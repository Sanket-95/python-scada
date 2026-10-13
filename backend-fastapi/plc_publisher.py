"""Live PLC tag polling for tank "has load" status AND wagon location.

Runs continuously (always, not behind SCADA_MOCK) alongside the rest of the
backend. On every tick it:
  1. Re-reads the saved PLC connection config, tank tags, and wagon location
     tags — so editing the Tank Tags / Wagon Tags page or the PLC Connection
     Test screen takes effect on the very next poll, no restart needed.
  2. Skips entirely (idles) if no PLC is configured yet, or no tag at all
     (tank or wagon) has a PLC address set — a tank/wagon with no address
     simply never gets a live value (no mock fallback).
  3. Reuses ONE PLC connection across every tick (tank and wagon tags share
     it too, not a separate one each) rather than reconnecting every 1.5s —
     confirmed on real hardware (an FX5U over MC protocol) that this PLC's
     Ethernet port doesn't tolerate connection-per-request/connection churn
     well; a long-lived connection, reused across many reads and only
     reconnected on failure or a config change, is the pattern proven to
     work (see mitsubishi_client.py and the Quick Test EXE's plc_test_logger.py,
     which both do the same). Reads every configured tag at its OWN
     configured data type (bool / int16 / uint16 / int32 / uint32 / float32
     — see tagConfig.js's TAG_DATA_TYPES, same ids the PLC client layer
     itself accepts), and publishes it into the TagStore under that tag's
     configured NAME — the exact same store POST /api/tags writes to, so
     the frontend's existing live WebSocket stream delivers it with no
     changes on that end:
       - a tank counts as "loaded" on any non-zero value, not just a bare
         boolean 1 (see WagonScada3D.jsx's tankTags live-override effect)
       - a wagon's tag value is read as a tank NUMBER — the wagon moves
         there (see WagonScada3D.jsx's wagonTags live-override effect)
     Any read failure (bad tag address, or the connection itself going bad)
     drops the held connection so the next tick reconnects cleanly, rather
     than keep hammering a socket that may already be dead.
"""

import asyncio

import config_store
from plc_clients.mitsubishi_client import MitsubishiClient
from plc_clients.omron_client import OmronClient
from plc_clients.siemens_client import SiemensClient
from tag_store import TagStore

POLL_INTERVAL_S = 0.5  # was 1.5 — the one real source of tag-change latency

# Held across ticks so the connection is reused instead of reconnected every
# poll — see the module docstring. _cfg_key lets a PLC Connection Test page
# edit force a fresh connection with the new settings on the very next poll.
_held_client = None
_held_cfg_key = None


def _cfg_key(cfg: dict):
    return (cfg.get("brand"), cfg.get("ip"), cfg.get("port"), cfg.get("plcType"), cfg.get("commType"),
            cfg.get("rack"), cfg.get("slot"), cfg.get("destNode"), cfg.get("srcNode"), cfg.get("timeout"))


def _drop_held_client():
    global _held_client, _held_cfg_key
    if _held_client is not None:
        try:
            _held_client.close()
        except Exception:
            pass
    _held_client, _held_cfg_key = None, None


def _get_client(plc_cfg: dict):
    global _held_client, _held_cfg_key
    key = _cfg_key(plc_cfg)
    if _held_client is not None and _held_cfg_key == key:
        return _held_client
    _drop_held_client()
    client = _plc_client(plc_cfg)
    if client is None:
        return None
    if not client.connect():
        if DEBUG_LOG:
            print("[PLC] connect() returned False — PLC did not confirm connection", flush=True)
        return None
    _held_client, _held_cfg_key = client, key
    return client


def _plc_client(cfg: dict):
    brand = cfg.get("brand")
    ip = cfg.get("ip", "")
    if brand == "siemens":
        return SiemensClient(ip, int(cfg.get("port") or 102), int(cfg.get("rack") or 0), int(cfg.get("slot") or 0))
    if brand == "omron":
        return OmronClient(ip, cfg.get("destNode") or "0.0.0", cfg.get("srcNode") or "0.127.0", float(cfg.get("timeout") or 2))
    if brand == "mitsubishi":
        return MitsubishiClient(ip, int(cfg.get("port") or 5002), cfg.get("plcType") or "Q", cfg.get("commType") or "binary")
    return None


def _addressed_tags(saved_cfg: dict, key: str, default_type: str) -> list[tuple[str, str, str]]:
    """[(tagName, plcAddress, dataType), ...] for every tag under
    savedUserConfig.json's `key` (tankTags or wagonTags) that has BOTH a
    name and a PLC address configured."""
    out = []
    for tag in (saved_cfg.get(key) or {}).values():
        name = (tag.get("name") or "").strip()
        address = (tag.get("address") or "").strip()
        if name and address:
            out.append((name, address, tag.get("type") or default_type))
    return out


def _wagon_bool_subtags(saved_cfg: dict, keys: tuple[str, ...]) -> list[tuple[str, str, str]]:
    """[(tagName, plcAddress, "bool"), ...] for every wagon's configured
    sub-tag under one of `keys` (Wagon Tags page) that has both a name and
    a PLC address set. Always bool — these are bit tags, not user-selectable."""
    out = []
    for tag in (saved_cfg.get("wagonTags") or {}).values():
        for key in keys:
            sub = tag.get(key) or {}
            name = (sub.get("name") or "").strip()
            address = (sub.get("address") or "").strip()
            if name and address:
                out.append((name, address, "bool"))
    return out


def _lift_tags(saved_cfg: dict) -> list[tuple[str, str, str]]:
    """Every wagon's configured up-lift/down-lift tag (Wagon Tags page)."""
    return _wagon_bool_subtags(saved_cfg, ("upLiftTag", "downLiftTag"))


def _mode_tags(saved_cfg: dict) -> list[tuple[str, str, str]]:
    """Every wagon's configured Auto/Manual/Service mode tag (Wagon Tags page)."""
    return _wagon_bool_subtags(saved_cfg, ("autoTag", "manualTag", "serviceTag"))


def station_param_tag_name(station_id, index: int) -> str:
    """The published tag NAME for one station parameter entry (Station Info
    page's flexible label/address/type/unit list) — synthesized, since the
    user only configures a label/unit for display, not a separate tag name.
    Shared convention with the frontend (WagonScada3D.jsx's
    stationParamValues), which must look values up under this exact name."""
    return f"STATION_{station_id}_P{index}"


def _station_param_tags(saved_cfg: dict) -> list[tuple[str, str, str]]:
    """[(tagName, plcAddress, dataType), ...] for every station's configured
    parameter entries (Station Info page) that have an address set — zero or
    more per station, nothing required."""
    out = []
    for station_id, params in (saved_cfg.get("stationParams") or {}).items():
        for i, p in enumerate(params or []):
            address = (p.get("address") or "").strip()
            if address:
                out.append((station_param_tag_name(station_id, i), address, p.get("type") or "float32"))
    return out


def station_load_number_tag_name(station_id) -> str:
    """The published tag NAME for a station's Load Number — a single
    dedicated per-station tag (Station Info page's own "LOAD NUMBER"
    column), unlike the flexible stationParams list. Shared convention with
    the frontend (WagonScada3D.jsx's stationParamValues)."""
    return f"STATION_{station_id}_LOADNUM"


def _load_number_tags(saved_cfg: dict) -> list[tuple[str, str, str]]:
    """[(tagName, plcAddress, "int16"), ...] for every station's configured
    Load Number address — always int16, not user-selectable."""
    out = []
    for station_id, address in (saved_cfg.get("stationLoadNumbers") or {}).items():
        addr = (address or "").strip()
        if addr:
            out.append((station_load_number_tag_name(station_id), addr, "int16"))
    return out


# TEMP DEBUG — prints every poll's PLC connection + each tag's live read to
# the console (this shows up in the exe's own console window too, since it's
# built without --noconsole), so values can be eyeballed live against
# another HMI (e.g. Movicon) while diagnosing why a tank isn't showing
# loaded. Remove this flag + the print() calls below once that's resolved.
DEBUG_LOG = True


def _data_source(plc_cfg) -> str:
    """'mock' (the frontend's built-in plant simulation supplies every live
    tag — nothing to poll) or 'plc'. A config saved before the switch existed
    has no dataSource: 'plc' if a PLC IP is configured, else 'mock'. Must
    match frontend/src/config/plcConfig.js's dataSourceOf()."""
    ds = (plc_cfg or {}).get("dataSource")
    if ds in ("mock", "plc"):
        return ds
    return "plc" if ((plc_cfg or {}).get("ip") or "").strip() else "mock"


def _poll_once(store: TagStore) -> None:
    plc_cfg = config_store.load_json("savedPlcConfig.json")
    if not plc_cfg or not (plc_cfg.get("ip") or "").strip() or _data_source(plc_cfg) == "mock":
        _drop_held_client()  # config cleared / simulation mode — don't keep a stale connection around
        return
    user_cfg = config_store.load_json("savedUserConfig.json") or {}
    tags = (_addressed_tags(user_cfg, "tankTags", "bool")
            + _addressed_tags(user_cfg, "wagonTags", "int16")
            + _lift_tags(user_cfg)
            + _mode_tags(user_cfg)
            + _station_param_tags(user_cfg)
            + _load_number_tags(user_cfg))
    if not tags:
        return

    try:
        client = _get_client(plc_cfg)
    except Exception as e:
        if DEBUG_LOG:
            print(f"[PLC] connect failed: {type(e).__name__}: {e}", flush=True)
        _drop_held_client()
        return
    if client is None:
        return

    if DEBUG_LOG:
        port = plc_cfg.get("port") or (5002 if plc_cfg.get("brand") == "mitsubishi" else None)
        print(f"[PLC] polling {plc_cfg.get('ip')}:{port} ({plc_cfg.get('brand')}) — {len(tags)} tag(s)", flush=True)

    batch = []

    def _wire(value):
        # bool reads back as a Python bool, not 0/1 — normalize so the
        # frontend's Number(value) !== 0 check works uniformly across
        # every data type.
        return int(value) if isinstance(value, bool) else value

    try:
        batch_read = getattr(client, "read_tags_batch", None)
        if batch_read is not None:
            # One combined request for every tag instead of one request per
            # tag — some PLCs (confirmed: an FX5U over MC protocol) close the
            # connection when hit with many sequential individual requests on
            # one connection, but answer a single combined block read fine.
            # See mitsubishi_client.py's read_tags_batch.
            values = batch_read([(address, dtype) for _, address, dtype in tags])
            for name, address, dtype in tags:
                wire_value = _wire(values.get(address))
                batch.append((name, wire_value, ""))
                if DEBUG_LOG:
                    print(f"[PLC]   {name} @ {address} ({dtype}) = {wire_value}", flush=True)
        else:
            for name, address, dtype in tags:
                wire_value = _wire(client.read_tag(address, dtype))
                batch.append((name, wire_value, ""))
                if DEBUG_LOG:
                    print(f"[PLC]   {name} @ {address} ({dtype}) = {wire_value}", flush=True)
        if batch:
            store.set_many(batch)
    except Exception as e:
        # Could be one bad address or the connection itself going bad — can't
        # tell which from here, so drop the held connection either way and
        # let the next tick reconnect cleanly rather than keep reading on a
        # socket that may already be dead.
        if DEBUG_LOG:
            print(f"[PLC] read failed this tick: {type(e).__name__}: {e} — reconnecting next tick", flush=True)
        _drop_held_client()


async def run(store: TagStore) -> None:
    while True:
        # snap7 / fins / pymcprotocol are all synchronous network I/O — run
        # off the event loop so a slow/unreachable PLC doesn't stall the
        # tag WebSocket for every other connected client while this waits.
        await asyncio.to_thread(_poll_once, store)
        await asyncio.sleep(POLL_INTERVAL_S)
