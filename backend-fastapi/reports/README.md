# Dairy Reports — mock-data reporting module

> **DEMO DATA — NOT FOR ACTUAL PRODUCTION OR QUALITY CERTIFICATION.**
> Every record is simulated (`is_mock: true`). Thresholds and process criteria
> are *illustrative demo rules — verify against current applicable standards*.
> Nothing here is a laboratory-certified result or an operating instruction.

Twelve reports for the fictional **Sahyadri Valley Dairy** demo plant — the same
plant drawn on the **Dairy 3D** screen (same tank and equipment IDs):

| # | Report | Endpoint |
|---|--------|----------|
| 1 | Daily Production Summary | `GET /api/reports/summary` |
| 2 | Daily Milk Collection | `GET /api/reports/collection` |
| 3 | Milk Quality Testing | `GET /api/reports/quality` |
| 4 | Cow vs Buffalo Milk | `GET /api/reports/milk-comparison` |
| 5 | Tank Inventory and Transfer | `GET /api/reports/tanks` · drill-down `GET /api/reports/tanks/{tank_id}/transfers` |
| 6 | Pasteurization and Processing | `GET /api/reports/processing` · detail `GET /api/reports/processing/{batch_id}` |
| 7 | Production and Packaging | `GET /api/reports/packaging` |
| 8 | CIP Cleaning | `GET /api/reports/cip` |
| 9 | Equipment Runtime and Downtime | `GET /api/reports/equipment-runtime` |
| 10 | Alarm and Event History | `GET /api/reports/alarms` |
| 11 | Milk Loss and Yield Reconciliation | `GET /api/reports/reconciliation` |
| 12 | Batch Traceability | `GET /api/reports/traceability/{id}` (batch, sample, delivery, FG batch, tank, centre or supplier) |

Also: `GET /api/reports/meta` (window, filter options, rules) and
`GET /api/reports/{report}/export?format=csv|pdf` (plus `/traceability/{id}/export`).

## Running it

```bash
# backend (serves the reports API on :50054)
cd backend-fastapi
python3 -m venv venv && venv/bin/pip install -r requirements-dev.txt   # first time only
venv/bin/python main.py

# frontend (second terminal) — Vite proxies /api/reports to the backend
cd frontend && npm run dev
```

Open the app → sidebar **Dairy Reports**.

**The Reports screen needs no backend and no database.** It runs a JavaScript
port of this module in the browser (`frontend/src/reports/engine/`: generator,
report calculations, CSV/PDF export), so `npm run dev` alone is enough and
there is never a proxy 504. This Python module is the same engine exposed as
a REST API for external use; the two share the same rules, IDs and envelope
shape (the random streams differ, so seeded numbers are not identical between
the browser and the API).

Tests:
- browser engine: `cd frontend && npm run test:reports`
- API: `cd backend-fastapi && venv/bin/python -m pytest test_reports.py -q`

## Query parameters (all report endpoints)

| Parameter | Values |
|-----------|--------|
| `mode` | `seeded` (default — repeatable, demo window 2025-07-21 → 2025-08-19) · `dynamic` (window ends today; nothing after the current time exists yet) |
| `start`, `end` | `YYYY-MM-DD`, inside the demo window (production day = 06:00 → 06:00) |
| `shift` | `Morning` (06–14) · `Afternoon` (14–22) · `Night` (22–06) |
| `milk_type` | `Cow` · `Buffalo` · `All` |
| `batch` | raw batch / delivery / sample / process batch / FG batch id |
| `center` | collection-centre id (`CC-01`…) or supplier id (`SUP-1001`…) |
| `equipment` | `PAST-01`, `HOMO-01`, `PACK-01`, `P-201`, `ST-COW-01`, `CIRC-PAST`, … |
| `status` | report-specific (see `/meta` → `statuses`) |
| `q` | free-text search across columns |
| `page`, `page_size`, `sort_by`, `sort_dir` | pagination (`pagination` block in every response) and sorting |

Invalid filters return **422** with an explanation. Every response is a
`ReportEnvelope` (`reports/models.py`): `report_id`, `generated_at`,
`demo_notice`, `period`, `filters`, `summary`, `rows`, `pagination`,
`columns`, `charts`, `notes`. Examples: `reports/examples/*.json`.

## How the data is generated (one source of truth)

`reports/generator.py` simulates the plant as a **chronological event timeline**
and every report is a filtered view of that one dataset, so totals and IDs agree
everywhere:

```
tanker arrives → intake sample tested → accept / partly reject / reject
→ unload into RT-01 (one milk type at a time) → diverter V-301 → ST-COW-01 / ST-BUF-01
→ process batch draws FIFO from the silo(s) → PAST-01 (+HOMO-01, COOL-01) → ST-PM-01
→ PACK-01 (500 mL) / PACK-02 (1000 mL) → cold storage CS-01 → dispatch
+ CIP after every batch and daily on tank circuits; equipment run/fault/down
  intervals; alarms raised only when the simulated condition happens.
```

Every litre moves through **FIFO lots**, so the source lots (and litres) of each
process batch are known exactly — that is what the traceability report follows.
Fictional data gaps are included on purpose (≈3 % of deliveries have no sample
record, ≈2 % of FG batches have no cold-storage scan, and opening stock from
before the window has no intake record) so the reports can show *missing links*
honestly instead of inventing them.

## Calculation conventions

* **Intake:** `gross = accepted + rejected + sample volume` (sample mL ÷ 1000).
  Accepted/rejected are stored to the millilitre so the identity holds exactly.
  Fully rejected loads are never unloaded.
* **Tanks:** `closing = opening + incoming − outgoing + documented adjustments`
  (none simulated); `level % = closing ÷ capacity × 100`. Opening/closing come
  from snapshots taken at every shift boundary. A transfer that would overfill a
  silo is limited and raises `CAPACITY_INTERLOCK`; a transfer into a silo that is
  feeding the line is blocked with `VALVE_CONFLICT`.
* **Quality:** values are rounded to reporting precision **first**, then judged
  against the configurable rules (`config.QUALITY_RULES`) — the flag always
  agrees with the value shown. Out-of-rule results are flagged, never altered.
  Unmeasured values are `null` → shown as **Not tested**.
* **Averages:** *simple* = every sample equal; *volume-weighted* =
  Σ(value × accepted litres) ÷ Σ accepted litres. Both are reported side by side.
* **Pasteurization (demo HTST 72 °C ≥ 15 s):** a batch is `COMPLETED` only if
  every minute of the outlet history is ≥ target while flow is forward **and**
  the holding time meets the minimum. Dip with flow diversion → `REVIEW REQUIRED`;
  dip without diversion or short hold → `FAILED DEMO CRITERIA`. Averages never
  pass a batch.
* **Packaging:** produced = accepted + rejected packs; finished volume =
  accepted packs × declared size, computed **per pack size**, then summed.
* **CIP:** completion is judged per phase (minimum time, minimum supply
  temperature, minimum flow, final-rinse conductivity) — not by elapsed time.
  Failed/incomplete cycles remain in the report. No dosing instructions.
* **Equipment runtime:** derived from run / fault / planned-down intervals with
  precedence FAULT > DOWN > RUN, so nothing double-counts;
  `idle = shift window − run − fault − planned down`.
* **Reconciliation:**
  `unexplained = opening + received − rejected − samples − finished − rejected packs − documented losses − closing`.
  It is reported as calculated (the simulation contains small unrecorded line
  losses on purpose) and **never forced to zero**. The mass balance uses a stated
  density assumption of 1.032 kg/L and is shown separately from volume.

## Dairy terms and units

| Term | Unit | Meaning |
|------|------|---------|
| Fat | % | Share of milk that is milk fat; affects energy, composition, cream separation and product specs. |
| SNF | % | Solids-not-fat — mainly protein, lactose and minerals. |
| Density | kg/L at 20 °C | Mass ÷ volume; varies with composition and temperature. Not the same as fat % or CLR. |
| CLR | — | Corrected lactometer reading. Demo convention: CLR = (ρ at 27 °C − 1.000) × 1000; real values depend on instrument scale, reference temperature and correction method. |
| Protein / Lactose | % | Separately simulated; measured on ~60 % of samples, otherwise *Not tested*. |
| Acidity | % lactic-acid equivalent | Titratable acidity — alkali needed to neutralise acids under a defined method. Not pH. |
| Sample temperature | °C | Temperature at measurement time. |
| Screening status | — | Not simulated · Pending · Screening pass · Screening review. A pass does not prove milk is free from every adulterant. |
| HTST | °C, s | High-temperature short-time pasteurization (demo 72 °C ≥ 15 s). |
| FDV | — | Flow-diversion valve — sends under-temperature milk back instead of forward. |
| CIP | — | Clean-in-place cycle: pre-rinse, cleaning-solution circulation, intermediate rinse, final rinse, sanitization. |

## Exports

CSV and PDF are produced (in the browser for the UI, or by the API's
`/export` endpoint) from the same envelope the screen shows
(same filters and period) and carry the report ID, generated timestamp, period,
filters and the DEMO notice. The PDF (no third-party dependency) adds a DEMO DATA
watermark and **Page X of Y** on every page. The screen's *Preview / Print* opens
a print layout of the full report (browser print → Save as PDF also works).

## Files

```
reports/config.py     plant, suppliers, tanks, equipment, demo rules (fictional)
reports/models.py     Pydantic schemas (records + ReportEnvelope)
reports/generator.py  seeded event-timeline generator (seeded / dynamic)
reports/service.py    filters, report calculations, reconciliation, traceability
reports/export.py     CSV + PDF writers
reports/api.py        FastAPI routes (/api/reports/*)
reports/examples/     example JSON responses
reports/screenshots/  sample screenshots
test_reports.py       automated tests
frontend/src/components/ReportsPage.jsx, frontend/src/reports/*   React UI
frontend/src/reports/engine/*   in-browser engine used by the UI (+ engine.test.js)
```
