"""JSON-file persistence for the frontend's saved configuration.

The frontend (Vite dev middleware today) reads/writes two files under
frontend/src/config/. This serves the same GET/POST contract from FastAPI and
defaults to the SAME files, so the dev server's middleware and this backend
never disagree about what's saved. Override the folder with SCADA_CONFIG_DIR.

Inside a generated exe (see exe_builder.py), there's no frontend/src/config —
config instead lives in a "config" folder next to the exe itself, so it's
writable and survives restarts (unlike PyInstaller's bundled-data extraction
folder, sys._MEIPASS, which is temporary and re-extracted every launch). The
exe can still ship with an initial value for a file — exe_builder.py bundles
one as a read-only "seed"; the first read of that file copies the seed into
the writable location, so it starts pre-set without needing special-case
logic here beyond that one-time copy.
"""

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def config_dir() -> Path:
    override = os.environ.get("SCADA_CONFIG_DIR")
    if override:
        return Path(override)
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "config"
    frontend_cfg = HERE.parent / "frontend" / "src" / "config"
    return frontend_cfg if frontend_cfg.is_dir() else HERE / "data"


def _seed_path(filename: str):
    """The bundled read-only starting value for `filename`, if this is a
    frozen exe that shipped one — None otherwise."""
    if not getattr(sys, "frozen", False):
        return None
    meipass = getattr(sys, "_MEIPASS", None)
    if not meipass:
        return None
    seed = Path(meipass) / "seed_config" / filename
    return seed if seed.exists() else None


def read_json_text(filename: str) -> str:
    """Raw file text, or the string 'null' when nothing has been saved yet.
    On first read inside a frozen exe, copies a bundled seed value (if any)
    into the writable config dir before reading."""
    path = config_dir() / filename
    if not path.exists():
        seed = _seed_path(filename)
        if seed is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(seed.read_text(encoding="utf-8"), encoding="utf-8")
    return path.read_text(encoding="utf-8") if path.exists() else "null"


def write_json(filename: str, data) -> None:
    directory = config_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / filename
    tmp = path.with_suffix(path.suffix + ".tmp")
    # ensure_ascii=False — otherwise json.dumps escapes any non-ASCII
    # character (e.g. a station parameter's "°C" unit) to °C. Same
    # value once parsed, but it churns the file's bytes with no real
    # change, and diverges from how the frontend's own JSON.stringify
    # (used by vite.config.js's dev-mode jsonFileApi middleware) writes
    # these same files — which never escapes. Keeps the two paths
    # byte-for-byte consistent and avoids noisy git diffs on these
    # intentionally-committed saved*.json files.
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)  # never leaves a half-written config behind


def load_json(filename: str):
    try:
        return json.loads(read_json_text(filename))
    except (OSError, ValueError):
        return None
