"""Builds a standalone .exe of the whole app — this FastAPI backend AND the
built frontend — via PyInstaller, in the background (a build takes a couple
of minutes: an npm frontend build, then a PyInstaller bundle).

The result is one file: no Python, no Node, nothing else needs to be
installed on the machine it's run on. Double-clicking it starts the backend
(serving the bundled frontend at "/") and opens the default browser to it.

Steps:
  1. `npm run build` the frontend fresh, so the exe always ships current code.
  2. Stage the chosen page selection, the currently-saved PLC connection
     config, the tank/wagon layout (lines, counts) and header branding, and
     — critically — the tank/wagon TAG configuration (names, PLC addresses,
     data types) as "seed" files (see config_store.py's seeding logic), so
     the exe starts up already showing only those pages, already pointed at
     that PLC, with the same tank/wagon counts, and with every configured
     tag address ready for plc_publisher.py to poll immediately — without
     needing ANY of those screens filled in again inside the exe.
  3. PyInstaller --onefile, bundling frontend/dist and the seed folder as
     read-only data, with main.py as the entrypoint.

In-memory job tracking only (BUILDS dict) — fine for a local dev tool; a
backend restart loses in-progress/finished build records (the exe files on
disk are unaffected).
"""

from __future__ import annotations  # allow `X | None` hints on Python 3.9

import json
import re
import subprocess
import sys
import threading
import uuid
from pathlib import Path

import config_store

BACKEND_DIR = Path(__file__).parent
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
BUILDS_DIR = BACKEND_DIR / "builds"

NPM_TIMEOUT_S = 300
PYINSTALLER_TIMEOUT_S = 600

# build_id -> {status, log, exe_path, error, exe_name}
BUILDS: dict[str, dict] = {}


def _sanitize(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9]+", "_", name.strip())
    return name.strip("_") or "App"


def start_build(client_name: str, selection: dict) -> str:
    build_id = uuid.uuid4().hex[:12]
    BUILDS[build_id] = {"status": "queued", "log": "", "exe_path": None, "error": None, "exe_name": None}
    thread = threading.Thread(target=_run_build, args=(build_id, client_name, selection), daemon=True)
    thread.start()
    return build_id


def _run(cmd, cwd, timeout, log_parts, shell=False):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, shell=shell)
    shown = cmd if isinstance(cmd, str) else " ".join(cmd)
    log_parts.append(f"$ {shown}\n{proc.stdout or ''}\n{proc.stderr or ''}")
    return proc.returncode


def _run_build(build_id: str, client_name: str, selection: dict) -> None:
    job = BUILDS[build_id]
    log_parts: list[str] = []
    try:
        job["status"] = "building"

        exe_name = f"{_sanitize(client_name or 'ProtovecSCADA')}_App"

        build_dir = BUILDS_DIR / build_id
        dist_dir = build_dir / "dist"
        work_dir = build_dir / "work"
        spec_dir = build_dir / "spec"
        seed_dir = build_dir / "seed_config"
        for d in (dist_dir, work_dir, spec_dir, seed_dir):
            d.mkdir(parents=True, exist_ok=True)

        # 1. Frontend, built fresh so the exe always ships current code.
        # shell=True: on Windows, `npm` resolves to npm.cmd, a batch file
        # that subprocess can't launch directly without going through a
        # shell (a well-known Windows-only gotcha with plain subprocess.run).
        rc = _run("npm run build", FRONTEND_DIR, NPM_TIMEOUT_S, log_parts, shell=True)
        job["log"] = "\n".join(log_parts)
        if rc != 0:
            job["status"] = "error"
            job["error"] = "Frontend build failed (npm run build)"
            return

        frontend_dist = FRONTEND_DIR / "dist"
        if not frontend_dist.is_dir():
            job["status"] = "error"
            job["error"] = "frontend/dist missing after build"
            return

        # 2. Seed everything the exe needs to start pre-configured — all
        # read back by config_store.py's seeding logic the first time the
        # exe runs. Only the page selection comes from this request's body
        # (it's chosen fresh on every build); everything else comes straight
        # from disk — whatever is currently saved in THIS dev app carries
        # over into the exe exactly as-is, including every tank/wagon tag's
        # name, PLC address, and data type (savedUserConfig.json).
        (seed_dir / "savedPageSelection.json").write_text(json.dumps(selection, indent=2), encoding="utf-8")
        for filename in ("savedPlcConfig.json", "savedUserConfig.json", "savedHeaderConfig.json"):
            (seed_dir / filename).write_text(
                config_store.read_json_text(filename), encoding="utf-8"
            )

        # 3. PyInstaller. Explicit loop/http implementations (rather than
        # uvicorn's default "auto") sidestep a known PyInstaller pitfall:
        # uvicorn normally picks its event loop and HTTP implementation via
        # dynamic imports that PyInstaller's static analysis can't see, so
        # the frozen exe would otherwise fail to find them at startup.
        cmd = [
            sys.executable, "-m", "PyInstaller",
            "--onefile", "--clean", "--noconfirm",
            "--name", exe_name,
            "--add-data", f"{frontend_dist};frontend_dist",
            "--add-data", f"{seed_dir};seed_config",
            "--collect-all", "uvicorn",
            "--hidden-import", "uvicorn.loops.auto",
            "--hidden-import", "uvicorn.protocols.http.auto",
            "--hidden-import", "uvicorn.protocols.websockets.auto",
            "--hidden-import", "uvicorn.lifespan.on",
            "--distpath", str(dist_dir),
            "--workpath", str(work_dir),
            "--specpath", str(spec_dir),
            "main.py",
        ]
        rc = _run(cmd, BACKEND_DIR, PYINSTALLER_TIMEOUT_S, log_parts)
        job["log"] = "\n".join(log_parts)

        exe_path = dist_dir / f"{exe_name}.exe"
        if rc == 0 and exe_path.exists():
            job["status"] = "done"
            job["exe_path"] = str(exe_path)
            job["exe_name"] = f"{exe_name}.exe"
        else:
            job["status"] = "error"
            job["error"] = f"PyInstaller exited {rc}"

    except subprocess.TimeoutExpired as e:
        job["status"] = "error"
        job["error"] = f"Timed out: {e}"
    except Exception as e:
        job["status"] = "error"
        job["error"] = f"{type(e).__name__}: {e}"


def get_build(build_id: str) -> dict | None:
    return BUILDS.get(build_id)
