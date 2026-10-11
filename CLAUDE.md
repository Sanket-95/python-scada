# Protovec SCADA — Wagon Transport App

This file is auto-loaded by Claude Code whenever it works in this repo. It exists so
a Claude Code session on a *different machine* has full context without having lived
through the original debugging conversation. Read this before making changes.

## What this is

A SCADA visualization + control app for a plating-line wagon transport system
(wagons carrying barrels/baskets/racks between process tanks). Two active parts:

- **`backend-fastapi/`** — Python FastAPI backend: PLC polling, live tag WebSocket
  stream, saved config storage, exe builder.
- **`frontend/`** — React 19 + React Three Fiber (R3F) frontend: 3D/2D plant
  visualization, all configuration screens.

**Only these two folders matter.** The repo root also has `backend/` (old Node gRPC
client) and `dotnet-grpc/` (old .NET gRPC tag server) — both are legacy, superseded
by `backend-fastapi`, untouched for months. There's also an unrelated `indiscadapy/`
project (different client/system) sitting at the same level. Ignore all three.

## Architecture

```
PLC (Mitsubishi FX5U, MC protocol) <--poll--> plc_publisher.py --> TagStore --> WebSocket --> React frontend
                                                                       ^
savedUserConfig.json / savedPlcConfig.json <--- config_store.py ------+
(read by both the live poller AND the frontend's own REST config endpoints)
```

- **Live tags**: `plc_publisher.py` polls the PLC every 0.5s, publishes into
  `tag_store.TagStore`, which fans out over a WebSocket (`ws://host:50054/`) that the
  frontend's `useTagSocket.js` hook consumes. Every live value flows through this
  one path — tank load status, wagon location, lift/mode bits, station parameters,
  load numbers, everything.
- **Saved config**: `config_store.py` reads/writes JSON files. In dev, these live at
  `frontend/src/config/*.json` (same files the Vite dev server's own middleware in
  `vite.config.js` reads/writes — so dev-mode and the backend never disagree). In a
  **generated exe**, they live in a `config/` folder next to the exe; `exe_builder.py`
  seeds them once at build time from whatever's currently saved in dev.
- **Everything that needs to survive into a generated exe MUST go through
  `userCfg`** (persisted via `saveUserConfig()` + `saveUserConfigToFile()` in
  `WagonScada3D.jsx`, backed by `savedUserConfig.json`). Plain `localStorage` does
  **not** survive into an exe — this bit us once already (see Gotchas below).

## Backend modules (`backend-fastapi/`)

- `main.py` — FastAPI app, WebSocket tag stream, all REST endpoints (config
  get/save, PLC connection test, exe generation).
- `plc_publisher.py` — the live polling loop. Holds **one persistent PLC
  connection**, reused across polls (critical — see Gotchas). Reads tank-load tags,
  wagon-location tags, wagon lift/mode tags, station parameter tags, and station
  Load Number tags, all in one batch per poll tick. Has a `DEBUG_LOG` flag that
  prints every tag read to the console (shows in a built exe's console window too,
  since exes are built without `--noconsole`) — extremely useful for diagnosing live
  issues, was used heavily throughout this project's PLC debugging.
- `plc_clients/mitsubishi_client.py` — wraps `pymcprotocol.Type3E` with a **framed
  receive fix** (`_recv_exact`) and a **batched multi-tag read** (`read_tags_batch`).
  Both fixes were hard-won — see "The Mitsubishi PLC Saga" below before touching
  this file.
- `plc_clients/siemens_client.py`, `omron_client.py` — Siemens S7 (via `snap7`) and
  Omron FINS (via `finscommand`) clients, much simpler, no known issues.
- `config_store.py` — the JSON config read/write + exe-seed-copy logic described
  above.
- `tag_store.py` — in-memory tag store + WebSocket fan-out (simple pub/sub, replays
  the last batch to a newly-connected client).
- `exe_builder.py` — builds the **full app exe** (frontend + backend bundled by
  PyInstaller via the App Builder UI page). Seeds `savedPageSelection/PlcConfig/
  UserConfig/HeaderConfig.json` into the exe — nothing else. Any new persisted
  feature that isn't inside `userCfg` won't make it into a generated exe.
- `test_exe_builder.py` + `plc_test_logger.py` — builds a **tiny console-only exe**
  (no frontend, no FastAPI) that just connects to the saved PLC config and prints a
  handful of ad-hoc tags to the console forever. Triggered from the "Quick Test EXE"
  section of the PLC Connection Test page. Much faster to build than the full app
  exe — this was built specifically to speed up PLC debugging iteration.

## Frontend modules (`frontend/src/`)

- `components/WagonScada3D.jsx` — the mega-component. Contains almost everything:
  the sidebar nav, the 3D scene (`Scene3D`, `Tank3D`, `TankGroup3D`, `Wagon3D`), the
  2D pane wrapper, every live-tag effect (tank load, wagon location, wagon lift
  flag, wagon mode, station parameters, load numbers), and the top-level
  `WagonScadaApp` that owns `userCfg` and all the save handlers. If in doubt, this
  is probably the file to look in.
- `hooks/useWagonSimulation.js` — the wagon/station physics simulation (runs via
  `requestAnimationFrame`). Drives wagon `x` position, load animation state,
  station `hasLoad`/`fillLevel`/temperature. Exposes `setWagonTarget`,
  `snapWagonToTank`, `setWagonLoadFlag`, `setWagonMode`, `setStationHasLoad`.
  **Important**: uses a fixed-timestep catch-up loop (not a single `dt` per frame)
  specifically so the sim doesn't "pause" while the browser tab is hidden/minimized
  — see Gotchas.
- `config/tagConfig.js` — tag-config helpers: `getTankTags`, `getWagonTags`,
  `getStationParams`, `getStationLoadNumbers`, `TAG_DATA_TYPES`.
- `components/StationNamesConfigPage.jsx` — "STATION INFO — NAME CONFIGURATION"
  page. Shows each station's name (read-only, sourced from Mimic Page Config's
  label — this page used to have its own separate editable name, removed), the
  flexible parameter list (expand/collapse per station), the Load Number column +
  array-fill, and the Excel import trigger.
- `components/StationParamsImportModal.jsx` — Excel import for station parameters.
  **Wide format**: one row per station, a fixed 3-column group (`<Kind> Address`,
  `<Kind> Type`, `<Kind> Unit`) per recognized parameter kind, fully auto-detected
  from headers (no manual column mapping).
- `components/WagonTagsPage.jsx` — "WAGON LOCATION TAG CONFIGURATION" page: per-
  wagon location tag, up-lift/down-lift tags, auto/manual/service mode tags.
- `components/PlcConnectionTestPage.jsx` — brand/IP/port form + live connection
  test + the "Quick Test EXE" generator (array-fill tag entry, build/download).
- `components/TankTagsPage.jsx` — "MIMIC PAGE CONFIGURATION" — tag name/label/PLC
  address/type per tank, plus Excel import (`ExcelTagImportModal.jsx`).

## The Mitsubishi PLC saga (read before touching `mitsubishi_client.py`)

This took a very long debugging session against a real FX5U at `192.168.3.13`. The
short version, in order of what was tried:

1. **First symptom**: every tag read as exactly 0, no error. Root cause turned out
   to be a **partial-TCP-read bug**: `pymcprotocol`'s stock `_recv()` does a single
   `sock.recv()` call, which can return less than a full frame when the response is
   split across TCP segments. Fixed with `_recv_exact()` (loop until the full
   declared length is read).
2. **Wrong turn**: before finding the real cause, SLMP (a different, newer
   Mitsubishi protocol) was implemented from scratch, on the theory that
   `pymcprotocol`'s MC protocol 3E frame wasn't supported by FX5U/iQ-F series. This
   was **wrong** — confirmed by finding a working reference app (`ASTIMO/
   py_datalogger`, a sibling project under `D:\Protovec\SignalR\ASTIMO`) that
   successfully talks to the exact same hardware using plain `pymcprotocol` with
   just the `_recv_exact` fix. The SLMP implementation was deleted; don't reinvent
   it.
3. **Wrong port**: `5003` vs `5023` vs `5002` confusion — this FX5U has **multiple
   independent Ethernet "Open Settings"** in GX Works2/3, each bound to its own
   port (e.g. Movicon on 5022, a different data logger on 5023). The port that
   turned out correct for *this* station's PLC (`192.168.3.13`) was **5003**,
   confirmed against another already-working Python app at the site. Don't assume a
   port that worked on a different PLC (even a sibling one at the same plant)
   applies here — always get the exact port from a known-working reference for the
   *specific* PLC in question.
2. **Second symptom** (after the port/protocol was right): every single request —
   including the simplest possible one (a CPU-type read) — got back 0 bytes
   immediately, i.e. the PLC closed the connection on every request. Root cause:
   this FX5U's embedded Ethernet port **cannot handle many sequential individual
   requests fired back-to-back on one connection**, but answers one combined batch
   read fine. Fixed by adding `read_tags_batch()` to `MitsubishiClient`, which
   groups nearby tags into as few requests as possible (merges gaps ≤32 words, caps
   at 960 words/request — the same constants ASTIMO's reference app uses) instead
   of issuing one request per tag. **Any code path that reads multiple Mitsubishi
   tags must use `read_tags_batch()`, never loop `read_tag()` per tag** — both
   `plc_publisher.py` and `plc_test_logger.py` already do this; keep it that way.
3. Also removed an automatic `read_cputype()` call that used to fire right after
   `connect()` for diagnostics — turned out to be unreliable on this hardware and
   added risk for no real benefit. `connect()` now does only what the proven
   reference implementation does.
4. **Connection churn**: `plc_publisher.py` used to reconnect fresh every single
   poll tick (every 1.5s, later 0.5s). Given the above connection-sensitivity, this
   was changed to hold **one persistent connection across polls**, only reconnecting
   on a config change or a read failure (see `_get_client`/`_drop_held_client` in
   `plc_publisher.py`). Don't revert to connect-per-tick.
5. **Wrong data type**: temperature/PH station-parameter tags were initially
   configured as `float32`, producing tiny denormalized garbage values
   (`~1e-39`) — the classic signature of reading a plain scaled integer register as
   if it were an IEEE-754 float. The PLC actually stores these as `int16`
   scaled integers. Fixed in the saved config; **Actual PH displays as raw/100,
   everything else (including Temperature, per a later correction — the PLC already
   sends the final calculated value for Temperature) displays raw** — see
   `PARAM_SCALE` in `WagonScada3D.jsx`.

If a *new* PLC/station ever shows the "reads as 0" or "connection closes
immediately" symptom again, suspect the same two things first: a receive/batching
bug, or a wrong port — not a wrong protocol.

## Feature notes

- **Wagon location**: driven entirely by a live tag (tank number). The *first*
  value ever seen for a wagon places it there instantly (no drive-there animation —
  `snapWagonToTank`); every value after that animates a move (`setWagonTarget`). A
  wagon with a live location tag never runs the autonomous demo trip-picker again.
  0/missing value resolves to that wagon's own track's lowest tank number. Move
  speed is a **fixed** multiplier (`TAG_MOVE_SPEED_MUL` in `useWagonSimulation.js`,
  currently 15.3125× base speed — tuned up repeatedly on request), deliberately
  *not* using each wagon's randomized demo-speed variance, so loaded and empty
  wagons always move at the same speed.
- **Wagon load flag**: SET on Up-Lift tag = 1, RESET on Down-Lift tag = 1 (not 0 —
  this was flipped once and corrected). A latch, not a live snapshot — holds its
  last state when neither bit fires. Drives `wagon.loadPercent` directly (100/0),
  which the existing 3D rendering (`Wagon3D`) already keys the carried-load visual
  off of.
- **Wagon mode**: Auto/Manual/Service tags, mutually exclusive on the PLC. Shown as
  a blinking LED on a gray panel on the wagon's top side (green/orange/blue) plus a
  `-A`/`-M`/`-S` label suffix. A legend bar (semi-transparent, bottom of the 2D/3D
  viewport) explains the colors.
- **Station parameters**: a *flexible* (zero-to-many per station) list, each entry
  `{label, address, type, unit}`. `label` is a closed dropdown (`PARAM_KINDS`:
  Actual Temperature, Actual Current, Calculated Current, Set Current, Actual PH) —
  deliberately not free text, so other code can reliably group by kind. Published
  under a synthesized tag name `STATION_<id>_P<index>` (see
  `station_param_tag_name` in `plc_publisher.py` — frontend and backend must agree
  on this exact naming). Shown on that tank's hover tooltip with the live value.
- **Load Number**: a *separate*, single, always-`int16` tag per station (not part
  of the flexible list above) — tag name `STATION_<id>_LOADNUM`. Has its own
  array-fill UI (type a start address, auto-fills every station sequentially).
- **Hover tooltip**: multi-line (station name + each parameter + load number),
  enlarged font/padding on request. The 3D tank walls were made more transparent
  (opacity 0.32 → 0.18) and the in-tank/carried load items scaled up (1.4×/1.5×)
  and given a continuous slow Y-axis rotation (`RotatingGroup`, ~0.8 rad/s) so a
  load reads clearly from a distance.
- **Sidebar nav**: grouped under "MIMIC SCREEN CONFIGURATION" in a fixed order
  (System Config, Tank Partitions, Cross Trolley, Wagon Location Tags, Mimic Page
  Config, Station Info), with items genuinely indented (the old `sub: true` flag on
  nav items was dead code — didn't render any differently — now it actually
  indents).

## Gotchas (don't repeat these)

1. **`localStorage`-only config never survives into a generated exe.** Tank
   Partitions, Cross Trolleys, Station Columns, and Station Names were all
   `localStorage`-only for a long time, with zero backend file — `exe_builder.py`
   only ever seeds `savedPageSelection/PlcConfig/UserConfig/HeaderConfig.json`, so
   none of those four were ever included in a built exe no matter what was
   configured in the dev browser. All four were migrated into `userCfg` (with a
   one-time `localStorage` fallback for pre-existing data). **Any new feature that
   needs to show up in a built exe must live inside `userCfg`**, full stop.
2. **A stale browser tab's Save can silently revert a direct config edit.** If you
   (or a Claude session) edit `savedUserConfig.json` directly on disk while a
   browser tab has that page open with older in-memory state, the next time that
   tab's Save button is clicked it overwrites your edit with the stale data. If
   editing config directly, tell the user to close/avoid saving from any open tab
   for that page until after the next reload.
3. **PyInstaller's generated exes have no console by default removed** — i.e. they
   are built *without* `--noconsole`, so `print()` output is visible in a console
   window. But `print()` without `flush=True` block-buffers when stdout isn't a
   live TTY — always pass `flush=True` on debug prints meant to be seen live.
4. **`requestAnimationFrame` is throttled/paused for hidden or minimized browser
   windows.** The wagon simulation loop replays the real elapsed gap as a tight
   loop of fixed-size steps when it resumes, specifically so it "catches up" to
   where it should be instead of freezing — don't go back to a single
   capped-`dt`-per-frame model, it reintroduces the "wagon doesn't move in the
   background" bug.
5. **`memo()`-wrapped 3D components need their custom equality comparator updated**
   whenever a new live-data prop is added, or the component silently won't
   re-render when that data changes (see `Tank3D`'s comparator, which explicitly
   checks `stationParamValues[id]` for this reason).

## Dev workflow

- Frontend dev: `cd frontend && npm run dev` (Vite). Backend dev:
  `cd backend-fastapi && venv\Scripts\python main.py` (or `uvicorn main:app`).
  `vite.config.js`'s dev-only middleware proxies a few `/api/*` paths to the
  FastAPI backend on port 50054 — if a *new* backend endpoint is added, it must also
  be added to that proxy list or the dev frontend silently can't reach it (looks
  exactly like "can't reach the backend" with no server-side error).
- Full app exe: App Builder page in the sidebar (`devOnly`, hidden in a built exe).
- Quick PLC test exe: PLC Connection Test page's "Quick Test EXE" section — much
  faster to build, console-only, for checking a handful of tag addresses without
  waiting for the full app build.
- `backend-fastapi/.gitignore` excludes `venv/`, `builds/`, `test_builds/`,
  `__pycache__/`, `.pytest_cache/`. `frontend/.gitignore` excludes `node_modules/`,
  `dist/`, `.env`, `.claude/`.

## Repo

`https://github.com/Sanket-95/python-scada.git`, branch `main`. The saved plant
config (`frontend/src/config/saved*.json` — real PLC IP, real register addresses,
custom branding) is committed on purpose, by explicit choice, not an oversight.
