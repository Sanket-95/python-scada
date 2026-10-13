"""Seeded mock-data generator for the dairy reports — ONE shared dataset.

The plant is simulated as a chronological event timeline (priority queue), so
every report is a view over the same records:

  tanker arrival → intake sample/test → accept / reject → unload into RT-01
  → transfer through diverter V-301 to the cow or buffalo silo
  → process batch draws FIFO from silo(s) → PAST-01 (+HOMO-01, COOL-01)
  → ST-PM-01 → packing (PACK-01 500 mL / PACK-02 1000 mL) → cold storage
  → dispatch;  CIP cycles after processing;  equipment intervals and alarms
  are derived from what actually happened in the timeline.

Every litre moves through FIFO lots, so tank balances, reconciliation and
traceability are exact by construction. Two modes:
  seeded   fixed seed + fixed anchor date → identical output every run
  dynamic  anchor = today, events after "now" are not generated yet
"""

from __future__ import annotations

import heapq
import random
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from . import config as C
from .models import (AlarmEvent, CipCycle, CipPhase, Delivery, EquipmentInterval, PackagingRecord,
                     ProcessBatch, QualitySample, TankMovement, TankSnapshot)

SEEDED_ANCHOR = date(2025, 8, 19)     # last production day of the seeded demo window
DEFAULT_SEED = 2025
WINDOW_DAYS = 30
TRANSFER_RATE_LPH = 20000
UNLOAD_RATE_LPH = 15000
SILO_HEEL_L = 1000.0


def iso(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%S")


def prod_day(ts: datetime) -> date:
    """Production day runs 06:00 → 06:00."""
    return (ts - timedelta(hours=6)).date()


def shift_of(ts: datetime) -> str:
    h = ts.hour
    if 6 <= h < 14:
        return "Morning"
    if 14 <= h < 22:
        return "Afternoon"
    return "Night"


def day_start(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 6, 0, 0)


class Tank:
    """FIFO lot store. lots: [[lot_id, litres], …] oldest first."""

    def __init__(self, tid: str, capacity: float, temp: float):
        self.id, self.capacity, self.temp = tid, capacity, temp
        self.lots: List[List] = []

    @property
    def volume(self) -> float:
        return sum(l for _, l in self.lots)

    def room(self) -> float:
        return self.capacity - self.volume

    def add(self, lot_id: str, litres: float) -> None:
        if litres <= 0:
            return
        if litres > self.room() + 1e-6:
            raise ValueError(f"{self.id}: add {litres:.1f} L exceeds capacity")
        if self.lots and self.lots[-1][0] == lot_id:
            self.lots[-1][1] += litres
        else:
            self.lots.append([lot_id, litres])

    def draw(self, litres: float) -> List[Tuple[str, float]]:
        if litres > self.volume + 1e-6:
            raise ValueError(f"{self.id}: draw {litres:.1f} L exceeds content")
        out, need = [], litres
        while need > 1e-9 and self.lots:
            lot = self.lots[0]
            take = min(need, lot[1])
            out.append((lot[0], take))
            lot[1] -= take
            need -= take
            if lot[1] <= 1e-9:
                self.lots.pop(0)
        return out

    def draw_lot(self, lot_id: str, litres: float) -> float:
        """Draw from one specific lot (packaging takes its own batch)."""
        for lot in self.lots:
            if lot[0] == lot_id:
                take = min(litres, lot[1])
                lot[1] -= take
                self.lots = [l for l in self.lots if l[1] > 1e-9]
                return take
        return 0.0


class Dataset:
    def __init__(self):
        self.deliveries: List[Delivery] = []
        self.samples: List[QualitySample] = []
        self.movements: List[TankMovement] = []
        self.snapshots: List[TankSnapshot] = []
        self.batches: List[ProcessBatch] = []
        self.packaging: List[PackagingRecord] = []
        self.cip: List[CipCycle] = []
        self.intervals: List[EquipmentInterval] = []
        self.alarms: List[AlarmEvent] = []
        self.window_start: Optional[date] = None
        self.window_end: Optional[date] = None
        self.now: Optional[datetime] = None
        self.mode = "seeded"
        self.seed = DEFAULT_SEED
        self.opening_lots: List[str] = []


class Generator:
    def __init__(self, anchor: date, days: int, seed: int, now: Optional[datetime], mode: str):
        self.rng = random.Random(f"{seed}:{anchor.isoformat()}:{days}")
        self.anchor, self.days, self.now, self.mode = anchor, days, now, mode
        self.start_day = anchor - timedelta(days=days - 1)
        self.t0 = day_start(self.start_day)
        self.t_end = day_start(anchor + timedelta(days=1))
        self.stop_at = min(self.t_end, now) if now else self.t_end
        self.ds = Dataset()
        self.ds.window_start, self.ds.window_end, self.ds.now, self.ds.mode, self.ds.seed = self.start_day, anchor, now, mode, seed
        self.q: list = []
        self.seq = 0
        self.counters: Dict[str, int] = {}
        self.tanks = {tid: Tank(tid, cfg["capacity"], 4.0) for tid, cfg in C.TANKS.items()}
        self.rt_busy_until = self.t0
        self.past_busy_until = self.t0
        self.pack_busy_until = {"PACK-01": self.t0, "PACK-02": self.t0}
        self.drawing: Dict[str, Tuple[datetime, datetime]] = {}   # silo → (start, end) of an active draw
        self.wip_l = 0.0
        self.level_alarm_open: Dict[Tuple[str, str], AlarmEvent] = {}

    # ── helpers ──────────────────────────────────────────────────────────────
    def nid(self, prefix: str, ts: datetime, width: int = 2) -> str:
        key = f"{prefix}{ts:%y%m%d}"
        self.counters[key] = self.counters.get(key, 0) + 1
        return f"{prefix}-{ts:%y%m%d}-{self.counters[key]:0{width}d}"

    def push(self, ts: datetime, kind: str, data) -> None:
        self.seq += 1
        heapq.heappush(self.q, (ts, self.seq, kind, data))

    def r(self, a: float, b: float) -> float:
        return self.rng.uniform(a, b)

    def alarm(self, ts, severity, equipment, code, desc, value=None, unit=None, threshold=None,
              cleared: Optional[datetime] = None, resolution=None, ref=None) -> AlarmEvent:
        ack_needed = severity != "INFO"
        ack = ts + timedelta(minutes=self.r(1.5, 12)) if ack_needed else None
        if ack and self.now and ack > self.now:
            ack = None
        if cleared and self.now and cleared > self.now:
            cleared, resolution = None, None
        ev = AlarmEvent(
            event_id=self.nid("ALM", ts, 4), timestamp=iso(ts), report_date=prod_day(ts).isoformat(), shift=shift_of(ts),
            severity=severity, equipment_id=equipment, code=code, description=desc,
            value=None if value is None else round(value, 3), unit=unit, threshold=threshold,
            ack_status=("Not required" if not ack_needed else "Acknowledged" if ack else "Unacknowledged"),
            ack_time=iso(ack) if ack else None, resolved_time=iso(cleared) if cleared else None,
            resolution=resolution if cleared else None, ref=ref,
        )
        self.ds.alarms.append(ev)
        return ev

    def interval(self, eq, state, a: datetime, b: datetime, reason=None, ref=None):
        b = min(b, self.stop_at)
        if b > a:
            self.ds.intervals.append(EquipmentInterval(equipment_id=eq, state=state, start=iso(a), end=iso(b), reason=reason, ref=ref))

    def move(self, ts, tank_id, direction, litres, counterpart, batch_ids, note=None):
        t = self.tanks[tank_id]
        cfg = C.TANKS[tank_id]
        self.ds.movements.append(TankMovement(
            event_id=self.nid("TRF", ts, 3), timestamp=iso(ts), report_date=prod_day(ts).isoformat(), shift=shift_of(ts),
            tank_id=tank_id, direction=direction, volume_l=round(litres, 1), counterpart=counterpart,
            batch_ids=sorted(set(batch_ids)), pump_id=cfg["pump"], valve_ids=cfg["valves"],
            level_after_l=round(t.volume, 1), level_after_pct=round(t.volume / t.capacity * 100, 2),
            temp_c=round(t.temp, 2), note=note,
        ))
        self.check_levels(ts, tank_id)

    def check_levels(self, ts, tank_id):
        """Raise / clear level alarms from the actual tank state."""
        t = self.tanks[tank_id]
        pct = t.volume / t.capacity * 100
        for code, active, thr, sev in (
            ("HIGH_LEVEL", pct >= C.TANK_HIGH_LEVEL_PCT, f">= {C.TANK_HIGH_LEVEL_PCT:.0f} %", "WARNING"),
            ("LOW_LEVEL", tank_id in ("ST-COW-01", "ST-BUF-01") and pct < C.TANK_LOW_LEVEL_PCT, f"< {C.TANK_LOW_LEVEL_PCT:.0f} %", "WARNING"),
        ):
            key = (tank_id, code)
            open_ev = self.level_alarm_open.get(key)
            if active and not open_ev:
                word = "high" if code == "HIGH_LEVEL" else "low"
                self.level_alarm_open[key] = self.alarm(ts, sev, tank_id, code, f"{C.TANKS[tank_id]['name']} level {word}",
                                                        pct, "%", thr)
            elif not active and open_ev:
                if not (self.now and ts > self.now):
                    open_ev.resolved_time = iso(ts)
                    open_ev.resolution = f"Level returned to {pct:.1f} %"
                del self.level_alarm_open[key]

    def snapshot(self, ts):
        self.ds.snapshots.append(TankSnapshot(
            timestamp=iso(ts), volumes={k: round(t.volume, 3) for k, t in self.tanks.items()},
            temps={k: round(t.temp, 2) for k, t in self.tanks.items()}, wip_l=round(self.wip_l, 3)))

    # ── schedule ─────────────────────────────────────────────────────────────
    def build_schedule(self):
        # Opening stock (from before the demo window) — traceability shows it as an open upstream link.
        self.tanks["ST-COW-01"].add("RB-OPENING-COW", 21000)
        self.tanks["ST-BUF-01"].add("RB-OPENING-BUF", 16000)
        self.tanks["ST-PM-01"].add("PB-OPENING", 0.0)
        self.ds.opening_lots = ["RB-OPENING-COW", "RB-OPENING-BUF"]

        for i in range(self.days):
            d = self.start_day + timedelta(days=i)
            ds = day_start(d)
            for h in (0, 8, 16):
                self.push(ds + timedelta(hours=h), "snapshot", None)
            # Deliveries — mostly morning, some afternoon, few at night.
            n_cow, n_buf = self.rng.randint(6, 8), self.rng.randint(5, 7)
            kinds = ["Cow"] * n_cow + ["Buffalo"] * n_buf
            self.rng.shuffle(kinds)
            for kind in kinds:
                u = self.rng.random()
                hour = self.r(0.4, 7.5) if u < 0.62 else self.r(8.5, 15.5) if u < 0.93 else self.r(17, 20.5)
                self.push(ds + timedelta(hours=hour), "arrival", kind)
            # Processing plan — six batches a day, two per shift.
            for hh, prod in ((1.5, "TM"), (4.5, "CM"), (8.5, "FCM"), (11.5, "TM"), (16.5, "CM"), (19.5, "FCM")):
                self.push(ds + timedelta(hours=hh, minutes=self.rng.randint(-10, 10)), "batch_start", prod)
            # Daily reception-tank CIP; silo circuits on alternate days (early morning, low-activity window).
            self.push(ds + timedelta(hours=22, minutes=30), "cip", "CIRC-RT")
            self.push(ds + timedelta(hours=23, minutes=10), "cip", "CIRC-SILO-COW" if i % 2 == 0 else "CIRC-SILO-BUF")
            # Planned maintenance on PACK-02 every 4th day, night shift.
            if i % 4 == 3:
                a = ds + timedelta(hours=21)
                self.interval("PACK-02", "DOWN", a, a + timedelta(minutes=60), "Planned maintenance (demo)")
        self.push(self.t_end, "snapshot", None)

    # ── event handlers ───────────────────────────────────────────────────────
    def on_arrival(self, ts: datetime, kind: str):
        sup = self.rng.choice([s for s in C.SUPPLIERS if s["milk"] == kind])
        center = next(c for c in C.COLLECTION_CENTERS if c["id"] == sup["center"])
        gross = round(self.r(4200, 8800), 0)
        temp = self.r(3.8, 7.2) if self.rng.random() > 0.08 else self.r(8.2, 12.0)
        rb, dlv = self.nid("RB", ts), self.nid("DLV", ts)
        sample_ml = round(self.r(150, 250), 0)
        test_time = ts + timedelta(minutes=self.r(8, 16))
        s = self.make_sample(ts, test_time, kind, temp, rb, dlv, sup, center)

        rejected, reason = 0.0, None
        rules = C.QUALITY_RULES[kind]
        sample_l = sample_ml / 1000.0
        if s is not None and s.result_status == "Rejected":
            rejected, reason = gross - sample_l, "; ".join(s.review_reasons)
        elif self.rng.random() < 0.03:
            rejected, reason = round(gross / 3, 0), "Compartment B failed organoleptic check (demo)"
        accepted = round(gross - sample_l - rejected, 3)   # mL precision → gross = accepted + rejected + sample exactly
        q_status = ("Not tested — sample record missing" if s is None else
                    "Rejected" if rejected and accepted <= 0 else
                    "Partially rejected" if rejected else s.result_status)
        if temp > rules["temp_max"]:
            sev = "CRITICAL" if temp >= rules["reject_temp"] else "WARNING"
            self.alarm(ts, sev, "RT-01", "TEMP_HIGH", f"Intake milk temperature high ({kind}, {dlv})", temp, "°C",
                       f"> {rules['temp_max']} °C", cleared=test_time,
                       resolution="Load rejected" if accepted <= 0 else "Load accepted with QA review", ref=dlv)

        if s is not None:
            s.weight_l = max(accepted, 0.0)
        rec = dict(delivery_id=dlv, batch_id=rb, collection_time=iso(ts - timedelta(hours=self.r(1.2, 3.5))),
                   center_id=center["id"], center_name=center["name"], supplier_id=sup["id"], supplier_name=sup["name"],
                   tanker_id=self.rng.choice(C.TANKERS), arrival_time=iso(ts), milk_type=kind, gross_l=gross,
                   sample_ml=sample_ml, accepted_l=max(accepted, 0.0), rejected_l=round(rejected, 3), reject_reason=reason,
                   temperature_c=round(temp, 1), quality_status=q_status, operator_id=self.rng.choice(C.OPERATORS),
                   sample_id=s.sample_id if s else None)
        if accepted <= 0:
            # Whole load rejected at the platform — never unloaded.
            self.push(test_time, "delivery_done", dict(rec, unload_start=None, unload_end=None, receiving_tank=None))
            return
        self.push(max(test_time, self.rt_busy_until), "unload_try", rec)

    def on_unload_try(self, ts, rec):
        """Unload only into an empty RT-01 — it holds one milk type at a time."""
        if self.tanks["RT-01"].volume > 0.5 or ts < self.rt_busy_until:
            self.push(max(ts + timedelta(minutes=10), self.rt_busy_until), "unload_try", rec)
            return
        end = ts + timedelta(hours=rec["accepted_l"] / UNLOAD_RATE_LPH)
        self.rt_busy_until = end + timedelta(minutes=2)
        self.push(end, "unload_end", dict(rec, unload_start=iso(ts), unload_end=iso(end), receiving_tank="RT-01"))
        self.interval("P-101", "RUN", ts, end, ref=rec["delivery_id"])

    def make_sample(self, ts, test_time, kind, temp, rb, dlv, sup, center) -> Optional[QualitySample]:
        if self.rng.random() < 0.03:
            return None                                   # sample record missing (data gap)
        if self.now and test_time > self.now:            # dynamic mode: test not finished yet
            s = QualitySample(
                sample_id=self.nid("SMP", ts), batch_id=rb, delivery_id=dlv, report_date=prod_day(ts).isoformat(), shift=shift_of(ts),
                center_id=center["id"], center_name=center["name"], supplier_id=sup["id"], milk_type=kind,
                sample_time=iso(ts + timedelta(minutes=2)), test_time=iso(test_time), fat_pct=None, snf_pct=None,
                density_kg_l=None, clr=None, protein_pct=None, lactose_pct=None, acidity_pct_la=None,
                sample_temp_c=round(temp, 1), method=C.QUALITY_METHODS["composition"], instrument_id=C.INSTRUMENTS[0],
                screening_status="Pending", result_status="Pending", review_reasons=[], reviewer_id=None, weight_l=0.0)
            self.ds.samples.append(s)
            return s
        rg, rules = C.SAMPLE_RANGES[kind], C.QUALITY_RULES[kind]
        fat = self.r(*rg["fat"])
        snf = self.r(*rg["snf"])
        if self.rng.random() < 0.06:
            snf -= self.r(0.4, 0.8)                       # low-solids sample → review
        clr = 4 * (snf - 0.2 * fat - 0.36)                # illustrative relation (see config.QUALITY_METHODS)
        rho27 = 1 + clr / 1000
        density = rho27 + 0.0013 + self.rng.gauss(0, 0.0003)
        acidity = self.rng.gauss(0.135, 0.007) if self.rng.random() > 0.05 else self.r(0.158, 0.2)
        # Round to reporting precision FIRST, then judge — the flag must agree with the value shown.
        fat, snf, clr = round(fat, 2), round(snf, 2), round(clr, 1)
        density, acidity, temp = round(density, 4), round(max(acidity, 0.08), 3), round(temp, 1)
        protein = round(self.r(*rg["protein"]), 2) if self.rng.random() < 0.6 else None
        lactose = round(self.r(*rg["lactose"]), 2) if self.rng.random() < 0.6 else None
        u = self.rng.random()
        screening = "Screening pass" if u < 0.7 else "Not simulated" if u < 0.85 else "Pending" if u < 0.95 else "Screening review"
        reasons = []
        if fat < rules["fat_min"]: reasons.append(f"Fat {fat:.2f} % < demo min {rules['fat_min']}")
        if snf < rules["snf_min"]: reasons.append(f"SNF {snf:.2f} % < demo min {rules['snf_min']}")
        if acidity > rules["acidity_max"]: reasons.append(f"Acidity {acidity:.3f} % LA > demo max {rules['acidity_max']}")
        if temp > rules["temp_max"]: reasons.append(f"Temperature {temp:.1f} °C > demo max {rules['temp_max']}")
        if not (rules["density_min"] <= density <= rules["density_max"]): reasons.append(f"Density {density:.4f} kg/L outside demo range")
        if screening == "Screening review": reasons.append("Adulterant screening flagged for review")
        rejected = acidity >= rules["reject_acidity"] or temp >= rules["reject_temp"]
        status = "Rejected" if rejected else "Review required" if reasons else "Within demo rules"
        s = QualitySample(
            sample_id=self.nid("SMP", ts), batch_id=rb, delivery_id=dlv, report_date=prod_day(ts).isoformat(), shift=shift_of(ts),
            center_id=center["id"], center_name=center["name"], supplier_id=sup["id"], milk_type=kind,
            sample_time=iso(ts + timedelta(minutes=2)), test_time=iso(test_time),
            fat_pct=fat, snf_pct=snf, density_kg_l=density, clr=clr,
            protein_pct=protein, lactose_pct=lactose, acidity_pct_la=acidity,
            sample_temp_c=temp, method=C.QUALITY_METHODS["composition"], instrument_id=self.rng.choice(C.INSTRUMENTS),
            screening_status=screening, result_status=status, review_reasons=reasons,
            reviewer_id=self.rng.choice(C.REVIEWERS) if status != "Within demo rules" else None, weight_l=0.0,
        )
        self.ds.samples.append(s)
        return s

    def on_delivery_done(self, ts, rec):
        self.ds.deliveries.append(Delivery(report_date=prod_day(ts).isoformat(), shift=shift_of(ts), **rec))

    def on_unload_end(self, ts, rec):
        rt = self.tanks["RT-01"]
        rt.add(rec["batch_id"], rec["accepted_l"])
        self.move(ts, "RT-01", "IN", rec["accepted_l"], rec["tanker_id"], [rec["batch_id"]])
        self.on_delivery_done(ts, rec)
        self.push(ts + timedelta(minutes=3), "transfer", dict(kind=rec["milk_type"], ref=rec["delivery_id"], retries=0))

    def on_transfer(self, ts, data):
        rt = self.tanks["RT-01"]
        if rt.volume <= 0.5:
            return
        silo_id = "ST-COW-01" if data["kind"] == "Cow" else "ST-BUF-01"
        silo = self.tanks[silo_id]
        active = self.drawing.get(silo_id)
        if active and active[0] <= ts < active[1]:
            # Routing interlock: don't fill a silo while it is feeding the line.
            self.alarm(ts, "WARNING", "V-301", "VALVE_CONFLICT",
                       f"Diverter route to {silo_id} blocked — silo outlet active (simultaneous fill/draw interlock)",
                       None, None, "Fill and draw not permitted together", cleared=active[1],
                       resolution="Transfer resumed after the draw finished", ref=data["ref"])
            self.rt_busy_until = max(self.rt_busy_until, active[1] + timedelta(minutes=5))
            self.push(active[1] + timedelta(minutes=2), "transfer", data)
            return
        amount = min(rt.volume, silo.room())
        if amount < rt.volume - 0.5:
            self.alarm(ts, "WARNING", silo_id, "CAPACITY_INTERLOCK",
                       f"Transfer into {silo_id} limited — would exceed capacity", silo.volume / silo.capacity * 100, "%",
                       "<= 100 % capacity", cleared=ts + timedelta(hours=2), resolution="Remaining milk transferred after silo draw",
                       ref=data["ref"])
        if amount > 0.5:
            dur = timedelta(hours=amount / TRANSFER_RATE_LPH)
            lots = rt.draw(amount)
            self.move(ts, "RT-01", "OUT", amount, silo_id, [l for l, _ in lots])
            for lot, litres in lots:
                silo.add(lot, litres)
            silo.temp += (rt.temp - silo.temp) * amount / max(silo.volume, 1)
            self.move(ts, silo_id, "IN", amount, "RT-01 via V-301", [l for l, _ in lots])
            self.interval("V-301", "RUN", ts, ts + dur, "Routing to " + silo_id, data["ref"])
            self.interval("P-101", "RUN", ts, ts + dur, ref=data["ref"])
            self.rt_busy_until = max(self.rt_busy_until, ts + dur)
        if rt.volume > 0.5:
            data = dict(data, retries=data["retries"] + 1)
            self.rt_busy_until = max(self.rt_busy_until, ts + timedelta(hours=1))
            self.push(ts + timedelta(minutes=50), "transfer", data)

    def on_batch_start(self, sched: datetime, code: str):
        prod = C.PRODUCTS[code]
        start = max(sched, self.past_busy_until)
        split = {"TM": {"ST-COW-01": 0.6, "ST-BUF-01": 0.4}, "FCM": {"ST-BUF-01": 1.0}, "CM": {"ST-COW-01": 1.0}}[code]
        fill = max(self.tanks[t].volume / self.tanks[t].capacity for t in split)
        planned = self.r(15000, 19000) if fill > 0.55 else self.r(9000, 13000)
        avail = min((self.tanks[t].volume - SILO_HEEL_L) / share for t, share in split.items())
        pm = self.tanks["ST-PM-01"]
        volume = max(0.0, min(planned, avail, pm.room() - 200))
        bid = self.nid("PB", start)
        milk = "Mixed" if len(split) > 1 else ("Cow" if "ST-COW-01" in split else "Buffalo")
        base = dict(batch_id=bid, product_code=code, product_name=prod["name"], milk_type=milk, source_tanks=list(split),
                    scheduled_start=iso(sched), line_id="LINE-01")
        if volume < 2000:
            why = "Insufficient raw milk in source silo(s)" if avail < planned else "Storage tank ST-PM-01 has no room"
            self.ds.batches.append(ProcessBatch(
                **base, report_date=prod_day(sched).isoformat(), shift=shift_of(sched), source_lots=[], start=None, end=None,
                incoming_l=0, processed_l=0, documented_loss_l=0, inlet_temp_c=None, outlet_temp_min_c=None,
                outlet_temp_avg_c=None, hold_time_s=None, homogenizer_bar=None, cooling_outlet_c=None,
                equipment_status="Idle", deviations=[why], state="NOT STARTED", disposition="Cancelled — not processed",
                events=[{"time": iso(sched), "text": f"Batch not started: {why}"}]))
            return
        deviations, events, alarm_ids = [], [{"time": iso(start), "text": "Batch started — feed from " + ", ".join(split)}], []
        if volume < planned - 1:
            deviations.append(f"Volume reduced from planned {planned:,.0f} L to {volume:,.0f} L (availability / storage room)")
        lots = []
        for t, share in split.items():
            for lot, litres in self.tanks[t].draw(volume * share):
                lots.append({"lot": lot, "litres": round(litres, 1), "tank": t})
            self.move(start, t, "OUT", volume * share, "PAST-01 (" + bid + ")", [l["lot"] for l in lots if l["tank"] == t])
        self.wip_l += volume
        run_h = volume / C.PROCESS_RATE_LPH
        pause = timedelta(0)
        if self.rng.random() < 0.05:                     # feed-pump trip mid-batch
            pump = "P-201" if "ST-COW-01" in split else "P-202"
            f_at = start + timedelta(hours=run_h * self.r(0.2, 0.7))
            pause = timedelta(minutes=self.r(8, 20))
            self.interval(pump, "FAULT", f_at, f_at + pause, "Motor overload trip (demo)", bid)
            ev = self.alarm(f_at, "FAULT", pump, "PUMP_FAULT", f"{C.EQUIPMENT[pump]['name']} tripped — batch {bid} paused",
                            None, None, "Motor protection", cleared=f_at + pause, resolution="Reset and restarted", ref=bid)
            alarm_ids.append(ev.event_id)
            deviations.append(f"Feed pump {pump} trip — line held {pause.seconds // 60} min")
            events.append({"time": iso(f_at), "text": f"{pump} fault — line on hold"})
            events.append({"time": iso(f_at + pause), "text": f"{pump} restarted"})
        end = start + timedelta(hours=run_h) + pause
        for t in split:
            self.drawing[t] = (start, end)
        self.past_busy_until = end + timedelta(minutes=5)
        self.push(end, "batch_end", dict(base=base, start=start, end=end, volume=volume, lots=lots, planned=planned,
                                         deviations=deviations, events=events, alarm_ids=alarm_ids, split=split))
        for eq in ("PAST-01", "HOMO-01", "COOL-01", "V-302"):
            self.interval(eq, "RUN", start, end, ref=bid)
        for t in split:
            self.interval(C.TANKS[t]["pump"], "RUN", start, end, ref=bid)

    def temp_profile(self, start, end, bid):
        """Per-minute holding-tube outlet temperature with FDV state. Deviations are simulated, not tuned to pass."""
        minutes = max(2, int((end - start).total_seconds() // 60))
        target = C.HTST_DEMO["target_temp_c"]
        u = self.rng.random()
        mode = "ok" if u < 0.86 else "diverted" if u < 0.95 else "undiverted"
        dip_at = self.rng.randint(1, max(1, minutes - 3))
        hold = round(self.r(15.4, 16.6), 1) if self.rng.random() > 0.03 else round(self.r(13.8, 14.8), 1)
        prof = []
        for m in range(minutes + 1):
            t = target + 0.55 + self.rng.gauss(0, 0.12)
            fdv = "FORWARD"
            if mode != "ok" and dip_at <= m < dip_at + 2:
                t = target - self.r(0.4, 1.2)
                fdv = "DIVERT" if mode == "diverted" else "FORWARD"
            prof.append({"t": iso(start + timedelta(minutes=m)), "outlet_c": round(t, 2), "fdv": fdv})
        return prof, hold, mode

    def on_batch_end(self, ts, d):
        bid, volume = d["base"]["batch_id"], d["volume"]
        prof, hold, mode = self.temp_profile(d["start"], d["end"], bid)
        target = C.HTST_DEMO["target_temp_c"]
        below = [p for p in prof if p["outlet_c"] < target]
        undiverted = [p for p in below if p["fdv"] == "FORWARD"]
        deviations, events, alarm_ids = d["deviations"], d["events"], d["alarm_ids"]
        state = "COMPLETED"
        if below:
            first = below[0]["t"]
            if undiverted:
                state = "FAILED DEMO CRITERIA"
                deviations.append(f"Outlet temperature below {target} °C for {len(undiverted)} min without flow diversion")
                ev = self.alarm(datetime.fromisoformat(first), "CRITICAL", "PAST-01", "PROCESS_DEVIATION",
                                f"Holding-tube outlet below {target} °C, FDV did not divert ({bid})",
                                min(p["outlet_c"] for p in undiverted), "°C", f">= {target} °C",
                                cleared=datetime.fromisoformat(undiverted[-1]["t"]) + timedelta(minutes=1),
                                resolution="Batch blocked for QA decision", ref=bid)
            else:
                state = "REVIEW REQUIRED"
                deviations.append(f"Outlet dipped below {target} °C for {len(below)} min — FDV diverted to balance tank")
                ev = self.alarm(datetime.fromisoformat(first), "WARNING", "V-302", "PROCESS_DEVIATION",
                                f"Flow diverted — outlet below {target} °C ({bid})", min(p["outlet_c"] for p in below), "°C",
                                f">= {target} °C", cleared=datetime.fromisoformat(below[-1]["t"]) + timedelta(minutes=1),
                                resolution="Forward flow restored at target", ref=bid)
            alarm_ids.append(ev.event_id)
            events.append({"time": first, "text": "Outlet below target — " + ("FDV diverted" if not undiverted else "no diversion recorded")})
        if hold < C.HTST_DEMO["min_hold_s"]:
            state = "FAILED DEMO CRITERIA"
            deviations.append(f"Holding time {hold} s < demo minimum {C.HTST_DEMO['min_hold_s']} s")
        loss_doc = volume * self.r(*C.PROCESS_LOSS_FRACTION)
        loss_undoc = self.r(5, 35)                       # small unrecorded loss → shows up as "unexplained" in reconciliation
        out = volume - loss_doc - loss_undoc
        pm = self.tanks["ST-PM-01"]
        self.wip_l -= volume
        pm.add(bid, out)
        pm.temp = self.r(3.6, 4.4)
        self.move(ts, "ST-PM-01", "IN", out, "PAST-01 → COOL-01", [bid])
        events.append({"time": iso(ts), "text": f"Batch complete — {out:,.0f} L to ST-PM-01"})
        disposition = {"COMPLETED": "Released (demo)", "REVIEW REQUIRED": "On hold — QA review",
                       "FAILED DEMO CRITERIA": "Blocked — QA decision pending"}[state]
        b = ProcessBatch(
            **d["base"], report_date=prod_day(d["start"]).isoformat(), shift=shift_of(d["start"]), source_lots=d["lots"],
            start=iso(d["start"]), end=iso(ts), incoming_l=round(volume, 1), processed_l=round(out, 1),
            documented_loss_l=round(loss_doc, 1), inlet_temp_c=round(self.r(4.0, 5.8), 1),
            outlet_temp_min_c=min(p["outlet_c"] for p in prof), outlet_temp_avg_c=round(sum(p["outlet_c"] for p in prof) / len(prof), 2),
            hold_time_s=hold, homogenizer_bar=round(self.r(185, 210), 0) if C.PRODUCTS[d["base"]["product_code"]]["homogenize"] else None,
            cooling_outlet_c=round(self.r(3.4, 4.6), 1), equipment_status="Normal" if not d["alarm_ids"] else "Fault during batch",
            deviations=deviations, alarm_ids=alarm_ids, state=state, disposition=disposition, temp_profile=prof, events=events)
        self.ds.batches.append(b)
        for t in d["split"]:
            self.drawing.pop(t, None)
        self.push(ts + timedelta(minutes=10), "pack", dict(batch=b, out=out))
        self.push(ts + timedelta(minutes=12), "cip", "CIRC-PAST")

    def on_pack(self, ts, d):
        b: ProcessBatch = d["batch"]
        split = {"TM": {500: 0.6, 1000: 0.4}, "FCM": {500: 0.5, 1000: 0.5}, "CM": {500: 1.0}}[b.product_code]
        pm = self.tanks["ST-PM-01"]
        for size, share in split.items():
            line = "PACK-01" if size == 500 else "PACK-02"
            start = max(ts, self.pack_busy_until[line])
            volume = d["out"] * share
            units = int(volume * 1000 // size)
            planned = int(b.incoming_l * share * 1000 // size)
            rej = int(round(units * self.r(0.003, 0.012)))
            acc = units - rej
            speed = C.PACK_SPEED_PPH[size]
            run_min = units / speed * 60
            down, why = 0.0, None
            if self.rng.random() < 0.25:
                down = round(self.r(6, 28), 1)
                why = self.rng.choice(["Film reel change overrun", "Sealing jaw jam", "Date-coder fault", "Pouch misfeed"])
            end = start + timedelta(minutes=run_min + down)
            self.pack_busy_until[line] = end + timedelta(minutes=3)
            fg = f"FG-{start:%y%m%d}-{line[-2:]}-{self.nid('FGS', start)[-2:]}"
            if down:
                f_at = start + timedelta(minutes=run_min * self.r(0.2, 0.8))
                self.interval(line, "FAULT", f_at, f_at + timedelta(minutes=down), why, fg)
                self.alarm(f_at, "WARNING", line, "PACK_STOP", f"{C.EQUIPMENT[line]['name']} stopped — {why}", down, "min",
                           None, cleared=f_at + timedelta(minutes=down), resolution="Cleared by operator, line restarted", ref=fg)
                self.interval(line, "RUN", start, f_at, ref=fg)
                self.interval(line, "RUN", f_at + timedelta(minutes=down), end, ref=fg)
            else:
                self.interval(line, "RUN", start, end, ref=fg)
            self.interval("P-401", "RUN", start, end, ref=fg)
            self.push(end, "pack_end", dict(batch=b, fg=fg, line=line, size=size, units=units, acc=acc, rej=rej,
                                            planned=planned, speed=speed, run_min=run_min, down=down, why=why,
                                            start=start, end=end, volume=volume))

    def on_pack_end(self, ts, d):
        b: ProcessBatch = d["batch"]
        pm = self.tanks["ST-PM-01"]
        used = d["units"] * d["size"] / 1000.0
        got = pm.draw_lot(b.batch_id, used)
        self.move(ts, "ST-PM-01", "OUT", got, d["line"], [b.batch_id])
        cold = None if self.rng.random() < 0.02 else iso(ts + timedelta(minutes=self.r(10, 30)))
        released = b.state == "COMPLETED"
        disp_time = ts + timedelta(hours=self.r(8, 20))
        dispatched = released and cold is not None and disp_time <= self.stop_at
        self.ds.packaging.append(PackagingRecord(
            fg_batch_id=d["fg"], batch_id=b.batch_id, report_date=prod_day(ts).isoformat(), shift=shift_of(ts),
            product_code=b.product_code, product_name=b.product_name, line_id=d["line"], pack_size_ml=d["size"],
            planned_units=d["planned"], produced_units=d["units"], accepted_packs=d["acc"], rejected_packs=d["rej"],
            speed_pph=d["speed"], operating_min=round(d["run_min"], 1), downtime_min=d["down"], downtime_reason=d["why"],
            finished_volume_l=round(d["acc"] * d["size"] / 1000.0, 1), rejected_volume_l=round(d["rej"] * d["size"] / 1000.0, 1),
            disposition=b.disposition, start=iso(d["start"]), end=iso(ts), cold_storage_in=cold,
            dispatch_id=self.nid("DSP", disp_time) if dispatched else None, dispatch_time=iso(disp_time) if dispatched else None))

    def on_cip(self, ts, circuit: str):
        if circuit == "CIRC-PAST":
            ts = max(ts, self.past_busy_until)
        equipment = {"CIRC-PAST": ["PAST-01", "HOMO-01", "COOL-01"], "CIRC-SILO-COW": ["ST-COW-01", "P-201"],
                     "CIRC-SILO-BUF": ["ST-BUF-01", "P-202"], "CIRC-RT": ["RT-01", "P-101"]}[circuit]
        u = self.rng.random()
        fault = None if u > 0.1 else self.rng.choice(["temp", "conductivity", "flow"])
        phases, t, deviations, pending_alarms = [], ts, [], []
        for name, min_minutes, min_temp in C.CIP_PHASES:
            minutes = round(min_minutes + self.r(0, 4), 1)
            hot = min_temp is not None
            supply = self.r(72, 78) if hot else self.r(20, 35)
            flow = self.r(17, 24)
            cond = round(self.r(0.05, 0.35), 2) if name == "Final rinse" else (round(self.r(15, 30), 1) if hot else None)
            ok, note = True, None
            if fault == "temp" and hot:
                supply, ok, note = self.r(62, 68), False, f"Supply temperature below demo minimum {min_temp} °C"
            if fault == "conductivity" and name == "Final rinse":
                cond, ok, note = round(self.r(0.7, 1.4), 2), False, f"Final-rinse conductivity above demo max {C.CIP_FINAL_RINSE_MAX_CONDUCTIVITY} mS/cm"
            if fault == "flow" and name == "Cleaning solution circulation":
                flow, ok, note = self.r(10, 13.5), False, f"Flow below demo minimum {C.CIP_MIN_FLOW_M3H} m³/h"
                pending_alarms.append((t + timedelta(minutes=2), "WARNING", "CIP-01", "LOW_FLOW", f"CIP low flow on {circuit}", flow,
                                       "m³/h", f">= {C.CIP_MIN_FLOW_M3H} m³/h", t + timedelta(minutes=minutes), "Phase ended"))
            phases.append(CipPhase(phase=name, start=iso(t), minutes=minutes, supply_temp_c=round(supply, 1),
                                   return_temp_c=round(supply - self.r(2, 6), 1), flow_m3h=round(flow, 1),
                                   pressure_bar=round(self.r(2.2, 3.4), 2), conductivity_ms_cm=cond, ok=ok, note=note))
            if not ok:
                deviations.append(f"{name}: {note}")
            t += timedelta(minutes=minutes)
        end = t
        status = "COMPLETED" if not deviations else ("INCOMPLETE" if fault == "conductivity" else "FAILED DEMO CRITERIA")
        if end > self.stop_at:
            return                                        # cycle still running at the stop point — not recorded yet
        cid = self.nid("CIP", ts)
        for (at, sev, eq, code, desc, val, unit, thr, clr, res) in pending_alarms:
            self.alarm(at, sev, eq, code, desc, val, unit, thr, cleared=clr, resolution=res, ref=cid)
        if deviations:
            self.alarm(end, "CRITICAL" if status == "FAILED DEMO CRITERIA" else "WARNING", "CIP-01", "CIP_DEVIATION",
                       f"CIP {cid} on {circuit}: {status}", None, None, "All phases meet demo criteria",
                       cleared=end + timedelta(minutes=self.r(20, 60)), resolution="Cycle repeat scheduled by operator", ref=cid)
        self.ds.cip.append(CipCycle(
            cycle_id=cid, report_date=prod_day(ts).isoformat(), shift=shift_of(ts), circuit_id=circuit,
            circuit_name=C.CIP_CIRCUITS[circuit], equipment=equipment, start=iso(ts), end=iso(end),
            duration_min=round((end - ts).total_seconds() / 60, 1), phases=phases, solution_id=self.rng.choice(C.CIP_SOLUTIONS),
            rinse_status="Final rinse within demo limit" if fault != "conductivity" else "Final rinse conductivity high",
            completion_status=status, deviations=deviations, operator_id=self.rng.choice(C.OPERATORS)))
        self.interval("CIP-01", "RUN", ts, end, "CIP " + circuit, cid)
        if circuit == "CIRC-PAST":
            self.past_busy_until = end + timedelta(minutes=5)

    # ── run ──────────────────────────────────────────────────────────────────
    def run(self) -> Dataset:
        self.build_schedule()
        handlers = {"arrival": self.on_arrival, "unload_try": self.on_unload_try, "unload_end": self.on_unload_end, "delivery_done": self.on_delivery_done,
                    "transfer": self.on_transfer, "batch_start": self.on_batch_start, "batch_end": self.on_batch_end,
                    "pack": self.on_pack, "pack_end": self.on_pack_end, "cip": self.on_cip,
                    "snapshot": lambda ts, _: self.snapshot(ts)}
        while self.q:
            ts, _, kind, data = heapq.heappop(self.q)
            if ts > self.stop_at or (ts >= self.t_end and kind != "snapshot"):
                break
            handlers[kind](ts, data)
        # Running batches at "now" (dynamic mode only).
        if self.now and self.now < self.t_end:
            self.snapshot(self.now)
            for _, _, kind, d in self.q:
                if kind == "batch_end" and d["start"] <= self.now:
                    b = d["base"]
                    self.ds.batches.append(ProcessBatch(
                        **b, report_date=prod_day(d["start"]).isoformat(), shift=shift_of(d["start"]), source_lots=d["lots"],
                        start=iso(d["start"]), end=None, incoming_l=round(d["volume"], 1), processed_l=0,
                        documented_loss_l=0, inlet_temp_c=round(self.r(4.0, 5.8), 1), outlet_temp_min_c=None,
                        outlet_temp_avg_c=None, hold_time_s=None, homogenizer_bar=None, cooling_outlet_c=None,
                        equipment_status="Running", deviations=d["deviations"], alarm_ids=d["alarm_ids"], state="RUNNING",
                        disposition="In process", events=d["events"]))
            self.alarm(self.now, "INFO", "SIM", "SIM_PAUSE", "Dynamic simulation clock — later events not generated yet",
                       None, None, None)
        # Drop anything stamped after the stop point (intervals were clipped already).
        self.ds.alarms = [a for a in self.ds.alarms if a.timestamp <= iso(self.stop_at)]
        return self.ds


# ── cache ────────────────────────────────────────────────────────────────────
_cache: Dict[tuple, Dataset] = {}


def get_dataset(mode: str = "seeded", seed: int = DEFAULT_SEED, now: Optional[datetime] = None) -> Dataset:
    if mode == "dynamic":
        now = (now or datetime.now()).replace(second=0, microsecond=0)
        anchor = prod_day(now)
        key = ("dynamic", seed, iso(now))
    else:
        anchor, now = SEEDED_ANCHOR, None
        key = ("seeded", seed)
    if key not in _cache:
        if len(_cache) > 6:
            _cache.clear()
        _cache[key] = Generator(anchor, WINDOW_DAYS, seed, now, mode).run()
    return _cache[key]
