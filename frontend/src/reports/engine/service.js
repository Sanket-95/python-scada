// Report calculations for the in-browser engine — port of
// backend-fastapi/reports/service.py. Every report is a filtered view of the
// ONE shared dataset from getDataset(), so totals agree across reports.
// Missing data stays null (shown as "Not tested" / "Unavailable"), never zero.

import * as C from './config';
import { getDataset, iso, dayStart, addDays, parseIso, round } from './generator';

const SHIFTS = Object.keys(C.SHIFTS);
const MILK_TYPES = ['Cow', 'Buffalo', 'All'];
const H = 3600e3, MIN = 60e3;
export const REPORT_TITLES = {
  summary: 'Daily Production Summary',
  collection: 'Daily Milk Collection Report',
  quality: 'Milk Quality Testing Report',
  'milk-comparison': 'Cow vs Buffalo Milk Report',
  tanks: 'Tank Inventory and Transfer Report',
  processing: 'Pasteurization and Processing Report',
  packaging: 'Production and Packaging Report',
  cip: 'CIP Cleaning Report',
  'equipment-runtime': 'Equipment Runtime and Downtime Report',
  alarms: 'Alarm and Event History Report',
  reconciliation: 'Milk Loss and Yield Reconciliation Report',
  traceability: 'Batch Traceability Report',
};

export class FilterError extends Error {}

const empty = v => v === undefined || v === null || v === '';

export function makeFilters(p = {}) {
  const mode = p.mode || 'seeded';
  if (mode !== 'seeded' && mode !== 'dynamic') throw new FilterError("mode must be 'seeded' or 'dynamic'");
  const ds = getDataset(mode);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const start = p.start || ds.window_end;
  const end = p.end || start;
  if (!re.test(start) || !re.test(end)) throw new FilterError('start/end must be dates in YYYY-MM-DD format');
  if (start > end) throw new FilterError('Start date is after end date');
  if (start < ds.window_start || end > ds.window_end) throw new FilterError(`Dates must be within the demo window ${ds.window_start} … ${ds.window_end}`);
  if (p.shift && !SHIFTS.includes(p.shift)) throw new FilterError(`shift must be one of ${SHIFTS.join(', ')}`);
  if (p.milk_type && !MILK_TYPES.includes(p.milk_type)) throw new FilterError(`milk_type must be one of ${MILK_TYPES.join(', ')}`);
  if (p.equipment && !C.EQUIPMENT[p.equipment] && !C.TANKS[p.equipment] && !C.CIP_CIRCUITS[p.equipment]) throw new FilterError('Unknown equipment id');
  const page = +(p.page || 1), page_size = +(p.page_size || 50);
  if (!(page_size >= 1 && page_size <= 10000) || page < 1) throw new FilterError('page must be ≥ 1 and page_size 1–10000');
  const sort_dir = p.sort_dir || 'asc';
  if (sort_dir !== 'asc' && sort_dir !== 'desc') throw new FilterError('sort_dir must be asc or desc');
  return {
    mode, start, end, shift: p.shift || null, milk_type: empty(p.milk_type) || p.milk_type === 'All' ? null : p.milk_type,
    batch: p.batch || null, center: p.center || null, equipment: p.equipment || null, status: p.status || null, q: p.q || null,
    page, page_size, sort_by: p.sort_by || null, sort_dir, ds,
  };
}

function filtersDict(f) {
  const out = {};
  for (const k of ['mode', 'start', 'end', 'shift', 'milk_type', 'batch', 'center', 'equipment', 'status', 'q']) if (!empty(f[k])) out[k] = f[k];
  return out;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const inPeriod = (f, d, sh) => f.start <= d && d <= f.end && !(f.shift && sh && sh !== f.shift);

function textMatch(f, row) {
  if (!f.q) return true;
  const q = f.q.toLowerCase();
  return Object.values(row).some(v => (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q));
}

function paginate(rows, f) {
  rows = rows.filter(r => textMatch(f, r));
  if (f.sort_by) {
    const k = f.sort_by;
    const present = rows.filter(r => r[k] != null), missing = rows.filter(r => r[k] == null);   // missing always last
    present.sort((a, b) => {
      const x = a[k], y = b[k];
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return f.sort_dir === 'desc' ? -c : c;
    });
    rows = [...present, ...missing];
  }
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / f.page_size));
  const page = Math.min(f.page, pages);
  const a = (page - 1) * f.page_size;
  return [rows.slice(a, a + f.page_size), { page, page_size: f.page_size, total, pages }];
}

const r1 = (x, n = 1) => (x == null ? null : round(x, n));
const sum = (xs, fn = x => x) => xs.reduce((s, x) => s + fn(x), 0);
function mean(xs) { xs = xs.filter(x => x != null); return xs.length ? sum(xs) / xs.length : null; }
function wmean(pairs) {
  pairs = pairs.filter(([v, w]) => v != null && w > 0);
  const tw = sum(pairs, p => p[1]);
  return tw ? sum(pairs, ([v, w]) => v * w) / tw : null;
}
const strip = (o, keys) => { const c = { ...o }; keys.forEach(k => delete c[k]); return c; };

function hash6(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
}

function envelope(report, f, kw) {
  const d = new Date();
  const gen = iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
  const fd = filtersDict(f);
  return {
    report_id: `RPT-${report.toUpperCase().slice(0, 4)}-${f.end.replace(/-/g, '')}-${hash6(report + JSON.stringify(fd) + gen)}`,
    report, title: REPORT_TITLES[report], generated_at: gen, demo_notice: C.DEMO_NOTICE, is_mock: true, mode: f.mode,
    period: { start: f.start, end: f.end, shift: f.shift || 'All shifts', window: [f.ds.window_start, f.ds.window_end], simulation_clock: f.ds.now ? iso(f.ds.now) : null },
    filters: fd, summary: {}, rows: [], pagination: null, columns: [], charts: {}, notes: [], ...kw,
  };
}

function periodBounds(f) {
  const a = dayStart(f.start);
  let b = dayStart(addDays(f.end, 1));
  if (f.ds.now && b > f.ds.now) b = f.ds.now;
  return [a, b];
}

function snapshotAt(ds, ts) {
  const key = iso(ts);
  let best = null;
  for (const s of ds.snapshots) { if (s.timestamp <= key) best = s; else break; }
  return best || ds.snapshots[0];
}

const days = f => { const out = []; for (let d = f.start; d <= f.end; d = addDays(d, 1)) out.push(d); return out; };

function deliveries(f) {
  return f.ds.deliveries.filter(d => inPeriod(f, d.report_date, d.shift)
    && (!f.milk_type || d.milk_type === f.milk_type)
    && (!f.center || f.center === d.center_id || f.center === d.supplier_id)
    && (!f.batch || f.batch === d.batch_id || f.batch === d.delivery_id)
    && (!f.status || f.status === d.quality_status));
}
function samples(f) {
  return f.ds.samples.filter(s => inPeriod(f, s.report_date, s.shift)
    && (!f.milk_type || s.milk_type === f.milk_type)
    && (!f.center || f.center === s.center_id || f.center === s.supplier_id)
    && (!f.batch || [s.batch_id, s.sample_id, s.delivery_id].includes(f.batch))
    && (!f.status || f.status === s.result_status));
}

function dailySeries(f, rows, value, key) {
  const out = Object.fromEntries(days(f).map(d => [d, {}]));
  for (const r of rows) {
    if (!out[r.report_date]) continue;
    const k = key(r);
    out[r.report_date][k] = (out[r.report_date][k] || 0) + value(r);
  }
  return Object.entries(out).map(([x, v]) => ({ x, ...Object.fromEntries(Object.entries(v).map(([k, n]) => [k, round(n, 1)])) }));
}

// ── 2. Collection ────────────────────────────────────────────────────────────
const COL_COLLECTION = [
  { key: 'delivery_id', label: 'Delivery' }, { key: 'batch_id', label: 'Batch' },
  { key: 'arrival_time', label: 'Arrival', kind: 'datetime' }, { key: 'center_name', label: 'Collection centre' },
  { key: 'supplier_id', label: 'Supplier' }, { key: 'tanker_id', label: 'Tanker' }, { key: 'milk_type', label: 'Milk' },
  { key: 'gross_l', label: 'Gross', unit: 'L' }, { key: 'sample_ml', label: 'Sample', unit: 'mL' },
  { key: 'accepted_l', label: 'Accepted', unit: 'L' }, { key: 'rejected_l', label: 'Rejected', unit: 'L' },
  { key: 'temperature_c', label: 'Temp', unit: '°C' }, { key: 'quality_status', label: 'Quality', kind: 'status' },
  { key: 'receiving_tank', label: 'Tank' }, { key: 'unload_start', label: 'Unload start', kind: 'datetime', hidden: true },
  { key: 'unload_end', label: 'Unload end', kind: 'datetime', hidden: true },
  { key: 'collection_time', label: 'Collected', kind: 'datetime', hidden: true },
  { key: 'operator_id', label: 'Operator', hidden: true }, { key: 'sample_id', label: 'Sample ID', hidden: true },
  { key: 'reject_reason', label: 'Reject reason', hidden: true },
];

function collectionSummary(rows) {
  const gross = sum(rows, d => d.gross_l), acc = sum(rows, d => d.accepted_l), rej = sum(rows, d => d.rejected_l);
  const smp = sum(rows, d => d.sample_ml) / 1000;
  return {
    total_received_l: r1(gross), cow_received_l: r1(sum(rows.filter(d => d.milk_type === 'Cow'), d => d.gross_l)),
    buffalo_received_l: r1(sum(rows.filter(d => d.milk_type === 'Buffalo'), d => d.gross_l)), accepted_l: r1(acc), rejected_l: r1(rej),
    samples_l: r1(smp, 2), deliveries: rows.length, avg_receiving_temp_c: r1(mean(rows.map(d => d.temperature_c)), 2),
    intake_balance_difference_l: r1(gross - acc - rej - smp, 2),
  };
}

function reportCollection(f) {
  const rows = deliveries(f);
  const [page, pagination] = paginate(rows, f);
  return envelope('collection', f, {
    summary: collectionSummary(rows), rows: page, pagination, columns: COL_COLLECTION,
    charts: { daily: dailySeries(f, rows, d => d.gross_l, d => d.milk_type) },
    notes: ['Convention: gross = accepted + rejected + documented sample volume (sample mL ÷ 1000). intake_balance_difference_l shows any residual (expected 0 within record rounding).',
      'Fully rejected loads are not unloaded — unload times and receiving tank are blank.',
      'Average receiving temperature is a simple mean over deliveries.'],
  });
}

// ── 3. Quality ───────────────────────────────────────────────────────────────
const COL_QUALITY = [
  { key: 'sample_id', label: 'Sample' }, { key: 'batch_id', label: 'Batch' }, { key: 'milk_type', label: 'Milk' },
  { key: 'center_name', label: 'Collection centre' }, { key: 'supplier_id', label: 'Supplier', hidden: true },
  { key: 'sample_time', label: 'Sampled', kind: 'datetime', hidden: true }, { key: 'test_time', label: 'Tested', kind: 'datetime' },
  { key: 'fat_pct', label: 'Fat', unit: '%', info: 'fat' }, { key: 'snf_pct', label: 'SNF', unit: '%', info: 'snf' },
  { key: 'density_kg_l', label: 'Density @20 °C', unit: 'kg/L', info: 'density' }, { key: 'clr', label: 'CLR @27 °C', info: 'clr' },
  { key: 'protein_pct', label: 'Protein', unit: '%' }, { key: 'lactose_pct', label: 'Lactose', unit: '%' },
  { key: 'acidity_pct_la', label: 'Acidity', unit: '% LA', info: 'acidity' }, { key: 'sample_temp_c', label: 'Sample temp', unit: '°C' },
  { key: 'screening_status', label: 'Screening', info: 'screening' }, { key: 'result_status', label: 'Result', kind: 'status' },
  { key: 'review_reasons', label: 'Review reasons', hidden: true }, { key: 'instrument_id', label: 'Instrument', hidden: true },
  { key: 'method', label: 'Method', hidden: true }, { key: 'reviewer_id', label: 'Reviewer', hidden: true },
];

function reportQuality(f) {
  const rows = samples(f);
  const missing = deliveries({ ...f, status: null }).filter(d => d.sample_id == null);
  const tested = rows.filter(s => s.fat_pct != null);
  const by = st => rows.filter(s => s.result_status === st).length;
  const [page, pagination] = paginate(rows, f);
  return envelope('quality', f, {
    rows: page, pagination, columns: COL_QUALITY,
    summary: { samples: rows.length, tested: tested.length, within_demo_rules: by('Within demo rules'), review_required: by('Review required'),
      rejected: by('Rejected'), pending: by('Pending'), not_tested_missing_record: missing.length,
      avg_fat_pct_simple: r1(mean(tested.map(s => s.fat_pct)), 2), avg_snf_pct_simple: r1(mean(tested.map(s => s.snf_pct)), 2) },
    charts: { rules: C.QUALITY_RULES, methods: C.QUALITY_METHODS },
    notes: [C.ILLUSTRATIVE + ' — all thresholds come from the configurable demo specification.',
      'Results outside a rule are flagged for review; measurements are never altered.',
      "Protein / lactose are measured on ~60 % of samples; unmeasured values show as 'Not tested'.",
      'Screening status never proves milk is free from every adulterant.'],
  });
}

// ── 4. Cow vs Buffalo ────────────────────────────────────────────────────────
function reportComparison(f) {
  const ff = { ...f, milk_type: null };
  const dl = deliveries(ff), sm = samples(ff);
  const stats = kind => {
    const d = dl.filter(x => x.milk_type === kind);
    const s = sm.filter(x => x.milk_type === kind && x.fat_pct != null);
    const g = sum(d, x => x.gross_l);
    const pair = k => s.map(x => [x[k], x.weight_l]);
    return {
      total_received_l: r1(g), accepted_l: r1(sum(d, x => x.accepted_l)), rejected_l: r1(sum(d, x => x.rejected_l)),
      deliveries: d.length, avg_delivery_l: d.length ? r1(g / d.length) : null, samples_tested: s.length,
      review_count: s.filter(x => x.result_status === 'Review required' || x.result_status === 'Rejected').length,
      fat_simple: r1(mean(s.map(x => x.fat_pct)), 2), fat_weighted: r1(wmean(pair('fat_pct')), 2),
      snf_simple: r1(mean(s.map(x => x.snf_pct)), 2), snf_weighted: r1(wmean(pair('snf_pct')), 2),
      density_simple: r1(mean(s.map(x => x.density_kg_l)), 4), density_weighted: r1(wmean(pair('density_kg_l')), 4),
      acidity_simple: r1(mean(s.map(x => x.acidity_pct_la)), 3), acidity_weighted: r1(wmean(pair('acidity_pct_la')), 3),
      temp_simple: r1(mean(d.map(x => x.temperature_c)), 2), temp_weighted: r1(wmean(d.map(x => [x.temperature_c, x.gross_l])), 2),
    };
  };
  const cow = stats('Cow'), buf = stats('Buffalo');
  const labels = [
    ['total_received_l', 'Total received', 'L', 'sum'], ['accepted_l', 'Accepted', 'L', 'sum'], ['rejected_l', 'Rejected', 'L', 'sum'],
    ['deliveries', 'Deliveries', '', 'count'], ['avg_delivery_l', 'Average delivery size', 'L', 'simple'],
    ['samples_tested', 'Samples tested', '', 'count'], ['review_count', 'Quality review / rejected', '', 'count'],
    ['fat_simple', 'Average fat', '%', 'simple'], ['fat_weighted', 'Average fat', '%', 'volume-weighted'],
    ['snf_simple', 'Average SNF', '%', 'simple'], ['snf_weighted', 'Average SNF', '%', 'volume-weighted'],
    ['density_simple', 'Average density @20 °C', 'kg/L', 'simple'], ['density_weighted', 'Average density @20 °C', 'kg/L', 'volume-weighted'],
    ['acidity_simple', 'Average acidity', '% LA', 'simple'], ['acidity_weighted', 'Average acidity', '% LA', 'volume-weighted'],
    ['temp_simple', 'Average receiving temperature', '°C', 'simple'], ['temp_weighted', 'Average receiving temperature', '°C', 'volume-weighted'],
  ];
  return envelope('milk-comparison', f, {
    rows: labels.map(([k, metric, unit, method]) => ({ metric, unit, method, cow: cow[k], buffalo: buf[k], key: k })),
    summary: { cow, buffalo: buf },
    columns: [{ key: 'metric', label: 'Metric' }, { key: 'method', label: 'Average type' }, { key: 'unit', label: 'Unit' }, { key: 'cow', label: 'Cow' }, { key: 'buffalo', label: 'Buffalo' }],
    charts: { daily: dailySeries(ff, dl, d => d.gross_l, d => d.milk_type) },
    notes: ['Volume-weighted averages weight each sample by the accepted litres it represents (rejected loads weigh 0).',
      'Simple averages give every sample equal weight.',
      'Cow and buffalo values vary within configurable demonstration ranges — no fixed composition is assumed.'],
  });
}

// ── 5. Tanks ─────────────────────────────────────────────────────────────────
function intervalsFor(f) {
  let out = days(f).map(d => {
    const ds = dayStart(d);
    if (f.shift) { const [h0, h1] = C.SHIFTS[f.shift]; return [ds + (h0 - 6) * H, ds + (h1 - 6) * H, d, f.shift]; }
    return [ds, ds + 24 * H, d, 'All'];
  });
  if (f.ds.now) out = out.filter(([a]) => a < f.ds.now).map(([a, b, d, s]) => [a, Math.min(b, f.ds.now), d, s]);
  return out;
}

function tankRows(f, tids) {
  const rows = [];
  for (const [a, b, d, sh] of intervalsFor(f)) {
    const so = snapshotAt(f.ds, a), sc = snapshotAt(f.ds, b), ia = iso(a), ib = iso(b);
    for (const tid of tids) {
      const mv = f.ds.movements.filter(m => m.tank_id === tid && ia <= m.timestamp && m.timestamp < ib);
      const inc = sum(mv.filter(m => m.direction === 'IN'), m => m.volume_l), out = sum(mv.filter(m => m.direction === 'OUT'), m => m.volume_l);
      const opening = so.volumes[tid], closing = sc.volumes[tid], cap = C.TANKS[tid].capacity;
      const pct = closing / cap * 100;
      rows.push({
        tank_id: tid, tank_name: C.TANKS[tid].name, milk_type: C.TANKS[tid].milk, capacity_l: cap, report_date: d, shift: sh, start: ia, end: ib,
        opening_l: r1(opening), incoming_l: r1(inc), outgoing_l: r1(out), adjustments_l: 0, closing_l: r1(closing),
        balance_check_l: r1(opening + inc - out - closing, 2), level_pct: r1(pct, 1), temp_c: r1(sc.temps[tid], 1),
        pump_id: C.TANKS[tid].pump, valve_ids: C.TANKS[tid].valves, transfers: mv.length,
        transfer_batch_ids: [...new Set(mv.flatMap(m => m.batch_ids))].sort().slice(0, 12),
        status: pct >= C.TANK_HIGH_LEVEL_PCT ? 'High' : pct < C.TANK_LOW_LEVEL_PCT && (tid === 'ST-COW-01' || tid === 'ST-BUF-01') ? 'Low' : 'Normal',
        alarm_events: f.ds.alarms.filter(x => x.equipment_id === tid && ia <= x.timestamp && x.timestamp < ib).length, is_mock: true,
      });
    }
  }
  return rows;
}

const COL_TANKS = [
  { key: 'report_date', label: 'Date' }, { key: 'shift', label: 'Shift' }, { key: 'tank_id', label: 'Tank' },
  { key: 'milk_type', label: 'Milk' }, { key: 'capacity_l', label: 'Capacity', unit: 'L' },
  { key: 'opening_l', label: 'Opening', unit: 'L' }, { key: 'incoming_l', label: 'In', unit: 'L' },
  { key: 'outgoing_l', label: 'Out', unit: 'L' }, { key: 'closing_l', label: 'Closing', unit: 'L' },
  { key: 'level_pct', label: 'Level', unit: '%' }, { key: 'temp_c', label: 'Temp', unit: '°C' },
  { key: 'status', label: 'Status', kind: 'status' }, { key: 'alarm_events', label: 'Alarms' },
  { key: 'transfers', label: 'Transfers' }, { key: 'pump_id', label: 'Pump', hidden: true },
  { key: 'valve_ids', label: 'Valves', hidden: true }, { key: 'transfer_batch_ids', label: 'Batch IDs', hidden: true },
  { key: 'balance_check_l', label: 'Balance check', unit: 'L', hidden: true },
];

function reportTanks(f) {
  const tids = C.TANKS[f.equipment] ? [f.equipment] : Object.keys(C.TANKS);
  let rows = tankRows(f, tids);
  if (f.status) rows = rows.filter(r => r.status === f.status);
  const [a, b] = periodBounds(f), ia = iso(a), ib = iso(b);
  const so = snapshotAt(f.ds, a);
  const history = {};
  for (const tid of tids) {
    const pts = [{ t: ia, l: round(so.volumes[tid], 1) }, ...f.ds.movements.filter(m => m.tank_id === tid && ia <= m.timestamp && m.timestamp < ib).map(m => ({ t: m.timestamp, l: m.level_after_l }))];
    const step = Math.max(1, Math.floor(pts.length / 400));
    history[tid] = { capacity: C.TANKS[tid].capacity, points: pts.filter((_, i) => i % step === 0) };
  }
  const [page, pagination] = paginate(rows, f);
  return envelope('tanks', f, {
    rows: page, pagination, columns: COL_TANKS,
    summary: { tanks: tids.length, max_abs_balance_check_l: rows.length ? Math.max(...rows.map(r => Math.abs(r.balance_check_l))) : 0 },
    charts: { history },
    notes: ['Closing = Opening + Incoming − Outgoing + documented adjustments (none simulated); balance_check_l should be 0.',
      'Level % = Closing ÷ Capacity × 100. Transfers that would exceed capacity are limited and raise a CAPACITY_INTERLOCK alarm.',
      'Opening/closing come from tank snapshots taken at every shift boundary.'],
  });
}

function reportTankTransfers(f, tankId) {
  if (!C.TANKS[tankId]) throw new FilterError('Unknown tank id');
  const [a, b] = periodBounds(f), ia = iso(a), ib = iso(b);
  const rows = f.ds.movements.filter(m => m.tank_id === tankId && ia <= m.timestamp && m.timestamp < ib && (!f.shift || m.shift === f.shift));
  const [page, pagination] = paginate(rows, f);
  return envelope('tanks', f, {
    rows: page, pagination, summary: { tank_id: tankId },
    columns: [{ key: 'event_id', label: 'Event' }, { key: 'timestamp', label: 'Time', kind: 'datetime' }, { key: 'direction', label: 'Dir' },
      { key: 'volume_l', label: 'Volume', unit: 'L' }, { key: 'counterpart', label: 'From / to' }, { key: 'batch_ids', label: 'Batches' },
      { key: 'level_after_l', label: 'Level after', unit: 'L' }, { key: 'level_after_pct', label: 'Level', unit: '%' }, { key: 'note', label: 'Note' }],
  });
}

// ── 6. Processing ────────────────────────────────────────────────────────────
const COL_PROCESS = [
  { key: 'batch_id', label: 'Batch' }, { key: 'product_name', label: 'Product' }, { key: 'milk_type', label: 'Milk' },
  { key: 'start', label: 'Start', kind: 'datetime' }, { key: 'end', label: 'End', kind: 'datetime' },
  { key: 'incoming_l', label: 'Incoming', unit: 'L' }, { key: 'processed_l', label: 'Processed', unit: 'L' },
  { key: 'inlet_temp_c', label: 'Inlet', unit: '°C' }, { key: 'outlet_temp_min_c', label: 'Outlet min', unit: '°C' },
  { key: 'hold_time_s', label: 'Hold', unit: 's' }, { key: 'homogenizer_bar', label: 'Homog.', unit: 'bar' },
  { key: 'cooling_outlet_c', label: 'Cooling out', unit: '°C' }, { key: 'state', label: 'State', kind: 'status' },
  { key: 'disposition', label: 'Disposition' }, { key: 'source_tanks', label: 'Source tanks', hidden: true },
  { key: 'deviations', label: 'Deviations', hidden: true }, { key: 'documented_loss_l', label: 'Doc. loss', unit: 'L', hidden: true },
  { key: 'line_id', label: 'Line', hidden: true }, { key: 'equipment_status', label: 'Equipment', hidden: true },
];

function batches(f) {
  return f.ds.batches.filter(b => inPeriod(f, b.report_date, b.shift)
    && (!f.milk_type || b.milk_type === f.milk_type || b.milk_type === 'Mixed')
    && (!f.batch || f.batch === b.batch_id)
    && (!f.status || f.status === b.state)
    && (!f.equipment || ['PAST-01', 'HOMO-01', 'COOL-01', 'V-302', b.line_id, ...b.source_tanks].includes(f.equipment)));
}
const statusKey = s => s.toLowerCase().replace(/ /g, '_');

function reportProcessing(f) {
  const rows = batches(f);
  const by = Object.fromEntries(['NOT STARTED', 'RUNNING', 'COMPLETED', 'REVIEW REQUIRED', 'FAILED DEMO CRITERIA'].map(s => [statusKey(s), rows.filter(b => b.state === s).length]));
  const [page, pagination] = paginate(rows.map(b => strip(b, ['temp_profile', 'events'])), f);
  return envelope('processing', f, {
    rows: page, pagination, columns: COL_PROCESS,
    summary: { batches: rows.length, ...by, incoming_l: r1(sum(rows, b => b.incoming_l)), processed_l: r1(sum(rows, b => b.processed_l)), documented_loss_l: r1(sum(rows, b => b.documented_loss_l)) },
    charts: { htst: C.HTST_DEMO },
    notes: [C.HTST_DEMO.note,
      'A batch is COMPLETED only if every minute of the outlet-temperature history is ≥ the target while flow was forward AND the holding time met the minimum. A dip with flow diversion → REVIEW REQUIRED; a dip without diversion or a short holding time → FAILED DEMO CRITERIA. Averages alone never pass a batch.'],
  });
}

function reportBatchDetail(f, batchId) {
  const b = f.ds.batches.find(x => x.batch_id === batchId);
  if (!b) throw new FilterError('Batch not found');
  return envelope('processing', f, { rows: [b], summary: { batch_id: batchId, state: b.state }, charts: { profile: b.temp_profile, target: C.HTST_DEMO.target_temp_c, events: b.events } });
}

// ── 7. Packaging ─────────────────────────────────────────────────────────────
const COL_PACK = [
  { key: 'fg_batch_id', label: 'FG batch' }, { key: 'batch_id', label: 'Process batch' }, { key: 'report_date', label: 'Date' },
  { key: 'shift', label: 'Shift' }, { key: 'product_name', label: 'Product' }, { key: 'line_id', label: 'Line' },
  { key: 'pack_size_ml', label: 'Pack', unit: 'mL' }, { key: 'planned_units', label: 'Planned' },
  { key: 'produced_units', label: 'Produced' }, { key: 'accepted_packs', label: 'Accepted' },
  { key: 'rejected_packs', label: 'Rejected' }, { key: 'speed_pph', label: 'Speed', unit: 'packs/h' },
  { key: 'operating_min', label: 'Run', unit: 'min' }, { key: 'downtime_min', label: 'Down', unit: 'min' },
  { key: 'downtime_reason', label: 'Downtime reason' }, { key: 'finished_volume_l', label: 'Finished vol.', unit: 'L' },
  { key: 'disposition', label: 'Disposition', kind: 'status' }, { key: 'end', label: 'Packed', kind: 'datetime', hidden: true },
  { key: 'cold_storage_in', label: 'Cold store in', kind: 'datetime', hidden: true }, { key: 'dispatch_id', label: 'Dispatch', hidden: true },
];

function packs(f) {
  const bmap = new Map(f.ds.batches.map(b => [b.batch_id, b]));
  return f.ds.packaging.filter(p => {
    if (!inPeriod(f, p.report_date, p.shift)) return false;
    if (f.batch && f.batch !== p.batch_id && f.batch !== p.fg_batch_id) return false;
    if (f.equipment && f.equipment !== p.line_id && f.equipment !== 'P-401') return false;
    if (f.status && f.status !== p.disposition) return false;
    if (f.milk_type) { const b = bmap.get(p.batch_id); if (b && b.milk_type !== f.milk_type && b.milk_type !== 'Mixed') return false; }
    return true;
  });
}

function packSummary(rows) {
  const bySize = {};
  for (const p of rows) {
    const s = bySize[p.pack_size_ml] ||= { accepted_packs: 0, rejected_packs: 0, finished_volume_l: 0 };
    s.accepted_packs += p.accepted_packs; s.rejected_packs += p.rejected_packs;
  }
  for (const [size, s] of Object.entries(bySize)) s.finished_volume_l = round((s.accepted_packs * +size) / 1000, 1);   // per pack size, then summed
  return {
    records: rows.length, planned_units: sum(rows, p => p.planned_units), produced_units: sum(rows, p => p.produced_units),
    accepted_packs: sum(rows, p => p.accepted_packs), rejected_packs: sum(rows, p => p.rejected_packs),
    finished_volume_l: round(sum(Object.values(bySize), s => s.finished_volume_l), 1), rejected_volume_l: r1(sum(rows, p => p.rejected_volume_l)),
    downtime_min: r1(sum(rows, p => p.downtime_min)), operating_min: r1(sum(rows, p => p.operating_min)), by_pack_size: bySize,
  };
}

function reportPackaging(f) {
  const rows = packs(f);
  const [a, b] = periodBounds(f);
  const hourly = (b - a) / H <= 72;
  const buckets = {};
  for (const p of rows) { const k = hourly ? p.end.slice(0, 13) + ':00' : p.report_date; buckets[k] = (buckets[k] || 0) + p.accepted_packs; }
  const [page, pagination] = paginate(rows, f);
  return envelope('packaging', f, {
    rows: page, pagination, columns: COL_PACK, summary: packSummary(rows),
    charts: { output: Object.keys(buckets).sort().map(x => ({ x, packs: buckets[x] })), output_bucket: hourly ? 'hour' : 'day',
      by_shift: SHIFTS.map(s => ({ x: s, packs: sum(rows.filter(p => p.shift === s), p => p.accepted_packs) })) },
    notes: ['Produced units = accepted packs + rejected packs (completed packs).',
      'Finished-product volume = accepted packs × declared pack size, calculated per pack size and then summed.',
      'Output chart uses the pack completion time; buckets are hourly for periods ≤ 3 days, daily otherwise.'],
  });
}

// ── 8. CIP ───────────────────────────────────────────────────────────────────
const COL_CIP = [
  { key: 'cycle_id', label: 'Cycle' }, { key: 'circuit_id', label: 'Circuit' }, { key: 'circuit_name', label: 'Circuit name' },
  { key: 'start', label: 'Start', kind: 'datetime' }, { key: 'end', label: 'End', kind: 'datetime' },
  { key: 'duration_min', label: 'Duration', unit: 'min' }, { key: 'solution_id', label: 'Solution' },
  { key: 'rinse_status', label: 'Rinse status' }, { key: 'completion_status', label: 'Completion', kind: 'status' },
  { key: 'deviations', label: 'Deviations' }, { key: 'operator_id', label: 'Operator', hidden: true },
  { key: 'equipment', label: 'Equipment', hidden: true },
];

function reportCip(f) {
  const rows = f.ds.cip.filter(c => inPeriod(f, c.report_date, c.shift)
    && (!f.equipment || f.equipment === c.circuit_id || c.equipment.includes(f.equipment) || f.equipment === 'CIP-01')
    && (!f.status || f.status === c.completion_status));
  const by = Object.fromEntries(['COMPLETED', 'INCOMPLETE', 'FAILED DEMO CRITERIA'].map(s => [statusKey(s), rows.filter(c => c.completion_status === s).length]));
  const [page, pagination] = paginate(rows, f);
  return envelope('cip', f, {
    rows: page, pagination, columns: COL_CIP,
    summary: { cycles: rows.length, ...by, avg_duration_min: r1(mean(rows.map(c => c.duration_min))) },
    charts: { criteria: { phases: C.CIP_PHASES, final_rinse_max_conductivity_ms_cm: C.CIP_FINAL_RINSE_MAX_CONDUCTIVITY, min_flow_m3h: C.CIP_MIN_FLOW_M3H } },
    notes: ['Completion is judged on configurable demo criteria per phase (minimum time, minimum supply temperature, minimum flow, final-rinse conductivity) — not on elapsed time alone.',
      'Failed and incomplete cycles stay visible. No chemical dosing instructions are provided — visualization only.'],
  });
}

// ── 9. Equipment runtime ─────────────────────────────────────────────────────
function merge(iv) {
  const out = [];
  for (const [a, b] of [...iv].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}
function subtract(iv, cut) {
  const res = [];
  for (const [a, b] of iv) {
    let segs = [[a, b]];
    for (const [c, d] of cut) {
      const nxt = [];
      for (const [x, y] of segs) {
        if (d <= x || c >= y) nxt.push([x, y]);
        else { if (c > x) nxt.push([x, c]); if (d < y) nxt.push([d, y]); }
      }
      segs = nxt;
    }
    res.push(...segs);
  }
  return res;
}
const dur = iv => sum(iv, ([a, b]) => b - a) / MIN;

function equipmentRows(f) {
  const eqIds = C.EQUIPMENT[f.equipment] ? [f.equipment] : Object.keys(C.EQUIPMENT);
  const byEq = {};
  for (const iv of f.ds.intervals) (byEq[iv.equipment_id] ||= []).push(iv);
  const rows = [];
  for (const [, , d] of intervalsFor({ ...f, shift: null })) {
    for (const [sh, [h0, h1]] of Object.entries(C.SHIFTS)) {
      if (f.shift && sh !== f.shift) continue;
      const sa = dayStart(d) + (h0 - 6) * H;
      let sb = dayStart(d) + (h1 - 6) * H;
      if (f.ds.now) { if (sa >= f.ds.now) continue; sb = Math.min(sb, f.ds.now); }
      for (const eq of eqIds) {
        const st = { RUN: [], FAULT: [], DOWN: [] }, reasons = [];
        for (const iv of byEq[eq] || []) {
          const x = Math.max(parseIso(iv.start), sa), y = Math.min(parseIso(iv.end), sb);
          if (y > x) { st[iv.state].push([x, y]); if (iv.state !== 'RUN' && iv.reason) reasons.push(iv.reason); }
        }
        const fault = merge(st.FAULT);
        const down = subtract(merge(st.DOWN), fault);                // precedence FAULT > DOWN > RUN
        const run = subtract(subtract(merge(st.RUN), fault), down);
        const window = (sb - sa) / MIN;
        const runm = dur(run), faultm = dur(fault), downm = dur(down);
        const ia = iso(sa), ib = iso(sb);
        rows.push({
          equipment_id: eq, equipment_name: C.EQUIPMENT[eq].name, kind: C.EQUIPMENT[eq].kind, report_date: d, shift: sh,
          first_start: run.length ? iso(Math.min(...run.map(i => i[0]))) : null, last_stop: run.length ? iso(Math.max(...run.map(i => i[1]))) : null,
          runtime_min: round(runm, 1), idle_min: round(window - runm - faultm - downm, 1), downtime_min: round(downm + faultm, 1),
          fault_min: round(faultm, 1), planned_down_min: round(downm, 1), fault_reason: [...new Set(reasons)].sort().join('; ') || null,
          alarm_count: f.ds.alarms.filter(x => x.equipment_id === eq && ia <= x.timestamp && x.timestamp < ib).length,
          maintenance_status: faultm ? 'Fault — inspect' : downm ? 'Planned maintenance done' : 'OK',
          utilization_pct: window ? round(runm / window * 100, 1) : null, window_min: round(window, 1), is_mock: true,
        });
      }
    }
  }
  return rows;
}

const COL_EQUIP = [
  { key: 'report_date', label: 'Date' }, { key: 'shift', label: 'Shift' }, { key: 'equipment_id', label: 'Equipment' },
  { key: 'equipment_name', label: 'Name' }, { key: 'first_start', label: 'First start', kind: 'datetime' },
  { key: 'last_stop', label: 'Last stop', kind: 'datetime' }, { key: 'runtime_min', label: 'Run', unit: 'min' },
  { key: 'idle_min', label: 'Idle', unit: 'min' }, { key: 'downtime_min', label: 'Down', unit: 'min' },
  { key: 'fault_min', label: 'Fault', unit: 'min' }, { key: 'fault_reason', label: 'Fault / downtime reason' },
  { key: 'alarm_count', label: 'Alarms' }, { key: 'maintenance_status', label: 'Maintenance', kind: 'status' },
  { key: 'utilization_pct', label: 'Utilization', unit: '%', hidden: true },
];

function reportEquipment(f) {
  let rows = equipmentRows(f);
  if (f.status) rows = rows.filter(r => r.maintenance_status === f.status);
  const tot = {};
  for (const r of rows) {
    const t = tot[r.equipment_id] ||= { run: 0, idle: 0, down: 0, fault: 0 };
    t.run += r.runtime_min; t.idle += r.idle_min; t.down += r.downtime_min; t.fault += r.fault_min;
  }
  const [page, pagination] = paginate(rows, f);
  return envelope('equipment-runtime', f, {
    rows: page, pagination, columns: COL_EQUIP,
    summary: { runtime_min: r1(sum(rows, r => r.runtime_min)), downtime_min: r1(sum(rows, r => r.downtime_min)), fault_min: r1(sum(rows, r => r.fault_min)), alarm_count: sum(rows, r => r.alarm_count) },
    charts: { by_equipment: Object.entries(tot).map(([x, v]) => ({ x, run: round(v.run, 1), idle: round(v.idle, 1), down: round(v.down, 1), fault: round(v.fault, 1) })) },
    notes: ['Runtime, fault and downtime are derived from simulated equipment events (run / fault / planned-down intervals).',
      'Overlaps are resolved with precedence FAULT > planned DOWN > RUN, so durations never double-count; idle = shift window − run − fault − planned down.'],
  });
}

// ── 10. Alarms ───────────────────────────────────────────────────────────────
const COL_ALARMS = [
  { key: 'event_id', label: 'Event' }, { key: 'timestamp', label: 'Time', kind: 'datetime' },
  { key: 'severity', label: 'Severity', kind: 'status' }, { key: 'equipment_id', label: 'Equipment' },
  { key: 'code', label: 'Code' }, { key: 'description', label: 'Description' }, { key: 'value', label: 'Value' },
  { key: 'unit', label: 'Unit' }, { key: 'threshold', label: 'Threshold' }, { key: 'ack_status', label: 'Ack', kind: 'status' },
  { key: 'ack_time', label: 'Ack time', kind: 'datetime', hidden: true },
  { key: 'resolved_time', label: 'Resolved', kind: 'datetime' }, { key: 'resolution', label: 'Resolution', hidden: true },
];

function alarms(f) {
  return f.ds.alarms.filter(x => inPeriod(f, x.report_date, x.shift)
    && (!f.equipment || f.equipment === x.equipment_id)
    && (!f.batch || f.batch === x.ref)
    && (!f.status || [x.severity, x.ack_status, x.resolved_time ? 'Resolved' : 'Open'].includes(f.status)));
}

function reportAlarms(f) {
  const rows = alarms(f);
  const sev = Object.fromEntries(['INFO', 'WARNING', 'CRITICAL', 'FAULT'].map(s => [s.toLowerCase(), rows.filter(a => a.severity === s).length]));
  const acks = rows.filter(a => a.ack_time).map(a => (parseIso(a.ack_time) - parseIso(a.timestamp)) / MIN);
  const [page, pagination] = paginate(rows, f);
  return envelope('alarms', f, {
    rows: page, pagination, columns: COL_ALARMS,
    summary: { events: rows.length, ...sev, open: rows.filter(a => !a.resolved_time && a.severity !== 'INFO').length,
      unacknowledged: rows.filter(a => a.ack_status === 'Unacknowledged').length, mean_time_to_ack_min: r1(mean(acks)) },
    charts: { daily: dailySeries(f, rows, () => 1, a => a.severity) },
    notes: ['Alarms are generated only when the simulated condition occurs (tank level, temperature, flow, faults, routing interlocks, process / CIP deviations). None are fabricated independently of equipment state.'],
  });
}

// ── 11. Reconciliation ───────────────────────────────────────────────────────
function reconciliation(f) {
  const [a, b] = periodBounds(f), ia = iso(a), ib = iso(b);
  const so = snapshotAt(f.ds, a), sc = snapshotAt(f.ds, b);
  const ff = { ...f, shift: null, milk_type: null, center: null, batch: null, status: null, equipment: null };
  const dl = deliveries(ff), pk = packs(ff);
  const opening = sum(Object.values(so.volumes)) + so.wip_l, closing = sum(Object.values(sc.volumes)) + sc.wip_l;
  const received = sum(dl, d => d.gross_l), rejected = sum(dl, d => d.rejected_l), samplesL = sum(dl, d => d.sample_ml) / 1000;
  const finished = sum(pk, p => p.finished_volume_l), rejPacks = sum(pk, p => p.rejected_volume_l);
  const losses = sum(f.ds.batches.filter(x => x.end && ia <= x.end && x.end < ib), x => x.documented_loss_l);
  const processed = sum(f.ds.batches.filter(x => x.start && ia <= x.start && x.start < ib), x => x.incoming_l);
  const unexplained = opening + received - rejected - samplesL - finished - rejPacks - losses - closing;
  const rho = C.DENSITY_ASSUMPTION_KG_PER_L;
  const terms = [
    ['Opening inventory (all tanks + in-process)', opening, '+'], ['Milk received (gross)', received, '+'],
    ['Milk rejected at intake', rejected, '−'], ['Documented intake samples', samplesL, '−'],
    ['Finished-product volume (accepted packs)', finished, '−'], ['Rejected packs volume', rejPacks, '−'],
    ['Documented process losses', losses, '−'], ['Closing inventory (all tanks + in-process)', closing, '−'],
  ];
  return {
    terms: terms.map(([term, v, sign]) => ({ term, sign, volume_l: round(v, 1), mass_kg: round(v * rho, 1) })),
    unexplained_l: round(unexplained, 1), unexplained_kg: round(unexplained * rho, 1),
    unexplained_pct_of_received: received ? round(unexplained / received * 100, 3) : null,
    transferred_to_processing_l: round(processed, 1), density_assumption_kg_l: rho, opening_ts: so.timestamp, closing_ts: sc.timestamp,
  };
}

function reportReconciliation(f) {
  const rec = reconciliation(f);
  const daily = days(f).map(d => {
    const r = reconciliation({ ...f, start: d, end: d });
    return { report_date: d, ...Object.fromEntries(r.terms.map(t => [t.term, t.volume_l])), unexplained_l: r.unexplained_l };
  });
  return envelope('reconciliation', f, {
    rows: rec.terms, summary: rec,
    columns: [{ key: 'term', label: 'Term' }, { key: 'sign', label: '±' }, { key: 'volume_l', label: 'Volume', unit: 'L' }, { key: 'mass_kg', label: 'Mass (assumed ρ)', unit: 'kg' }],
    charts: { daily, equation: C.VOLUME_BALANCE_TERMS },
    notes: ['Unexplained = Opening + Received − Rejected − Samples − Finished − Rejected packs − Documented losses − Closing. It is shown as calculated and never adjusted to zero.',
      `Mass balance uses a stated density assumption of ${C.DENSITY_ASSUMPTION_KG_PER_L} kg/L for every term; volume and mass are kept separate because volume varies with temperature and measurement conditions.`,
      'Plant-wide balance — milk-type, shift, centre and batch filters do not apply to this report.',
      'Includes record rounding (0.1 L) and small unrecorded line losses that exist in the simulation on purpose.'],
  });
}

// ── 12. Traceability ─────────────────────────────────────────────────────────
const node = (stage, id, time = null, detail = null, status = 'ok') => ({ stage, id, time, detail, status });
const n0 = x => Math.round(x).toLocaleString('en-US');

function traceForwardFromDelivery(ds, d) {
  const s = d.sample_id ? ds.samples.find(x => x.sample_id === d.sample_id) : null;
  const head = [
    node('Collection centre', d.center_id, d.collection_time, `${d.center_name} · supplier ${d.supplier_id}`),
    node('Tanker', d.tanker_id, d.arrival_time, `${n0(d.gross_l)} L gross · ${d.milk_type}`),
    node('Receiving sample', d.sample_id, s ? s.test_time : null, s ? s.result_status : 'Sample record not found', s ? 'ok' : 'missing'),
    node('Acceptance', d.delivery_id, d.unload_end || d.arrival_time, `${d.quality_status}: accepted ${n0(d.accepted_l)} L, rejected ${n0(d.rejected_l)} L`),
  ];
  if (d.accepted_l <= 0) return [{ title: `${d.batch_id} — rejected at intake`, nodes: [...head, node('Source tank', null, null, 'Not applicable — load rejected', 'n/a')] }];
  head.push(node('Reception tank', 'RT-01', d.unload_start, `Unloaded ${d.unload_start} → ${d.unload_end}`));
  const xfer = ds.movements.find(m => (m.tank_id === 'ST-COW-01' || m.tank_id === 'ST-BUF-01') && m.direction === 'IN' && m.batch_ids.includes(d.batch_id));
  head.push(node('Transfer to silo', xfer ? xfer.tank_id : null, xfer ? xfer.timestamp : null, xfer ? `via V-301, event ${xfer.event_id}` : 'Transfer event not found', xfer ? 'ok' : 'missing'));
  const used = ds.batches.filter(b => b.source_lots.some(l => l.lot === d.batch_id));
  if (!used.length) return [{ title: `${d.batch_id} → in silo`, nodes: [...head, node('Processing', null, null, 'Not yet processed (still in silo) or beyond simulated period', 'pending')] }];
  return used.map(b => {
    const litres = sum(b.source_lots.filter(l => l.lot === d.batch_id), l => l.litres);
    return { title: `${d.batch_id} → ${b.batch_id}`, nodes: [...head, ...traceForwardFromBatch(ds, b, `${n0(litres)} L of this lot`)] };
  });
}

function traceForwardFromBatch(ds, b, contrib = null, onlyFg = null) {
  const nodes = [
    node('Processing equipment', 'LINE-01 (PAST-01 / HOMO-01 / COOL-01)', b.start, (contrib ? contrib + ' · ' : '') + `${n0(b.incoming_l)} L batch`),
    node('Pasteurization record', b.batch_id, b.end, `${b.state} · ${b.disposition}`,
      b.state === 'COMPLETED' ? 'ok' : b.state === 'RUNNING' || b.state === 'NOT STARTED' ? 'pending' : 'review'),
  ];
  const pk = ds.packaging.filter(p => p.batch_id === b.batch_id && (onlyFg == null || p.fg_batch_id === onlyFg));
  if (!pk.length) return [...nodes, node('Packaging line', null, null, 'No packaging record yet', 'pending')];
  for (const p of pk) {
    nodes.push(
      node('Packaging line', p.line_id, p.start, `${p.accepted_packs.toLocaleString('en-US')} × ${p.pack_size_ml} mL accepted, ${p.rejected_packs} rejected`),
      node('Finished-product batch', p.fg_batch_id, p.end, `${n0(p.finished_volume_l)} L · ${p.disposition}`),
      node('Cold storage', p.cold_storage_in ? 'CS-01' : null, p.cold_storage_in, p.cold_storage_in ? 'Received in cold store' : 'Missing link — cold-storage scan not recorded', p.cold_storage_in ? 'ok' : 'missing'),
      node('Dispatch', p.dispatch_id, p.dispatch_time,
        p.dispatch_id ? 'Dispatched' : p.disposition !== 'Released (demo)' ? 'Held — batch not released' : !p.cold_storage_in ? 'Missing link — no cold-storage record' : 'Not dispatched within simulated period',
        p.dispatch_id ? 'ok' : 'pending'),
    );
  }
  return nodes;
}

function traceBackFromBatch(ds, b) {
  return b.source_lots.map(lot => {
    const d = ds.deliveries.find(x => x.batch_id === lot.lot);
    return {
      lot: lot.lot, litres: lot.litres, tank: lot.tank,
      nodes: d ? traceForwardFromDelivery(ds, d)[0].nodes.slice(0, 6)
        : [node('Raw-milk lot', lot.lot, null, 'Missing link — opening stock from before the demo window (no intake record)', 'missing')],
    };
  });
}

function reportTraceability(f, ident) {
  const ds = f.ds;
  ident = (ident || '').trim();
  let chains = [], upstream = [], candidates = [], kind = null;
  const d = ds.deliveries.find(x => ident && [x.batch_id, x.delivery_id, x.sample_id].includes(ident));
  let b = ds.batches.find(x => x.batch_id === ident);
  const p = ds.packaging.find(x => x.fg_batch_id === ident);
  if (d) { kind = 'raw batch'; chains = traceForwardFromDelivery(ds, d); }
  else if (b) { kind = 'process batch'; chains = [{ title: b.batch_id, nodes: traceForwardFromBatch(ds, b) }]; upstream = traceBackFromBatch(ds, b); }
  else if (p) {
    kind = 'finished-product batch';
    b = ds.batches.find(x => x.batch_id === p.batch_id);
    chains = [{ title: `${p.fg_batch_id} ← ${p.batch_id}`, nodes: traceForwardFromBatch(ds, b, null, p.fg_batch_id) }];
    upstream = traceBackFromBatch(ds, b);
  } else if (C.TANKS[ident]) {
    kind = 'tank';
    candidates = [...new Set(ds.movements.filter(m => m.tank_id === ident && f.start <= m.report_date && m.report_date <= f.end).flatMap(m => m.batch_ids))].sort();
  } else if (C.COLLECTION_CENTERS.some(c => c.id === ident) || C.SUPPLIERS.some(s => s.id === ident)) {
    kind = 'collection centre / supplier';
    candidates = ds.deliveries.filter(x => (x.center_id === ident || x.supplier_id === ident) && f.start <= x.report_date && x.report_date <= f.end).map(x => x.batch_id);
  } else if (ds.opening_lots.includes(ident)) {
    kind = 'opening stock';
    chains = [{ title: ident, nodes: [node('Raw-milk lot', ident, null, 'Missing link — opening stock from before the demo window', 'missing')] }];
  } else {
    throw new FilterError(`Nothing found for '${ident}' — search by batch, sample, delivery, finished-product batch, tank, centre or supplier ID`);
  }
  return envelope('traceability', f, {
    summary: { query: ident, kind }, rows: chains, charts: { upstream, candidates: candidates.slice(0, 200) },
    notes: ['Links come only from simulated records. A link that does not exist is shown as missing — never invented.',
      'Raw lots merge in silos; FIFO draws record exactly which lots (and litres) each process batch used.'],
  });
}

// ── 1. Daily summary ─────────────────────────────────────────────────────────
function reportSummary(f) {
  const ff = { ...f, status: null, batch: null };
  const dl = deliveries(ff), sm = samples(ff);
  const tested = sm.filter(s => s.fat_pct != null);
  const [, b] = periodBounds(f);
  const sc = snapshotAt(f.ds, b);
  const ended = f.ds.batches.filter(x => inPeriod(ff, x.report_date, x.shift));
  const pk = packs(ff);
  const cipRows = f.ds.cip.filter(c => inPeriod(ff, c.report_date, c.shift));
  const eq = equipmentRows({ ...ff, equipment: null });
  const al = alarms({ ...ff, equipment: null });
  const rec = reconciliation(ff);
  const qual = {};
  for (const kind of ['Cow', 'Buffalo']) {
    const s = tested.filter(x => x.milk_type === kind);
    qual[kind] = { fat_weighted: r1(wmean(s.map(x => [x.fat_pct, x.weight_l])), 2), snf_weighted: r1(wmean(s.map(x => [x.snf_pct, x.weight_l])), 2),
      fat_simple: r1(mean(s.map(x => x.fat_pct)), 2), snf_simple: r1(mean(s.map(x => x.snf_pct)), 2), samples: s.length };
  }
  const ps = packSummary(pk);
  const { by_pack_size, ...psRest } = ps;
  const summary = {
    plant: C.PLANT_NAME, ...collectionSummary(dl), quality: qual,
    quality_review_count: sm.filter(s => s.result_status === 'Review required' || s.result_status === 'Rejected').length,
    processed_volume_l: r1(sum(ended, x => x.incoming_l)), ...Object.fromEntries(Object.entries(psRest).map(([k, v]) => ['pack_' + k, v])),
    pack_by_size: by_pack_size,
    tank_closing: Object.fromEntries(Object.entries(sc.volumes).map(([k, v]) => [k, round(v, 1)])),
    cip: Object.fromEntries(['COMPLETED', 'INCOMPLETE', 'FAILED DEMO CRITERIA'].map(s => [s, cipRows.filter(c => c.completion_status === s).length])),
    equipment_downtime_min: r1(sum(eq, r => r.downtime_min)),
    open_alarms: al.filter(x => !x.resolved_time && x.severity !== 'INFO').length,
    alarms_by_severity: Object.fromEntries(['INFO', 'WARNING', 'CRITICAL', 'FAULT'].map(s => [s, al.filter(x => x.severity === s).length])),
    batch_disposition: Object.fromEntries(['COMPLETED', 'REVIEW REQUIRED', 'FAILED DEMO CRITERIA', 'RUNNING', 'NOT STARTED'].map(s => [s, ended.filter(x => x.state === s).length])),
    reconciliation: rec,
  };
  return envelope('summary', f, {
    summary, rows: [],
    charts: { by_shift: SHIFTS.map(s => ({ x: s, received_l: round(sum(dl.filter(d => d.shift === s), d => d.gross_l), 1), packs: sum(pk.filter(p => p.shift === s), p => p.accepted_packs) })), quality: qual },
    notes: ['All figures are simulated demonstration data generated from one shared seeded dataset.',
      'Fat / SNF summary values are volume-weighted by accepted litres; simple averages are shown alongside.',
      'Thresholds and process criteria are illustrative demo rules — verify against current applicable standards.',
      `Mass figures assume a density of ${C.DENSITY_ASSUMPTION_KG_PER_L} kg/L.`],
  });
}

// ── meta + public API ────────────────────────────────────────────────────────
export function meta(mode = 'seeded') {
  const ds = getDataset(mode);
  return {
    demo_notice: C.DEMO_NOTICE, plant: C.PLANT_NAME, mode, is_mock: true,
    window: { start: ds.window_start, end: ds.window_end }, simulation_clock: ds.now ? iso(ds.now) : null,
    reports: Object.entries(REPORT_TITLES).map(([id, title]) => ({ id, title })), shifts: SHIFTS, milk_types: MILK_TYPES,
    centers: C.COLLECTION_CENTERS, suppliers: C.SUPPLIERS.map(s => ({ id: s.id, name: s.name, center: s.center })),
    equipment: [...Object.entries(C.EQUIPMENT).map(([id, v]) => ({ id, ...v })), ...Object.entries(C.TANKS).map(([id, v]) => ({ id, name: v.name, kind: 'Tank' }))],
    statuses: {
      collection: ['Within demo rules', 'Review required', 'Rejected', 'Partially rejected', 'Not tested — sample record missing', 'Pending'],
      quality: ['Within demo rules', 'Review required', 'Rejected', 'Pending'],
      processing: ['NOT STARTED', 'RUNNING', 'COMPLETED', 'REVIEW REQUIRED', 'FAILED DEMO CRITERIA'],
      packaging: ['Released (demo)', 'On hold — QA review', 'Blocked — QA decision pending'],
      cip: ['COMPLETED', 'INCOMPLETE', 'FAILED DEMO CRITERIA'],
      tanks: ['Normal', 'High', 'Low'],
      'equipment-runtime': ['OK', 'Fault — inspect', 'Planned maintenance done'],
      alarms: ['INFO', 'WARNING', 'CRITICAL', 'FAULT', 'Open', 'Resolved', 'Unacknowledged'],
    },
    quality_rules: C.QUALITY_RULES, methods: C.QUALITY_METHODS, htst_demo: C.HTST_DEMO,
  };
}

export const REPORTS = {
  summary: reportSummary, collection: reportCollection, quality: reportQuality, 'milk-comparison': reportComparison,
  tanks: reportTanks, processing: reportProcessing, packaging: reportPackaging, cip: reportCip,
  'equipment-runtime': reportEquipment, alarms: reportAlarms, reconciliation: reportReconciliation,
};

export function runReport(report, params) {
  const fn = REPORTS[report];
  if (!fn) throw new FilterError(`Unknown report '${report}'`);
  return fn(makeFilters(params));
}
export const runBatchDetail = (id, params) => reportBatchDetail(makeFilters(params), id);
export const runTankTransfers = (tank, params) => reportTankTransfers(makeFilters(params), tank);
export const runTrace = (id, params) => reportTraceability(makeFilters(params), id);
