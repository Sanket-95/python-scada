"""Report calculations — every report is a filtered view of the ONE shared
dataset from generator.get_dataset(), so totals agree across reports.

Conventions (also returned in each report's `notes`):
  • Intake: gross = accepted + rejected + documented sample volume.
  • Tank balance: closing = opening + incoming − outgoing (+ documented adjustments, none simulated).
  • Finished-product volume = accepted packs × declared pack size, summed per pack size.
  • Volume-weighted averages weight each sample by the accepted litres it represents.
  • Missing data stays missing (None) — never replaced by zero.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from . import config as C
from .generator import Dataset, day_start, get_dataset, iso, prod_day
from .models import Pagination, ReportEnvelope

SHIFTS = list(C.SHIFTS)
MILK_TYPES = ["Cow", "Buffalo", "All"]
REPORT_TITLES = {
    "summary": "Daily Production Summary",
    "collection": "Daily Milk Collection Report",
    "quality": "Milk Quality Testing Report",
    "milk-comparison": "Cow vs Buffalo Milk Report",
    "tanks": "Tank Inventory and Transfer Report",
    "processing": "Pasteurization and Processing Report",
    "packaging": "Production and Packaging Report",
    "cip": "CIP Cleaning Report",
    "equipment-runtime": "Equipment Runtime and Downtime Report",
    "alarms": "Alarm and Event History Report",
    "reconciliation": "Milk Loss and Yield Reconciliation Report",
    "traceability": "Batch Traceability Report",
}


class FilterError(ValueError):
    pass


@dataclass
class Filters:
    mode: str = "seeded"
    start: Optional[date] = None
    end: Optional[date] = None
    shift: Optional[str] = None
    milk_type: Optional[str] = None
    batch: Optional[str] = None
    center: Optional[str] = None        # collection centre id OR supplier id
    equipment: Optional[str] = None
    status: Optional[str] = None
    q: Optional[str] = None
    page: int = 1
    page_size: int = 50
    sort_by: Optional[str] = None
    sort_dir: str = "asc"
    ds: Optional[Dataset] = field(default=None, repr=False)

    def as_dict(self) -> Dict[str, Any]:
        return {k: (v.isoformat() if isinstance(v, date) else v) for k, v in self.__dict__.items()
                if k not in ("ds", "page", "page_size", "sort_by", "sort_dir") and v not in (None, "")}


def make_filters(mode="seeded", start=None, end=None, shift=None, milk_type=None, batch=None, center=None,
                 equipment=None, status=None, q=None, page=1, page_size=50, sort_by=None, sort_dir="asc") -> Filters:
    if mode not in ("seeded", "dynamic"):
        raise FilterError("mode must be 'seeded' or 'dynamic'")
    ds = get_dataset(mode)
    try:
        s = date.fromisoformat(start) if start else ds.window_end
        e = date.fromisoformat(end) if end else s
    except ValueError:
        raise FilterError("start/end must be dates in YYYY-MM-DD format")
    if s > e:
        raise FilterError("start date is after end date")
    if s < ds.window_start or e > ds.window_end:
        raise FilterError(f"dates must be within the demo window {ds.window_start} … {ds.window_end}")
    if shift and shift not in SHIFTS:
        raise FilterError(f"shift must be one of {SHIFTS}")
    if milk_type and milk_type not in MILK_TYPES:
        raise FilterError(f"milk_type must be one of {MILK_TYPES}")
    if equipment and equipment not in C.EQUIPMENT and equipment not in C.TANKS and equipment not in C.CIP_CIRCUITS:
        raise FilterError("unknown equipment id")
    if not (1 <= page_size <= 10000) or page < 1:
        raise FilterError("page must be ≥ 1 and page_size 1–10000")
    if sort_dir not in ("asc", "desc"):
        raise FilterError("sort_dir must be asc or desc")
    return Filters(mode, s, e, shift or None, None if milk_type in (None, "", "All") else milk_type, batch or None,
                   center or None, equipment or None, status or None, q or None, page, page_size, sort_by, sort_dir, ds)


# ── helpers ──────────────────────────────────────────────────────────────────
def in_period(f: Filters, rec_date: str, rec_shift: Optional[str] = None) -> bool:
    d = date.fromisoformat(rec_date)
    if not (f.start <= d <= f.end):
        return False
    return not (f.shift and rec_shift and rec_shift != f.shift)


def text_match(f: Filters, row: Dict[str, Any]) -> bool:
    if not f.q:
        return True
    q = f.q.lower()
    return any(q in str(v).lower() for v in row.values() if isinstance(v, (str, int, float)))


def paginate(rows: List[Dict[str, Any]], f: Filters) -> Tuple[List[Dict[str, Any]], Pagination]:
    rows = [r for r in rows if text_match(f, r)]
    if f.sort_by:
        present = [r for r in rows if r.get(f.sort_by) is not None]
        missing = [r for r in rows if r.get(f.sort_by) is None]   # missing values always last
        present.sort(key=lambda r: r[f.sort_by], reverse=f.sort_dir == "desc")
        rows = present + missing
    total = len(rows)
    pages = max(1, -(-total // f.page_size))
    a = (min(f.page, pages) - 1) * f.page_size
    return rows[a:a + f.page_size], Pagination(page=min(f.page, pages), page_size=f.page_size, total=total, pages=pages)


def r1(x: Optional[float], n: int = 1) -> Optional[float]:
    return None if x is None else round(x, n)


def mean(xs: List[float]) -> Optional[float]:
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def wmean(pairs: List[Tuple[Optional[float], float]]) -> Optional[float]:
    """Volume-weighted mean: Σ(value × litres) / Σ litres over records that HAVE a value and a weight."""
    pairs = [(v, w) for v, w in pairs if v is not None and w > 0]
    tw = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / tw if tw else None


def envelope(report: str, f: Filters, **kw) -> Dict[str, Any]:
    gen = datetime.now()
    h = hashlib.sha1(f"{report}|{f.as_dict()}|{gen:%Y%m%d%H%M%S}".encode()).hexdigest()[:6].upper()
    env = ReportEnvelope(
        report_id=f"RPT-{report.upper()[:4]}-{f.end:%Y%m%d}-{h}", report=report, title=REPORT_TITLES[report],
        generated_at=iso(gen), demo_notice=C.DEMO_NOTICE, mode=f.mode,
        period={"start": f.start.isoformat(), "end": f.end.isoformat(), "shift": f.shift or "All shifts",
                "window": [f.ds.window_start.isoformat(), f.ds.window_end.isoformat()],
                "simulation_clock": iso(f.ds.now) if f.ds.now else None},
        filters=f.as_dict(), **kw)
    return env.model_dump()


def period_bounds(f: Filters) -> Tuple[datetime, datetime]:
    a = day_start(f.start)
    b = day_start(f.end + timedelta(days=1))
    if f.ds.now and b > f.ds.now:
        b = f.ds.now
    return a, b


def snapshot_at(ds: Dataset, ts: datetime):
    """Latest snapshot at or before ts (snapshots are taken at every shift boundary)."""
    key = iso(ts)
    best = None
    for s in ds.snapshots:
        if s.timestamp <= key:
            best = s
        else:
            break
    return best


def deliveries(f: Filters):
    out = []
    for d in f.ds.deliveries:
        if not in_period(f, d.report_date, d.shift):
            continue
        if f.milk_type and d.milk_type != f.milk_type:
            continue
        if f.center and f.center not in (d.center_id, d.supplier_id):
            continue
        if f.batch and f.batch not in (d.batch_id, d.delivery_id):
            continue
        if f.status and f.status != d.quality_status:
            continue
        out.append(d)
    return out


def samples(f: Filters):
    out = []
    for s in f.ds.samples:
        if not in_period(f, s.report_date, s.shift):
            continue
        if f.milk_type and s.milk_type != f.milk_type:
            continue
        if f.center and f.center not in (s.center_id, s.supplier_id):
            continue
        if f.batch and f.batch not in (s.batch_id, s.sample_id, s.delivery_id):
            continue
        if f.status and f.status != s.result_status:
            continue
        out.append(s)
    return out


# ── 2. Collection ────────────────────────────────────────────────────────────
COL_COLLECTION = [
    {"key": "delivery_id", "label": "Delivery"}, {"key": "batch_id", "label": "Batch"},
    {"key": "arrival_time", "label": "Arrival", "kind": "datetime"}, {"key": "center_name", "label": "Collection centre"},
    {"key": "supplier_id", "label": "Supplier"}, {"key": "tanker_id", "label": "Tanker"}, {"key": "milk_type", "label": "Milk"},
    {"key": "gross_l", "label": "Gross", "unit": "L"}, {"key": "sample_ml", "label": "Sample", "unit": "mL"},
    {"key": "accepted_l", "label": "Accepted", "unit": "L"}, {"key": "rejected_l", "label": "Rejected", "unit": "L"},
    {"key": "temperature_c", "label": "Temp", "unit": "°C"}, {"key": "quality_status", "label": "Quality", "kind": "status"},
    {"key": "receiving_tank", "label": "Tank"}, {"key": "unload_start", "label": "Unload start", "kind": "datetime", "hidden": True},
    {"key": "unload_end", "label": "Unload end", "kind": "datetime", "hidden": True},
    {"key": "collection_time", "label": "Collected", "kind": "datetime", "hidden": True},
    {"key": "operator_id", "label": "Operator", "hidden": True}, {"key": "sample_id", "label": "Sample ID", "hidden": True},
    {"key": "reject_reason", "label": "Reject reason", "hidden": True},
]


def collection_summary(rows) -> Dict[str, Any]:
    cow = [d for d in rows if d.milk_type == "Cow"]
    buf = [d for d in rows if d.milk_type == "Buffalo"]
    gross = sum(d.gross_l for d in rows)
    acc = sum(d.accepted_l for d in rows)
    rej = sum(d.rejected_l for d in rows)
    smp = sum(d.sample_ml for d in rows) / 1000
    return {
        "total_received_l": r1(gross), "cow_received_l": r1(sum(d.gross_l for d in cow)),
        "buffalo_received_l": r1(sum(d.gross_l for d in buf)), "accepted_l": r1(acc), "rejected_l": r1(rej),
        "samples_l": r1(smp, 2), "deliveries": len(rows),
        "avg_receiving_temp_c": r1(mean([d.temperature_c for d in rows]), 2),
        "intake_balance_difference_l": r1(gross - acc - rej - smp, 2),
    }


def daily_series(f: Filters, rows, value: Callable, key: Callable) -> List[Dict[str, Any]]:
    days = [(f.start + timedelta(days=i)).isoformat() for i in range((f.end - f.start).days + 1)]
    out = {d: {} for d in days}
    for r in rows:
        k = key(r)
        out[r.report_date][k] = out[r.report_date].get(k, 0) + value(r)
    return [{"x": d, **{k: round(v, 1) for k, v in out[d].items()}} for d in days]


def report_collection(f: Filters):
    rows = deliveries(f)
    page, pag = paginate([d.model_dump() for d in rows], f)
    return envelope("collection", f, summary=collection_summary(rows), rows=page, pagination=pag, columns=COL_COLLECTION,
                    charts={"daily": daily_series(f, rows, lambda d: d.gross_l, lambda d: d.milk_type)},
                    notes=["Convention: gross = accepted + rejected + documented sample volume (sample mL ÷ 1000). "
                           "intake_balance_difference_l shows any residual (expected 0 within record rounding).",
                           "Fully rejected loads are not unloaded — unload times and receiving tank are blank.",
                           "Average receiving temperature is a simple mean over deliveries."])


# ── 3. Quality ───────────────────────────────────────────────────────────────
COL_QUALITY = [
    {"key": "sample_id", "label": "Sample"}, {"key": "batch_id", "label": "Batch"}, {"key": "milk_type", "label": "Milk"},
    {"key": "center_name", "label": "Collection centre"}, {"key": "supplier_id", "label": "Supplier", "hidden": True},
    {"key": "sample_time", "label": "Sampled", "kind": "datetime", "hidden": True}, {"key": "test_time", "label": "Tested", "kind": "datetime"},
    {"key": "fat_pct", "label": "Fat", "unit": "%", "info": "fat"}, {"key": "snf_pct", "label": "SNF", "unit": "%", "info": "snf"},
    {"key": "density_kg_l", "label": "Density @20 °C", "unit": "kg/L", "info": "density"}, {"key": "clr", "label": "CLR @27 °C", "info": "clr"},
    {"key": "protein_pct", "label": "Protein", "unit": "%"}, {"key": "lactose_pct", "label": "Lactose", "unit": "%"},
    {"key": "acidity_pct_la", "label": "Acidity", "unit": "% LA", "info": "acidity"}, {"key": "sample_temp_c", "label": "Sample temp", "unit": "°C"},
    {"key": "screening_status", "label": "Screening", "info": "screening"}, {"key": "result_status", "label": "Result", "kind": "status"},
    {"key": "review_reasons", "label": "Review reasons", "hidden": True}, {"key": "instrument_id", "label": "Instrument", "hidden": True},
    {"key": "method", "label": "Method", "hidden": True}, {"key": "reviewer_id", "label": "Reviewer", "hidden": True},
]


def report_quality(f: Filters):
    rows = samples(f)
    dl = deliveries(Filters(**{**f.__dict__, "status": None, "batch": f.batch}))
    missing = [d for d in dl if d.sample_id is None]
    tested = [s for s in rows if s.fat_pct is not None]
    by = lambda st: sum(1 for s in rows if s.result_status == st)
    page, pag = paginate([s.model_dump() for s in rows], f)
    return envelope("quality", f, rows=page, pagination=pag, columns=COL_QUALITY,
                    summary={"samples": len(rows), "tested": len(tested), "within_demo_rules": by("Within demo rules"),
                             "review_required": by("Review required"), "rejected": by("Rejected"), "pending": by("Pending"),
                             "not_tested_missing_record": len(missing),
                             "avg_fat_pct_simple": r1(mean([s.fat_pct for s in tested]), 2),
                             "avg_snf_pct_simple": r1(mean([s.snf_pct for s in tested]), 2)},
                    charts={"rules": C.QUALITY_RULES, "methods": C.QUALITY_METHODS},
                    notes=[C.ILLUSTRATIVE + " — all thresholds come from the configurable demo specification.",
                           "Results outside a rule are flagged for review; measurements are never altered.",
                           "Protein / lactose are measured on ~60 % of samples; unmeasured values show as 'Not tested'.",
                           "Screening status never proves milk is free from every adulterant."])


# ── 5. Cow vs Buffalo ────────────────────────────────────────────────────────
def report_comparison(f: Filters):
    ff = Filters(**{**f.__dict__, "milk_type": None})
    dl, sm = deliveries(ff), samples(ff)
    metrics = []

    def stats(kind):
        d = [x for x in dl if x.milk_type == kind]
        s = [x for x in sm if x.milk_type == kind and x.fat_pct is not None]
        g = sum(x.gross_l for x in d)
        return {
            "total_received_l": r1(g), "accepted_l": r1(sum(x.accepted_l for x in d)), "rejected_l": r1(sum(x.rejected_l for x in d)),
            "deliveries": len(d), "avg_delivery_l": r1(g / len(d)) if d else None, "samples_tested": len(s),
            "review_count": sum(1 for x in s if x.result_status in ("Review required", "Rejected")),
            "fat_simple": r1(mean([x.fat_pct for x in s]), 2), "fat_weighted": r1(wmean([(x.fat_pct, x.weight_l) for x in s]), 2),
            "snf_simple": r1(mean([x.snf_pct for x in s]), 2), "snf_weighted": r1(wmean([(x.snf_pct, x.weight_l) for x in s]), 2),
            "density_simple": r1(mean([x.density_kg_l for x in s]), 4), "density_weighted": r1(wmean([(x.density_kg_l, x.weight_l) for x in s]), 4),
            "acidity_simple": r1(mean([x.acidity_pct_la for x in s]), 3), "acidity_weighted": r1(wmean([(x.acidity_pct_la, x.weight_l) for x in s]), 3),
            "temp_simple": r1(mean([x.temperature_c for x in d]), 2), "temp_weighted": r1(wmean([(x.temperature_c, x.gross_l) for x in d]), 2),
        }
    cow, buf = stats("Cow"), stats("Buffalo")
    labels = [
        ("total_received_l", "Total received", "L", "sum"), ("accepted_l", "Accepted", "L", "sum"), ("rejected_l", "Rejected", "L", "sum"),
        ("deliveries", "Deliveries", "", "count"), ("avg_delivery_l", "Average delivery size", "L", "simple"),
        ("samples_tested", "Samples tested", "", "count"), ("review_count", "Quality review / rejected", "", "count"),
        ("fat_simple", "Average fat", "%", "simple"), ("fat_weighted", "Average fat", "%", "volume-weighted"),
        ("snf_simple", "Average SNF", "%", "simple"), ("snf_weighted", "Average SNF", "%", "volume-weighted"),
        ("density_simple", "Average density @20 °C", "kg/L", "simple"), ("density_weighted", "Average density @20 °C", "kg/L", "volume-weighted"),
        ("acidity_simple", "Average acidity", "% LA", "simple"), ("acidity_weighted", "Average acidity", "% LA", "volume-weighted"),
        ("temp_simple", "Average receiving temperature", "°C", "simple"), ("temp_weighted", "Average receiving temperature", "°C", "volume-weighted"),
    ]
    for k, label, unit, method in labels:
        metrics.append({"metric": label, "unit": unit, "method": method, "cow": cow[k], "buffalo": buf[k], "key": k})
    return envelope("milk-comparison", f, rows=metrics, summary={"cow": cow, "buffalo": buf},
                    columns=[{"key": "metric", "label": "Metric"}, {"key": "method", "label": "Average type"},
                             {"key": "unit", "label": "Unit"}, {"key": "cow", "label": "Cow"}, {"key": "buffalo", "label": "Buffalo"}],
                    charts={"daily": daily_series(ff, dl, lambda d: d.gross_l, lambda d: d.milk_type)},
                    notes=["Volume-weighted averages weight each sample by the accepted litres it represents (rejected loads weigh 0).",
                           "Simple averages give every sample equal weight.",
                           "Cow and buffalo values vary within configurable demonstration ranges — no fixed composition is assumed."])


# ── 6. Tanks ─────────────────────────────────────────────────────────────────
def intervals_for(f: Filters) -> List[Tuple[datetime, datetime, str, str]]:
    """(start, end, report_date, shift) windows — whole days, or one shift per day when filtered."""
    out = []
    for i in range((f.end - f.start).days + 1):
        d = f.start + timedelta(days=i)
        ds = day_start(d)
        if f.shift:
            h0, h1 = C.SHIFTS[f.shift]
            out.append((ds + timedelta(hours=h0 - 6), ds + timedelta(hours=h1 - 6), d.isoformat(), f.shift))
        else:
            out.append((ds, ds + timedelta(days=1), d.isoformat(), "All"))
    if f.ds.now:
        out = [(a, min(b, f.ds.now), d, s) for a, b, d, s in out if a < f.ds.now]
    return out


def tank_rows(f: Filters, tank_ids: List[str]):
    rows = []
    for a, b, d, sh in intervals_for(f):
        so, sc = snapshot_at(f.ds, a), snapshot_at(f.ds, b)
        for tid in tank_ids:
            mv = [m for m in f.ds.movements if m.tank_id == tid and iso(a) <= m.timestamp < iso(b)]
            inc = sum(m.volume_l for m in mv if m.direction == "IN")
            out = sum(m.volume_l for m in mv if m.direction == "OUT")
            opening, closing = so.volumes[tid], sc.volumes[tid]
            cap = C.TANKS[tid]["capacity"]
            alarms = [x for x in f.ds.alarms if x.equipment_id == tid and iso(a) <= x.timestamp < iso(b)]
            pct = closing / cap * 100
            rows.append({
                "tank_id": tid, "tank_name": C.TANKS[tid]["name"], "milk_type": C.TANKS[tid]["milk"], "capacity_l": cap,
                "report_date": d, "shift": sh, "start": iso(a), "end": iso(b),
                "opening_l": r1(opening), "incoming_l": r1(inc), "outgoing_l": r1(out), "adjustments_l": 0.0,
                "closing_l": r1(closing), "balance_check_l": r1(opening + inc - out - closing, 2),
                "level_pct": r1(pct, 1), "temp_c": r1(sc.temps[tid], 1), "pump_id": C.TANKS[tid]["pump"],
                "valve_ids": C.TANKS[tid]["valves"], "transfers": len(mv),
                "transfer_batch_ids": sorted({bid for m in mv for bid in m.batch_ids})[:12],
                "status": "High" if pct >= C.TANK_HIGH_LEVEL_PCT else "Low" if (pct < C.TANK_LOW_LEVEL_PCT and tid.startswith("ST-") and tid != "ST-PM-01") else "Normal",
                "alarm_events": len(alarms), "is_mock": True,
            })
    return rows


COL_TANKS = [
    {"key": "report_date", "label": "Date"}, {"key": "shift", "label": "Shift"}, {"key": "tank_id", "label": "Tank"},
    {"key": "milk_type", "label": "Milk"}, {"key": "capacity_l", "label": "Capacity", "unit": "L"},
    {"key": "opening_l", "label": "Opening", "unit": "L"}, {"key": "incoming_l", "label": "In", "unit": "L"},
    {"key": "outgoing_l", "label": "Out", "unit": "L"}, {"key": "closing_l", "label": "Closing", "unit": "L"},
    {"key": "level_pct", "label": "Level", "unit": "%"}, {"key": "temp_c", "label": "Temp", "unit": "°C"},
    {"key": "status", "label": "Status", "kind": "status"}, {"key": "alarm_events", "label": "Alarms"},
    {"key": "transfers", "label": "Transfers"}, {"key": "pump_id", "label": "Pump", "hidden": True},
    {"key": "valve_ids", "label": "Valves", "hidden": True}, {"key": "transfer_batch_ids", "label": "Batch IDs", "hidden": True},
    {"key": "balance_check_l", "label": "Balance check", "unit": "L", "hidden": True},
]


def report_tanks(f: Filters):
    tids = [f.equipment] if f.equipment in C.TANKS else list(C.TANKS)
    rows = tank_rows(f, tids)
    if f.status:
        rows = [r for r in rows if r["status"] == f.status]
    a, b = period_bounds(f)
    history = {}
    for tid in tids:
        so = snapshot_at(f.ds, a)
        pts = [{"t": iso(a), "l": round(so.volumes[tid], 1)}]
        pts += [{"t": m.timestamp, "l": m.level_after_l} for m in f.ds.movements if m.tank_id == tid and iso(a) <= m.timestamp < iso(b)]
        step = max(1, len(pts) // 400)
        history[tid] = {"capacity": C.TANKS[tid]["capacity"], "points": pts[::step]}
    page, pag = paginate(rows, f)
    return envelope("tanks", f, rows=page, pagination=pag, columns=COL_TANKS,
                    summary={"tanks": len(tids), "max_abs_balance_check_l": max((abs(r["balance_check_l"]) for r in rows), default=0)},
                    charts={"history": history},
                    notes=["Closing = Opening + Incoming − Outgoing + documented adjustments (none simulated); balance_check_l should be 0.",
                           "Level % = Closing ÷ Capacity × 100. Transfers that would exceed capacity are limited and raise a CAPACITY_INTERLOCK alarm.",
                           "Opening/closing come from tank snapshots taken at every shift boundary."])


def report_tank_transfers(f: Filters, tank_id: str):
    if tank_id not in C.TANKS:
        raise FilterError("unknown tank id")
    a, b = period_bounds(f)
    rows = [m.model_dump() for m in f.ds.movements if m.tank_id == tank_id and iso(a) <= m.timestamp < iso(b)
            and (not f.shift or m.shift == f.shift)]
    page, pag = paginate(rows, f)
    return envelope("tanks", f, rows=page, pagination=pag, summary={"tank_id": tank_id},
                    columns=[{"key": "event_id", "label": "Event"}, {"key": "timestamp", "label": "Time", "kind": "datetime"},
                             {"key": "direction", "label": "Dir"}, {"key": "volume_l", "label": "Volume", "unit": "L"},
                             {"key": "counterpart", "label": "From / to"}, {"key": "batch_ids", "label": "Batches"},
                             {"key": "level_after_l", "label": "Level after", "unit": "L"}, {"key": "level_after_pct", "label": "Level", "unit": "%"},
                             {"key": "note", "label": "Note"}])


# ── 7. Processing ────────────────────────────────────────────────────────────
COL_PROCESS = [
    {"key": "batch_id", "label": "Batch"}, {"key": "product_name", "label": "Product"}, {"key": "milk_type", "label": "Milk"},
    {"key": "start", "label": "Start", "kind": "datetime"}, {"key": "end", "label": "End", "kind": "datetime"},
    {"key": "incoming_l", "label": "Incoming", "unit": "L"}, {"key": "processed_l", "label": "Processed", "unit": "L"},
    {"key": "inlet_temp_c", "label": "Inlet", "unit": "°C"}, {"key": "outlet_temp_min_c", "label": "Outlet min", "unit": "°C"},
    {"key": "hold_time_s", "label": "Hold", "unit": "s"}, {"key": "homogenizer_bar", "label": "Homog.", "unit": "bar"},
    {"key": "cooling_outlet_c", "label": "Cooling out", "unit": "°C"}, {"key": "state", "label": "State", "kind": "status"},
    {"key": "disposition", "label": "Disposition"}, {"key": "source_tanks", "label": "Source tanks", "hidden": True},
    {"key": "deviations", "label": "Deviations", "hidden": True}, {"key": "documented_loss_l", "label": "Doc. loss", "unit": "L", "hidden": True},
    {"key": "line_id", "label": "Line", "hidden": True}, {"key": "equipment_status", "label": "Equipment", "hidden": True},
]


def batches(f: Filters):
    out = []
    for b in f.ds.batches:
        if not in_period(f, b.report_date, b.shift):
            continue
        if f.milk_type and b.milk_type not in (f.milk_type, "Mixed"):
            continue
        if f.batch and f.batch != b.batch_id:
            continue
        if f.status and f.status != b.state:
            continue
        if f.equipment and f.equipment not in ("PAST-01", "HOMO-01", "COOL-01", "V-302", b.line_id, *b.source_tanks):
            continue
        out.append(b)
    return out


def report_processing(f: Filters):
    rows = batches(f)
    by = {s: sum(1 for b in rows if b.state == s) for s in ("NOT STARTED", "RUNNING", "COMPLETED", "REVIEW REQUIRED", "FAILED DEMO CRITERIA")}
    page, pag = paginate([b.model_dump(exclude={"temp_profile", "events"}) for b in rows], f)
    return envelope("processing", f, rows=page, pagination=pag, columns=COL_PROCESS,
                    summary={"batches": len(rows), **{k.lower().replace(" ", "_"): v for k, v in by.items()},
                             "incoming_l": r1(sum(b.incoming_l for b in rows)), "processed_l": r1(sum(b.processed_l for b in rows)),
                             "documented_loss_l": r1(sum(b.documented_loss_l for b in rows))},
                    charts={"htst": C.HTST_DEMO},
                    notes=[C.HTST_DEMO["note"],
                           "A batch is COMPLETED only if every minute of the outlet-temperature history is ≥ the target while flow was "
                           "forward AND the holding time met the minimum. A dip with flow diversion → REVIEW REQUIRED; a dip without "
                           "diversion or a short holding time → FAILED DEMO CRITERIA. Averages alone never pass a batch."])


def report_batch_detail(f: Filters, batch_id: str):
    b = next((x for x in f.ds.batches if x.batch_id == batch_id), None)
    if not b:
        raise FilterError("batch not found")
    return envelope("processing", f, rows=[b.model_dump()], summary={"batch_id": batch_id, "state": b.state},
                    charts={"profile": b.temp_profile, "target": C.HTST_DEMO["target_temp_c"], "events": b.events})


# ── 8. Packaging ─────────────────────────────────────────────────────────────
COL_PACK = [
    {"key": "fg_batch_id", "label": "FG batch"}, {"key": "batch_id", "label": "Process batch"}, {"key": "report_date", "label": "Date"},
    {"key": "shift", "label": "Shift"}, {"key": "product_name", "label": "Product"}, {"key": "line_id", "label": "Line"},
    {"key": "pack_size_ml", "label": "Pack", "unit": "mL"}, {"key": "planned_units", "label": "Planned"},
    {"key": "produced_units", "label": "Produced"}, {"key": "accepted_packs", "label": "Accepted"},
    {"key": "rejected_packs", "label": "Rejected"}, {"key": "speed_pph", "label": "Speed", "unit": "packs/h"},
    {"key": "operating_min", "label": "Run", "unit": "min"}, {"key": "downtime_min", "label": "Down", "unit": "min"},
    {"key": "downtime_reason", "label": "Downtime reason"}, {"key": "finished_volume_l", "label": "Finished vol.", "unit": "L"},
    {"key": "disposition", "label": "Disposition", "kind": "status"}, {"key": "end", "label": "Packed", "kind": "datetime", "hidden": True},
    {"key": "cold_storage_in", "label": "Cold store in", "kind": "datetime", "hidden": True},
    {"key": "dispatch_id", "label": "Dispatch", "hidden": True},
]


def packs(f: Filters):
    out = []
    for p in f.ds.packaging:
        if not in_period(f, p.report_date, p.shift):
            continue
        if f.batch and f.batch not in (p.batch_id, p.fg_batch_id):
            continue
        if f.equipment and f.equipment not in (p.line_id, "P-401"):
            continue
        if f.status and f.status != p.disposition:
            continue
        if f.milk_type:
            b = next((x for x in f.ds.batches if x.batch_id == p.batch_id), None)
            if b and b.milk_type not in (f.milk_type, "Mixed"):
                continue
        out.append(p)
    return out


def pack_summary(rows) -> Dict[str, Any]:
    by_size = {}
    for p in rows:
        s = by_size.setdefault(p.pack_size_ml, {"accepted_packs": 0, "rejected_packs": 0, "finished_volume_l": 0.0})
        s["accepted_packs"] += p.accepted_packs
        s["rejected_packs"] += p.rejected_packs
    for size, s in by_size.items():
        s["finished_volume_l"] = round(s["accepted_packs"] * size / 1000, 1)   # per pack size, then summed
    return {
        "records": len(rows), "planned_units": sum(p.planned_units for p in rows), "produced_units": sum(p.produced_units for p in rows),
        "accepted_packs": sum(p.accepted_packs for p in rows), "rejected_packs": sum(p.rejected_packs for p in rows),
        "finished_volume_l": round(sum(s["finished_volume_l"] for s in by_size.values()), 1),
        "rejected_volume_l": r1(sum(p.rejected_volume_l for p in rows)),
        "downtime_min": r1(sum(p.downtime_min for p in rows)), "operating_min": r1(sum(p.operating_min for p in rows)),
        "by_pack_size": {str(k): v for k, v in sorted(by_size.items())},
    }


def report_packaging(f: Filters):
    rows = packs(f)
    a, b = period_bounds(f)
    hours = int((b - a).total_seconds() // 3600)
    hourly = hours <= 72
    buckets: Dict[str, int] = {}
    for p in rows:
        t = datetime.fromisoformat(p.end)
        k = t.strftime("%Y-%m-%dT%H:00") if hourly else p.report_date
        buckets[k] = buckets.get(k, 0) + p.accepted_packs
    shift_tot = {s: sum(p.accepted_packs for p in rows if p.shift == s) for s in SHIFTS}
    page, pag = paginate([p.model_dump() for p in rows], f)
    return envelope("packaging", f, rows=page, pagination=pag, columns=COL_PACK, summary=pack_summary(rows),
                    charts={"output": [{"x": k, "packs": v} for k, v in sorted(buckets.items())], "output_bucket": "hour" if hourly else "day",
                            "by_shift": [{"x": s, "packs": v} for s, v in shift_tot.items()]},
                    notes=["Produced units = accepted packs + rejected packs (completed packs).",
                           "Finished-product volume = accepted packs × declared pack size, calculated per pack size and then summed.",
                           "Output chart uses the pack completion time; buckets are hourly for periods ≤ 3 days, daily otherwise."])


# ── 9. CIP ───────────────────────────────────────────────────────────────────
COL_CIP = [
    {"key": "cycle_id", "label": "Cycle"}, {"key": "circuit_id", "label": "Circuit"}, {"key": "circuit_name", "label": "Circuit name"},
    {"key": "start", "label": "Start", "kind": "datetime"}, {"key": "end", "label": "End", "kind": "datetime"},
    {"key": "duration_min", "label": "Duration", "unit": "min"}, {"key": "solution_id", "label": "Solution"},
    {"key": "rinse_status", "label": "Rinse status"}, {"key": "completion_status", "label": "Completion", "kind": "status"},
    {"key": "deviations", "label": "Deviations"}, {"key": "operator_id", "label": "Operator", "hidden": True},
    {"key": "equipment", "label": "Equipment", "hidden": True},
]


def report_cip(f: Filters):
    rows = [c for c in f.ds.cip if in_period(f, c.report_date, c.shift)
            and (not f.equipment or f.equipment == c.circuit_id or f.equipment in c.equipment or f.equipment == "CIP-01")
            and (not f.status or f.status == c.completion_status)]
    by = {s: sum(1 for c in rows if c.completion_status == s) for s in ("COMPLETED", "INCOMPLETE", "FAILED DEMO CRITERIA")}
    page, pag = paginate([c.model_dump() for c in rows], f)
    return envelope("cip", f, rows=page, pagination=pag, columns=COL_CIP,
                    summary={"cycles": len(rows), **{k.lower().replace(" ", "_"): v for k, v in by.items()},
                             "avg_duration_min": r1(mean([c.duration_min for c in rows]))},
                    charts={"criteria": {"phases": C.CIP_PHASES, "final_rinse_max_conductivity_ms_cm": C.CIP_FINAL_RINSE_MAX_CONDUCTIVITY,
                                         "min_flow_m3h": C.CIP_MIN_FLOW_M3H}},
                    notes=["Completion is judged on configurable demo criteria per phase (minimum time, minimum supply temperature, "
                           "minimum flow, final-rinse conductivity) — not on elapsed time alone.",
                           "Failed and incomplete cycles stay visible. No chemical dosing instructions are provided — visualization only."])


# ── 10. Equipment runtime ────────────────────────────────────────────────────
def _merge(iv):
    iv = sorted(iv)
    out = []
    for a, b in iv:
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def _subtract(iv, cut):
    res = []
    for a, b in iv:
        segs = [[a, b]]
        for c, d in cut:
            nxt = []
            for x, y in segs:
                if d <= x or c >= y:
                    nxt.append([x, y])
                else:
                    if c > x: nxt.append([x, c])
                    if d < y: nxt.append([d, y])
            segs = nxt
        res += segs
    return res


def _dur(iv) -> float:
    return sum((b - a).total_seconds() for a, b in iv) / 60


def equipment_rows(f: Filters):
    eq_ids = [f.equipment] if f.equipment in C.EQUIPMENT else list(C.EQUIPMENT)
    rows = []
    by_eq: Dict[str, list] = {}
    for iv in f.ds.intervals:
        by_eq.setdefault(iv.equipment_id, []).append(iv)
    for a, b, d, _ in intervals_for(Filters(**{**f.__dict__, "shift": None})):
        for sh, (h0, h1) in C.SHIFTS.items():
            if f.shift and sh != f.shift:
                continue
            sa, sb = day_start(date.fromisoformat(d)) + timedelta(hours=h0 - 6), day_start(date.fromisoformat(d)) + timedelta(hours=h1 - 6)
            if f.ds.now:
                if sa >= f.ds.now:
                    continue
                sb = min(sb, f.ds.now)
            for eq in eq_ids:
                st = {"RUN": [], "FAULT": [], "DOWN": []}
                reasons = []
                for iv in by_eq.get(eq, []):
                    x, y = max(datetime.fromisoformat(iv.start), sa), min(datetime.fromisoformat(iv.end), sb)
                    if y > x:
                        st[iv.state].append([x, y])
                        if iv.state in ("FAULT", "DOWN") and iv.reason:
                            reasons.append(iv.reason)
                fault = _merge(st["FAULT"])
                down = _subtract(_merge(st["DOWN"]), fault)                 # precedence FAULT > DOWN > RUN
                run = _subtract(_subtract(_merge(st["RUN"]), fault), down)
                window = (sb - sa).total_seconds() / 60
                runm, faultm, downm = _dur(run), _dur(fault), _dur(down)
                alarms = [x for x in f.ds.alarms if x.equipment_id == eq and iso(sa) <= x.timestamp < iso(sb)]
                rows.append({
                    "equipment_id": eq, "equipment_name": C.EQUIPMENT[eq]["name"], "kind": C.EQUIPMENT[eq]["kind"],
                    "report_date": d, "shift": sh, "first_start": iso(min(i[0] for i in run)) if run else None,
                    "last_stop": iso(max(i[1] for i in run)) if run else None, "runtime_min": round(runm, 1),
                    "idle_min": round(window - runm - faultm - downm, 1), "downtime_min": round(downm + faultm, 1),
                    "fault_min": round(faultm, 1), "planned_down_min": round(downm, 1),
                    "fault_reason": "; ".join(sorted(set(reasons))) or None, "alarm_count": len(alarms),
                    "maintenance_status": "Fault — inspect" if faultm else "Planned maintenance done" if downm else "OK",
                    "utilization_pct": round(runm / window * 100, 1) if window else None, "window_min": round(window, 1), "is_mock": True,
                })
    return rows


COL_EQUIP = [
    {"key": "report_date", "label": "Date"}, {"key": "shift", "label": "Shift"}, {"key": "equipment_id", "label": "Equipment"},
    {"key": "equipment_name", "label": "Name"}, {"key": "first_start", "label": "First start", "kind": "datetime"},
    {"key": "last_stop", "label": "Last stop", "kind": "datetime"}, {"key": "runtime_min", "label": "Run", "unit": "min"},
    {"key": "idle_min", "label": "Idle", "unit": "min"}, {"key": "downtime_min", "label": "Down", "unit": "min"},
    {"key": "fault_min", "label": "Fault", "unit": "min"}, {"key": "fault_reason", "label": "Fault / downtime reason"},
    {"key": "alarm_count", "label": "Alarms"}, {"key": "maintenance_status", "label": "Maintenance", "kind": "status"},
    {"key": "utilization_pct", "label": "Utilization", "unit": "%", "hidden": True},
]


def report_equipment(f: Filters):
    rows = equipment_rows(f)
    if f.status:
        rows = [r for r in rows if r["maintenance_status"] == f.status]
    tot = {}
    for r in rows:
        t = tot.setdefault(r["equipment_id"], {"equipment_id": r["equipment_id"], "run": 0, "idle": 0, "down": 0, "fault": 0})
        t["run"] += r["runtime_min"]; t["idle"] += r["idle_min"]; t["down"] += r["downtime_min"]; t["fault"] += r["fault_min"]
    page, pag = paginate(rows, f)
    return envelope("equipment-runtime", f, rows=page, pagination=pag, columns=COL_EQUIP,
                    summary={"runtime_min": r1(sum(r["runtime_min"] for r in rows)), "downtime_min": r1(sum(r["downtime_min"] for r in rows)),
                             "fault_min": r1(sum(r["fault_min"] for r in rows)), "alarm_count": sum(r["alarm_count"] for r in rows)},
                    charts={"by_equipment": [{"x": k, **{kk: round(vv, 1) for kk, vv in v.items() if kk != "equipment_id"}} for k, v in tot.items()]},
                    notes=["Runtime, fault and downtime are derived from simulated equipment events (run / fault / planned-down intervals).",
                           "Overlaps are resolved with precedence FAULT > planned DOWN > RUN, so durations never double-count; "
                           "idle = shift window − run − fault − planned down."])


# ── 11. Alarms ───────────────────────────────────────────────────────────────
COL_ALARMS = [
    {"key": "event_id", "label": "Event"}, {"key": "timestamp", "label": "Time", "kind": "datetime"},
    {"key": "severity", "label": "Severity", "kind": "status"}, {"key": "equipment_id", "label": "Equipment"},
    {"key": "code", "label": "Code"}, {"key": "description", "label": "Description"}, {"key": "value", "label": "Value"},
    {"key": "unit", "label": "Unit"}, {"key": "threshold", "label": "Threshold"}, {"key": "ack_status", "label": "Ack", "kind": "status"},
    {"key": "ack_time", "label": "Ack time", "kind": "datetime", "hidden": True},
    {"key": "resolved_time", "label": "Resolved", "kind": "datetime"}, {"key": "resolution", "label": "Resolution", "hidden": True},
]


def alarms(f: Filters):
    out = []
    for x in f.ds.alarms:
        if not in_period(f, x.report_date, x.shift):
            continue
        if f.equipment and f.equipment != x.equipment_id:
            continue
        if f.batch and f.batch != x.ref:
            continue
        if f.status and f.status not in (x.severity, x.ack_status, "Open" if not x.resolved_time else "Resolved"):
            continue
        out.append(x)
    return out


def report_alarms(f: Filters):
    rows = alarms(f)
    sev = {s: sum(1 for a in rows if a.severity == s) for s in ("INFO", "WARNING", "CRITICAL", "FAULT")}
    acks = [(datetime.fromisoformat(a.ack_time) - datetime.fromisoformat(a.timestamp)).total_seconds() / 60 for a in rows if a.ack_time]
    page, pag = paginate([a.model_dump() for a in rows], f)
    return envelope("alarms", f, rows=page, pagination=pag, columns=COL_ALARMS,
                    summary={"events": len(rows), **{k.lower(): v for k, v in sev.items()},
                             "open": sum(1 for a in rows if not a.resolved_time and a.severity != "INFO"),
                             "unacknowledged": sum(1 for a in rows if a.ack_status == "Unacknowledged"),
                             "mean_time_to_ack_min": r1(mean(acks))},
                    charts={"daily": daily_series(f, rows, lambda a: 1, lambda a: a.severity)},
                    notes=["Alarms are generated only when the simulated condition occurs (tank level, temperature, flow, faults, "
                           "routing interlocks, process / CIP deviations). None are fabricated independently of equipment state."])


# ── 12. Reconciliation ───────────────────────────────────────────────────────
def reconciliation(f: Filters) -> Dict[str, Any]:
    a, b = period_bounds(f)
    so, sc = snapshot_at(f.ds, a), snapshot_at(f.ds, b)
    ff = Filters(**{**f.__dict__, "shift": None, "milk_type": None, "center": None, "batch": None, "status": None})
    dl = deliveries(ff)
    pk = packs(ff)
    ended = [x for x in f.ds.batches if x.end and iso(a) <= x.end < iso(b)]
    opening = sum(so.volumes.values()) + so.wip_l
    closing = sum(sc.volumes.values()) + sc.wip_l
    received = sum(d.gross_l for d in dl)
    rejected = sum(d.rejected_l for d in dl)
    samples_l = sum(d.sample_ml for d in dl) / 1000
    finished = sum(p.finished_volume_l for p in pk)
    rej_packs = sum(p.rejected_volume_l for p in pk)
    losses = sum(x.documented_loss_l for x in ended)
    processed = sum(x.incoming_l for x in f.ds.batches if x.start and iso(a) <= x.start < iso(b))
    unexplained = opening + received - rejected - samples_l - finished - rej_packs - losses - closing
    terms = [
        ("Opening inventory (all tanks + in-process)", opening, "+"), ("Milk received (gross)", received, "+"),
        ("Milk rejected at intake", rejected, "−"), ("Documented intake samples", samples_l, "−"),
        ("Finished-product volume (accepted packs)", finished, "−"), ("Rejected packs volume", rej_packs, "−"),
        ("Documented process losses", losses, "−"), ("Closing inventory (all tanks + in-process)", closing, "−"),
    ]
    rho = C.DENSITY_ASSUMPTION_KG_PER_L
    return {
        "terms": [{"term": t, "sign": s, "volume_l": round(v, 1), "mass_kg": round(v * rho, 1)} for t, v, s in terms],
        "unexplained_l": round(unexplained, 1), "unexplained_kg": round(unexplained * rho, 1),
        "unexplained_pct_of_received": round(unexplained / received * 100, 3) if received else None,
        "transferred_to_processing_l": round(processed, 1), "density_assumption_kg_l": rho,
        "opening_ts": so.timestamp, "closing_ts": sc.timestamp,
    }


def report_reconciliation(f: Filters):
    rec = reconciliation(f)
    days = []
    for i in range((f.end - f.start).days + 1):
        d = f.start + timedelta(days=i)
        r = reconciliation(Filters(**{**f.__dict__, "start": d, "end": d}))
        days.append({"report_date": d.isoformat(), **{t["term"]: t["volume_l"] for t in r["terms"]}, "unexplained_l": r["unexplained_l"]})
    return envelope("reconciliation", f, rows=rec["terms"], summary=rec,
                    columns=[{"key": "term", "label": "Term"}, {"key": "sign", "label": "±"},
                             {"key": "volume_l", "label": "Volume", "unit": "L"}, {"key": "mass_kg", "label": "Mass (assumed ρ)", "unit": "kg"}],
                    charts={"daily": days, "equation": C.VOLUME_BALANCE_TERMS},
                    notes=["Unexplained = Opening + Received − Rejected − Samples − Finished − Rejected packs − Documented losses − Closing. "
                           "It is shown as calculated and never adjusted to zero.",
                           f"Mass balance uses a stated density assumption of {C.DENSITY_ASSUMPTION_KG_PER_L} kg/L for every term; "
                           "volume and mass are kept separate because volume varies with temperature and measurement conditions.",
                           "Plant-wide balance — milk-type, shift, centre and batch filters do not apply to this report.",
                           "Includes record rounding (0.1 L) and small unrecorded line losses that exist in the simulation on purpose."])


# ── 13. Traceability ─────────────────────────────────────────────────────────
def _node(stage, ident, time=None, detail=None, status="ok"):
    return {"stage": stage, "id": ident, "time": time, "detail": detail, "status": status}


def trace_forward_from_delivery(ds: Dataset, d) -> List[Dict[str, Any]]:
    s = next((x for x in ds.samples if x.sample_id == d.sample_id), None) if d.sample_id else None
    head = [
        _node("Collection centre", d.center_id, d.collection_time, d.center_name + " · supplier " + d.supplier_id),
        _node("Tanker", d.tanker_id, d.arrival_time, f"{d.gross_l:,.0f} L gross · {d.milk_type}"),
        _node("Receiving sample", d.sample_id, s.test_time if s else None, s.result_status if s else "Sample record not found",
              "ok" if s else "missing"),
        _node("Acceptance", d.delivery_id, d.unload_end or d.arrival_time,
              f"{d.quality_status}: accepted {d.accepted_l:,.0f} L, rejected {d.rejected_l:,.0f} L"),
    ]
    if d.accepted_l <= 0:
        return [{"title": f"{d.batch_id} — rejected at intake", "nodes": head + [_node("Source tank", None, None, "Not applicable — load rejected", "n/a")]}]
    head.append(_node("Reception tank", "RT-01", d.unload_start, f"Unloaded {d.unload_start} → {d.unload_end}"))
    xfer = next((m for m in ds.movements if m.tank_id in ("ST-COW-01", "ST-BUF-01") and m.direction == "IN" and d.batch_id in m.batch_ids), None)
    head.append(_node("Transfer to silo", xfer.tank_id if xfer else None, xfer.timestamp if xfer else None,
                      f"via V-301, event {xfer.event_id}" if xfer else "Transfer event not found", "ok" if xfer else "missing"))
    used = [b for b in ds.batches if any(l["lot"] == d.batch_id for l in b.source_lots)]
    if not used:
        return [{"title": f"{d.batch_id} → in silo", "nodes": head + [_node("Processing", None, None, "Not yet processed (still in silo) or beyond simulated period", "pending")]}]
    chains = []
    for b in used:
        litres = sum(l["litres"] for l in b.source_lots if l["lot"] == d.batch_id)
        chains.append({"title": f"{d.batch_id} → {b.batch_id}", "nodes": head + trace_forward_from_batch(ds, b, f"{litres:,.0f} L of this lot")})
    return chains


def trace_forward_from_batch(ds: Dataset, b, contrib=None, only_fg=None) -> List[Dict[str, Any]]:
    nodes = [
        _node("Processing equipment", "LINE-01 (PAST-01 / HOMO-01 / COOL-01)", b.start, (contrib + " · " if contrib else "") + f"{b.incoming_l:,.0f} L batch"),
        _node("Pasteurization record", b.batch_id, b.end, f"{b.state} · {b.disposition}",
              "ok" if b.state == "COMPLETED" else "pending" if b.state in ("RUNNING", "NOT STARTED") else "review"),
    ]
    pk = [p for p in ds.packaging if p.batch_id == b.batch_id and (only_fg is None or p.fg_batch_id == only_fg)]
    if not pk:
        return nodes + [_node("Packaging line", None, None, "No packaging record yet", "pending")]
    for p in pk:
        nodes += [
            _node("Packaging line", p.line_id, p.start, f"{p.accepted_packs:,} × {p.pack_size_ml} mL accepted, {p.rejected_packs} rejected"),
            _node("Finished-product batch", p.fg_batch_id, p.end, f"{p.finished_volume_l:,.0f} L · {p.disposition}"),
            _node("Cold storage", "CS-01" if p.cold_storage_in else None, p.cold_storage_in,
                  "Received in cold store" if p.cold_storage_in else "Missing link — cold-storage scan not recorded",
                  "ok" if p.cold_storage_in else "missing"),
            _node("Dispatch", p.dispatch_id, p.dispatch_time,
                  "Dispatched" if p.dispatch_id else ("Held — batch not released" if p.disposition != "Released (demo)" else
                                                      "Missing link — no cold-storage record" if not p.cold_storage_in else
                                                      "Not dispatched within simulated period"),
                  "ok" if p.dispatch_id else "pending"),
        ]
    return nodes


def trace_back_from_batch(ds: Dataset, b) -> List[Dict[str, Any]]:
    out = []
    for lot in b.source_lots:
        d = next((x for x in ds.deliveries if x.batch_id == lot["lot"]), None)
        if not d:
            out.append({"lot": lot["lot"], "litres": lot["litres"], "tank": lot["tank"],
                        "nodes": [_node("Raw-milk lot", lot["lot"], None, "Missing link — opening stock from before the demo window (no intake record)", "missing")]})
        else:
            out.append({"lot": lot["lot"], "litres": lot["litres"], "tank": lot["tank"],
                        "nodes": trace_forward_from_delivery(ds, d)[0]["nodes"][:6]})
    return out


def report_traceability(f: Filters, ident: str):
    ds = f.ds
    ident = ident.strip()
    chains, upstream, candidates, kind = [], [], [], None
    d = next((x for x in ds.deliveries if ident in (x.batch_id, x.delivery_id, x.sample_id)), None)
    b = next((x for x in ds.batches if x.batch_id == ident), None)
    p = next((x for x in ds.packaging if x.fg_batch_id == ident), None)
    if d:
        kind, chains = "raw batch", trace_forward_from_delivery(ds, d)
    elif b:
        kind = "process batch"
        chains = [{"title": b.batch_id, "nodes": trace_forward_from_batch(ds, b)}]
        upstream = trace_back_from_batch(ds, b)
    elif p:
        kind = "finished-product batch"
        b = next((x for x in ds.batches if x.batch_id == p.batch_id), None)
        chains = [{"title": f"{p.fg_batch_id} ← {p.batch_id}", "nodes": trace_forward_from_batch(ds, b, only_fg=p.fg_batch_id)}]
        upstream = trace_back_from_batch(ds, b)
    elif ident in C.TANKS:
        kind = "tank"
        candidates = sorted({bid for m in ds.movements if m.tank_id == ident and f.start.isoformat() <= m.report_date <= f.end.isoformat() for bid in m.batch_ids})
    elif any(c["id"] == ident for c in C.COLLECTION_CENTERS) or any(s["id"] == ident for s in C.SUPPLIERS):
        kind = "collection centre / supplier"
        candidates = [x.batch_id for x in ds.deliveries if ident in (x.center_id, x.supplier_id) and f.start.isoformat() <= x.report_date <= f.end.isoformat()]
    elif ident in ds.opening_lots:
        kind = "opening stock"
        chains = [{"title": ident, "nodes": [_node("Raw-milk lot", ident, None, "Missing link — opening stock from before the demo window", "missing")]}]
    else:
        raise FilterError(f"Nothing found for '{ident}' — search by batch, sample, delivery, finished-product batch, tank, centre or supplier ID")
    return envelope("traceability", f, summary={"query": ident, "kind": kind}, rows=chains,
                    charts={"upstream": upstream, "candidates": candidates[:200]},
                    notes=["Links come only from simulated records. A link that does not exist is shown as missing — never invented.",
                           "Raw lots merge in silos; FIFO draws record exactly which lots (and litres) each process batch used."])


# ── 14. Daily summary ────────────────────────────────────────────────────────
def report_summary(f: Filters):
    ff = Filters(**{**f.__dict__, "status": None, "batch": None})
    dl, sm = deliveries(ff), samples(ff)
    tested = [s for s in sm if s.fat_pct is not None]
    a, b = period_bounds(f)
    sc = snapshot_at(f.ds, b)
    ended = [x for x in f.ds.batches if in_period(ff, x.report_date, x.shift)]
    pk = packs(ff)
    cip_rows = [c for c in f.ds.cip if in_period(ff, c.report_date, c.shift)]
    eq = equipment_rows(Filters(**{**ff.__dict__, "equipment": None}))
    al = alarms(Filters(**{**ff.__dict__, "equipment": None}))
    rec = reconciliation(ff)
    qual = {}
    for kind in ("Cow", "Buffalo"):
        s = [x for x in tested if x.milk_type == kind]
        qual[kind] = {"fat_weighted": r1(wmean([(x.fat_pct, x.weight_l) for x in s]), 2), "snf_weighted": r1(wmean([(x.snf_pct, x.weight_l) for x in s]), 2),
                      "fat_simple": r1(mean([x.fat_pct for x in s]), 2), "snf_simple": r1(mean([x.snf_pct for x in s]), 2), "samples": len(s)}
    summary = {
        "plant": C.PLANT_NAME, **collection_summary(dl), "quality": qual,
        "quality_review_count": sum(1 for s in sm if s.result_status in ("Review required", "Rejected")),
        "processed_volume_l": r1(sum(x.incoming_l for x in ended)), **{f"pack_{k}": v for k, v in pack_summary(pk).items() if k != "by_pack_size"},
        "pack_by_size": pack_summary(pk)["by_pack_size"],
        "tank_closing": {k: round(v, 1) for k, v in sc.volumes.items()},
        "cip": {s: sum(1 for c in cip_rows if c.completion_status == s) for s in ("COMPLETED", "INCOMPLETE", "FAILED DEMO CRITERIA")},
        "equipment_downtime_min": r1(sum(r["downtime_min"] for r in eq)),
        "open_alarms": sum(1 for x in al if not x.resolved_time and x.severity != "INFO"),
        "alarms_by_severity": {s: sum(1 for x in al if x.severity == s) for s in ("INFO", "WARNING", "CRITICAL", "FAULT")},
        "batch_disposition": {s: sum(1 for x in ended if x.state == s) for s in ("COMPLETED", "REVIEW REQUIRED", "FAILED DEMO CRITERIA", "RUNNING", "NOT STARTED")},
        "reconciliation": rec,
    }
    by_shift = [{"x": s, "received_l": round(sum(d.gross_l for d in dl if d.shift == s), 1),
                 "packs": sum(p.accepted_packs for p in pk if p.shift == s)} for s in SHIFTS]
    return envelope("summary", f, summary=summary, rows=[],
                    charts={"by_shift": by_shift, "quality": qual},
                    notes=["All figures are simulated demonstration data generated from one shared seeded dataset.",
                           "Fat / SNF summary values are volume-weighted by accepted litres; simple averages are shown alongside.",
                           "Thresholds and process criteria are illustrative demo rules — verify against current applicable standards.",
                           f"Mass figures assume a density of {C.DENSITY_ASSUMPTION_KG_PER_L} kg/L."])


def meta(mode="seeded") -> Dict[str, Any]:
    ds = get_dataset(mode)
    return {
        "demo_notice": C.DEMO_NOTICE, "plant": C.PLANT_NAME, "mode": mode,
        "window": {"start": ds.window_start.isoformat(), "end": ds.window_end.isoformat()},
        "simulation_clock": iso(ds.now) if ds.now else None,
        "reports": [{"id": k, "title": v} for k, v in REPORT_TITLES.items()],
        "shifts": SHIFTS, "milk_types": MILK_TYPES,
        "centers": C.COLLECTION_CENTERS, "suppliers": [{"id": s["id"], "name": s["name"], "center": s["center"]} for s in C.SUPPLIERS],
        "equipment": [{"id": k, **v} for k, v in C.EQUIPMENT.items()] + [{"id": k, "name": v["name"], "kind": "Tank"} for k, v in C.TANKS.items()],
        "statuses": {
            "collection": ["Within demo rules", "Review required", "Rejected", "Partially rejected", "Not tested — sample record missing", "Pending"],
            "quality": ["Within demo rules", "Review required", "Rejected", "Pending"],
            "processing": ["NOT STARTED", "RUNNING", "COMPLETED", "REVIEW REQUIRED", "FAILED DEMO CRITERIA"],
            "packaging": ["Released (demo)", "On hold — QA review", "Blocked — QA decision pending"],
            "cip": ["COMPLETED", "INCOMPLETE", "FAILED DEMO CRITERIA"],
            "tanks": ["Normal", "High", "Low"],
            "equipment-runtime": ["OK", "Fault — inspect", "Planned maintenance done"],
            "alarms": ["INFO", "WARNING", "CRITICAL", "FAULT", "Open", "Resolved", "Unacknowledged"],
        },
        "quality_rules": C.QUALITY_RULES, "methods": C.QUALITY_METHODS, "htst_demo": C.HTST_DEMO,
    }


REPORTS = {
    "summary": report_summary, "collection": report_collection, "quality": report_quality,
    "milk-comparison": report_comparison, "tanks": report_tanks, "processing": report_processing,
    "packaging": report_packaging, "cip": report_cip, "equipment-runtime": report_equipment,
    "alarms": report_alarms, "reconciliation": report_reconciliation,
}
