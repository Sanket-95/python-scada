"""Mitsubishi client — pymcprotocol (MC protocol 3E frame), with a framed
receive fix.

Why the fix: pymcprotocol's stock `_recv()` does a single `sock.recv()` call,
which can return a partial frame when a response is split across TCP
segments. The old code's "every tag silently reads as 0, no error" symptom
on this FX5U was this bug, not a wrong protocol — confirmed against a
second, independently-working Python app (ASTIMO's py_datalogger) that
talks to the exact same FX5U using this exact library (pymcprotocol==0.3.0,
plctype="Q", commtype="binary") with only this receive fix applied. SLMP
was a dead end: this FX5U's Ethernet port answers plain MC protocol 3E
frames fine once the full response is actually read off the socket.

Note: PLC_TYPE in a working config is "Q" even though the hardware is an
FX5U/iQ-F — pymcprotocol has no FX5U-specific plctype, and none is needed;
"Q" selects the 3E frame layout, which this CPU's Ethernet port accepts.

Also note each FX5U Ethernet port setting ("Open Setting" in GX Works2/3)
is normally dedicated to ONE port number per connection/app — e.g. in this
plant Movicon uses 5022 and the working data logger uses 5023. A port that
was never configured as an "Open Setting" for MC protocol will accept the
TCP connection but drop it the instant any request is sent — this matches
the "response too short (0 bytes)" failures seen while this app was
pointed at port 5003. Confirm in GX Works2/3 which Open Setting port is
free/valid for this connection before assuming the client code is at fault.
"""

import struct

import pymcprotocol
from pymcprotocol import mcprotocolconst as const

# 3E response header: subheader, network, PC, I/O, station, data length
_BIN_HEADER = 9     # bytes; data length = bytes 7..8 (little endian)
_ASCII_HEADER = 18  # chars; data length = chars 14..17 (hex)

_32BIT_TYPES = {"int32", "uint32", "float32"}

# Device prefix tables (longest first so e.g. "ZR" wins over "Z") — used only
# by read_tags_batch's address parsing/grouping below.
_BIT_DEVICES = ["SM", "SB", "TS", "TC", "CS", "CC", "SS", "SC", "DX", "DY",
                "X", "Y", "M", "L", "F", "V", "B", "S"]
_WORD_DEVICES = ["ZR", "SD", "SW", "TN", "CN", "SN", "D", "W", "R", "Z"]
_HEX_DEVICES = {"X", "Y", "B", "W", "SB", "SW", "DX", "DY"}
_PREFIXES = sorted(_BIT_DEVICES + _WORD_DEVICES, key=len, reverse=True)

# Q series limits per request (binary 3E): 960 words, 7168 bits (3584 in ASCII).
# Merge tags into one read when the address gap is at most this many points —
# same constants as ASTIMO's proven-working py_datalogger (tags.py).
_MAX_WORDS_PER_READ = 960
_MAX_BITS_PER_READ = 3584
_MAX_WORD_GAP = 32
_MAX_BIT_GAP = 128


def _parse_device(address: str):
    addr = address.strip().upper()
    prefix = next((p for p in _PREFIXES if addr.startswith(p)), None)
    if prefix is None:
        raise ValueError(f"unknown device in '{address}'")
    number = int(addr[len(prefix):], 16 if prefix in _HEX_DEVICES else 10)
    kind = "bit" if prefix in _BIT_DEVICES else "word"
    return prefix, number, kind


def _format_device(prefix: str, number: int) -> str:
    if prefix in _HEX_DEVICES:
        return f"{prefix}0{number:X}"
    return f"{prefix}{number}"


def _decode_from_block(raw, offset: int, data_type: str, kind: str):
    if kind == "bit":
        value = raw[offset]
        return bool(value) if data_type == "bool" else value
    if data_type in _32BIT_TYPES:
        low, high = raw[offset] & 0xFFFF, raw[offset + 1] & 0xFFFF
        combined = low | (high << 16)
        if data_type == "uint32":
            return combined
        if data_type == "int32":
            return combined - 0x100000000 if combined >= 0x80000000 else combined
        return struct.unpack("<f", struct.pack("<I", combined))[0]
    value = raw[offset] & 0xFFFF
    if data_type == "uint16":
        return value
    if data_type == "bool":
        return bool(value & 1)
    return value - 0x10000 if value >= 0x8000 else value  # int16 (signed)


class _MCClient(pymcprotocol.Type3E):
    def _recv_exact(self, size):
        buf = bytearray()
        while len(buf) < size:
            chunk = self._sock.recv(size - len(buf))
            if not chunk:
                raise ConnectionError("PLC closed the connection")
            buf += chunk
        return bytes(buf)

    def _recv(self):
        if self.commtype == const.COMMTYPE_BINARY:
            header = self._recv_exact(_BIN_HEADER)
            length = int.from_bytes(header[7:9], "little")
        else:
            header = self._recv_exact(_ASCII_HEADER)
            length = int(header[14:18].decode(), 16)
        return header + self._recv_exact(length)


class MitsubishiClient:
    def __init__(self, ip, port, plc_type=None, comm_type="binary"):
        self.ip, self.port = ip, port
        self._plc_type = plc_type or "Q"
        self._comm_type = comm_type or "binary"
        self._client = None
        self.cpu_type = None

    def connect(self):
        # No automatic read_cputype() here: ASTIMO's proven-working client
        # against this exact PLC family never sends that command at all —
        # it connects and goes straight to real tag reads. On at least one
        # FX5U (192.168.3.13:5003) sending the CPU-type-read command right
        # after connect killed the connection for every read that followed
        # (confirmed: cpu_type never came back, and every single subsequent
        # tag read then failed with "PLC closed the connection" on that same
        # now-dead socket). Keep connect() to exactly what's proven to work.
        client = _MCClient(plctype=self._plc_type)
        client.setaccessopt(commtype=self._comm_type)
        client.connect(self.ip, self.port)
        self._client = client
        return True

    def read_tag(self, address, data_type="int16"):
        device_code = address[0].upper()
        if device_code in ("X", "Y", "M", "L", "B"):
            value = self._client.batchread_bitunits(headdevice=address, readsize=1)[0]
            return bool(value) if data_type == "bool" else value

        if data_type in _32BIT_TYPES:
            words = self._client.batchread_wordunits(headdevice=address, readsize=2)
            raw = (words[0] & 0xFFFF) | ((words[1] & 0xFFFF) << 16)
            if data_type == "uint32":
                return raw
            if data_type == "int32":
                return raw - 0x100000000 if raw >= 0x80000000 else raw
            return struct.unpack("<f", struct.pack("<I", raw))[0]

        value = self._client.batchread_wordunits(headdevice=address, readsize=1)[0] & 0xFFFF
        if data_type == "uint16":
            return value
        if data_type == "bool":
            return bool(value & 1)
        return value - 0x10000 if value >= 0x8000 else value  # int16 (signed)

    def read_tags_batch(self, tags):
        """tags: [(address, data_type), ...]. Returns {address: value}.

        Groups tags into as few requests as possible — one per contiguous
        block of nearby addresses — instead of one request per tag. This
        PLC's embedded Ethernet port cannot handle many sequential
        individual requests fired back-to-back on one connection (confirmed:
        it closes the connection on literally the first one every time), but
        answers one combined block read fine — exactly how ASTIMO's
        proven-working py_datalogger reads 399 tags in a single request.
        Prefer this over looping read_tag() for more than a couple of tags.
        """
        parsed = []
        for address, data_type in tags:
            prefix, number, kind = _parse_device(address)
            size = 2 if data_type in _32BIT_TYPES else 1
            parsed.append((address, data_type, prefix, number, kind, size))

        groups: dict = {}
        for item in parsed:
            groups.setdefault((item[2], item[4]), []).append(item)

        values = {}
        for (prefix, kind), items in groups.items():
            items.sort(key=lambda it: it[3])
            max_len = _MAX_BITS_PER_READ if kind == "bit" else _MAX_WORDS_PER_READ
            max_gap = _MAX_BIT_GAP if kind == "bit" else _MAX_WORD_GAP
            block_start = block_end = None
            block_items = []

            def flush():
                if not block_items:
                    return
                head = _format_device(prefix, block_start)
                count = block_end - block_start
                if kind == "bit":
                    raw = self._client.batchread_bitunits(headdevice=head, readsize=count)
                else:
                    raw = self._client.batchread_wordunits(headdevice=head, readsize=count)
                for b_address, b_type, _, b_number, _, _ in block_items:
                    values[b_address] = _decode_from_block(raw, b_number - block_start, b_type, kind)

            for item in items:
                _, _, _, number, _, size = item
                t_end = number + size
                if (block_items and number <= block_end + max_gap
                        and max(block_end, t_end) - block_start <= max_len):
                    block_end = max(block_end, t_end)
                    block_items.append(item)
                else:
                    flush()
                    block_start, block_end, block_items = number, t_end, [item]
            flush()

        return values

    def write_tag(self, address, value, data_type="int16"):
        device_code = address[0].upper()
        if device_code in ("X", "Y", "M", "L", "B"):
            self._client.batchwrite_bitunits(headdevice=address, values=[1 if value else 0])
            return

        if data_type in _32BIT_TYPES:
            if data_type == "float32":
                raw = struct.unpack("<I", struct.pack("<f", float(value)))[0]
            else:
                raw = int(value) & 0xFFFFFFFF
            self._client.batchwrite_wordunits(headdevice=address, values=[raw & 0xFFFF, (raw >> 16) & 0xFFFF])
            return

        word = int(value) & 0xFFFF  # masks negative int16 values to their raw two's-complement word too
        self._client.batchwrite_wordunits(headdevice=address, values=[word])

    def close(self):
        if self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None
