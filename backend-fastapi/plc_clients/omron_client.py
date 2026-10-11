"""Omron FINS client — connect + tag read/write. finscommand 0.1.3's
fins.__del__ has a real bug: `self.sock.cloase()` (typo — verified by reading
its source), which raises AttributeError during garbage collection. Patched
at import time so it doesn't spam stderr; harmless no-op if a fixed library
version is installed later (the try/except just swallows whatever's there)."""

import struct

from finscommand import fins as FinsClient


def _safe_del(self):
    try:
        self.sock.close()
    except Exception:
        pass


FinsClient.__del__ = _safe_del

# FINS memory is untyped words — the type only exists in how we pack/unpack
# the bytes. Big-endian throughout (matches plc.md's ">h" example).
_FMT   = {"int16": ">h", "uint16": ">H", "int32": ">i", "uint32": ">I", "float32": ">f", "bool": ">h"}
_WORDS = {"int16": 1,    "uint16": 1,    "int32": 2,    "uint32": 2,    "float32": 2,    "bool": 1}


class OmronClient:
    def __init__(self, ip, dest_node, src_node, timeout):
        self.ip, self.dest_node, self.src_node, self.timeout = ip, dest_node, src_node, timeout
        self._client = None

    def connect(self):
        self._client = FinsClient(self.ip, self.dest_node, self.src_node, self.timeout)
        status = self._client.ReadUnitStatus()  # proves a real reply, not just a socket
        return status is not None

    def read_tag(self, address, data_type="int16"):
        raw = self._client.read(address, _WORDS[data_type])
        value = struct.unpack(_FMT[data_type], raw)[0]
        return bool(value) if data_type == "bool" else value

    def write_tag(self, address, value, data_type="int16"):
        wire_value = (1 if value else 0) if data_type == "bool" else value
        packed = struct.pack(_FMT[data_type], wire_value)
        self._client.write(address, packed)

    def close(self):
        self._client = None
