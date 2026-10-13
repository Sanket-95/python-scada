"""Builds the small, console-only "quick test exe" from the PLC Connection
Test page — plc_test_logger.py bundled by itself via PyInstaller, no
frontend, no FastAPI/uvicorn. Lets a PLC connection + a handful of tags be
checked standalone in the field in under a minute, instead of needing the
full app_builder.py build (npm + the whole backend) just to see whether a
few addresses read correctly.

Same in-memory job-tracking pattern as exe_builder.py (BUILDS dict; a
backend restart loses in-progress/finished build records, the exe files on
disk are unaffected) — kept as a separate dict/module so the two build
kinds never collide on build_id or stomp on each other's dist folders.
"""

from __future__ import annotations  # allow `X | None` hints on Python 3.9

import json
import re
import subprocess
import sys
import threading
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
BUILDS_DIR = BACKEND_DIR / "test_builds"

PYINSTALLER_TIMEOUT_S = 300

# build_id -> {status, log, exe_path, error, exe_name}
BUILDS: dict[str, dict] = {}


def _sanitize(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9]+", "_", name.strip())
    return name.strip("_") or "PLC_Test"


def start_build(plc_cfg: dict, tags: list) -> str:
    build_id = uuid.uuid4().hex[:12]
    BUILDS[build_id] = {"status": "queued", "log": "", "exe_path": None, "error": None, "exe_name": None}
    thread = threading.Thread(target=_run_build, args=(build_id, plc_cfg, tags), daemon=True)
    thread.start()
    return build_id


def _run(cmd, cwd, timeout, log_parts):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    log_parts.append(f"$ {' '.join(cmd)}\n{proc.stdout or ''}\n{proc.stderr or ''}")
    return proc.returncode


def _run_build(build_id: str, plc_cfg: dict, tags: list) -> None:
    job = BUILDS[build_id]
    log_parts: list[str] = []
    try:
        job["status"] = "building"

        exe_name = f"{_sanitize(plc_cfg.get('brand') or 'PLC')}_Test"

        build_dir = BUILDS_DIR / build_id
        dist_dir = build_dir / "dist"
        work_dir = build_dir / "work"
        spec_dir = build_dir / "spec"
        seed_dir = build_dir / "seed_config"
        for d in (dist_dir, work_dir, spec_dir, seed_dir):
            d.mkdir(parents=True, exist_ok=True)

        (seed_dir / "plcTestTags.json").write_text(
            json.dumps({"plcConfig": plc_cfg, "tags": tags}, indent=2), encoding="utf-8"
        )

        # No --collect-all uvicorn / frontend bundling here — this is a bare
        # console script, so the build is far faster than the full app exe.
        cmd = [
            sys.executable, "-m", "PyInstaller",
            "--onefile", "--clean", "--noconfirm",
            "--name", exe_name,
            "--add-data", f"{seed_dir};seed_config",
            "--distpath", str(dist_dir),
            "--workpath", str(work_dir),
            "--specpath", str(spec_dir),
            "plc_test_logger.py",
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
