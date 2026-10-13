import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { THEME, FONT_COND, FONT_MONO } from '../theme';
import { Page, Card, Grid, Button, Badge, Segmented, Input, Modal, Callout, DataTable } from '../ui/kit';
import { getMeta, getReport, getBatchDetail, getTankTransfers, getTrace } from '../reports/api';
import { SERIES } from '../reports/api';
import {
  GLOSSARY, InfoTip, DemoBanner, Watermark, SummaryMetricCard, ReportTable, QualityResultsTable, ReportFilters,
  ReportExportMenu, ReconciliationPanel, BatchTraceabilityTimeline, ErrorBox, Loading, StatusBadge, n0, n1, fmtCell,
} from '../reports/components';
import {
  DailyMilkChart, MilkComparisonChart, ProductionTrendChart, TankInventoryChart, ProcessTemperatureChart,
  AlarmTimeline, BarChart,
} from '../reports/charts';

// Dairy Reports — 12 reports over ONE shared mock dataset served by the
// in-browser mock-data engine (src/reports/engine — no backend, no database). Every view, export and print carries the
// DEMO DATA notice; measurements that weren't taken show "Not tested".

const REPORTS = [
  { id: 'summary', icon: '▦', label: 'Daily Production Summary' },
  { id: 'collection', icon: '⛟', label: 'Daily Milk Collection' },
  { id: 'quality', icon: '⚗', label: 'Milk Quality Testing' },
  { id: 'milk-comparison', icon: '⇋', label: 'Cow vs Buffalo Milk' },
  { id: 'tanks', icon: '⛁', label: 'Tank Inventory & Transfer' },
  { id: 'processing', icon: '♨', label: 'Pasteurization & Processing' },
  { id: 'packaging', icon: '▣', label: 'Production & Packaging' },
  { id: 'cip', icon: '⟲', label: 'CIP Cleaning' },
  { id: 'equipment-runtime', icon: '⚙', label: 'Equipment Runtime & Downtime' },
  { id: 'alarms', icon: '⚠', label: 'Alarm & Event History' },
  { id: 'reconciliation', icon: '⚖', label: 'Loss & Yield Reconciliation' },
  { id: 'traceability', icon: '⛓', label: 'Batch Traceability' },
];

// Which filters each report uses.
const FILTERS = {
  summary: { shift: false, search: false },
  collection: { milk: true, batch: true, center: true },
  quality: { milk: true, batch: true, center: true },
  'milk-comparison': { center: true, search: false },
  tanks: { equipment: true },
  processing: { milk: true, batch: true, equipment: true },
  packaging: { milk: true, batch: true, equipment: true },
  cip: { equipment: true },
  'equipment-runtime': { equipment: true },
  alarms: { equipment: true, batch: true },
  reconciliation: { shift: false, search: false },
  traceability: { shift: false, search: false },
};

const KPI = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 12 }}>{children}</div>;

function Notes({ notes }) {
  if (!notes?.length) return null;
  return (
    <Card title="Notes & assumptions" icon="ℹ" pad={14}>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: THEME.textMid, lineHeight: 1.55 }}>{notes.map(n => <li key={n}>{n}</li>)}</ul>
    </Card>
  );
}

// ── individual report views ──────────────────────────────────────────────────
function SummaryView({ env }) {
  const s = env.summary;
  const q = s.quality;
  return (
    <>
      <Card pad={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontFamily: FONT_COND, fontSize: 26, fontWeight: 700 }}>{s.plant}</div>
            <div style={{ fontSize: 13.5, color: THEME.textMid }}>Report date {env.period.start === env.period.end ? env.period.start : `${env.period.start} → ${env.period.end}`} · generated {env.generated_at.replace('T', ' ')}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5, color: THEME.textDim }}>Report ID<br /><span style={{ fontFamily: FONT_MONO, color: THEME.text }}>{env.report_id}</span></div>
        </div>
      </Card>
      <KPI>
        <SummaryMetricCard label="Milk received" value={n0(s.total_received_l)} unit="L" sub={`${s.deliveries} tanker deliveries`} toneName="info" />
        <SummaryMetricCard label="Cow milk" value={n0(s.cow_received_l)} unit="L" />
        <SummaryMetricCard label="Buffalo milk" value={n0(s.buffalo_received_l)} unit="L" />
        <SummaryMetricCard label="Accepted / rejected" value={n0(s.accepted_l)} unit="L" sub={`${n0(s.rejected_l)} L rejected`} />
        <SummaryMetricCard label="Quality reviews" value={s.quality_review_count} toneName={s.quality_review_count ? 'warn' : 'ok'} sub="review or rejected samples" />
        <SummaryMetricCard label="Processed volume" value={n0(s.processed_volume_l)} unit="L" />
        <SummaryMetricCard label="Packaged units" value={n0(s.pack_produced_units)} sub={`${n0(s.pack_accepted_packs)} accepted`} />
        <SummaryMetricCard label="Finished product" value={n0(s.pack_finished_volume_l)} unit="L" />
        <SummaryMetricCard label="Equipment downtime" value={n0(s.equipment_downtime_min)} unit="min" toneName="warn" />
        <SummaryMetricCard label="Open alarms" value={s.open_alarms} toneName={s.open_alarms ? 'danger' : 'ok'} />
      </KPI>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>
        <Card title="Milk received by shift" icon="⛟"><BarChart data={env.charts.by_shift} keys={[{ key: 'received_l', label: 'Received', color: SERIES.Buffalo }]} unit="L" height={190} /></Card>
        <Card title="Packs produced by shift" icon="▣"><BarChart data={env.charts.by_shift} keys={[{ key: 'packs', label: 'Accepted packs', color: SERIES.Cow }]} unit="packs" height={190} /></Card>
        <Card title={<span>Fat &amp; SNF — volume-weighted<InfoTip id="weighted" /></span>} icon="⚗">
          <MilkComparisonChart cow={q.Cow} buffalo={q.Buffalo} metrics={[{ key: 'fat_weighted', label: 'Fat %', unit: '%' }, { key: 'snf_weighted', label: 'SNF %', unit: '%' }]} />
          <div style={{ fontSize: 12.5, color: THEME.textMid, marginTop: 6 }}>
            Simple averages — cow fat {q.Cow.fat_simple ?? 'n/a'} %, SNF {q.Cow.snf_simple ?? 'n/a'} % · buffalo fat {q.Buffalo.fat_simple ?? 'n/a'} %, SNF {q.Buffalo.snf_simple ?? 'n/a'} %
          </div>
        </Card>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Card title="Batch disposition" icon="♨">{Object.entries(s.batch_disposition).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><StatusBadge value={k} /><b>{v}</b></div>)}</Card>
        <Card title="CIP completion" icon="⟲">{Object.entries(s.cip).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><StatusBadge value={k} /><b>{v}</b></div>)}</Card>
        <Card title="Alarms by severity" icon="⚠">{Object.entries(s.alarms_by_severity).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><StatusBadge value={k} /><b>{v}</b></div>)}</Card>
        <Card title="Tank closing inventory" icon="⛁">{Object.entries(s.tank_closing).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13.5 }}><span style={{ fontFamily: FONT_MONO }}>{k}</span><b>{n0(v)} L</b></div>)}</Card>
      </div>
      <ReconciliationPanel rec={s.reconciliation} compact />
    </>
  );
}

function CollectionView({ env, params, setParams, print }) {
  const s = env.summary;
  return (
    <>
      <KPI>
        <SummaryMetricCard label="Total received" value={n0(s.total_received_l)} unit="L" toneName="info" />
        <SummaryMetricCard label="Cow milk" value={n0(s.cow_received_l)} unit="L" />
        <SummaryMetricCard label="Buffalo milk" value={n0(s.buffalo_received_l)} unit="L" />
        <SummaryMetricCard label="Accepted" value={n0(s.accepted_l)} unit="L" toneName="ok" />
        <SummaryMetricCard label="Rejected" value={n0(s.rejected_l)} unit="L" toneName={s.rejected_l ? 'danger' : 'ok'} />
        <SummaryMetricCard label="Tanker deliveries" value={s.deliveries} />
        <SummaryMetricCard label="Avg receiving temp" value={n1(s.avg_receiving_temp_c, 1)} unit="°C" sub="simple mean" />
      </KPI>
      <Card title="Milk received per day" icon="▥"><DailyMilkChart daily={env.charts.daily} /></Card>
      <ReportTable env={env} params={params} setParams={setParams} rowKey={r => r.delivery_id} title="Collection records" print={print} />
    </>
  );
}

function QualityView({ env, params, setParams, meta, print }) {
  const s = env.summary;
  return (
    <>
      <KPI>
        <SummaryMetricCard label="Samples" value={s.samples} toneName="info" />
        <SummaryMetricCard label="Within demo rules" value={s.within_demo_rules} toneName="ok" />
        <SummaryMetricCard label="Review required" value={s.review_required} toneName="warn" />
        <SummaryMetricCard label="Rejected" value={s.rejected} toneName="danger" />
        <SummaryMetricCard label="Not tested" value={s.not_tested_missing_record} sub="sample record missing" />
        <SummaryMetricCard label="Avg fat (simple)" value={n1(s.avg_fat_pct_simple, 2)} unit="%" info="fat" />
        <SummaryMetricCard label="Avg SNF (simple)" value={n1(s.avg_snf_pct_simple, 2)} unit="%" info="snf" />
      </KPI>
      <Card title="Quality specification (configurable)" icon="⚙" subtitle="Illustrative demo rule — verify against current applicable standards">
        <DataTable dense rows={Object.entries(meta.quality_rules).map(([k, r]) => ({ milk: k, ...r }))} rowKey={r => r.milk} columns={[
          { key: 'milk', label: 'Milk' }, { key: 'fat_min', label: 'Fat min %' }, { key: 'snf_min', label: 'SNF min %' },
          { key: 'density_min', label: 'Density kg/L', render: r => `${r.density_min} – ${r.density_max}` },
          { key: 'acidity_max', label: 'Acidity max % LA' }, { key: 'temp_max', label: 'Temp max °C' },
          { key: 'reject_acidity', label: 'Reject at acidity ≥' }, { key: 'reject_temp', label: 'Reject at temp ≥ °C' },
        ]} />
        <div style={{ marginTop: 10, fontSize: 12.5, color: THEME.textMid, lineHeight: 1.6 }}>
          {Object.entries(meta.methods).map(([k, m]) => <div key={k}><b style={{ textTransform: 'capitalize' }}>{k}:</b> {m}</div>)}
        </div>
      </Card>
      <QualityResultsTable env={env} params={params} setParams={setParams} print={print} />
    </>
  );
}

function ComparisonView({ env }) {
  const { cow, buffalo } = env.summary;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card title="Litres received" icon="⛟"><MilkComparisonChart cow={cow} buffalo={buffalo} metrics={[{ key: 'total_received_l', label: 'Received', unit: 'L' }, { key: 'accepted_l', label: 'Accepted', unit: 'L' }, { key: 'rejected_l', label: 'Rejected', unit: 'L' }]} /></Card>
        <Card title={<span>Fat &amp; SNF — volume-weighted<InfoTip id="weighted" /></span>} icon="⚗"><MilkComparisonChart cow={cow} buffalo={buffalo} metrics={[{ key: 'fat_weighted', label: 'Fat', unit: '%' }, { key: 'snf_weighted', label: 'SNF', unit: '%' }]} /></Card>
        <Card title="Received per day" icon="▥"><DailyMilkChart daily={env.charts.daily} /></Card>
      </div>
      <Card title="Comparison table" icon="⇋" pad={0}>
        <DataTable rows={env.rows} rowKey={r => r.key} columns={[
          { key: 'metric', label: 'Metric', render: r => <b>{r.metric}{r.metric.includes('fat') || r.metric.includes('Fat') ? <InfoTip id="fat" /> : r.metric.includes('SNF') ? <InfoTip id="snf" /> : r.metric.includes('density') ? <InfoTip id="density" /> : r.metric.includes('acidity') ? <InfoTip id="acidity" /> : null}</b> },
          { key: 'method', label: 'Average type', render: r => r.method === 'volume-weighted' ? <Badge toneName="info">volume-weighted</Badge> : r.method === 'simple' ? <Badge>simple</Badge> : <span style={{ color: THEME.textDim }}>{r.method}</span> },
          { key: 'unit', label: 'Unit' },
          { key: 'cow', label: 'Cow', align: 'right', render: r => fmtCell({ key: 'cow' }, r.cow) },
          { key: 'buffalo', label: 'Buffalo', align: 'right', render: r => fmtCell({ key: 'buffalo' }, r.buffalo) },
        ]} />
      </Card>
    </>
  );
}

function TanksView({ env, params, setParams, print }) {
  const [drill, setDrill] = useState(null);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!drill) return;
    setRows(null);
    getTankTransfers(drill, { ...params, page_size: 500, page: 1, sort_by: null }).then(setRows).catch(e => setRows({ error: e.message }));
  }, [drill]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <KPI>
        <SummaryMetricCard label="Tanks" value={env.summary.tanks} />
        <SummaryMetricCard label="Max balance check" value={n1(env.summary.max_abs_balance_check_l, 2)} unit="L" toneName="ok" sub="closing − (opening + in − out)" />
      </KPI>
      <Card title="Tank level history" icon="∿" subtitle="Level after every transfer — hover for litres"><TankInventoryChart history={env.charts.history} /></Card>
      <ReportTable env={env} params={params} setParams={setParams} title="Inventory by tank (click a row for its transfer events)" rowKey={r => r.tank_id + r.report_date + r.shift}
        onRowClick={print ? undefined : r => setDrill(r.tank_id)} print={print} />
      {drill && (
        <Modal title={`Transfer events — ${drill}`} subtitle="Every IN/OUT movement in the selected period" onClose={() => setDrill(null)} width={1000}>
          {!rows ? <Loading /> : rows.error ? <Callout toneName="danger">{rows.error}</Callout> : (
            <DataTable dense maxHeight="60vh" rows={rows.rows} rowKey={r => r.event_id}
              columns={rows.columns.map(c => ({ key: c.key, label: c.label + (c.unit ? ` (${c.unit})` : ''), render: r => fmtCell(c, r[c.key]) }))} />
          )}
        </Modal>
      )}
    </>
  );
}

function ProcessingView({ env, params, setParams, print }) {
  const [sel, setSel] = useState(null);
  const [det, setDet] = useState(null);
  useEffect(() => {
    if (!sel) return;
    setDet(null);
    getBatchDetail(sel, { mode: params.mode, start: params.start, end: params.end }).then(setDet).catch(e => setDet({ error: e.message }));
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = env.summary;
  const b = det?.rows?.[0];
  return (
    <>
      <KPI>
        <SummaryMetricCard label="Batches" value={s.batches} toneName="info" />
        <SummaryMetricCard label="Completed" value={s.completed} toneName="ok" />
        <SummaryMetricCard label="Review required" value={s.review_required} toneName="warn" />
        <SummaryMetricCard label="Failed demo criteria" value={s.failed_demo_criteria} toneName="danger" />
        <SummaryMetricCard label="Running / not started" value={`${s.running} / ${s.not_started}`} />
        <SummaryMetricCard label="Processed" value={n0(s.processed_l)} unit="L" />
      </KPI>
      <Callout toneName="warn" icon="⚠" title={<span>Demonstration setpoints<InfoTip id="htst" /></span>}>{env.charts.htst.note}</Callout>
      <ReportTable env={env} params={params} setParams={setParams} title="Process batches (click a batch for its temperature history)" rowKey={r => r.batch_id}
        onRowClick={print ? undefined : r => r.start && setSel(r.batch_id)} print={print} />
      {sel && (
        <Modal title={`Batch ${sel}`} subtitle={b ? `${b.product_name} · ${b.milk_type} · ${b.state}` : ''} onClose={() => setSel(null)} width={1050}>
          {!det ? <Loading /> : det.error ? <Callout toneName="danger">{det.error}</Callout> : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatusBadge value={b.state} /><Badge>{b.disposition}</Badge>
                <Badge toneName="info">Hold {b.hold_time_s ?? '—'} s</Badge><Badge>Outlet min {b.outlet_temp_min_c ?? '—'} °C</Badge>
                <Badge>Avg {b.outlet_temp_avg_c ?? '—'} °C</Badge><Badge>Homogenizer {b.homogenizer_bar ?? '—'} bar</Badge>
              </div>
              {b.temp_profile.length > 0
                ? <ProcessTemperatureChart profile={b.temp_profile} target={det.charts.target} />
                : <Callout>No temperature history yet (batch not finished).</Callout>}
              {b.deviations.length > 0 && <Callout toneName="warn" icon="⚠" title="Deviations">{b.deviations.map(d => <div key={d}>{d}</div>)}</Callout>}
              <Card title="Batch event timeline" icon="⏱" pad={12}>
                {b.events.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '5px 0', fontSize: 13.5, borderTop: i ? '1px solid #EEF1F3' : 'none' }}>
                    <span style={{ fontFamily: FONT_MONO, color: THEME.textMid, minWidth: 140 }}>{e.time.replace('T', ' ')}</span><span>{e.text}</span>
                  </div>
                ))}
              </Card>
              <div style={{ fontSize: 13, color: THEME.textMid }}>Source lots: {b.source_lots.map(l => `${l.lot} (${Math.round(l.litres).toLocaleString()} L from ${l.tank})`).join(' · ') || '—'}</div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function PackagingView({ env, params, setParams, print }) {
  const s = env.summary;
  return (
    <>
      <KPI>
        <SummaryMetricCard label="Planned units" value={n0(s.planned_units)} />
        <SummaryMetricCard label="Produced units" value={n0(s.produced_units)} toneName="info" sub="accepted + rejected" />
        <SummaryMetricCard label="Accepted packs" value={n0(s.accepted_packs)} toneName="ok" />
        <SummaryMetricCard label="Rejected packs" value={n0(s.rejected_packs)} toneName="danger" />
        <SummaryMetricCard label="Finished volume" value={n0(s.finished_volume_l)} unit="L" sub={Object.entries(s.by_pack_size).map(([k, v]) => `${k} mL: ${n0(v.finished_volume_l)} L`).join(' · ')} />
        <SummaryMetricCard label="Downtime" value={n1(s.downtime_min)} unit="min" toneName="warn" />
      </KPI>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16 }}>
        <Card title={`Output per ${env.charts.output_bucket}`} icon="▥"><ProductionTrendChart output={env.charts.output} bucket={env.charts.output_bucket} /></Card>
        <Card title="Production by shift" icon="◔"><BarChart data={env.charts.by_shift} keys={[{ key: 'packs', label: 'Accepted packs', color: SERIES.Cow }]} unit="packs" /></Card>
      </div>
      <ReportTable env={env} params={params} setParams={setParams} title="Packaging records" rowKey={r => r.fg_batch_id} print={print} />
    </>
  );
}

function CipView({ env, params, setParams, print }) {
  const [sel, setSel] = useState(null);
  const s = env.summary;
  return (
    <>
      <KPI>
        <SummaryMetricCard label="Cycles" value={s.cycles} toneName="info" info="cip" />
        <SummaryMetricCard label="Completed" value={s.completed} toneName="ok" />
        <SummaryMetricCard label="Incomplete" value={s.incomplete} toneName="warn" />
        <SummaryMetricCard label="Failed demo criteria" value={s.failed_demo_criteria} toneName="danger" />
        <SummaryMetricCard label="Avg duration" value={n1(s.avg_duration_min)} unit="min" />
      </KPI>
      <Callout toneName="info" title="Demo completion criteria (not dosing instructions)">
        {env.charts.criteria.phases.map(([p, m, t]) => `${p}: ≥ ${m} min${t ? `, supply ≥ ${t} °C` : ''}`).join(' · ')} · flow ≥ {env.charts.criteria.min_flow_m3h} m³/h ·
        final rinse ≤ {env.charts.criteria.final_rinse_max_conductivity_ms_cm} mS/cm.
      </Callout>
      <ReportTable env={env} params={params} setParams={setParams} title="CIP cycles (click for phases)" rowKey={r => r.cycle_id} onRowClick={print ? undefined : setSel} print={print} />
      {sel && (
        <Modal title={`CIP ${sel.cycle_id} — ${sel.circuit_name}`} subtitle={`${sel.start.replace('T', ' ')} · ${sel.duration_min} min · ${sel.completion_status}`} onClose={() => setSel(null)} width={1000}>
          <DataTable dense rows={sel.phases} rowKey={r => r.phase} columns={[
            { key: 'phase', label: 'Phase', render: r => <b>{r.phase}</b> }, { key: 'minutes', label: 'Min' },
            { key: 'supply_temp_c', label: 'Supply °C' }, { key: 'return_temp_c', label: 'Return °C' }, { key: 'flow_m3h', label: 'Flow m³/h' },
            { key: 'pressure_bar', label: 'bar' }, { key: 'conductivity_ms_cm', label: 'Cond. mS/cm', render: r => r.conductivity_ms_cm ?? '—' },
            { key: 'ok', label: 'Result', render: r => <StatusBadge value={r.ok ? 'OK' : 'FAILED'} /> }, { key: 'note', label: 'Note', render: r => r.note || '—' },
          ]} />
        </Modal>
      )}
    </>
  );
}

function EquipmentView({ env, params, setParams, print }) {
  const s = env.summary;
  const data = env.charts.by_equipment.map(r => ({ x: r.x, run: r.run, fault: r.fault, planned: Math.max(0, r.down - r.fault) }));
  return (
    <>
      <KPI>
        <SummaryMetricCard label="Runtime" value={n0(s.runtime_min)} unit="min" toneName="ok" />
        <SummaryMetricCard label="Downtime" value={n0(s.downtime_min)} unit="min" toneName="warn" />
        <SummaryMetricCard label="Fault time" value={n0(s.fault_min)} unit="min" toneName="danger" />
        <SummaryMetricCard label="Alarms" value={s.alarm_count} />
      </KPI>
      <Card title="Runtime, fault and planned downtime by equipment" icon="⚙">
        <BarChart data={data} stacked unit="min" keys={[{ key: 'run', label: 'Run', color: SERIES.Buffalo }, { key: 'fault', label: 'Fault', color: SERIES['RT-01'] }, { key: 'planned', label: 'Planned down', color: SERIES['ST-PM-01'] }]} />
      </Card>
      <ReportTable env={env} params={params} setParams={setParams} title="Runtime by equipment and shift" rowKey={r => r.equipment_id + r.report_date + r.shift} print={print} />
    </>
  );
}

function AlarmsView({ env, params, setParams, print }) {
  const s = env.summary;
  return (
    <>
      <KPI>
        <SummaryMetricCard label="Events" value={s.events} toneName="info" />
        <SummaryMetricCard label="Critical" value={s.critical} toneName="danger" />
        <SummaryMetricCard label="Fault" value={s.fault} toneName="danger" />
        <SummaryMetricCard label="Warning" value={s.warning} toneName="warn" />
        <SummaryMetricCard label="Open" value={s.open} toneName={s.open ? 'warn' : 'ok'} />
        <SummaryMetricCard label="Mean time to ack" value={n1(s.mean_time_to_ack_min)} unit="min" />
      </KPI>
      <Card title="Alarm timeline" icon="⚠" subtitle="Events per day by severity"><AlarmTimeline daily={env.charts.daily} /></Card>
      <ReportTable env={env} params={params} setParams={setParams} title="Alarm & event history" rowKey={r => r.event_id} print={print} />
    </>
  );
}

function ReconciliationView({ env }) {
  const days = env.charts.daily;
  return (
    <>
      <ReconciliationPanel rec={env.summary} />
      <Card title="Balance equation" icon="Σ">
        <div style={{ fontFamily: FONT_MONO, fontSize: 13, lineHeight: 1.8, color: THEME.textMid }}>{env.charts.equation.map(t => <div key={t}>{t}</div>)}</div>
      </Card>
      <Card title="Daily unexplained difference" icon="▥">
        <BarChart data={days.map(d => ({ x: d.report_date, unexplained: Math.max(0, d.unexplained_l) }))} keys={[{ key: 'unexplained', label: 'Unexplained', color: SERIES['RT-01'] }]} unit="L" height={180}
          xLabel={d => d.x.slice(5)} />
        <DataTable dense rows={days} rowKey={r => r.report_date} maxHeight="320px" columns={[
          { key: 'report_date', label: 'Date' },
          { key: 'r', label: 'Received L', align: 'right', render: r => n0(r['Milk received (gross)']) },
          { key: 'f', label: 'Finished L', align: 'right', render: r => n0(r['Finished-product volume (accepted packs)']) },
          { key: 'o', label: 'Opening L', align: 'right', render: r => n0(r['Opening inventory (all tanks + in-process)']) },
          { key: 'c', label: 'Closing L', align: 'right', render: r => n0(r['Closing inventory (all tanks + in-process)']) },
          { key: 'unexplained_l', label: 'Unexplained L', align: 'right', render: r => <b>{n1(r.unexplained_l)}</b> },
        ]} />
      </Card>
    </>
  );
}

function TraceView({ params, traceId, setTraceId }) {
  const [input, setInput] = useState(traceId || '');
  const [env, setEnv] = useState(null);
  const [err, setErr] = useState(null);
  const [examples, setExamples] = useState([]);
  useEffect(() => {
    getReport('packaging', { mode: params.mode, start: params.end, end: params.end, page_size: 3 })
      .then(r => setExamples([...new Set(r.rows.flatMap(x => [x.fg_batch_id, x.batch_id]))].slice(0, 4))).catch(() => {});
  }, [params.mode, params.end]);
  useEffect(() => {
    if (!traceId) { setEnv(null); return; }
    setErr(null); setEnv(null);
    getTrace(traceId, { mode: params.mode, start: params.start, end: params.end }).then(setEnv).catch(e => setErr(e.message));
  }, [traceId, params.mode, params.start, params.end]);
  return (
    <>
      <Card title="Find a batch" icon="⌕" subtitle="Batch ID, sample ID, delivery, finished-product batch, tank or collection centre / supplier">
        <form onSubmit={e => { e.preventDefault(); setTraceId(input.trim()); }} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. PB-250819-02, FG-250819-01-03, RB-250818-04, ST-COW-01, CC-02" style={{ flex: 1, minWidth: 260 }} mono />
          <Button variant="primary" icon="⛓">Trace</Button>
        </form>
        {examples.length > 0 && <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 13, color: THEME.textMid, alignItems: 'center' }}>
          Try: {examples.map(x => <button key={x} onClick={() => { setInput(x); setTraceId(x); }} style={{ border: '1px solid #DCE2E7', background: '#FFFFFF', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 12.5 }}>{x}</button>)}
        </div>}
      </Card>
      {err && <ErrorBox error={err} />}
      {traceId && !env && !err && <Loading />}
      {env && (
        <>
          <Badge toneName="info">{env.summary.kind}: {env.summary.query}</Badge>
          {env.charts.candidates.length > 0 && (
            <Card title="Matching raw-milk batches" icon="☷" subtitle="Pick one to trace">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {env.charts.candidates.map(c => <button key={c} onClick={() => { setInput(c); setTraceId(c); }} style={{ border: '1px solid #DCE2E7', background: '#FFFFFF', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 12.5 }}>{c}</button>)}
              </div>
            </Card>
          )}
          {env.charts.upstream.length > 0 && (
            <Card title="Upstream — raw-milk lots in this batch (FIFO draw)" icon="⇡" pad={0}>
              <DataTable dense rows={env.charts.upstream} rowKey={r => r.lot} columns={[
                { key: 'lot', label: 'Lot', render: r => <button onClick={() => { setInput(r.lot); setTraceId(r.lot); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: FONT_MONO, color: THEME.accentDark, fontWeight: 700 }}>{r.lot}</button> },
                { key: 'litres', label: 'Litres', align: 'right', render: r => n0(r.litres) }, { key: 'tank', label: 'From tank' },
                { key: 'src', label: 'Origin', render: r => { const c = r.nodes[0]; return c.status === 'missing' ? <Badge toneName="danger">Missing link</Badge> : `${c.id} · ${r.nodes[1]?.id || ''}`; } },
              ]} />
            </Card>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
            {env.rows.map(ch => <BatchTraceabilityTimeline key={ch.title} chain={ch} onOpen={id => { if (/^(RB|PB|FG|DLV|SMP)-/.test(id)) { setInput(id); setTraceId(id); } }} />)}
          </div>
        </>
      )}
    </>
  );
}

const VIEWS = {
  summary: SummaryView, collection: CollectionView, quality: QualityView, 'milk-comparison': ComparisonView,
  tanks: TanksView, processing: ProcessingView, packaging: PackagingView, cip: CipView,
  'equipment-runtime': EquipmentView, alarms: AlarmsView, reconciliation: ReconciliationView,
};

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Print / preview document ─────────────────────────────────────────────────
function PrintDocument({ report, env, meta, params, onClose, autoPrint }) {
  const View = VIEWS[report];
  useEffect(() => {
    if (!autoPrint || !env) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoPrint, env]);
  return createPortal(
    <div className="report-print-overlay" style={{ position: 'fixed', inset: 0, zIndex: 400, overflowY: 'auto', background: '#5B6570', padding: '24px 0' }}>
      <style>{`@media print {
        #root { display: none !important; }
        .report-print-overlay { position: static !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
        .report-print-paper { box-shadow: none !important; margin: 0 !important; width: auto !important; }
        .no-print { display: none !important; }
        .print-watermark { position: fixed !important; }
        @page { size: A4 landscape; margin: 12mm; }
      }`}</style>
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
        <Button variant="primary" icon="⎙" onClick={() => window.print()}>Print / save as PDF</Button>
        <Button onClick={onClose}>Close preview</Button>
      </div>
      <div className="report-print-paper" style={{ position: 'relative', width: 1120, maxWidth: '96vw', margin: '0 auto', background: '#FFFFFF', boxShadow: '0 10px 40px rgba(0,0,0,0.35)', padding: 32 }}>
        <div className="print-watermark" aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <div style={{ transform: 'rotate(-24deg)', fontFamily: FONT_COND, fontSize: 130, fontWeight: 700, color: 'rgba(197,48,48,0.07)', whiteSpace: 'nowrap' }}>DEMO DATA</div>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `3px solid ${THEME.text}`, paddingBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, color: THEME.textMid }}>{meta.plant}</div>
              <div style={{ fontFamily: FONT_COND, fontSize: 30, fontWeight: 700 }}>{env?.title}</div>
              <div style={{ fontSize: 12.5, color: THEME.textMid }}>Period {params.start} → {params.end} · {params.shift || 'All shifts'} · mode {params.mode}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12.5, color: THEME.textMid }}>
              <div style={{ fontFamily: FONT_MONO, color: THEME.text }}>{env?.report_id}</div>
              <div>Generated {env?.generated_at.replace('T', ' ')}</div>
              <div>Filters: {Object.entries(env?.filters || {}).map(([k, v]) => `${k}=${v}`).join(', ')}</div>
            </div>
          </div>
          <DemoBanner notice={meta.demo_notice} />
          {!env ? <Loading /> : View ? <View env={env} params={params} setParams={() => {}} meta={meta} print /> : null}
          {env && <Notes notes={env.notes} />}
          <div style={{ fontSize: 11.5, color: THEME.textDim, borderTop: '1px solid #DCE2E7', paddingTop: 8 }}>{meta.demo_notice} · {env?.report_id} · Page numbers are added in the PDF export.</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [mode, setMode] = useState('seeded');
  const [meta, setMeta] = useState(null);
  const [metaErr, setMetaErr] = useState(null);
  const [report, setReport] = useState('summary');
  const [params, setParams] = useState(null);
  const [env, setEnv] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [traceId, setTraceId] = useState('');
  const [preview, setPreview] = useState(null);   // { env, autoPrint }
  const [glossary, setGlossary] = useState(false);

  const loadMeta = useCallback(() => {
    setMetaErr(null);
    getMeta(mode).then(m => {
      setMeta(m);
      setParams(p => {
        const end = m.window.end;
        const keep = p && p.start >= m.window.start && p.end <= end;
        return keep ? { ...p, mode } : { mode, start: end, end, shift: null, milk_type: null, batch: null, center: null, equipment: null, status: null, q: null, page: 1, page_size: 50, sort_by: null, sort_dir: 'asc' };
      });
    }).catch(e => setMetaErr(e.message));
  }, [mode]);
  useEffect(loadMeta, [loadMeta]);

  const load = useCallback(() => {
    if (!params || report === 'traceability') return;
    setLoading(true); setErr(null);
    getReport(report, params).then(e => { setEnv(e); setLoading(false); }).catch(e => { setErr(e.message); setLoading(false); });
  }, [report, params]);
  useEffect(load, [load]);

  const pick = id => {
    setReport(id); setEnv(null);
    setParams(p => ({ ...p, page: 1, sort_by: null, status: null, q: null, ...(id === 'summary' ? { start: p.end } : {}) }));
  };

  const openPreview = async autoPrint => {
    if (report === 'traceability') { window.print(); return; }
    setPreview({ env: null, autoPrint });
    try {
      const full = await getReport(report, { ...params, page: 1, page_size: 10000 });
      setPreview({ env: full, autoPrint });
    } catch (e) { setPreview(null); setErr(e.message); }
  };

  const View = VIEWS[report];
  const title = REPORTS.find(r => r.id === report)?.label;

  if (metaErr) return <Page crumbs={['Reports']} title="Dairy Reports"><ErrorBox error={metaErr} onRetry={loadMeta} /></Page>;
  if (!meta || !params) return <Page crumbs={['Reports']} title="Dairy Reports"><Loading /></Page>;

  const quick = n => setParams(p => ({ ...p, start: addDays(meta.window.end, -(n - 1)) < meta.window.start ? meta.window.start : addDays(meta.window.end, -(n - 1)), end: meta.window.end, page: 1 }));

  return (
    <Page crumbs={['Dairy', 'Reports']} title={title}
      subtitle={`${meta.plant} · demo window ${meta.window.start} → ${meta.window.end}${meta.simulation_clock ? ` · simulation clock ${meta.simulation_clock.replace('T', ' ')}` : ''}`}
      width={1500}
      actions={(
        <>
          <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'seeded', label: 'Seeded demo' }, { value: 'dynamic', label: 'Dynamic sim' }]} />
          <ReportExportMenu report={report} params={params} traceId={traceId} preview={!!preview} onPreview={() => (preview ? setPreview(null) : openPreview(false))} onPrint={() => openPreview(true)} />
        </>
      )}>
      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <Card pad={8} style={{ position: 'sticky', top: 0 }}>
          {REPORTS.map((r, i) => (
            <button key={r.id} onClick={() => pick(r.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
              background: report === r.id ? THEME.accentSoft : 'transparent', color: report === r.id ? THEME.accentDark : THEME.text, fontWeight: report === r.id ? 700 : 600, fontSize: 13.5,
            }}>
              <span style={{ width: 22, textAlign: 'center', color: THEME.textMid }}>{r.icon}</span>
              <span style={{ fontSize: 11, color: THEME.textDim, minWidth: 16 }}>{i + 1}</span>{r.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid #EEF1F3', margin: '8px 0 4px' }} />
          <button onClick={() => setGlossary(true)} style={{ width: '100%', padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: THEME.accentDark, fontWeight: 700, fontSize: 13.5 }}>ⓘ Dairy terms & units</button>
        </Card>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Watermark />
          <DemoBanner notice={meta.demo_notice} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
            <span style={{ fontSize: 12.5, color: THEME.textMid, fontWeight: 700 }}>Quick range:</span>
            {[1, 7, 14, 30].map(n => <Button key={n} size="sm" variant="ghost" onClick={() => quick(n)}>{n === 1 ? 'Last day' : `Last ${n} days`}</Button>)}
          </div>
          <div style={{ position: 'relative' }}><ReportFilters meta={meta} report={report} params={params} setParams={setParams} show={FILTERS[report]} /></div>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {report === 'traceability'
              ? <TraceView params={params} traceId={traceId} setTraceId={setTraceId} />
              : err ? <ErrorBox error={err} onRetry={load} />
                : !env || loading && !env ? <Loading />
                  : (
                    <>
                      {loading && <div style={{ fontSize: 12.5, color: THEME.textDim }}>Updating…</div>}
                      <View env={env} params={params} setParams={setParams} meta={meta} />
                      <Notes notes={env.notes} />
                      <div style={{ fontSize: 12, color: THEME.textDim }}>Report {env.report_id} · generated {env.generated_at.replace('T', ' ')} · {meta.demo_notice}</div>
                    </>
                  )}
          </div>
        </div>
      </div>

      {preview && <PrintDocument report={report} env={preview.env} meta={meta} params={params} autoPrint={preview.autoPrint} onClose={() => setPreview(null)} />}
      {glossary && (
        <Modal title="Dairy terms & units" subtitle="How each measurement in these reports is defined" onClose={() => setGlossary(false)} width={760}>
          {Object.entries(GLOSSARY).map(([k, g]) => (
            <div key={k} style={{ padding: '8px 0', borderTop: '1px solid #EEF1F3' }}>
              <div style={{ fontWeight: 800, color: THEME.text }}>{g.term}</div>
              <div style={{ fontSize: 13.5, color: THEME.textMid, lineHeight: 1.5 }}>{g.text}</div>
            </div>
          ))}
          <Callout toneName="warn" icon="⚠">{meta.demo_notice}. Thresholds and process criteria are illustrative demo rules — verify against current applicable standards.</Callout>
        </Modal>
      )}
    </Page>
  );
}
