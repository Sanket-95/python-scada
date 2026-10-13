import { useEffect, useRef, useState } from 'react';
import { THEME, FONT_COND, FONT_MONO } from '../theme';
import { Card, Button, Badge, Input, Select, Segmented, Field, EmptyState, Callout } from '../ui/kit';
import { exportReport } from './api';

// ── Dairy terms (info tooltips + glossary) ───────────────────────────────────
export const GLOSSARY = {
  fat: { term: 'Fat (%)', text: 'Share of the milk made up of milk fat. Fat contributes to energy and composition, drives cream separation and is part of many product specifications.' },
  snf: { term: 'SNF (%)', text: 'Solids-not-fat: the non-fat milk solids — mainly protein, lactose and minerals.' },
  density: { term: 'Density (kg/L)', text: 'Mass divided by volume, reported here at 20 °C. It changes with composition and temperature, and is a different measurement from fat % or CLR.' },
  clr: { term: 'CLR', text: 'Corrected lactometer reading. Lactometer readings relate to milk density; the corrected value depends on the instrument scale, the reference temperature and the correction method. Demo convention: CLR = (ρ at 27 °C − 1.000) × 1000.' },
  acidity: { term: 'Acidity (% LA)', text: 'Titratable acidity: how much alkali is needed to neutralise the acids in a sample under a defined method, expressed as % lactic-acid equivalent. It is not the same as pH.' },
  protein: { term: 'Protein (%)', text: 'Separately simulated measurement — shown only for samples where it was measured; otherwise "Not tested".' },
  lactose: { term: 'Lactose (%)', text: 'Separately simulated measurement — shown only for samples where it was measured; otherwise "Not tested".' },
  screening: { term: 'Screening status', text: 'Adulteration screening outcome: Not simulated, Pending, Screening pass or Screening review. A pass does not prove milk is free from every adulterant.' },
  weighted: { term: 'Volume-weighted average', text: 'Each sample result is weighted by the litres of accepted milk it represents, so the average describes the overall volume. A simple average weights every sample equally.' },
  htst: { term: 'HTST (demo)', text: 'High-temperature short-time pasteurization. Demo setpoint 72 °C for at least 15 s — illustrative only, not an instruction for operating real equipment.' },
  cip: { term: 'CIP', text: 'Clean-in-place: automated cleaning of tanks and lines through pre-rinse, cleaning-solution circulation, rinses and sanitization. Completion is judged on configured demo criteria.' },
};

export function InfoTip({ id }) {
  const [open, setOpen] = useState(false);
  const g = GLOSSARY[id];
  if (!g) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span tabIndex={0} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} aria-label={`About ${g.term}`}
        style={{ width: 15, height: 15, borderRadius: '50%', marginLeft: 5, fontSize: 10, fontWeight: 800, cursor: 'help',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: THEME.accentSoft, color: THEME.accentDark }}>i</span>
      {open && (
        <span style={{ position: 'absolute', top: 20, left: -10, zIndex: 50, width: 280, padding: '10px 12px', borderRadius: 10,
          background: THEME.frame, color: '#E6EDF3', fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, textTransform: 'none', letterSpacing: 0,
          boxShadow: '0 10px 24px rgba(0,0,0,0.3)', whiteSpace: 'normal' }}>
          <b style={{ display: 'block', marginBottom: 3, color: '#FFFFFF' }}>{g.term}</b>{g.text}
        </span>
      )}
    </span>
  );
}

// ── Demo notice / watermark ──────────────────────────────────────────────────
export function DemoBanner({ notice }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 12, background: '#FFF4D6', border: '1px solid #F5DE9C', color: '#7A5600', fontWeight: 800, fontSize: 13, letterSpacing: 0.4 }}>
      <span style={{ fontSize: 16 }}>⚠</span>{notice}
    </div>
  );
}

export function Watermark() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%) rotate(-24deg)', fontFamily: FONT_COND,
        fontSize: 120, fontWeight: 700, color: 'rgba(14,124,134,0.05)', whiteSpace: 'nowrap', letterSpacing: 8 }}>DEMO DATA</div>
    </div>
  );
}

// ── Metric card ──────────────────────────────────────────────────────────────
export function SummaryMetricCard({ label, value, unit, sub, toneName = 'neutral', info }) {
  const color = { ok: THEME.ok, warn: THEME.warn, danger: THEME.danger, info: THEME.accentDark }[toneName] || THEME.text;
  return (
    <div style={{ background: THEME.panel, borderRadius: 14, border: '1px solid #E1E6EA', padding: '12px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.9, color: THEME.textDim, textTransform: 'uppercase' }}>
        {label}{info && <InfoTip id={info} />}
      </div>
      <div style={{ fontFamily: FONT_COND, fontSize: 28, fontWeight: 700, color, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
        {value == null ? <span style={{ color: THEME.textDim, fontSize: 20 }}>Unavailable</span> : value}
        {value != null && unit && <span style={{ fontSize: 15, color: THEME.textMid, marginLeft: 4 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: THEME.textDim }}>{sub}</div>}
    </div>
  );
}

export const n0 = v => (v == null ? null : Math.round(v).toLocaleString());
export const n1 = (v, d = 1) => (v == null ? null : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));

// ── Status badges ────────────────────────────────────────────────────────────
const STATUS_TONE = [
  [/^(Within demo rules|COMPLETED|Released|Normal|OK|Acknowledged|Resolved|Screening pass)/, 'ok'],
  [/^(RUNNING)/, 'info'],
  [/^(FAULT)$/, 'violet'],
  [/^(Rejected|FAILED|Blocked|CRITICAL|Fault)/, 'danger'],
  [/^(Review|REVIEW|On hold|Partially|INCOMPLETE|High|Low|WARNING|Pending|Planned|Unacknowledged|Screening review)/, 'warn'],
];
export function StatusBadge({ value }) {
  if (value == null) return <span style={{ color: THEME.textDim }}>—</span>;
  const tone = STATUS_TONE.find(([re]) => re.test(value))?.[1] || 'neutral';
  return <Badge toneName={tone} dot>{value}</Badge>;
}

const NOT_TESTED = new Set(['fat_pct', 'snf_pct', 'density_kg_l', 'clr', 'protein_pct', 'lactose_pct', 'acidity_pct_la']);

export function fmtCell(col, v) {
  if (v == null) {
    if (NOT_TESTED.has(col.key)) return <span style={{ color: THEME.textDim, fontStyle: 'italic' }}>Not tested</span>;
    return <span style={{ color: THEME.textDim }}>—</span>;
  }
  if (col.kind === 'status') return <StatusBadge value={v} />;
  if (col.kind === 'datetime' && typeof v === 'string') return <span style={{ whiteSpace: 'nowrap' }}>{v.slice(5, 16).replace('T', ' ')}</span>;
  if (Array.isArray(v)) return v.length ? <span title={v.join('\n')}>{v.length > 2 ? `${v.slice(0, 2).join(', ')} +${v.length - 2}` : v.join(', ')}</span> : <span style={{ color: THEME.textDim }}>—</span>;
  if (typeof v === 'number') {
    const digits = col.unit === 'L' ? 1 : 4;           // litres shown to 0.1 L (stored at mL precision)
    return <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: digits })}</span>;
  }
  if (/^(DLV|RB|SMP|PB|FG|CIP|ALM|TRF|DSP|SUP|TKR|ST|RT|CC)-/.test(String(v))) return <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, whiteSpace: 'nowrap' }}>{v}</span>;
  return String(v);
}

// ── Report table: server-side sort + pagination, column visibility ──────────
export function ReportTable({ env, params, setParams, onRowClick, rowKey = r => JSON.stringify(r).slice(0, 80), maxHeight = 'calc(100vh - 470px)', title = 'Records', print }) {
  const cols0 = env?.columns || [];
  const [hidden, setHidden] = useState(() => new Set(cols0.filter(c => c.hidden).map(c => c.key)));
  const [menu, setMenu] = useState(false);
  useEffect(() => { setHidden(new Set((env?.columns || []).filter(c => c.hidden).map(c => c.key))); }, [env?.report]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!env) return null;
  const cols = cols0.filter(c => print || !hidden.has(c.key));
  const pag = env.pagination;
  const sortBy = key => setParams(p => ({ ...p, sort_by: key, sort_dir: p.sort_by === key && p.sort_dir === 'asc' ? 'desc' : 'asc', page: 1 }));
  return (
    <Card pad={0} title={title} subtitle={pag ? `${pag.total.toLocaleString()} records` : `${env.rows.length} rows`} icon="☷"
      actions={!print && (
        <div style={{ position: 'relative' }}>
          <Button size="sm" icon="▥" onClick={() => setMenu(m => !m)}>Columns</Button>
          {menu && (
            <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 30, width: 240, maxHeight: 340, overflowY: 'auto', background: '#FFFFFF', border: '1px solid #DCE2E7', borderRadius: 12, boxShadow: '0 12px 28px rgba(16,24,40,0.15)', padding: 8 }}>
              {cols0.map(c => (
                <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => setHidden(h => { const n = new Set(h); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} />
                  {c.label}{c.unit ? ` (${c.unit})` : ''}
                </label>
              ))}
            </div>
          )}
        </div>
      )}>
      <div data-print-expand style={{ overflow: 'auto', maxHeight: print ? 'none' : maxHeight }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: print ? 10.5 : 13 }}>
          <thead>
            <tr>
              {cols.map(c => {
                const active = params.sort_by === c.key;
                return (
                  <th key={c.key} onClick={() => !print && setParams && sortBy(c.key)} style={{
                    position: 'sticky', top: 0, zIndex: 1, background: '#F4F6F8', textAlign: 'left', padding: print ? '6px 6px' : '9px 12px', cursor: print ? 'default' : 'pointer',
                    fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: active ? THEME.accentDark : THEME.textDim,
                    borderBottom: '1px solid #E1E6EA', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {c.label}{c.unit && <span style={{ textTransform: 'none', marginLeft: 3 }}>({c.unit})</span>}
                      {c.info && <InfoTip id={c.info} />}
                      {active && <span style={{ marginLeft: 4 }}>{params.sort_dir === 'asc' ? '▲' : '▼'}</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {env.rows.length === 0 && (
              <tr><td colSpan={cols.length}><EmptyState icon="∅" title="No records for these filters" text="Widen the date range or clear a filter." /></td></tr>
            )}
            {env.rows.map((r, i) => (
              <tr key={rowKey(r) + i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{ cursor: onRowClick ? 'pointer' : 'default', background: i % 2 ? '#FAFBFC' : '#FFFFFF' }}
                onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = THEME.accentSoft; }}
                onMouseLeave={e => { e.currentTarget.style.background = i % 2 ? '#FAFBFC' : '#FFFFFF'; }}>
                {cols.map(c => <td key={c.key} style={{ padding: print ? '4px 6px' : '8px 12px', borderBottom: '1px solid #EEF1F3', verticalAlign: 'middle' }}>{fmtCell(c, r[c.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pag && !print && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid #EEF1F3', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: THEME.textMid }}>
            {pag.total ? `${((pag.page - 1) * pag.page_size + 1).toLocaleString()}–${Math.min(pag.page * pag.page_size, pag.total).toLocaleString()} of ${pag.total.toLocaleString()}` : '0 records'}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: THEME.textMid }}>Rows</span>
          <Select value={params.page_size} onChange={e => setParams(p => ({ ...p, page_size: +e.target.value, page: 1 }))} options={[25, 50, 100, 250]} style={{ width: 80, height: 32 }} />
          <Button size="sm" disabled={pag.page <= 1} onClick={() => setParams(p => ({ ...p, page: pag.page - 1 }))}>‹ Prev</Button>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{pag.page} / {pag.pages}</span>
          <Button size="sm" disabled={pag.page >= pag.pages} onClick={() => setParams(p => ({ ...p, page: pag.page + 1 }))}>Next ›</Button>
        </div>
      )}
    </Card>
  );
}

export function QualityResultsTable(props) {
  return <ReportTable title="Laboratory results" rowKey={r => r.sample_id} {...props} />;
}

// ── Filters ──────────────────────────────────────────────────────────────────
function SearchablePick({ label, value, onChange, options, placeholder, listId }) {
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value]);
  return (
    <Field label={label}>
      <Input list={listId} value={text} placeholder={placeholder}
        onChange={e => setText(e.target.value)}
        onBlur={() => { const hit = options.find(o => o.id === text || `${o.id} · ${o.name}` === text); onChange(hit ? hit.id : text.trim() || null); }}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
      <datalist id={listId}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</datalist>
    </Field>
  );
}

export function ReportFilters({ meta, report, params, setParams, show = {} }) {
  const set = patch => setParams(p => ({ ...p, ...patch, page: 1 }));
  const [q, setQ] = useState(params.q || '');
  const t = useRef(null);
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(() => { if ((params.q || '') !== q) set({ q: q || null }); }, 350); return () => clearTimeout(t.current); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!meta) return null;
  const statuses = meta.statuses[report] || [];
  const minD = meta.window.start, maxD = meta.window.end;
  const people = [...meta.centers.map(c => ({ id: c.id, name: c.name })), ...meta.suppliers.map(s => ({ id: s.id, name: s.name }))];
  return (
    <Card pad={14}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, alignItems: 'end' }}>
        <Field label="Start date"><Input type="date" min={minD} max={maxD} value={params.start} onChange={e => e.target.value && set({ start: e.target.value, end: params.end < e.target.value ? e.target.value : params.end })} /></Field>
        <Field label="End date"><Input type="date" min={params.start} max={maxD} value={params.end} onChange={e => e.target.value && set({ end: e.target.value })} /></Field>
        {show.shift !== false && <Field label="Shift"><Select value={params.shift || ''} onChange={e => set({ shift: e.target.value || null })} options={[{ value: '', label: 'All shifts' }, ...meta.shifts]} /></Field>}
        {show.milk && <Field label="Milk type"><Segmented size="sm" value={params.milk_type || 'All'} onChange={v => set({ milk_type: v === 'All' ? null : v })} options={meta.milk_types} /></Field>}
        {show.batch && <Field label="Batch / sample"><Input value={params.batch || ''} placeholder="e.g. RB-250819-03" onChange={e => set({ batch: e.target.value.trim() || null })} /></Field>}
        {show.center && <SearchablePick label="Supplier / centre" listId="dl-centre" value={params.center} placeholder="All" options={people} onChange={v => set({ center: v })} />}
        {show.equipment && <SearchablePick label="Equipment" listId="dl-eq" value={params.equipment} placeholder="All" options={meta.equipment} onChange={v => set({ equipment: v })} />}
        {statuses.length > 0 && <Field label="Status"><Select value={params.status || ''} onChange={e => set({ status: e.target.value || null })} options={[{ value: '', label: 'Any status' }, ...statuses]} /></Field>}
        {show.search !== false && <Field label="Search"><Input value={q} placeholder="Text in any column" onChange={e => setQ(e.target.value)} /></Field>}
      </div>
    </Card>
  );
}

// ── Export menu ──────────────────────────────────────────────────────────────
export function ReportExportMenu({ report, params, traceId, onPrint, onPreview, preview }) {
  const [err, setErr] = useState(null);
  const go = fmt => {
    setErr(null);
    if (report === 'traceability' && !traceId) { setErr('Trace a batch first'); return; }
    exportReport(report, fmt, params, traceId).catch(e => setErr(e.message));
  };
  return (
    <>
      <Button size="sm" icon="⬇" onClick={() => go('csv')}>CSV</Button>
      <Button size="sm" icon="⬇" onClick={() => go('pdf')}>PDF</Button>
      <Button size="sm" variant={preview ? 'dark' : 'secondary'} icon="◫" onClick={onPreview}>{preview ? 'Close preview' : 'Preview'}</Button>
      <Button size="sm" icon="⎙" onClick={onPrint}>Print</Button>
      {err && <span style={{ fontSize: 12.5, color: '#C53030', fontWeight: 700 }}>{err}</span>}
    </>
  );
}

// ── Reconciliation ───────────────────────────────────────────────────────────
export function ReconciliationPanel({ rec, compact }) {
  if (!rec) return null;
  const u = rec.unexplained_l;
  return (
    <Card title="Volume & mass balance" icon="⚖" subtitle={`Opening ${rec.opening_ts.replace('T', ' ')} → closing ${rec.closing_ts.replace('T', ' ')}`}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr style={{ color: THEME.textDim, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            <th style={{ textAlign: 'left', padding: '6px 4px' }}>Term</th><th style={{ textAlign: 'right' }}>Volume (L)</th>
            {!compact && <th style={{ textAlign: 'right' }}>Mass (kg, ρ assumed)</th>}
          </tr>
        </thead>
        <tbody>
          {rec.terms.map(t => (
            <tr key={t.term} style={{ borderTop: '1px solid #EEF1F3' }}>
              <td style={{ padding: '7px 4px' }}><b style={{ color: t.sign === '+' ? THEME.ok : THEME.textMid, marginRight: 6 }}>{t.sign}</b>{t.term}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.volume_l.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              {!compact && <td style={{ textAlign: 'right', color: THEME.textMid, fontVariantNumeric: 'tabular-nums' }}>{t.mass_kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>}
            </tr>
          ))}
          <tr style={{ borderTop: `2px solid ${THEME.text}` }}>
            <td style={{ padding: '9px 4px', fontWeight: 800 }}>= Unexplained difference (not adjusted)</td>
            <td style={{ textAlign: 'right', fontWeight: 800, color: Math.abs(u) > 0.5 ? THEME.warn : THEME.ok }}>{u.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
            {!compact && <td style={{ textAlign: 'right', fontWeight: 700, color: THEME.textMid }}>{rec.unexplained_kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>}
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 10, fontSize: 12.5, color: THEME.textMid }}>
        {rec.unexplained_pct_of_received != null && <>Unexplained = <b>{rec.unexplained_pct_of_received} %</b> of milk received. </>}
        Mass uses an assumed density of {rec.density_assumption_kg_l} kg/L. Milk transferred to processing in the period: {rec.transferred_to_processing_l.toLocaleString()} L.
      </div>
    </Card>
  );
}

// ── Traceability timeline ────────────────────────────────────────────────────
const NODE_TONE = { ok: THEME.ok, missing: THEME.danger, pending: THEME.warn, review: THEME.warn, 'n/a': THEME.textDim };

export function BatchTraceabilityTimeline({ chain, onOpen }) {
  return (
    <Card title={chain.title} icon="⛓" pad={16}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {chain.nodes.map((n, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', marginTop: 4, background: NODE_TONE[n.status] || THEME.textDim, boxShadow: `0 0 0 4px ${(NODE_TONE[n.status] || '#999')}22` }} />
              {i < chain.nodes.length - 1 && <span style={{ flex: 1, width: 2, background: '#DCE2E7', minHeight: 18 }} />}
            </div>
            <div style={{ paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: THEME.textDim }}>{n.stage}</span>
                {n.id
                  ? <button onClick={() => onOpen?.(n.id)} style={{ border: 'none', background: 'none', padding: 0, cursor: onOpen ? 'pointer' : 'default', fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: THEME.accentDark }}>{n.id}</button>
                  : <Badge toneName={n.status === 'missing' ? 'danger' : 'neutral'}>{n.status === 'missing' ? 'Missing link' : 'No ID'}</Badge>}
                {n.time && <span style={{ fontSize: 12.5, color: THEME.textMid }}>{n.time.replace('T', ' ')}</span>}
              </div>
              <div style={{ fontSize: 13.5, color: n.status === 'missing' ? THEME.danger : THEME.text }}>{n.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <Card>
      <Callout toneName="danger" icon="!" title="Report could not be loaded">{error}</Callout>
      {onRetry && <div style={{ marginTop: 12 }}><Button onClick={onRetry}>Retry</Button></div>}
    </Card>
  );
}

export function Loading() {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: THEME.textMid, fontSize: 14 }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', border: `3px solid ${THEME.accentSoft}`, borderTopColor: THEME.accent, animation: 'rspin 0.8s linear infinite' }} />
        Loading report…
        <style>{'@keyframes rspin { to { transform: rotate(360deg); } }'}</style>
      </div>
    </Card>
  );
}
