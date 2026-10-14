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
  issues, was used heavily throughout this project's PLC debugging. Also runs
  `_resolve_wagon_part_numbers` after every poll's batch read — see "Part Number
  column" under Feature notes.
- `db_client.py` — SQL Server access for the Part Number column's PartName lookup,
  via `pymssql` (chosen over `pyodbc` specifically so a built exe doesn't depend on
  the Microsoft ODBC Driver for SQL Server being separately installed on whatever
  machine it runs on). Holds one persistent connection, reused across polls, same
  pattern as `plc_publisher.py`'s PLC connection. `test_connection()` backs the
  Database Connection Test page; `query_part_name()` backs the live lookup.
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
  UserConfig/HeaderConfig/DbConfig.json` into the exe — nothing else. Any new persisted
  feature that isn't inside `userCfg` (or one of these other seeded files) won't
  make it into a generated exe. Also passes `--collect-all pymssql` to PyInstaller
  (only when pymssql is actually importable in the venv running the build — checked
  via `importlib.util.find_spec`, so a build without it still succeeds and Part
  Number just stays dark, same as today). **Without this, a deployed exe's Part
  Number column silently never looks anything up**: pymssql is a C extension
  wrapping FreeTDS and ships its own DLLs inside the wheel, which PyInstaller's
  static import analysis doesn't find on its own — `plc_publisher.py`'s guarded
  `import db_client` then fails at exe runtime (even though it imports fine in the
  dev venv) and falls back to `db_client = None`, with the import failure now
  printed to the exe's console (previously silent — see Gotchas #6). If a report
  of "Part Number always 0/empty in the built exe" ever comes up again after this
  fix, check that console line first.
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
  `getStationParams`, `getStationLoadNumbers`, `getStationExtraCols`/
  `getStationExtraValues`, `getStationColumnOrder`/`orderStationColumns`/
  `FIXED_STATION_COLS`, `getWagonPartNumberTags`/`PART_NUMBER_TAG_FIELDS`,
  `TAG_DATA_TYPES`.
- `config/dbConfig.js` — SQL Server connection form persistence (Database Connection
  Test page), same dual localStorage + backend pattern as `config/plcConfig.js`.
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
- `components/DbConnectionTestPage.jsx` — SQL Server form (server/port/database/
  username/password) + live connection test, modeled directly on
  `PlcConnectionTestPage.jsx`'s layout/pattern. Sidebar nav id `db-test`, placed
  right under PLC Connection Test in the DIAGNOSTICS section. This is what the
  Part Number column (see Feature notes) queries live against. A read-only
  **CURRENT CONFIGURATION** card sits above the editable form (added on request
  — the password field being masked made it otherwise impossible to tell at a
  glance whether one was already saved), showing what's actually loaded from
  the server right now — Port shows "Auto (named instance)" when blank (see the
  named-instance port note below) and Password shows "••••••••• (saved)" or
  "Not configured", never the value itself.
  **Port defaults to blank, not 1433** — a named instance (e.g. `.\SQLEXPRESS`,
  the real shape of a connection this was built against) resolves its own,
  often dynamic, port via the SQL Server Browser service when no port is
  given; forcing 1433 by default would break that resolution. `db_client.py`'s
  `_connect()` only passes a `port` kwarg to `pymssql.connect()` when the user
  actually set one.
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
  `{label, address, type, unit}`. `label` is a closed dropdown (`PARAM_KINDS` in
  `tagConfig.js` — Actual Temperature, Actual Current, Calculated Current, Set
  Current, Actual PH; exported from there rather than kept private to
  `StationNamesConfigPage.jsx` so the Column Config/StationWise Info pages below
  can use the same list) — deliberately not free text, so other code can reliably
  group by kind. Published under a synthesized tag name `STATION_<id>_P<index>`
  (see `station_param_tag_name` in `plc_publisher.py` — frontend and backend must
  agree on this exact naming). Shown on that tank's hover tooltip with the live
  value. **Also surfaced as columns on the Column Config / StationWise Info pages**
  (on request — "same parameter apply on this screen also"): any kind already
  configured on at least one station gets its own column on both
  `StationColumnConfigPage.jsx` (`tagConfig.js`'s `getStationParamKinds` decides
  which — only kinds actually in use, never all of `PARAM_KINDS` unconditionally)
  and `StationInfoPage.jsx`, id'd by `paramKindColId(kind)` and folded into the
  same `orderStationColumns()` sequencing as the fixed/custom columns (its
  signature grew a third `paramColIds` argument for this). These columns are
  **not addable/removable from the Column Config page** — a kind only exists once
  it's added via "+ Add Parameter" on STATION INFO — NAME CONFIGURATION — but
  every station's address for that kind **is editable from both pages**, via the
  shared `tagConfig.js` helpers `findStationParamEntry`/`setStationParamAddress`,
  which edit the exact same `userCfg.stationParams` structure either page saves
  (if a station has more than one entry of the same kind — allowed — these
  helpers and the Column Config column only ever address the first; editing
  additional duplicates still needs the Name Configuration page). Live values on
  `StationInfoPage.jsx` come from a new `paramColValues` prop built in
  `WagonScada3D.jsx` (`stationParamColValues`), reusing the exact same tag name
  and `PARAM_SCALE` engineering-unit scaling as the hover tooltip's own
  `stationParamValues`, so a value shown in this column always matches the
  tooltip.
- **Load Number**: a *separate*, single, always-`int16` tag per station (not part
  of the flexible list above) — tag name `STATION_<id>_LOADNUM`. Has its own
  array-fill UI (type a start address, auto-fills every station sequentially).
- **Hover tooltip**: multi-line (station name + each parameter + load number),
  enlarged font/padding on request. The 3D tank walls were made more transparent
  (opacity 0.32 → 0.18) and the in-tank/carried load items scaled up (1.4×/1.5×)
  and given a continuous slow Y-axis rotation (`RotatingGroup`, ~0.8 rad/s) so a
  load reads clearly from a distance.
- **Sidebar nav**: two actual indent levels now (`item.depth`: 1 = child of the
  section heading, 2 = child of the nearest depth-1 item above it — the old
  `sub: true` boolean was dead code, replaced). Under "MIMIC SCREEN
  CONFIGURATION": **General Config** (depth 1) and **Mimic Config** (depth 1, nav
  id `config` — the old "System Config"/"Configuration", `ConfigPanel.jsx`,
  "PROTOVEC SCADA — SYSTEM CONFIGURATION") are siblings; **Mimic Station
  Config** (nav id `tags-config` — the old "Mimic Page Config",
  `TankTagsPage.jsx`, "MIMIC PAGE CONFIGURATION"), Tank Partitions, Cross Trolley,
  Wagon Location Tags, and Station Info are all depth 2, nested under Mimic
  Config. **StationWise Info Config** (nav id `station-cols` — `StationColumnConfigPage.jsx`,
  "STATION INFO — COLUMN CONFIGURATION") was deliberately pulled out of that group
  into its own separate top-level section ("STATION COLUMNS"), not nested under
  Mimic Config — kept it a standalone route on request. Sidebar *labels* have been
  renamed/reordered multiple times on request; the nav `id`s and each page's own
  on-screen title have not changed — use the `id` or the page's own title to
  identify a page in code, never the current sidebar label text.
- **Column Config page** (`StationColumnConfigPage.jsx`, `StationInfoPage.jsx`):
  went through many rounds of simplification on request and is now a **read-only
  mirror of Mimic Page Config**: it shows a STATION NO column (the tank id itself
  — ids are contiguous from 1 across all lines, so this also reads as a plain
  serial number) plus the STATION NAME column, rows built directly from
  `tankTags` (one row per configured tank, in tank-id order, label =
  `tankTags[id].label` — the same common/canonical source `StationNamesConfigPage.
  jsx` uses), plus a third **LOAD NO TAG** column. This page is itself a
  *configuration* page, so — on correction, after an earlier version showed
  the live value here and was confusingly always empty in dev with no PLC
  connected — it shows the **configured PLC address/tag** itself
  (`stationLoadNumbers[id]`, the same address set on
  `StationNamesConfigPage.jsx`'s "LOAD NUMBER" column; "Not configured" when
  blank), not a live reading. The live *value* of that tag belongs on the
  "actual" page — `StationInfoPage.jsx` — which reads it from
  `loadNumberValues` (built in `WagonScada3D.jsx` from `grpcTags`, the live
  tag WebSocket) instead. Keep this split: config pages show what's
  configured, `StationInfoPage.jsx` shows what's live. `DEFAULT_STATION_COLS`
  is now
  just `[]` (originally seeded Wagon/Operation/Station No/Station Name/Load No/
  Duration/Client Name/Part Name/Temp PV/Temp SV/Current PV/Current SV/pH PV — all
  removed over several requests). The **STATION NO / STATION NAME / LOAD NO
  TAG** columns themselves still have **no add, delete, reorder, hide/show,
  reset, or edit** (all removed on request, including one round that was
  reverted — see git history on `StationColumnConfigPage.jsx` before
  re-adding any of them) — "✔ Save Column Config" just persists the current
  tankTags-derived snapshot into `stationColCfg`, unchanged. **On top of
  that fixed set, "+ Add Column" (re-added later) lets the user define any
  number of extra columns** — own name + a `TAG_DATA_TYPES` data type — each
  rendered as its own column with a per-station **editable** PLC-address
  input (empty by default) plus a small "start address" box in the column
  header: typing a start address and leaving it (`onBlur`) auto-fills every
  station's address for that column incrementally (same letters-prefix +
  zero-padded-number scheme as `StationNamesConfigPage.jsx`'s Load Number
  array fill), after which any individual row can still be hand-edited. A
  column can be removed with the × next to its name. **The data type is also
  editable after creation** (on request — it used to be a one-shot choice
  made only in the "+ Add Column" form, shown read-only afterward; the
  header now has a live `TAG_DATA_TYPES` `<select>` instead of a plain label)
  — takes effect on the next poll since `plc_publisher.py`'s
  `_station_extra_col_tags` reads `col.get("dataType")` fresh from
  `stationExtraCols` every tick, no backend change needed for this. Source of truth:
  `userCfg.stationExtraCols` (`[{id, name, dataType}, ...]`) +
  `userCfg.stationExtraValues` (`{stationId: {colId: address}}`), both saved
  together via `onSaveExtra` from the same Save button. The backend
  publishes each configured one under `STATION_<id>_X_<colId>`
  (`station_extra_col_tag_name` in `plc_publisher.py` — frontend and backend
  must agree on this exact naming, same convention as `station_param_tag_name`/
  `station_load_number_tag_name`), read with that column's own data type.
  `StationInfoPage.jsx` reflects these same columns with their live value
  from `extraLiveValues` (`{stationId: {colId: value}}`, built in
  `WagonScada3D.jsx` from `grpcTags` — "—" until a PLC is connected and that
  station has an address configured for that column). **`StationInfoPage.jsx`'s
  column set is now exactly the Column Config page's column set, nothing
  more** — on explicit request ("only shows column data whose configured in
  [Column Config]"), its old fixed 13-column list (Wagon, Operation, Station
  No, Station Name, Load No, Duration, Client Name, Part Name, Temp PV, Temp
  SV, Current PV, Current SV, pH PV) was cut down to just **Station No,
  Station Name, Load No** — the three the Column Config page always shows —
  plus any custom columns. Wagon/Operation (which wagon is at a station, its
  current operation) and the Temp/Current/pH `stationParamValues`-driven
  columns were deleted outright, not hidden — none of them are part of the
  Column Config page's column set, so per that instruction they don't belong
  here; `stationParamValues` is no longer a prop of this page at all (still
  used elsewhere, e.g. the hover tooltip — see `WagonScada3D.jsx`). **If a
  future request wants per-station operational/parameter data back on this
  page, the right fix is to make it configurable on the Column Config page
  first** (e.g. another custom column, or a new fixed one there), not to
  re-add it directly to `StationInfoPage.jsx` — that would reopen the exact
  mismatch this request closed. **Every column — the three fixed ones
  included — can also be moved left/right**, per explicit request that
  Column Config's column order "also reflect in station wise info screen".
  Each header on `StationColumnConfigPage.jsx` gets ◀/▶ buttons
  (`moveColumn`, swaps with the adjacent id in a local `order` array of
  column ids — nothing is pinned); the canonical ids both pages share are
  `'stNo'`/`'stName'`/`'loadNo'` for the fixed three (note: **not**
  `'loadNoTag'`, so the id matches `StationInfoPage.jsx`'s own id for that
  same conceptual column) plus each custom column's own id. Persisted as
  `userCfg.stationColOrder` (flat array of ids), saved in the same
  `onSaveExtra(cols, addrs, order)` call. Both pages resolve a saved order
  against whatever columns currently exist via the shared
  `orderStationColumns(order, extraCols)` helper in `tagConfig.js` (also
  exports `FIXED_STATION_COLS`) — it drops ids for columns since removed and
  appends any column not yet in the saved order (e.g. one added after the
  order was last saved) at the end, so the two pages can never disagree on
  sequence. `StationInfoPage.jsx` builds its `activeCols` by mapping that
  same ordered id list through a small `COL_LABELS` lookup (fixed ids) /
  `extraCols` (custom ids) — don't let this drift back into a separately
  maintained fixed `INFO_COLS` list, or the two pages' column order will
  silently diverge again. `colConfig` is still read here, but only to source the **Station
  No / Station Name cell values** (`colConfig[absIdx]?.stationNo` / `.label`,
  matched by row position against the Column Config page's saved snapshot —
  the "reflect this screen's data onto StationWise Info" wiring), falling
  back to computing them directly from `tankTags`/`stationNames` if
  `stationColCfg` hasn't been saved yet. **Load No** reflects the live
  `STATION_<id>_LOADNUM` tag via `loadNumberValues` (same value the Column
  Config page's own Load No Tag column's live reading would be) — "—" until
  a PLC is connected. All earlier mock/simulated logic (random-noise
  `currents`, hardcoded PH values, a fake `ALARMS` ticker, an always-"Auto"
  Plant Status badge, a fake `+14` on the alarm count) stays deleted, not
  replaced. **CommStatus** is still wired to the real `connected` prop
  (`useTagSocket`'s connection state, threaded down from `WagonScada3D.jsx`)
  — genuine live information, kept.
- **Part Number column** (the Column Config page's 4th fixed column, alongside
  Station No/Name/Load No Tag — `FIXED_STATION_COLS` in `tagConfig.js`): unlike
  every other column, its value isn't read from a plain per-station PLC address —
  it's derived from a **wagon event + a SQL Server lookup**. Each wagon logs its
  last Get/Put event on 6 PLC tags (`Get(1)/Put(2)`, `Station No`, `Year`/`Month`/
  `Date` of the event, `Load No` — all `int16` except `Load No`, `uint16`). When a
  wagon's `Get(1)/Put(2)` tag reads **2 (Put)**, `plc_publisher.py`'s
  `_resolve_wagon_part_numbers` (runs after every poll's batch read, since the 6
  source tags are folded into that same batch — see
  `_wagon_part_number_source_tags`) composes a load-number string
  `{2000+year}/{month:02d}/{date:02d}-{loadNo}` — e.g. year `26` → `2026` (**the
  PLC stores the year as 2 digits on purpose, this is not a bug** — confirmed
  against a live test-exe reading that matched the actual current date) — and
  looks it up via `db_client.query_part_name()`:
  `SELECT [PartName] FROM [dbo].[LoadPartDetails] WHERE LoadNumber = %s`
  (parameterized, against whatever `database` is set on the Database Connection
  Test page). The result is published under `STATION_<id>_PARTNUMBER` (`id` =
  that event's own `Station No` tag value, read dynamically — the backend doesn't
  need to know in advance which station a wagon will name) — the exact same
  per-station publish convention as Load Number, so
  `StationInfoPage.jsx`'s `partNumberValues` prop just scans `grpcTags` for
  `STATION_*_PARTNUMBER` keys. **Latched, not cleared on Get (1)**: a station's
  last-looked-up PartName stays shown until a *different* composed load number
  triggers a new lookup — per spec this represents "what's currently in this
  station," not something to blank out when a wagon's Get/Put bit flips. The DB
  is only queried on a genuinely new composed string per wagon (`_last_part_lookup`
  cache), not every 0.5s poll tick while a wagon sits at Put=2. Because the 6
  source tags are **per-wagon**, not per-station, they can't be configured as a
  per-station address like every other column — they get their own panel on the
  Column Config page ("⚙ Configure Part Number Tags", one row per wagon, 6
  address inputs), saved via `onSavePartNumberTags` into
  `userCfg.wagonPartNumberTags` (`{wagonId: {getPut, stnNo, year, month, date,
  loadNo}}`) alongside everything else from that page's one Save button. The
  Column Config page's own Part Number *cell* just shows a static "Live — wagon
  Put event" label per row (there's nothing per-station to configure there).
  `backend-fastapi/db_client.py` uses `pymssql`, not `pyodbc` — picked
  specifically because a generated exe can't guarantee the Microsoft ODBC Driver
  for SQL Server is installed on whatever machine it runs on, while `pymssql`
  has no external dependency (same reasoning as every other "must survive into
  an exe" decision in this file). Connection info lives in `savedDbConfig.json`
  (own file, same `_register_config_route`/seed pattern as `savedPlcConfig.json`
  — **not** inside `userCfg`, since it's credentials, not app config), edited on
  the new **Database Connection Test** page (`DbConnectionTestPage.jsx`,
  `config/dbConfig.js`, `POST /api/db-test-connection`) — placed in the sidebar
  right under PLC Connection Test. If a new PLC/station ever needs Part-Number-
  style "derived from several tags + an external lookup" logic, follow this same
  shape: fold the source tags into the normal PLC batch read, resolve/publish in
  a dedicated function that runs after `store.set_many(batch)`, and give it its
  own per-entity (not per-station) config panel rather than forcing it into the
  generic "+Add Column" one-address-one-datatype shape.

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
6. **A guarded `try: import X / except ImportError: X = None` pattern (used for
   `db_client`/pymssql, so missing it never takes down the rest of PLC polling)
   must still log the exception, not swallow it silently.** A silent fallback here
   was exactly why a deployed exe's Part Number column came back empty with
   nothing in the console to explain why — pymssql imported fine in the dev venv
   but failed in the frozen exe because its DLLs weren't bundled (see
   `exe_builder.py`'s `--collect-all pymssql` fix). `plc_publisher.py` now prints
   the actual `ImportError` at startup, and `_resolve_wagon_part_numbers` now logs
   (behind `DEBUG_LOG`) every other point where it would otherwise silently do
   nothing — no `wagonPartNumberTags` configured, no DB server configured, a
   required source tag not yet answered, a non-numeric tag value, a Get (not Put)
   event, and a DB query that ran but matched no `LoadPartDetails` row. If a
   derived/looked-up value ever "just doesn't show up" again, check this function's
   console output first before assuming the PLC or DB side is wrong.
7. **A config page's Save button that calls several `handleSave*` props back-to-
   back in one click (Station Info Column Config: `onSave` + `onSaveExtra` +
   `onSavePartNumberTags` + `onSaveStationParams`; Station Info Name
   Configuration: `onSave` + `onSaveParams` + `onSaveParamLabels` +
   `onSaveLoadNumbers`) will silently drop every field except the LAST call's if
   each `handleSave*` builds its `newCfg` as `{ ...userCfg, ownField: ... }` off
   the plain `userCfg` state variable** — that variable is a stale closure
   snapshot from this render, unchanged by an earlier `setUserCfg` call in the
   same synchronous click (no re-render happens between them), so every call in
   the chain computes its `newCfg` from the SAME pre-click data and each
   `setUserCfg`/disk-write overwrites the previous one's field instead of merging
   with it. **Reported symptom**: editing a custom column's data type on Station
   Info Column Config and clicking Save showed the *previous* data type again on
   reload — the data-type edit was the 2nd of 4 chained calls, clobbered by the
   3rd/4th. Fixed with `userCfgRef` (a `useRef` kept in sync with `userCfg` on
   every render) in `WagonScadaApp` (`WagonScada3D.jsx`): every `handleSave*`
   now reads `userCfgRef.current` instead of `userCfg`, and sets
   `userCfgRef.current = newCfg` immediately after computing it — so the next
   handler in the same click chain builds on top of the previous one's change
   instead of a stale snapshot. **Any new `handleSave*` added to this component
   must follow the same `userCfgRef.current` pattern**, especially if its page's
   Save button might ever call it alongside another handler.

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
