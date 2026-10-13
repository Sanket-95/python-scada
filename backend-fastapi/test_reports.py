"""Tests for the dairy reporting module (mock data).

Run:  venv/bin/python -m pytest test_reports.py -q
"""

import csv
import io
import random
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import main
from reports import config as C
from reports import service as S
from reports.generator import DEFAULT_SEED, SEEDED_ANCHOR, WINDOW_DAYS, Generator, get_dataset

START, END = "2025-08-10", "2025-08-19"


@pytest.fixture(scope="module")
def ds():
    return get_dataset("seeded")


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def F(**kw):
    base = dict(mode="seeded", start=START, end=END, page_size=10000)
    base.update(kw)
    return S.make_filters(**base)


# ── determinism / mock flag ──────────────────────────────────────────────────
def test_seeded_mode_is_repeatable():
    a = Generator(SEEDED_ANCHOR, WINDOW_DAYS, DEFAULT_SEED, None, "seeded").run()
    b = Generator(SEEDED_ANCHOR, WINDOW_DAYS, DEFAULT_SEED, None, "seeded").run()
    assert [d.model_dump() for d in a.deliveries] == [d.model_dump() for d in b.deliveries]
    assert [x.batch_id for x in a.batches] == [x.batch_id for x in b.batches]


def test_every_record_is_flagged_mock(ds):
    for coll in (ds.deliveries, ds.samples, ds.movements, ds.batches, ds.packaging, ds.cip, ds.alarms):
        assert coll and all(r.is_mock for r in coll)


# ── intake: accepted + rejected + sample = gross ─────────────────────────────
def test_accepted_rejected_sample_equals_gross(ds):
    for d in ds.deliveries:
        assert d.accepted_l >= 0 and d.rejected_l >= 0
        assert abs(d.gross_l - d.accepted_l - d.rejected_l - d.sample_ml / 1000) < 1e-6, d.delivery_id
        if d.accepted_l == 0:
            assert d.unload_start is None and d.receiving_tank is None


def test_collection_totals_match_records(ds):
    env = S.report_collection(F())
    rows = env["rows"]
    s = env["summary"]
    assert s["deliveries"] == len(rows) == env["pagination"]["total"]
    assert s["cow_received_l"] == pytest.approx(sum(r["gross_l"] for r in rows if r["milk_type"] == "Cow"), abs=0.1)
    assert s["buffalo_received_l"] == pytest.approx(sum(r["gross_l"] for r in rows if r["milk_type"] == "Buffalo"), abs=0.1)
    assert s["total_received_l"] == pytest.approx(s["cow_received_l"] + s["buffalo_received_l"], abs=0.1)
    assert abs(s["intake_balance_difference_l"]) < 0.01
    assert all(START <= r["report_date"] <= END for r in rows)


# ── tanks ────────────────────────────────────────────────────────────────────
def test_tank_levels_never_negative_or_over_capacity(ds):
    for m in ds.movements:
        cap = C.TANKS[m.tank_id]["capacity"]
        assert -0.01 <= m.level_after_l <= cap + 0.01, m.event_id
    for snap in ds.snapshots:
        for tid, v in snap.volumes.items():
            assert -0.01 <= v <= C.TANKS[tid]["capacity"] + 0.01


def test_tank_balance_closing_equals_opening_plus_in_minus_out():
    env = S.report_tanks(F())
    assert env["rows"]
    for r in env["rows"]:
        assert r["closing_l"] == pytest.approx(r["opening_l"] + r["incoming_l"] - r["outgoing_l"] + r["adjustments_l"], abs=0.5)
        assert r["level_pct"] == pytest.approx(r["closing_l"] / r["capacity_l"] * 100, abs=0.05)


def test_capacity_interlock_limits_transfer_instead_of_overflowing(ds):
    """Every CAPACITY_INTERLOCK alarm must coincide with a silo that was genuinely near-full."""
    for a in (x for x in ds.alarms if x.code == "CAPACITY_INTERLOCK"):
        assert a.equipment_id in C.TANKS and a.value is not None and a.value > 50


# ── packaging ────────────────────────────────────────────────────────────────
def test_pack_counts_and_volumes(ds):
    for p in ds.packaging:
        assert p.produced_units == p.accepted_packs + p.rejected_packs
        assert p.finished_volume_l == pytest.approx(p.accepted_packs * p.pack_size_ml / 1000, abs=0.05)
        assert p.rejected_volume_l == pytest.approx(p.rejected_packs * p.pack_size_ml / 1000, abs=0.05)
        assert p.downtime_min >= 0 and p.operating_min > 0


def test_finished_volume_is_summed_per_pack_size():
    s = S.report_packaging(F())["summary"]
    per_size = sum(v["finished_volume_l"] for v in s["by_pack_size"].values())
    assert s["finished_volume_l"] == pytest.approx(per_size, abs=0.05)
    assert s["produced_units"] == s["accepted_packs"] + s["rejected_packs"]


# ── quality ──────────────────────────────────────────────────────────────────
def test_quality_values_are_physically_plausible(ds):
    for s in ds.samples:
        for k in ("fat_pct", "snf_pct", "protein_pct", "lactose_pct", "acidity_pct_la"):
            v = getattr(s, k)
            assert v is None or v > 0, (s.sample_id, k)
        if s.fat_pct is not None:
            assert 0.5 < s.fat_pct < 15 and 5 < s.snf_pct < 13
            assert 1.020 < s.density_kg_l < 1.040
            assert 0.08 <= s.acidity_pct_la <= 0.25


def test_quality_status_follows_configured_rules(ds):
    for s in ds.samples:
        if s.result_status == "Pending":
            continue
        rules = C.QUALITY_RULES[s.milk_type]
        broken = (s.fat_pct < rules["fat_min"] or s.snf_pct < rules["snf_min"] or s.acidity_pct_la > rules["acidity_max"]
                  or s.sample_temp_c > rules["temp_max"] or not rules["density_min"] <= s.density_kg_l <= rules["density_max"]
                  or s.screening_status == "Screening review")
        if s.result_status == "Within demo rules":
            assert not broken, s.sample_id
        else:
            assert broken and s.review_reasons, s.sample_id


def test_missing_samples_stay_missing(ds):
    missing = [d for d in ds.deliveries if d.sample_id is None]
    assert missing, "generator should include a few missing sample records"
    assert all(d.quality_status.startswith("Not tested") for d in missing)
    assert any(s.protein_pct is None for s in ds.samples)          # not measured → None, never 0


# ── weighted averages ────────────────────────────────────────────────────────
def test_weighted_mean_function():
    assert S.wmean([(4.0, 1000), (6.0, 3000)]) == pytest.approx(5.5)
    assert S.wmean([(4.0, 1000), (None, 3000), (9.0, 0)]) == pytest.approx(4.0)
    assert S.wmean([]) is None
    assert S.mean([4.0, 6.0, None]) == pytest.approx(5.0)


def test_comparison_weighted_fat_matches_manual(ds):
    env = S.report_comparison(F())
    for kind, key in (("Cow", "cow"), ("Buffalo", "buffalo")):
        sm = [s for s in ds.samples if s.milk_type == kind and START <= s.report_date <= END and s.fat_pct is not None]
        manual = sum(s.fat_pct * s.weight_l for s in sm) / sum(s.weight_l for s in sm)
        assert env["summary"][key]["fat_weighted"] == pytest.approx(manual, abs=0.006)
        assert env["summary"][key]["fat_simple"] == pytest.approx(sum(s.fat_pct for s in sm) / len(sm), abs=0.006)


# ── processing state rules ───────────────────────────────────────────────────
def test_process_states_follow_temperature_time_history(ds):
    target, min_hold = C.HTST_DEMO["target_temp_c"], C.HTST_DEMO["min_hold_s"]
    for b in ds.batches:
        if b.state in ("NOT STARTED", "RUNNING"):
            continue
        below = [p for p in b.temp_profile if p["outlet_c"] < target]
        undiverted = [p for p in below if p["fdv"] == "FORWARD"]
        if b.state == "COMPLETED":
            assert not below and b.hold_time_s >= min_hold, b.batch_id
        elif b.state == "REVIEW REQUIRED":
            assert below and not undiverted and b.hold_time_s >= min_hold, b.batch_id
        elif b.state == "FAILED DEMO CRITERIA":
            assert undiverted or b.hold_time_s < min_hold, b.batch_id
        assert b.incoming_l == pytest.approx(sum(l["litres"] for l in b.source_lots), abs=0.5)


def test_average_alone_never_passes_a_batch(ds):
    """A batch whose AVERAGE is above target but which dipped below target is not COMPLETED."""
    t = C.HTST_DEMO["target_temp_c"]
    dipped = [b for b in ds.batches if b.temp_profile and b.outlet_temp_avg_c > t and b.outlet_temp_min_c < t]
    assert dipped and all(b.state != "COMPLETED" for b in dipped)


# ── CIP ──────────────────────────────────────────────────────────────────────
def test_cip_completion_uses_criteria_not_elapsed_time(ds):
    mins = {name: (m, temp) for name, m, temp in C.CIP_PHASES}
    for c in ds.cip:
        ok = all(p.ok for p in c.phases)
        for p in c.phases:
            m, temp = mins[p.phase]
            assert p.minutes >= m
            if p.ok and temp is not None:
                assert p.supply_temp_c >= temp
            if p.ok and p.phase == "Final rinse":
                assert p.conductivity_ms_cm <= C.CIP_FINAL_RINSE_MAX_CONDUCTIVITY
        assert (c.completion_status == "COMPLETED") == ok, c.cycle_id
    assert any(c.completion_status != "COMPLETED" for c in ds.cip)   # failures stay visible


# ── equipment runtime ────────────────────────────────────────────────────────
def test_runtime_durations_do_not_overlap():
    for r in S.equipment_rows(F()):
        parts = r["runtime_min"] + r["idle_min"] + r["downtime_min"]
        assert parts == pytest.approx(r["window_min"], abs=0.2), (r["equipment_id"], r["report_date"], r["shift"])
        assert min(r["runtime_min"], r["idle_min"], r["downtime_min"], r["fault_min"]) >= -0.05


# ── alarms are condition-driven ──────────────────────────────────────────────
def test_alarms_only_when_condition_met(ds):
    by_id = {d.delivery_id: d for d in ds.deliveries}
    for a in ds.alarms:
        if a.code == "TEMP_HIGH" and a.ref in by_id:
            d = by_id[a.ref]
            assert d.temperature_c > C.QUALITY_RULES[d.milk_type]["temp_max"]
        if a.code == "PACK_STOP":
            assert any(p.fg_batch_id == a.ref and p.downtime_min > 0 for p in ds.packaging)
        if a.code == "HIGH_LEVEL":
            assert a.value >= C.TANK_HIGH_LEVEL_PCT
        assert a.severity in ("INFO", "WARNING", "CRITICAL", "FAULT")


# ── reconciliation ───────────────────────────────────────────────────────────
def test_reconciliation_equation_and_additivity():
    f = F()
    rec = S.reconciliation(f)
    v = {t["term"]: t["volume_l"] for t in rec["terms"]}
    calc = (v["Opening inventory (all tanks + in-process)"] + v["Milk received (gross)"] - v["Milk rejected at intake"]
            - v["Documented intake samples"] - v["Finished-product volume (accepted packs)"] - v["Rejected packs volume"]
            - v["Documented process losses"] - v["Closing inventory (all tanks + in-process)"])
    assert rec["unexplained_l"] == pytest.approx(calc, abs=0.5)
    # Unexplained is NOT forced to zero — the simulation contains small unrecorded losses.
    assert rec["unexplained_l"] > 0
    assert abs(rec["unexplained_pct_of_received"]) < 1.0
    # Day-by-day differences add up to the period difference.
    daily = [S.reconciliation(F(start=(date(2025, 8, 10) + timedelta(days=i)).isoformat(),
                                end=(date(2025, 8, 10) + timedelta(days=i)).isoformat()))["unexplained_l"] for i in range(10)]
    assert sum(daily) == pytest.approx(rec["unexplained_l"], abs=1.0)
    assert rec["unexplained_kg"] == pytest.approx(rec["unexplained_l"] * C.DENSITY_ASSUMPTION_KG_PER_L, abs=0.2)


# ── traceability ─────────────────────────────────────────────────────────────
def test_traceability_links_are_real(ds):
    rng = random.Random(7)
    lots = {d.batch_id for d in ds.deliveries} | set(ds.opening_lots)
    for b in rng.sample([x for x in ds.batches if x.state != "NOT STARTED"], 15):
        assert all(l["lot"] in lots for l in b.source_lots)
        env = S.report_traceability(F(), b.batch_id)
        for up in env["charts"]["upstream"]:
            if up["lot"] in ds.opening_lots:
                assert up["nodes"][0]["status"] == "missing"
    p = next(x for x in ds.packaging)
    env = S.report_traceability(F(), p.fg_batch_id)
    stages = [n["stage"] for n in env["rows"][0]["nodes"]]
    assert "Finished-product batch" in stages and "Dispatch" in stages


def test_traceability_shows_missing_links(ds):
    gap = next((p for p in ds.packaging if p.cold_storage_in is None), None)
    if gap:
        nodes = S.report_traceability(F(), gap.fg_batch_id)["rows"][0]["nodes"]
        cs = next(n for n in nodes if n["stage"] == "Cold storage")
        assert cs["status"] == "missing" and "Missing link" in cs["detail"]
    d = next(x for x in ds.deliveries if x.sample_id is None)
    nodes = S.report_traceability(F(), d.batch_id)["rows"][0]["nodes"]
    assert next(n for n in nodes if n["stage"] == "Receiving sample")["status"] == "missing"


# ── filters (API) ────────────────────────────────────────────────────────────
def test_filters_are_applied(client):
    j = client.get("/api/reports/collection", params={"start": START, "end": END, "shift": "Morning", "milk_type": "Buffalo", "page_size": 500}).json()
    assert j["rows"] and all(r["shift"] == "Morning" and r["milk_type"] == "Buffalo" for r in j["rows"])
    j = client.get("/api/reports/alarms", params={"start": START, "end": END, "equipment": "PACK-01", "page_size": 500}).json()
    assert all(r["equipment_id"] == "PACK-01" for r in j["rows"])
    j = client.get("/api/reports/processing", params={"start": START, "end": END, "status": "COMPLETED", "page_size": 500}).json()
    assert all(r["state"] == "COMPLETED" for r in j["rows"])


@pytest.mark.parametrize("params", [
    {"start": "2025-08-19", "end": "2025-08-10"}, {"start": "1999-01-01"}, {"shift": "Evening"},
    {"milk_type": "Goat"}, {"equipment": "NOPE"}, {"page_size": 0}, {"start": "19-08-2025"},
])
def test_invalid_filters_rejected(client, params):
    assert client.get("/api/reports/collection", params=params).status_code == 422


def test_pagination_metadata(client):
    j = client.get("/api/reports/collection", params={"start": START, "end": END, "page": 2, "page_size": 10}).json()
    assert j["pagination"]["page"] == 2 and len(j["rows"]) == 10 and j["pagination"]["total"] > 20


def test_every_report_agrees_on_totals(client):
    p = {"start": START, "end": END}
    summ = client.get("/api/reports/summary", params=p).json()["summary"]
    coll = client.get("/api/reports/collection", params=p).json()["summary"]
    comp = client.get("/api/reports/milk-comparison", params=p).json()["summary"]
    pack = client.get("/api/reports/packaging", params=p).json()["summary"]
    assert summ["total_received_l"] == coll["total_received_l"]
    assert comp["cow"]["total_received_l"] == coll["cow_received_l"]
    assert summ["pack_finished_volume_l"] == pack["finished_volume_l"]
    rec = client.get("/api/reports/reconciliation", params=p).json()["summary"]
    v = {t["term"]: t["volume_l"] for t in rec["terms"]}
    assert v["Milk received (gross)"] == pytest.approx(coll["total_received_l"], abs=0.1)
    assert v["Finished-product volume (accepted packs)"] == pytest.approx(pack["finished_volume_l"], abs=0.1)


# ── exports ──────────────────────────────────────────────────────────────────
def test_csv_export_totals_match_report(client):
    p = {"start": START, "end": END}
    env = client.get("/api/reports/collection", params={**p, "page_size": 10000}).json()
    text = client.get("/api/reports/collection/export", params={**p, "format": "csv"}).text
    assert C.DEMO_NOTICE in text and env["title"] in text
    data = [r for r in csv.reader(io.StringIO(text)) if r and not r[0].startswith("#")]
    header, body = data[0], data[1:]
    gross_i = header.index("Gross (L)")
    assert len(body) == env["pagination"]["total"]
    assert sum(float(r[gross_i]) for r in body) == pytest.approx(env["summary"]["total_received_l"], abs=0.1)


def test_pdf_export_is_valid_and_labeled(client):
    r = client.get("/api/reports/packaging/export", params={"start": START, "end": END, "format": "pdf"})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    body = r.content
    assert body.startswith(b"%PDF-1.4") and body.rstrip().endswith(b"%%EOF")
    assert b"DEMO DATA" in body and b"Page 1 of" in body and b"RPT-PACK" in body


def test_dynamic_mode_runs_and_stops_at_clock():
    ds = get_dataset("dynamic", now=datetime(2026, 1, 15, 10, 30))
    stamp = "2026-01-15T10:30:00"
    assert all(d.unload_end is None or d.unload_end <= stamp for d in ds.deliveries)
    assert any(a.code == "SIM_PAUSE" for a in ds.alarms)
