"""Standalone console PLC tag logger — the entrypoint for the "quick test
exe" built from the PLC Connection Test page (see test_exe_builder.py).

Not the main app: no web server, no frontend, nothing to configure once
built. Reads the handful of {name, address, type} tags and the PLC
connection info that were typed in on that page at build time (bundled as
seed_config/plcTestTags.json — see test_exe_builder.py), connects to that
PLC, and prints every tag's live value to the console once a second,
forever, so a connection/wiring/address problem can be checked on-site in
seconds without building (or even having) the full application.

Double-click to run; close the window to stop.
"""

import sys
import time
from pathlib import Path

from plc_clients.mitsubishi_client import MitsubishiClient
from plc_clients.omron_client import OmronClient
from plc_clients.siemens_client import SiemensClient

POLL_INTERVAL_S = 1.0
RETRY_INTERVAL_S = 3.0


def _seed_path() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass) / "seed_config" / "plcTestTags.json"
    # Not frozen: running this file directly for development — look next to it.
    return Path(__file__).resolve().parent / "plcTestTags.json"


def _load_config() -> dict:
    import json
    path = _seed_path()
    if not path.exists():
        print(f"[PLC TEST] config not found: {path}", flush=True)
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def _plc_client(cfg: dict):
    brand = cfg.get("brand")
    ip = cfg.get("ip", "")
    if brand == "siemens":
        return SiemensClient(ip, int(cfg.get("port") or 102), int(cfg.get("rack") or 0), int(cfg.get("slot") or 0))
    if brand == "omron":
        return OmronClient(ip, cfg.get("destNode") or "0.0.0", cfg.get("srcNode") or "0.127.0", float(cfg.get("timeout") or 2))
    if brand == "mitsubishi":
        return MitsubishiClient(ip, int(cfg.get("port") or 5002), cfg.get("plcType") or "Q", cfg.get("commType") or "binary")
    raise ValueError(f"Unknown PLC brand: {brand!r}")


def main() -> None:
    cfg = _load_config()
    plc_cfg = cfg.get("plcConfig") or {}
    tags = cfg.get("tags") or []

    print("=" * 70, flush=True)
    print("PLC QUICK TEST LOGGER", flush=True)
    print(f"PLC   : {plc_cfg.get('ip')}:{plc_cfg.get('port')}  brand={plc_cfg.get('brand')}"
          + (f"  plcType={plc_cfg.get('plcType')} commType={plc_cfg.get('commType')}"
             if plc_cfg.get("brand") == "mitsubishi" else ""), flush=True)
    print(f"Tags  : {len(tags)} configured", flush=True)
    for t in tags:
        print(f"        {t.get('name', '?'):<24} {t.get('address', '?'):<10} ({t.get('type', '?')})", flush=True)
    print(f"Polling every {POLL_INTERVAL_S:g}s - close this window to stop", flush=True)
    print("=" * 70, flush=True)

    if not tags:
        print("No tags configured - nothing to do.", flush=True)
        return

    while True:
        client = _plc_client(plc_cfg)
        try:
            if not client.connect():
                print("[PLC TEST] connect() returned False - PLC did not confirm connection", flush=True)
                time.sleep(RETRY_INTERVAL_S)
                continue
            cpu_type = getattr(client, "cpu_type", None)
            if cpu_type:
                print(f"[PLC TEST] connected - CPU reports itself as: {cpu_type!r}", flush=True)
            else:
                print("[PLC TEST] connected", flush=True)

            batch_read = getattr(client, "read_tags_batch", None)

            while True:
                print("-" * 70, flush=True)
                if batch_read is not None:
                    # One combined request for every tag instead of one
                    # request per tag — this PLC's embedded Ethernet port
                    # cannot handle many sequential individual requests on
                    # one connection (see mitsubishi_client.py).
                    try:
                        values = batch_read([(t.get("address", ""), t.get("type", "int16")) for t in tags])
                        for t in tags:
                            name, address, dtype = t.get("name", "?"), t.get("address", ""), t.get("type", "int16")
                            print(f"  {name:<24} {address:<10} ({dtype:<8}) = {values.get(address)}", flush=True)
                    except Exception as e:
                        print(f"  BATCH READ -> ERROR: {type(e).__name__}: {e}", flush=True)
                else:
                    for t in tags:
                        name, address, dtype = t.get("name", "?"), t.get("address", ""), t.get("type", "int16")
                        try:
                            value = client.read_tag(address, dtype)
                            print(f"  {name:<24} {address:<10} ({dtype:<8}) = {value}", flush=True)
                        except Exception as e:
                            print(f"  {name:<24} {address:<10} ({dtype:<8}) -> ERROR: {type(e).__name__}: {e}", flush=True)
                time.sleep(POLL_INTERVAL_S)
        except Exception as e:
            print(f"[PLC TEST] connection failed: {type(e).__name__}: {e} - retrying in {RETRY_INTERVAL_S:g}s", flush=True)
            time.sleep(RETRY_INTERVAL_S)
        finally:
            try:
                client.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
