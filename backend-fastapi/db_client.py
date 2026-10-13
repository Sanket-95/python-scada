"""Live SQL Server lookups for the Part Number column (Station Info Column
Config page's "Part Number" column — see plc_publisher.py's
_resolve_wagon_part_numbers for how this plugs into the poll loop).

Uses pymssql (a pure-Python TDS implementation) rather than pyodbc on
purpose: pyodbc needs the Microsoft ODBC Driver for SQL Server separately
installed on whatever machine the app runs on, which a generated exe can't
guarantee — pymssql has no such external dependency, same reasoning as why
PLC config has to survive into userCfg (see CLAUDE.md's Gotchas).
"""

import time

import pymssql

# Held across polls so the connection is reused instead of reconnected every
# tick — same pattern as plc_publisher.py's _held_client. Only reconnects on
# a config change or a failed query.
_held_conn = None
_held_cfg_key = None


def _cfg_key(cfg: dict):
    return (cfg.get("server"), cfg.get("port"), cfg.get("database"), cfg.get("username"), cfg.get("password"))


def _drop_held_conn():
    global _held_conn, _held_cfg_key
    if _held_conn is not None:
        try:
            _held_conn.close()
        except Exception:
            pass
    _held_conn, _held_cfg_key = None, None


def _connect(cfg: dict):
    kwargs = dict(
        server=cfg.get("server") or "",
        database=cfg.get("database") or "",
        user=cfg.get("username") or "",
        password=cfg.get("password") or "",
        login_timeout=5,
        timeout=5,
    )
    # Only pass a port when one is actually set. A named instance (e.g.
    # ".\SQLEXPRESS") resolves its own (often dynamic) port via the SQL
    # Server Browser service (UDP 1434) when no port is given — forcing 1433
    # here would break that resolution and fail to connect for the common
    # "default/standalone instance on 1433" case, port stays optional.
    port = cfg.get("port")
    if port:
        kwargs["port"] = str(port)
    return pymssql.connect(**kwargs)


def _get_conn(cfg: dict):
    global _held_conn, _held_cfg_key
    key = _cfg_key(cfg)
    if _held_conn is not None and _held_cfg_key == key:
        return _held_conn
    _drop_held_conn()
    conn = _connect(cfg)
    _held_conn, _held_cfg_key = conn, key
    return conn


def test_connection(cfg: dict) -> dict:
    """One-shot connect + SELECT 1, used by the Database Connection Test
    page — never touches the held/reused connection above."""
    started = time.monotonic()
    try:
        conn = _connect(cfg)
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchall()
        finally:
            conn.close()
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    return {"ok": True, "latencyMs": round((time.monotonic() - started) * 1000)}


_PART_NAME_QUERY = "SELECT [PartName] FROM [dbo].[LoadPartDetails] WHERE LoadNumber = %s"


def query_part_name(cfg: dict, load_number: str) -> str | None:
    """Parameterized lookup (never string-formats load_number into the SQL
    text). Retries once on a fresh connection if the held one has gone
    stale, same resilience pattern as plc_publisher.py's PLC reads."""
    try:
        conn = _get_conn(cfg)
        cur = conn.cursor()
        cur.execute(_PART_NAME_QUERY, (load_number,))
        row = cur.fetchone()
        return row[0] if row else None
    except Exception:
        _drop_held_conn()
        conn = _get_conn(cfg)
        cur = conn.cursor()
        cur.execute(_PART_NAME_QUERY, (load_number,))
        row = cur.fetchone()
        return row[0] if row else None
