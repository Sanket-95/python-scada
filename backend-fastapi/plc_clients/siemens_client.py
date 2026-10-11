"""Siemens S7 client — connect + tag read/write. Pattern verified against
plc.md (get_int/set_int for DBW, plus the sibling get/set_bool/byte/real for
the other address kinds it lists)."""

import re

import snap7
import snap7.util

# "DB403.DBW90"  -> db=403, kind=W, start=90       (word/int16)
# "DB1.DBX10.3"  -> db=1,   kind=X, start=10, bit=3 (single bit)
# "%DB403.DBW90" -> same as above — the leading "%" is TIA Portal's own
# absolute-address notation (that's what you get pasting straight out of a
# TIA Portal export), so it's accepted and just stripped.
_ADDR_RE = re.compile(r"^%?DB(\d+)\.DB([XBWD])(\d+)(?:\.(\d))?$", re.IGNORECASE)

_SIZE = {"X": 1, "B": 1, "W": 2, "D": 4}


def parse_address(address):
    m = _ADDR_RE.match(address.strip())
    if not m:
        raise ValueError(
            f"Invalid Siemens address '{address}' — expected e.g. DB403.DBW90 "
            "(word), DB1.DBB5 (byte), DB1.DBD8 (real), or DB1.DBX10.3 (bit) "
            "— a leading '%' (TIA Portal style) is fine too"
        )
    db, kind, start, bit = m.groups()
    return int(db), kind.upper(), int(start), int(bit) if bit is not None else 0


class SiemensClient:
    def __init__(self, ip, port, rack, slot):
        self.ip, self.port, self.rack, self.slot = ip, port, rack, slot
        self._client = None

    def connect(self):
        self._client = snap7.client.Client()
        self._client.connect(self.ip, self.rack, self.slot, self.port)
        return self._client.get_connected()

    # data_type is accepted-but-unused here — Siemens addresses already carry
    # their type in the DBX/DBB/DBW/DBD suffix, so there's nothing to add.
    # It's still a parameter so every brand's client can be called the same
    # way from tester_console.py.
    def read_tag(self, address, data_type=None):
        db, kind, start, bit = parse_address(address)
        raw = self._client.db_read(db, start, _SIZE[kind])
        if kind == "X":
            return snap7.util.get_bool(raw, 0, bit)
        if kind == "B":
            return snap7.util.get_byte(raw, 0)
        if kind == "W":
            return snap7.util.get_int(raw, 0)
        return snap7.util.get_real(raw, 0)  # D -> REAL (matches plc.md's DBD example)

    def write_tag(self, address, value, data_type=None):
        db, kind, start, bit = parse_address(address)
        buf = bytearray(_SIZE[kind])
        if kind == "X":
            snap7.util.set_bool(buf, 0, bit, bool(int(float(value))))
        elif kind == "B":
            snap7.util.set_byte(buf, 0, int(float(value)))
        elif kind == "W":
            snap7.util.set_int(buf, 0, int(float(value)))
        else:
            snap7.util.set_real(buf, 0, float(value))
        self._client.db_write(db, start, buf)

    def close(self):
        if self._client is not None:
            try:
                self._client.disconnect()
            except Exception:
                pass
