// In-browser seeded mock-data generator for the dairy reports — ONE shared
// dataset (port of backend-fastapi/reports/generator.py). No backend, no
// database: the plant is simulated as a chronological event timeline and every
// report is a filtered view of the result, so totals and IDs agree everywhere.
//
//   tanker arrival → intake sample/test → accept / reject → unload into RT-01
//   → diverter V-301 → cow / buffalo silo → process batch (FIFO draw) → PAST-01
//   → ST-PM-01 → PACK-01 / PACK-02 → cold storage → dispatch; CIP cycles;
//   equipment intervals and alarms derived from what actually happened.
//
// Time is handled as "plant-local" milliseconds stored in UTC fields (no
// timezone conversions anywhere).

import * as C from './config';

export const SEEDED_ANCHOR = '2025-08-19';
export const DEFAULT_SEED = 2025;
export const WINDOW_DAYS = 30;
const TRANSFER_RATE_LPH = 20000;
const UNLOAD_RATE_LPH = 15000;
const SILO_HEEL_L = 1000;
const H = 3600e3, MIN = 60e3, DAY = 24 * H;

// ── time helpers ─────────────────────────────────────────────────────────────
const pad = (n, w = 2) => String(n).padStart(w, '0');
export function iso(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
export const dateOf = ms => iso(ms).slice(0, 10);
export const prodDay = ms => dateOf(ms - 6 * H);                 // production day runs 06:00 → 06:00
export function dayStart(dstr) {
  const [y, m, d] = dstr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 6, 0, 0);
}
export const addDays = (dstr, n) => dateOf(Date.UTC(...dstr.split('-').map((v, i) => (i === 1 ? +v - 1 : +v))) + n * DAY);
export function shiftOf(ms) {
  const h = new Date(ms).getUTCHours();
  return h >= 6 && h < 14 ? 'Morning' : h >= 14 && h < 22 ? 'Afternoon' : 'Night';
}
const yymmdd = ms => iso(ms).slice(2, 10).replace(/-/g, '');
export const parseIso = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0, +s.slice(17, 19) || 0);

// ── seeded PRNG (mulberry32 over a string hash) ──────────────────────────────
function hashString(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return (h >>> 0) || 1;
}
function makeRng(seedStr) {
  let a = hashString(seedStr);
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  return {
    random: next,
    uniform: (lo, hi) => lo + next() * (hi - lo),
    randint: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    choice: arr => arr[Math.floor(next() * arr.length)],
    shuffle: arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    gauss: (mu, sigma) => {
      if (spare != null) { const s = spare; spare = null; return mu + sigma * s; }
      let u = 0, v = 0;
      while (u === 0) u = next();
      v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return mu + sigma * r * Math.cos(2 * Math.PI * v);
    },
  };
}

export const round = (x, n = 0) => { const p = 10 ** n; return Math.round((x + Number.EPSILON * Math.sign(x)) * p) / p; };

// ── min-heap on (ts, seq) ────────────────────────────────────────────────────
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(i, j) { const x = this.a[i], y = this.a[j]; return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
  push(item) {
    const a = this.a; a.push(item);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

// ── FIFO lot tank ────────────────────────────────────────────────────────────
class Tank {
  constructor(id, capacity, temp) { this.id = id; this.capacity = capacity; this.temp = temp; this.lots = []; }
  get volume() { return this.lots.reduce((s, l) => s + l[1], 0); }
  room() { return this.capacity - this.volume; }
  add(lot, litres) {
    if (litres <= 0) return;
    if (litres > this.room() + 1e-6) throw new Error(`${this.id}: add ${litres.toFixed(1)} L exceeds capacity`);
    const last = this.lots[this.lots.length - 1];
    if (last && last[0] === lot) last[1] += litres; else this.lots.push([lot, litres]);
  }
  draw(litres) {
    if (litres > this.volume + 1e-6) throw new Error(`${this.id}: draw ${litres.toFixed(1)} L exceeds content`);
    const out = [];
    let need = litres;
    while (need > 1e-9 && this.lots.length) {
      const lot = this.lots[0];
      const take = Math.min(need, lot[1]);
      out.push([lot[0], take]);
      lot[1] -= take; need -= take;
      if (lot[1] <= 1e-9) this.lots.shift();
    }
    return out;
  }
  drawLot(lotId, litres) {
    const lot = this.lots.find(l => l[0] === lotId);
    if (!lot) return 0;
    const take = Math.min(litres, lot[1]);
    lot[1] -= take;
    this.lots = this.lots.filter(l => l[1] > 1e-9);
    return take;
  }
}

class Generator {
  constructor(anchor, days, seed, now, mode) {
    this.rng = makeRng(`${seed}:${anchor}:${days}`);
    this.anchor = anchor; this.days = days; this.now = now; this.mode = mode;
    this.startDay = addDays(anchor, -(days - 1));
    this.t0 = dayStart(this.startDay);
    this.tEnd = dayStart(addDays(anchor, 1));
    this.stopAt = now ? Math.min(this.tEnd, now) : this.tEnd;
    this.ds = {
      deliveries: [], samples: [], movements: [], snapshots: [], batches: [], packaging: [], cip: [], intervals: [], alarms: [],
      window_start: this.startDay, window_end: anchor, now, mode, seed, opening_lots: [],
    };
    this.q = new Heap(); this.seq = 0; this.counters = {};
    this.tanks = Object.fromEntries(Object.entries(C.TANKS).map(([id, c]) => [id, new Tank(id, c.capacity, 4.0)]));
    this.rtBusyUntil = this.t0; this.pastBusyUntil = this.t0;
    this.packBusyUntil = { 'PACK-01': this.t0, 'PACK-02': this.t0 };
    this.drawing = {}; this.wip = 0; this.levelOpen = {};
  }

  // helpers
  nid(prefix, ts, width = 2) {
    const key = prefix + yymmdd(ts);
    this.counters[key] = (this.counters[key] || 0) + 1;
    return `${prefix}-${yymmdd(ts)}-${pad(this.counters[key], width)}`;
  }
  push(ts, kind, data) { this.q.push([ts, ++this.seq, kind, data]); }
  r(a, b) { return this.rng.uniform(a, b); }

  alarm(ts, severity, equipment, code, description, value = null, unit = null, threshold = null, cleared = null, resolution = null, ref = null) {
    const ackNeeded = severity !== 'INFO';
    let ack = ackNeeded ? ts + this.r(1.5, 12) * MIN : null;
    if (ack && this.now && ack > this.now) ack = null;
    if (cleared && this.now && cleared > this.now) { cleared = null; resolution = null; }
    const ev = {
      event_id: this.nid('ALM', ts, 4), timestamp: iso(ts), report_date: prodDay(ts), shift: shiftOf(ts),
      severity, equipment_id: equipment, code, description, value: value == null ? null : round(value, 3), unit, threshold,
      ack_status: !ackNeeded ? 'Not required' : ack ? 'Acknowledged' : 'Unacknowledged',
      ack_time: ack ? iso(ack) : null, resolved_time: cleared ? iso(cleared) : null, resolution: cleared ? resolution : null,
      ref, is_mock: true,
    };
    this.ds.alarms.push(ev);
    return ev;
  }

  interval(eq, state, a, b, reason = null, ref = null) {
    b = Math.min(b, this.stopAt);
    if (b > a) this.ds.intervals.push({ equipment_id: eq, state, start: iso(a), end: iso(b), reason, ref });
  }

  move(ts, tankId, direction, litres, counterpart, batchIds, note = null) {
    const t = this.tanks[tankId], cfg = C.TANKS[tankId];
    this.ds.movements.push({
      event_id: this.nid('TRF', ts, 3), timestamp: iso(ts), report_date: prodDay(ts), shift: shiftOf(ts),
      tank_id: tankId, direction, volume_l: round(litres, 1), counterpart, batch_ids: [...new Set(batchIds)].sort(),
      pump_id: cfg.pump, valve_ids: cfg.valves, level_after_l: round(t.volume, 1),
      level_after_pct: round(t.volume / t.capacity * 100, 2), temp_c: round(t.temp, 2), note, is_mock: true,
    });
    this.checkLevels(ts, tankId);
  }

  checkLevels(ts, tankId) {
    const t = this.tanks[tankId];
    const pct = t.volume / t.capacity * 100;
    const checks = [
      ['HIGH_LEVEL', pct >= C.TANK_HIGH_LEVEL_PCT, `>= ${C.TANK_HIGH_LEVEL_PCT} %`],
      ['LOW_LEVEL', (tankId === 'ST-COW-01' || tankId === 'ST-BUF-01') && pct < C.TANK_LOW_LEVEL_PCT, `< ${C.TANK_LOW_LEVEL_PCT} %`],
    ];
    for (const [code, active, thr] of checks) {
      const key = tankId + code;
      const open = this.levelOpen[key];
      if (active && !open) {
        this.levelOpen[key] = this.alarm(ts, 'WARNING', tankId, code, `${C.TANKS[tankId].name} level ${code === 'HIGH_LEVEL' ? 'high' : 'low'}`, pct, '%', thr);
      } else if (!active && open) {
        if (!(this.now && ts > this.now)) { open.resolved_time = iso(ts); open.resolution = `Level returned to ${pct.toFixed(1)} %`; }
        delete this.levelOpen[key];
      }
    }
  }

  snapshot(ts) {
    this.ds.snapshots.push({
      timestamp: iso(ts),
      volumes: Object.fromEntries(Object.entries(this.tanks).map(([k, t]) => [k, round(t.volume, 3)])),
      temps: Object.fromEntries(Object.entries(this.tanks).map(([k, t]) => [k, round(t.temp, 2)])),
      wip_l: round(this.wip, 3),
    });
  }

  // schedule
  buildSchedule() {
    this.tanks['ST-COW-01'].add('RB-OPENING-COW', 21000);
    this.tanks['ST-BUF-01'].add('RB-OPENING-BUF', 16000);
    this.ds.opening_lots = ['RB-OPENING-COW', 'RB-OPENING-BUF'];
    for (let i = 0; i < this.days; i++) {
      const d = addDays(this.startDay, i);
      const ds = dayStart(d);
      for (const h of [0, 8, 16]) this.push(ds + h * H, 'snapshot', null);
      const kinds = this.rng.shuffle([...Array(this.rng.randint(6, 8)).fill('Cow'), ...Array(this.rng.randint(5, 7)).fill('Buffalo')]);
      for (const kind of kinds) {
        const u = this.rng.random();
        const hour = u < 0.62 ? this.r(0.4, 7.5) : u < 0.93 ? this.r(8.5, 15.5) : this.r(17, 20.5);
        this.push(ds + hour * H, 'arrival', kind);
      }
      for (const [hh, prod] of [[1.5, 'TM'], [4.5, 'CM'], [8.5, 'FCM'], [11.5, 'TM'], [16.5, 'CM'], [19.5, 'FCM']]) {
        this.push(ds + hh * H + this.rng.randint(-10, 10) * MIN, 'batch_start', prod);
      }
      this.push(ds + 22.5 * H, 'cip', 'CIRC-RT');
      this.push(ds + (23 * 60 + 10) * MIN, 'cip', i % 2 === 0 ? 'CIRC-SILO-COW' : 'CIRC-SILO-BUF');
      if (i % 4 === 3) { const a = ds + 21 * H; this.interval('PACK-02', 'DOWN', a, a + 60 * MIN, 'Planned maintenance (demo)'); }
    }
    this.push(this.tEnd, 'snapshot', null);
  }

  // intake
  onArrival(ts, kind) {
    const sup = this.rng.choice(C.SUPPLIERS.filter(s => s.milk === kind));
    const center = C.COLLECTION_CENTERS.find(c => c.id === sup.center);
    const gross = Math.round(this.r(4200, 8800));
    const temp = this.rng.random() > 0.08 ? this.r(3.8, 7.2) : this.r(8.2, 12.0);
    const rb = this.nid('RB', ts), dlv = this.nid('DLV', ts);
    const sampleMl = Math.round(this.r(150, 250));
    const testTime = ts + this.r(8, 16) * MIN;
    const s = this.makeSample(ts, testTime, kind, temp, rb, dlv, sup, center);
    const rules = C.QUALITY_RULES[kind];
    const sampleL = sampleMl / 1000;
    let rejected = 0, reason = null;
    if (s && s.result_status === 'Rejected') { rejected = gross - sampleL; reason = s.review_reasons.join('; '); }
    else if (this.rng.random() < 0.03) { rejected = Math.round(gross / 3); reason = 'Compartment B failed organoleptic check (demo)'; }
    const accepted = round(gross - sampleL - rejected, 3);   // mL precision → gross = accepted + rejected + sample exactly
    const qStatus = !s ? 'Not tested — sample record missing' : rejected && accepted <= 0 ? 'Rejected' : rejected ? 'Partially rejected' : s.result_status;
    if (temp > rules.temp_max) {
      this.alarm(ts, temp >= rules.reject_temp ? 'CRITICAL' : 'WARNING', 'RT-01', 'TEMP_HIGH', `Intake milk temperature high (${kind}, ${dlv})`,
        temp, '°C', `> ${rules.temp_max} °C`, testTime, accepted <= 0 ? 'Load rejected' : 'Load accepted with QA review', dlv);
    }
    if (s) s.weight_l = Math.max(accepted, 0);
    const rec = {
      delivery_id: dlv, batch_id: rb, collection_time: iso(ts - this.r(1.2, 3.5) * H), center_id: center.id, center_name: center.name,
      supplier_id: sup.id, supplier_name: sup.name, tanker_id: this.rng.choice(C.TANKERS), arrival_time: iso(ts), milk_type: kind,
      gross_l: gross, sample_ml: sampleMl, accepted_l: Math.max(accepted, 0), rejected_l: round(rejected, 3), reject_reason: reason,
      temperature_c: round(temp, 1), quality_status: qStatus, operator_id: this.rng.choice(C.OPERATORS), sample_id: s ? s.sample_id : null,
    };
    if (accepted <= 0) { this.push(testTime, 'delivery_done', { ...rec, unload_start: null, unload_end: null, receiving_tank: null }); return; }
    this.push(Math.max(testTime, this.rtBusyUntil), 'unload_try', rec);
  }

  onUnloadTry(ts, rec) {
    if (this.tanks['RT-01'].volume > 0.5 || ts < this.rtBusyUntil) { this.push(Math.max(ts + 10 * MIN, this.rtBusyUntil), 'unload_try', rec); return; }
    const end = ts + (rec.accepted_l / UNLOAD_RATE_LPH) * H;
    this.rtBusyUntil = end + 2 * MIN;
    this.push(end, 'unload_end', { ...rec, unload_start: iso(ts), unload_end: iso(end), receiving_tank: 'RT-01' });
    this.interval('P-101', 'RUN', ts, end, null, rec.delivery_id);
  }

  makeSample(ts, testTime, kind, temp, rb, dlv, sup, center) {
    if (this.rng.random() < 0.03) return null;                       // sample record missing (data gap)
    const base = {
      sample_id: this.nid('SMP', ts), batch_id: rb, delivery_id: dlv, report_date: prodDay(ts), shift: shiftOf(ts),
      center_id: center.id, center_name: center.name, supplier_id: sup.id, milk_type: kind,
      sample_time: iso(ts + 2 * MIN), test_time: iso(testTime), density_temp_c: 20, method: C.QUALITY_METHODS.composition, is_mock: true,
    };
    if (this.now && testTime > this.now) {
      const s = { ...base, fat_pct: null, snf_pct: null, density_kg_l: null, clr: null, protein_pct: null, lactose_pct: null, acidity_pct_la: null,
        sample_temp_c: round(temp, 1), instrument_id: C.INSTRUMENTS[0], screening_status: 'Pending', result_status: 'Pending', review_reasons: [], reviewer_id: null, weight_l: 0 };
      this.ds.samples.push(s);
      return s;
    }
    const rg = C.SAMPLE_RANGES[kind], rules = C.QUALITY_RULES[kind];
    let fat = this.r(...rg.fat), snf = this.r(...rg.snf);
    if (this.rng.random() < 0.06) snf -= this.r(0.4, 0.8);
    let clr = 4 * (snf - 0.2 * fat - 0.36);
    let density = 1 + clr / 1000 + 0.0013 + this.rng.gauss(0, 0.0003);
    let acidity = this.rng.random() > 0.05 ? this.rng.gauss(0.135, 0.007) : this.r(0.158, 0.2);
    // Round to reporting precision FIRST, then judge — the flag must agree with the value shown.
    fat = round(fat, 2); snf = round(snf, 2); clr = round(clr, 1); density = round(density, 4);
    acidity = round(Math.max(acidity, 0.08), 3); const t = round(temp, 1);
    const protein = this.rng.random() < 0.6 ? round(this.r(...rg.protein), 2) : null;
    const lactose = this.rng.random() < 0.6 ? round(this.r(...rg.lactose), 2) : null;
    const u = this.rng.random();
    const screening = u < 0.7 ? 'Screening pass' : u < 0.85 ? 'Not simulated' : u < 0.95 ? 'Pending' : 'Screening review';
    const reasons = [];
    if (fat < rules.fat_min) reasons.push(`Fat ${fat.toFixed(2)} % < demo min ${rules.fat_min}`);
    if (snf < rules.snf_min) reasons.push(`SNF ${snf.toFixed(2)} % < demo min ${rules.snf_min}`);
    if (acidity > rules.acidity_max) reasons.push(`Acidity ${acidity.toFixed(3)} % LA > demo max ${rules.acidity_max}`);
    if (t > rules.temp_max) reasons.push(`Temperature ${t.toFixed(1)} °C > demo max ${rules.temp_max}`);
    if (!(rules.density_min <= density && density <= rules.density_max)) reasons.push(`Density ${density.toFixed(4)} kg/L outside demo range`);
    if (screening === 'Screening review') reasons.push('Adulterant screening flagged for review');
    const rejected = acidity >= rules.reject_acidity || t >= rules.reject_temp;
    const status = rejected ? 'Rejected' : reasons.length ? 'Review required' : 'Within demo rules';
    const s = { ...base, fat_pct: fat, snf_pct: snf, density_kg_l: density, clr, protein_pct: protein, lactose_pct: lactose, acidity_pct_la: acidity,
      sample_temp_c: t, instrument_id: this.rng.choice(C.INSTRUMENTS), screening_status: screening, result_status: status, review_reasons: reasons,
      reviewer_id: status !== 'Within demo rules' ? this.rng.choice(C.REVIEWERS) : null, weight_l: 0 };
    this.ds.samples.push(s);
    return s;
  }

  onDeliveryDone(ts, rec) { this.ds.deliveries.push({ report_date: prodDay(ts), shift: shiftOf(ts), ...rec, is_mock: true }); }

  onUnloadEnd(ts, rec) {
    this.tanks['RT-01'].add(rec.batch_id, rec.accepted_l);
    this.move(ts, 'RT-01', 'IN', rec.accepted_l, rec.tanker_id, [rec.batch_id]);
    this.onDeliveryDone(ts, rec);
    this.push(ts + 3 * MIN, 'transfer', { kind: rec.milk_type, ref: rec.delivery_id, retries: 0 });
  }

  onTransfer(ts, data) {
    const rt = this.tanks['RT-01'];
    if (rt.volume <= 0.5) return;
    const siloId = data.kind === 'Cow' ? 'ST-COW-01' : 'ST-BUF-01';
    const silo = this.tanks[siloId];
    const active = this.drawing[siloId];
    if (active && active[0] <= ts && ts < active[1]) {
      this.alarm(ts, 'WARNING', 'V-301', 'VALVE_CONFLICT', `Diverter route to ${siloId} blocked — silo outlet active (simultaneous fill/draw interlock)`,
        null, null, 'Fill and draw not permitted together', active[1], 'Transfer resumed after the draw finished', data.ref);
      this.rtBusyUntil = Math.max(this.rtBusyUntil, active[1] + 5 * MIN);
      this.push(active[1] + 2 * MIN, 'transfer', data);
      return;
    }
    const amount = Math.min(rt.volume, silo.room());
    if (amount < rt.volume - 0.5) {
      this.alarm(ts, 'WARNING', siloId, 'CAPACITY_INTERLOCK', `Transfer into ${siloId} limited — would exceed capacity`,
        silo.volume / silo.capacity * 100, '%', '<= 100 % capacity', ts + 2 * H, 'Remaining milk transferred after silo draw', data.ref);
    }
    if (amount > 0.5) {
      const dur = (amount / TRANSFER_RATE_LPH) * H;
      const lots = rt.draw(amount);
      this.move(ts, 'RT-01', 'OUT', amount, siloId, lots.map(l => l[0]));
      lots.forEach(([lot, l]) => silo.add(lot, l));
      silo.temp += (rt.temp - silo.temp) * amount / Math.max(silo.volume, 1);
      this.move(ts, siloId, 'IN', amount, 'RT-01 via V-301', lots.map(l => l[0]));
      this.interval('V-301', 'RUN', ts, ts + dur, 'Routing to ' + siloId, data.ref);
      this.interval('P-101', 'RUN', ts, ts + dur, null, data.ref);
      this.rtBusyUntil = Math.max(this.rtBusyUntil, ts + dur);
    }
    if (rt.volume > 0.5) {
      this.rtBusyUntil = Math.max(this.rtBusyUntil, ts + H);
      this.push(ts + 50 * MIN, 'transfer', { ...data, retries: data.retries + 1 });
    }
  }

  // processing
  onBatchStart(sched, code) {
    const prod = C.PRODUCTS[code];
    const start = Math.max(sched, this.pastBusyUntil);
    const split = { TM: { 'ST-COW-01': 0.6, 'ST-BUF-01': 0.4 }, FCM: { 'ST-BUF-01': 1 }, CM: { 'ST-COW-01': 1 } }[code];
    const tids = Object.keys(split);
    const fill = Math.max(...tids.map(t => this.tanks[t].volume / this.tanks[t].capacity));
    const planned = fill > 0.55 ? this.r(15000, 19000) : this.r(9000, 13000);
    const avail = Math.min(...tids.map(t => (this.tanks[t].volume - SILO_HEEL_L) / split[t]));
    const pm = this.tanks['ST-PM-01'];
    const volume = Math.max(0, Math.min(planned, avail, pm.room() - 200));
    const bid = this.nid('PB', start);
    const milk = tids.length > 1 ? 'Mixed' : tids[0] === 'ST-COW-01' ? 'Cow' : 'Buffalo';
    const base = { batch_id: bid, product_code: code, product_name: prod.name, milk_type: milk, source_tanks: tids, scheduled_start: iso(sched), line_id: 'LINE-01' };
    if (volume < 2000) {
      const why = avail < planned ? 'Insufficient raw milk in source silo(s)' : 'Storage tank ST-PM-01 has no room';
      this.ds.batches.push({ ...base, report_date: prodDay(sched), shift: shiftOf(sched), source_lots: [], start: null, end: null,
        incoming_l: 0, processed_l: 0, documented_loss_l: 0, inlet_temp_c: null, outlet_temp_min_c: null, outlet_temp_avg_c: null,
        hold_time_s: null, homogenizer_bar: null, cooling_outlet_c: null, equipment_status: 'Idle', deviations: [why], alarm_ids: [],
        state: 'NOT STARTED', disposition: 'Cancelled — not processed', temp_profile: [], events: [{ time: iso(sched), text: `Batch not started: ${why}` }], is_mock: true });
      return;
    }
    const deviations = [], events = [{ time: iso(start), text: 'Batch started — feed from ' + tids.join(', ') }], alarmIds = [];
    if (volume < planned - 1) deviations.push(`Volume reduced from planned ${Math.round(planned).toLocaleString('en-US')} L to ${Math.round(volume).toLocaleString('en-US')} L (availability / storage room)`);
    const lots = [];
    for (const t of tids) {
      const drawn = this.tanks[t].draw(volume * split[t]);
      drawn.forEach(([lot, l]) => lots.push({ lot, litres: round(l, 1), tank: t }));
      this.move(start, t, 'OUT', volume * split[t], `PAST-01 (${bid})`, drawn.map(d => d[0]));
    }
    this.wip += volume;
    const runH = volume / C.PROCESS_RATE_LPH;
    let pause = 0;
    if (this.rng.random() < 0.05) {
      const pump = tids.includes('ST-COW-01') ? 'P-201' : 'P-202';
      const fAt = start + runH * this.r(0.2, 0.7) * H;
      pause = this.r(8, 20) * MIN;
      this.interval(pump, 'FAULT', fAt, fAt + pause, 'Motor overload trip (demo)', bid);
      const ev = this.alarm(fAt, 'FAULT', pump, 'PUMP_FAULT', `${C.EQUIPMENT[pump].name} tripped — batch ${bid} paused`, null, null, 'Motor protection', fAt + pause, 'Reset and restarted', bid);
      alarmIds.push(ev.event_id);
      deviations.push(`Feed pump ${pump} trip — line held ${Math.floor(pause / MIN)} min`);
      events.push({ time: iso(fAt), text: `${pump} fault — line on hold` }, { time: iso(fAt + pause), text: `${pump} restarted` });
    }
    const end = start + runH * H + pause;
    tids.forEach(t => { this.drawing[t] = [start, end]; });
    this.pastBusyUntil = end + 5 * MIN;
    this.push(end, 'batch_end', { base, start, end, volume, lots, planned, deviations, events, alarmIds, tids });
    ['PAST-01', 'HOMO-01', 'COOL-01', 'V-302'].forEach(eq => this.interval(eq, 'RUN', start, end, null, bid));
    tids.forEach(t => this.interval(C.TANKS[t].pump, 'RUN', start, end, null, bid));
  }

  tempProfile(start, end) {
    const minutes = Math.max(2, Math.floor((end - start) / MIN));
    const target = C.HTST_DEMO.target_temp_c;
    const u = this.rng.random();
    const mode = u < 0.86 ? 'ok' : u < 0.95 ? 'diverted' : 'undiverted';
    const dipAt = this.rng.randint(1, Math.max(1, minutes - 3));
    const hold = this.rng.random() > 0.03 ? round(this.r(15.4, 16.6), 1) : round(this.r(13.8, 14.8), 1);
    const prof = [];
    for (let m = 0; m <= minutes; m++) {
      let t = target + 0.55 + this.rng.gauss(0, 0.12), fdv = 'FORWARD';
      if (mode !== 'ok' && dipAt <= m && m < dipAt + 2) { t = target - this.r(0.4, 1.2); fdv = mode === 'diverted' ? 'DIVERT' : 'FORWARD'; }
      prof.push({ t: iso(start + m * MIN), outlet_c: round(t, 2), fdv });
    }
    return [prof, hold];
  }

  onBatchEnd(ts, d) {
    const { base, volume } = d;
    const bid = base.batch_id;
    const [prof, hold] = this.tempProfile(d.start, d.end);
    const target = C.HTST_DEMO.target_temp_c;
    const below = prof.filter(p => p.outlet_c < target);
    const undiverted = below.filter(p => p.fdv === 'FORWARD');
    const { deviations, events, alarmIds } = d;
    let state = 'COMPLETED';
    if (below.length) {
      const first = below[0].t;
      let ev;
      if (undiverted.length) {
        state = 'FAILED DEMO CRITERIA';
        deviations.push(`Outlet temperature below ${target} °C for ${undiverted.length} min without flow diversion`);
        ev = this.alarm(parseIso(first), 'CRITICAL', 'PAST-01', 'PROCESS_DEVIATION', `Holding-tube outlet below ${target} °C, FDV did not divert (${bid})`,
          Math.min(...undiverted.map(p => p.outlet_c)), '°C', `>= ${target} °C`, parseIso(undiverted[undiverted.length - 1].t) + MIN, 'Batch blocked for QA decision', bid);
      } else {
        state = 'REVIEW REQUIRED';
        deviations.push(`Outlet dipped below ${target} °C for ${below.length} min — FDV diverted to balance tank`);
        ev = this.alarm(parseIso(first), 'WARNING', 'V-302', 'PROCESS_DEVIATION', `Flow diverted — outlet below ${target} °C (${bid})`,
          Math.min(...below.map(p => p.outlet_c)), '°C', `>= ${target} °C`, parseIso(below[below.length - 1].t) + MIN, 'Forward flow restored at target', bid);
      }
      alarmIds.push(ev.event_id);
      events.push({ time: first, text: 'Outlet below target — ' + (undiverted.length ? 'no diversion recorded' : 'FDV diverted') });
    }
    if (hold < C.HTST_DEMO.min_hold_s) { state = 'FAILED DEMO CRITERIA'; deviations.push(`Holding time ${hold} s < demo minimum ${C.HTST_DEMO.min_hold_s} s`); }
    const lossDoc = volume * this.r(...C.PROCESS_LOSS_FRACTION);
    const lossUndoc = this.r(5, 35);                 // small unrecorded loss → shows as "unexplained" in reconciliation
    const out = volume - lossDoc - lossUndoc;
    const pm = this.tanks['ST-PM-01'];
    this.wip -= volume;
    pm.add(bid, out);
    pm.temp = this.r(3.6, 4.4);
    this.move(ts, 'ST-PM-01', 'IN', out, 'PAST-01 → COOL-01', [bid]);
    events.push({ time: iso(ts), text: `Batch complete — ${Math.round(out).toLocaleString('en-US')} L to ST-PM-01` });
    const disposition = { COMPLETED: 'Released (demo)', 'REVIEW REQUIRED': 'On hold — QA review', 'FAILED DEMO CRITERIA': 'Blocked — QA decision pending' }[state];
    const b = {
      ...base, report_date: prodDay(d.start), shift: shiftOf(d.start), source_lots: d.lots, start: iso(d.start), end: iso(ts),
      incoming_l: round(volume, 1), processed_l: round(out, 1), documented_loss_l: round(lossDoc, 1), inlet_temp_c: round(this.r(4.0, 5.8), 1),
      outlet_temp_min_c: Math.min(...prof.map(p => p.outlet_c)), outlet_temp_avg_c: round(prof.reduce((s, p) => s + p.outlet_c, 0) / prof.length, 2),
      hold_time_s: hold, homogenizer_bar: C.PRODUCTS[base.product_code].homogenize ? Math.round(this.r(185, 210)) : null,
      cooling_outlet_c: round(this.r(3.4, 4.6), 1), equipment_status: alarmIds.length ? 'Fault during batch' : 'Normal',
      deviations, alarm_ids: alarmIds, state, disposition, temp_profile: prof, events, is_mock: true,
    };
    this.ds.batches.push(b);
    d.tids.forEach(t => delete this.drawing[t]);
    this.push(ts + 10 * MIN, 'pack', { batch: b, out });
    this.push(ts + 12 * MIN, 'cip', 'CIRC-PAST');
  }

  onPack(ts, d) {
    const b = d.batch;
    const split = { TM: { 500: 0.6, 1000: 0.4 }, FCM: { 500: 0.5, 1000: 0.5 }, CM: { 500: 1 } }[b.product_code];
    for (const [sizeStr, share] of Object.entries(split)) {
      const size = +sizeStr;
      const line = size === 500 ? 'PACK-01' : 'PACK-02';
      const start = Math.max(ts, this.packBusyUntil[line]);
      const volume = d.out * share;
      const units = Math.floor((volume * 1000) / size);
      const planned = Math.floor((b.incoming_l * share * 1000) / size);
      const rej = Math.round(units * this.r(0.003, 0.012));
      const acc = units - rej;
      const speed = C.PACK_SPEED_PPH[size];
      const runMin = (units / speed) * 60;
      let down = 0, why = null;
      if (this.rng.random() < 0.25) {
        down = round(this.r(6, 28), 1);
        why = this.rng.choice(['Film reel change overrun', 'Sealing jaw jam', 'Date-coder fault', 'Pouch misfeed']);
      }
      const end = start + (runMin + down) * MIN;
      this.packBusyUntil[line] = end + 3 * MIN;
      const fg = `FG-${yymmdd(start)}-${line.slice(-2)}-${this.nid('FGS', start).slice(-2)}`;
      if (down) {
        const fAt = start + runMin * this.r(0.2, 0.8) * MIN;
        this.interval(line, 'FAULT', fAt, fAt + down * MIN, why, fg);
        this.alarm(fAt, 'WARNING', line, 'PACK_STOP', `${C.EQUIPMENT[line].name} stopped — ${why}`, down, 'min', null, fAt + down * MIN, 'Cleared by operator, line restarted', fg);
        this.interval(line, 'RUN', start, fAt, null, fg);
        this.interval(line, 'RUN', fAt + down * MIN, end, null, fg);
      } else this.interval(line, 'RUN', start, end, null, fg);
      this.interval('P-401', 'RUN', start, end, null, fg);
      this.push(end, 'pack_end', { batch: b, fg, line, size, units, acc, rej, planned, speed, runMin, down, why, start, end });
    }
  }

  onPackEnd(ts, d) {
    const b = d.batch;
    const pm = this.tanks['ST-PM-01'];
    const got = pm.drawLot(b.batch_id, (d.units * d.size) / 1000);
    this.move(ts, 'ST-PM-01', 'OUT', got, d.line, [b.batch_id]);
    const cold = this.rng.random() < 0.02 ? null : iso(ts + this.r(10, 30) * MIN);
    const dispTime = ts + this.r(8, 20) * H;
    const dispatched = b.state === 'COMPLETED' && cold != null && dispTime <= this.stopAt;
    this.ds.packaging.push({
      fg_batch_id: d.fg, batch_id: b.batch_id, report_date: prodDay(ts), shift: shiftOf(ts), product_code: b.product_code, product_name: b.product_name,
      line_id: d.line, pack_size_ml: d.size, planned_units: d.planned, produced_units: d.units, accepted_packs: d.acc, rejected_packs: d.rej,
      speed_pph: d.speed, operating_min: round(d.runMin, 1), downtime_min: d.down, downtime_reason: d.why,
      finished_volume_l: round((d.acc * d.size) / 1000, 1), rejected_volume_l: round((d.rej * d.size) / 1000, 1), disposition: b.disposition,
      start: iso(d.start), end: iso(ts), cold_storage_in: cold, dispatch_id: dispatched ? this.nid('DSP', dispTime) : null,
      dispatch_time: dispatched ? iso(dispTime) : null, is_mock: true,
    });
  }

  onCip(ts, circuit) {
    if (circuit === 'CIRC-PAST') ts = Math.max(ts, this.pastBusyUntil);
    const equipment = { 'CIRC-PAST': ['PAST-01', 'HOMO-01', 'COOL-01'], 'CIRC-SILO-COW': ['ST-COW-01', 'P-201'], 'CIRC-SILO-BUF': ['ST-BUF-01', 'P-202'], 'CIRC-RT': ['RT-01', 'P-101'] }[circuit];
    const fault = this.rng.random() > 0.1 ? null : this.rng.choice(['temp', 'conductivity', 'flow']);
    const phases = [], deviations = [], pending = [];
    let t = ts;
    for (const [name, minM, minTemp] of C.CIP_PHASES) {
      const minutes = round(minM + this.r(0, 4), 1);
      const hot = minTemp != null;
      let supply = hot ? this.r(72, 78) : this.r(20, 35);
      let flow = this.r(17, 24);
      let cond = name === 'Final rinse' ? round(this.r(0.05, 0.35), 2) : hot ? round(this.r(15, 30), 1) : null;
      let ok = true, note = null;
      if (fault === 'temp' && hot) { supply = this.r(62, 68); ok = false; note = `Supply temperature below demo minimum ${minTemp} °C`; }
      if (fault === 'conductivity' && name === 'Final rinse') { cond = round(this.r(0.7, 1.4), 2); ok = false; note = `Final-rinse conductivity above demo max ${C.CIP_FINAL_RINSE_MAX_CONDUCTIVITY} mS/cm`; }
      if (fault === 'flow' && name === 'Cleaning solution circulation') {
        flow = this.r(10, 13.5); ok = false; note = `Flow below demo minimum ${C.CIP_MIN_FLOW_M3H} m³/h`;
        pending.push([t + 2 * MIN, flow, t + minutes * MIN]);
      }
      phases.push({ phase: name, start: iso(t), minutes, supply_temp_c: round(supply, 1), return_temp_c: round(supply - this.r(2, 6), 1),
        flow_m3h: round(flow, 1), pressure_bar: round(this.r(2.2, 3.4), 2), conductivity_ms_cm: cond, ok, note });
      if (!ok) deviations.push(`${name}: ${note}`);
      t += minutes * MIN;
    }
    const end = t;
    if (end > this.stopAt) return;                 // still running at the stop point — not recorded yet
    const status = !deviations.length ? 'COMPLETED' : fault === 'conductivity' ? 'INCOMPLETE' : 'FAILED DEMO CRITERIA';
    const cid = this.nid('CIP', ts);
    pending.forEach(([at, flow, clr]) => this.alarm(at, 'WARNING', 'CIP-01', 'LOW_FLOW', `CIP low flow on ${circuit}`, flow, 'm³/h', `>= ${C.CIP_MIN_FLOW_M3H} m³/h`, clr, 'Phase ended', cid));
    if (deviations.length) {
      this.alarm(end, status === 'FAILED DEMO CRITERIA' ? 'CRITICAL' : 'WARNING', 'CIP-01', 'CIP_DEVIATION', `CIP ${cid} on ${circuit}: ${status}`, null, null,
        'All phases meet demo criteria', end + this.r(20, 60) * MIN, 'Cycle repeat scheduled by operator', cid);
    }
    this.ds.cip.push({
      cycle_id: cid, report_date: prodDay(ts), shift: shiftOf(ts), circuit_id: circuit, circuit_name: C.CIP_CIRCUITS[circuit], equipment,
      start: iso(ts), end: iso(end), duration_min: round((end - ts) / MIN, 1), phases, solution_id: this.rng.choice(C.CIP_SOLUTIONS),
      rinse_status: fault !== 'conductivity' ? 'Final rinse within demo limit' : 'Final rinse conductivity high', completion_status: status,
      deviations, operator_id: this.rng.choice(C.OPERATORS), is_mock: true,
    });
    this.interval('CIP-01', 'RUN', ts, end, 'CIP ' + circuit, cid);
    if (circuit === 'CIRC-PAST') this.pastBusyUntil = end + 5 * MIN;
  }

  run() {
    this.buildSchedule();
    const handlers = {
      arrival: (ts, d) => this.onArrival(ts, d), unload_try: (ts, d) => this.onUnloadTry(ts, d), unload_end: (ts, d) => this.onUnloadEnd(ts, d),
      delivery_done: (ts, d) => this.onDeliveryDone(ts, d), transfer: (ts, d) => this.onTransfer(ts, d), batch_start: (ts, d) => this.onBatchStart(ts, d),
      batch_end: (ts, d) => this.onBatchEnd(ts, d), pack: (ts, d) => this.onPack(ts, d), pack_end: (ts, d) => this.onPackEnd(ts, d),
      cip: (ts, d) => this.onCip(ts, d), snapshot: ts => this.snapshot(ts),
    };
    while (this.q.size) {
      const [ts, , kind, data] = this.q.pop();
      if (ts > this.stopAt || (ts >= this.tEnd && kind !== 'snapshot')) break;
      handlers[kind](ts, data);
    }
    if (this.now && this.now < this.tEnd) {
      this.snapshot(this.now);
      for (const [, , kind, d] of this.q.a) {
        if (kind === 'batch_end' && d.start <= this.now) {
          this.ds.batches.push({
            ...d.base, report_date: prodDay(d.start), shift: shiftOf(d.start), source_lots: d.lots, start: iso(d.start), end: null,
            incoming_l: round(d.volume, 1), processed_l: 0, documented_loss_l: 0, inlet_temp_c: round(this.r(4.0, 5.8), 1),
            outlet_temp_min_c: null, outlet_temp_avg_c: null, hold_time_s: null, homogenizer_bar: null, cooling_outlet_c: null,
            equipment_status: 'Running', deviations: d.deviations, alarm_ids: d.alarmIds, state: 'RUNNING', disposition: 'In process',
            temp_profile: [], events: d.events, is_mock: true,
          });
        }
      }
      this.alarm(this.now, 'INFO', 'SIM', 'SIM_PAUSE', 'Dynamic simulation clock — later events not generated yet');
    }
    const stop = iso(this.stopAt);
    this.ds.alarms = this.ds.alarms.filter(a => a.timestamp <= stop);
    this.ds.snapshots.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    return this.ds;
  }
}

// ── cache ────────────────────────────────────────────────────────────────────
const cache = new Map();

// Plant-local "now" as UTC-field milliseconds (the browser's wall clock).
export function localNow() {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0);
}

export function getDataset(mode = 'seeded', seed = DEFAULT_SEED, now = null) {
  let anchor, key;
  if (mode === 'dynamic') {
    now = now ?? localNow();
    anchor = prodDay(now);
    key = `dynamic:${seed}:${iso(now)}`;
  } else {
    anchor = SEEDED_ANCHOR; now = null; key = `seeded:${seed}`;
  }
  if (!cache.has(key)) {
    if (cache.size > 4) cache.clear();
    cache.set(key, new Generator(anchor, WINDOW_DAYS, seed, now, mode).run());
  }
  return cache.get(key);
}
