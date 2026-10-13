// Tests for the in-browser dairy-report engine (no backend / no database).
// Run: npm run test:reports   (bundles with esbuild, runs under Node's test runner)

import test from 'node:test';
import assert from 'node:assert/strict';
import { getDataset, iso, prodDay } from './generator';
import { meta, runReport, runBatchDetail, runTankTransfers, runTrace, REPORTS, FilterError } from './service';
import { toCsv, toPdf } from './export';
import { DEMO_NOTICE } from './config';

// Guard: the engine must never touch the network.
globalThis.fetch = () => { throw new Error('engine must not call fetch'); };

const ds = getDataset('seeded');
const W = { start: ds.window_start, end: ds.window_end };
const close = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

test('seeded dataset is deterministic and non-empty', () => {
  assert.equal(ds.window_end, '2025-08-19');
  assert.equal(ds.window_start, '2025-07-21');
  for (const k of ['deliveries', 'samples', 'movements', 'batches', 'packaging', 'cip', 'alarms', 'intervals']) assert.ok(ds[k].length > 20, k);
  assert.ok(ds.deliveries.every(d => d.is_mock));
  const again = getDataset('seeded');
  assert.equal(again, ds);   // cached single source of truth
});

test('every report runs over the whole window and carries the demo notice', () => {
  for (const r of Object.keys(REPORTS)) {
    const env = runReport(r, { ...W, page_size: 10000 });
    assert.equal(env.demo_notice, DEMO_NOTICE, r);
    assert.equal(env.is_mock, true, r);
    assert.ok(env.report_id.startsWith('RPT-'), r);
  }
});

test('intake identity: gross = accepted + rejected + samples', () => {
  for (const d of ds.deliveries) assert.ok(close(d.gross_l, d.accepted_l + d.rejected_l + d.sample_ml / 1000, 0.001), d.delivery_id);
  const s = runReport('collection', W).summary;
  assert.ok(Math.abs(s.intake_balance_difference_l) <= 0.05, String(s.intake_balance_difference_l));
});

test('tank balance closes for every tank and day', () => {
  const env = runReport('tanks', { ...W, page_size: 10000 });
  assert.ok(env.summary.max_abs_balance_check_l <= 1, String(env.summary.max_abs_balance_check_l));
  for (const r of env.rows) assert.ok(r.closing_l <= r.capacity_l + 0.5, r.tank_id);
});

test('quality flags agree with displayed (rounded) values', () => {
  for (const s of ds.samples.filter(x => x.fat_pct != null)) {
    for (const reason of s.review_reasons) {
      const m = reason.match(/^Fat ([\d.]+) % < demo min ([\d.]+)/);
      if (m) assert.ok(+m[1] < +m[2], reason);
    }
  }
});

test('missing measurements stay null (never zero)', () => {
  assert.ok(ds.samples.some(s => s.protein_pct === null));
  assert.ok(ds.samples.every(s => s.protein_pct !== 0));
  assert.ok(ds.deliveries.some(d => d.sample_id === null));
  const csv = toCsv(runReport('quality', { ...W, page_size: 10000 }));
  assert.ok(csv.includes('Not tested'));
});

test('processing states follow the HTST demo rules', () => {
  for (const b of ds.batches.filter(x => x.state === 'COMPLETED')) {
    assert.ok(b.hold_time_s >= 15, b.batch_id);
    assert.ok(b.temp_profile.every(p => p.outlet_c >= 72), b.batch_id);
  }
  assert.ok(ds.batches.some(b => b.state !== 'COMPLETED'), 'demo data should include deviations');
});

test('packaging: produced = accepted + rejected, finished volume per pack size', () => {
  for (const p of ds.packaging) {
    assert.equal(p.produced_units, p.accepted_packs + p.rejected_packs);
    assert.ok(close(p.finished_volume_l, (p.accepted_packs * p.pack_size_ml) / 1000, 0.05));
  }
});

test('reconciliation is reported as calculated (not forced to zero)', () => {
  const s = runReport('reconciliation', W).summary;
  assert.equal(typeof s.unexplained_l, 'number');
  assert.ok(s.unexplained_l !== 0);
  assert.ok(Math.abs(s.unexplained_pct_of_received) < 2, String(s.unexplained_pct_of_received));
});

test('filters, pagination, sorting and validation', () => {
  const env = runReport('collection', { ...W, milk_type: 'Cow', page_size: 10, sort_by: 'gross_l', sort_dir: 'desc' });
  assert.equal(env.rows.length, 10);
  assert.ok(env.rows.every(r => r.milk_type === 'Cow'));
  assert.ok(env.rows[0].gross_l >= env.rows[9].gross_l);
  assert.ok(env.pagination.total > 10);
  assert.throws(() => runReport('collection', { start: '2025-08-19', end: '2025-08-01' }), FilterError);
  assert.throws(() => runReport('collection', { start: '2024-01-01', end: '2024-01-02' }), FilterError);
  assert.throws(() => runReport('collection', { shift: 'Lunch' }), FilterError);
  assert.throws(() => runReport('nope', {}), FilterError);
});

test('drill-downs and traceability', () => {
  const b = ds.batches.find(x => x.state !== 'NOT STARTED' && x.end);
  assert.equal(runBatchDetail(b.batch_id, W).rows[0].batch_id, b.batch_id);
  assert.ok(runTankTransfers('ST-COW-01', W).rows.length > 0);
  const p = ds.packaging[0];
  const tr = runTrace(p.fg_batch_id, W);
  assert.equal(tr.summary.kind, 'finished-product batch');
  assert.ok(tr.charts.upstream.length > 0);
  assert.equal(runTrace('RB-OPENING-COW', W).summary.kind, 'opening stock');
  assert.throws(() => runTrace('XYZ-404', W), FilterError);
});

test('dynamic mode stops at "now"', () => {
  const now = Date.UTC(2026, 9, 13, 15, 30);
  const d = getDataset('dynamic', 2025, now);
  const stop = iso(now);
  assert.equal(d.window_end, prodDay(now));
  for (const k of ['alarms', 'movements']) assert.ok(d[k].every(x => x.timestamp <= stop), k);
  assert.ok(d.alarms.some(a => a.code === 'SIM_PAUSE'));
  assert.equal(meta('seeded').window.end, '2025-08-19');
});

test('CSV and PDF exports', () => {
  const env = runReport('collection', { ...W, page_size: 10000 });
  const csv = toCsv(env);
  assert.ok(csv.includes(DEMO_NOTICE) && csv.includes(env.report_id));
  const pdf = toPdf(env);
  const s = String.fromCharCode(...pdf.slice(0, 8));
  assert.equal(s, '%PDF-1.4');
  const text = Array.from(pdf, c => String.fromCharCode(c)).join('');
  assert.ok(text.includes('DEMO DATA'));
  assert.match(text, /Page 1 of \d+/);
  assert.ok(text.trimEnd().endsWith('%%EOF'));
});
