"""SCADA backend — FastAPI.

Replaces the Node gRPC client (backend/) and the .NET gRPC tag server
(dotnet-grpc/) with one process that serves exactly what the existing
frontend already expects, so the frontend needs no changes:

  WebSocket  ws://<host>:50054/      live tag stream, JSON {name,value,unit,timestamp};
                                     last published batch is replayed on connect
  POST /api/tags                     publish tags (was gRPC SetTags)
  POST /api/tags/text                same, from "key: value, key2 = value2" text
  GET  /api/tags                     everything currently in the store
  GET/POST /api/scada-config         saved line/tank/wagon configuration
  GET/POST /api/header-config        saved header branding
  GET/POST /api/page-selection       which app pages are switched on
  GET/POST /api/plc-config           saved PLC brand/connection info (App Builder gate + exe seed)
  POST /api/generate-app-exe         build a standalone exe of this whole app
  GET  /api/generate-app-exe/{id}/status    poll a build started above
  GET  /api/generate-app-exe/{id}/download  fetch the finished exe
  POST /api/plc-test-connection      live connect check against a real PLC
  POST /api/build-plc-test-exe       build a tiny console-only exe that just
                                      logs a handful of tags (PLC Connection
                                      Test page "Quick Test EXE")
  GET  /api/build-plc-test-exe/{id}/status    poll a build started above
  GET  /api/build-plc-test-exe/{id}/download  fetch the finished exe

If frontend/dist exists it is also served at "/", so a production build runs
from this one process — this is also what a generated exe does: PyInstaller
bundles this backend together with frontend/dist, so the exe is the frontend
*and* the backend in one file (see exe_builder.py).
"""

import asyncio
import contextlib
import json
import mimetypes
import os
import sys
import time
from pathlib import Path
from typing import Literal, Optional

# StaticFiles (below) guesses each file's Content-Type from Python's
# mimetypes module, which on Windows reads its mapping from the registry —
# a machine with a misconfigured/missing .js registry entry serves JS bundles
# as text/plain, which browsers refuse to load as a module script (blank
# page). Registering the correct type here overrides that unconditionally,
# so this works the same on every machine regardless of registry state —
# including a client PC running a generated exe.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config_store
import exe_builder
import mock_publisher
import plc_publisher
import tag_parser
import test_exe_builder
from plc_clients.mitsubishi_client import MitsubishiClient
from plc_clients.omron_client import OmronClient
from plc_clients.siemens_client import SiemensClient
from tag_store import TagStore

store = TagStore()


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    mock_task = None
    if os.environ.get("SCADA_MOCK") == "1":
        mock_task = asyncio.create_task(mock_publisher.run(store))
    # Always on (not behind SCADA_MOCK) — it idles harmlessly until a PLC
    # and at least one tank tag address are actually configured.
    plc_task = asyncio.create_task(plc_publisher.run(store))
    yield
    if mock_task:
        mock_task.cancel()
    plc_task.cancel()


app = FastAPI(title="SCADA API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── Tags ──────────────────────────────────────────────────────────────────────

@app.post("/api/tags")
async def set_tags(request: Request):
    try:
        items = tag_parser.normalize_payload(await request.json())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    written = store.set_many(items)
    return {"success": True, "count": len(written)}


@app.post("/api/tags/text")
async def set_tags_text(request: Request):
    items, errors = tag_parser.parse_line((await request.body()).decode("utf-8"))
    written = store.set_many(items)
    return {"success": not errors, "count": len(written), "errors": errors}


@app.get("/api/tags")
def list_tags():
    return store.get_all()


@app.get("/api/health")
def health():
    # "frozen" tells the frontend whether it's running inside a generated exe
    # (vs. the dev app) — the only signal that distinguishes them, since both
    # serve the exact same built frontend bundle. The frontend uses this to
    # apply the App Builder's page selection ONLY inside a generated exe; the
    # dev app always shows every page regardless of what's saved there.
    return {"status": "ok", "frozen": getattr(sys, "frozen", False)}


# ── Live stream ───────────────────────────────────────────────────────────────

@app.websocket("/")
@app.websocket("/ws")
async def tag_stream(ws: WebSocket):
    await ws.accept()
    # Subscribe BEFORE replaying the last batch: anything published while the
    # replay is being sent lands in the queue instead of being missed. At worst
    # a tag shows up twice, which is harmless for a latest-value stream.
    queue = store.subscribe()
    disconnect = asyncio.create_task(ws.receive())  # also notices the client closing
    try:
        for tag in store.last_batch():
            await ws.send_text(json.dumps(tag))

        while True:
            next_tag = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait({next_tag, disconnect}, return_when=asyncio.FIRST_COMPLETED)
            if next_tag in done:
                await ws.send_text(json.dumps(next_tag.result()))
            else:
                next_tag.cancel()
            if disconnect in done:
                if disconnect.result()["type"] == "websocket.disconnect":
                    break
                disconnect = asyncio.create_task(ws.receive())  # ignore anything the client sends
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        store.unsubscribe(queue)
        disconnect.cancel()


# ── Saved configuration (same GET/POST-a-JSON-file contract the Vite dev
#    middleware provides today) ───────────────────────────────────────────────

def _register_config_route(route: str, filename: str) -> None:
    def read() -> Response:
        return Response(content=config_store.read_json_text(filename), media_type="application/json")

    async def write(request: Request):
        try:
            data = await request.json()
        except ValueError:
            raise HTTPException(status_code=400, detail="body is not valid JSON")
        config_store.write_json(filename, data)
        return {"ok": True}

    app.add_api_route(route, read, methods=["GET"])
    app.add_api_route(route, write, methods=["POST"])


_register_config_route("/api/scada-config", "savedUserConfig.json")
_register_config_route("/api/header-config", "savedHeaderConfig.json")
_register_config_route("/api/page-selection", "savedPageSelection.json")
_register_config_route("/api/plc-config", "savedPlcConfig.json")


# ── PLC Connection Test — live connect check against a real PLC, straight
# from the running app (no exe to build or file to save first). One request,
# one connect attempt, one answer — nothing here is persisted.

class PlcTestRequest(BaseModel):
    brand: Literal["siemens", "omron", "mitsubishi"]
    ip: str
    port: Optional[int] = None
    # Siemens (S7)
    rack: Optional[int] = None
    slot: Optional[int] = None
    # Omron (FINS)
    destNode: Optional[str] = None
    srcNode: Optional[str] = None
    timeout: Optional[float] = None
    # Mitsubishi (SLMP / MC)
    plcType: Optional[str] = None
    commType: Optional[str] = None


def _plc_client(cfg: PlcTestRequest):
    if cfg.brand == "siemens":
        return SiemensClient(cfg.ip, int(cfg.port or 102), int(cfg.rack or 0), int(cfg.slot or 0))
    if cfg.brand == "omron":
        return OmronClient(cfg.ip, cfg.destNode or "0.0.0", cfg.srcNode or "0.127.0", float(cfg.timeout or 2))
    return MitsubishiClient(cfg.ip, int(cfg.port or 5002), cfg.plcType or "Q", cfg.commType or "binary")


def _run_plc_test(cfg: PlcTestRequest) -> dict:
    client = _plc_client(cfg)
    started = time.monotonic()
    try:
        ok = client.connect()
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    finally:
        client.close()
    if not ok:
        return {"ok": False, "error": "PLC did not confirm connection"}
    return {"ok": True, "latencyMs": round((time.monotonic() - started) * 1000)}


@app.post("/api/plc-test-connection")
async def plc_test_connection(cfg: PlcTestRequest):
    # snap7 / fins / pymcprotocol are all synchronous network I/O — run off
    # the event loop so a slow or unreachable PLC doesn't stall the tag
    # WebSocket for every other connected client while this waits.
    return await asyncio.to_thread(_run_plc_test, cfg)


# ── App Builder — package this whole app (frontend + backend) as one exe ──────

@app.post("/api/generate-app-exe")
async def generate_app_exe(request: Request):
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="body is not valid JSON")
    plc_cfg = config_store.load_json("savedPlcConfig.json")
    if not plc_cfg or not (plc_cfg.get("ip") or "").strip():
        raise HTTPException(
            status_code=400,
            detail="No PLC connection info saved yet — fill in the PLC Connection Test form first.",
        )
    build_id = exe_builder.start_build(payload.get("clientName") or "", payload.get("selection") or {})
    return {"ok": True, "buildId": build_id}


@app.get("/api/generate-app-exe/{build_id}/status")
def app_exe_status(build_id: str):
    job = exe_builder.get_build(build_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown build id")
    return {
        "status": job["status"],
        "error": job["error"],
        "exeName": job["exe_name"],
        "log": job["log"][-4000:] if job["log"] else "",
    }


@app.get("/api/generate-app-exe/{build_id}/download")
def app_exe_download(build_id: str):
    job = exe_builder.get_build(build_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown build id")
    if job["status"] != "done" or not job["exe_path"]:
        raise HTTPException(status_code=409, detail=f"Build not ready (status: {job['status']})")
    return FileResponse(job["exe_path"], filename=job["exe_name"], media_type="application/octet-stream")


# ── PLC Connection Test page — quick test exe (a few ad-hoc tags only) ─────────

@app.post("/api/build-plc-test-exe")
async def build_plc_test_exe(request: Request):
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="body is not valid JSON")
    # Uses the connection fields straight from the request body (the PLC
    # Connection Test page's current form state) rather than re-reading the
    # backend's own saved file — this build is meant to work from whatever
    # is on the page right now, with no separate successful save required.
    plc_cfg = payload.get("plcConfig") or {}
    if not (plc_cfg.get("ip") or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Fill in the IP address field above first — the test exe needs it to know what to connect to.",
        )
    tags = payload.get("tags") or []
    if not tags:
        raise HTTPException(status_code=400, detail="Add at least one tag to test")
    build_id = test_exe_builder.start_build(plc_cfg, tags)
    return {"ok": True, "buildId": build_id}


@app.get("/api/build-plc-test-exe/{build_id}/status")
def plc_test_exe_status(build_id: str):
    job = test_exe_builder.get_build(build_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown build id")
    return {
        "status": job["status"],
        "error": job["error"],
        "exeName": job["exe_name"],
        "log": job["log"][-4000:] if job["log"] else "",
    }


@app.get("/api/build-plc-test-exe/{build_id}/download")
def plc_test_exe_download(build_id: str):
    job = test_exe_builder.get_build(build_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown build id")
    if job["status"] != "done" or not job["exe_path"]:
        raise HTTPException(status_code=409, detail=f"Build not ready (status: {job['status']})")
    return FileResponse(job["exe_path"], filename=job["exe_name"], media_type="application/octet-stream")


# ── Built frontend (optional) — mounted last so it never shadows the routes
# above. Bundled at a fixed location inside a generated exe (see
# exe_builder.py); a plain dev/prod run instead looks next to this file.
def _frontend_dist() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass) / "frontend_dist"
    return Path(__file__).resolve().parent.parent / "frontend" / "dist"


_dist = _frontend_dist()
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")


if __name__ == "__main__":
    import threading
    import webbrowser

    import uvicorn

    # 127.0.0.1 by default: tag ingestion is unauthenticated, so opening it to
    # the LAN should be a deliberate choice (HOST=0.0.0.0), not the default.
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "50054"))

    # A generated exe is meant to be double-clicked by someone at the client
    # site with no dev tools around — open the app for them instead of
    # leaving a bare console window as the only sign anything happened.
    if getattr(sys, "frozen", False):
        threading.Timer(1.5, lambda: webbrowser.open(f"http://{host}:{port}/")).start()

    uvicorn.run(app, host=host, port=port)
