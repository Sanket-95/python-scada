import { memo, useMemo, useRef, useState } from 'react';
import { loadTempSetpoints, saveTempSetpoints } from '../config/temperatureSetpoints';
import { THEME, FONT_COND } from '../theme';
import { Card, Grid, Row, Stat, Segmented, SearchBox, Input, Badge, SavedNote, Mono } from '../ui/kit';

// Bath Temperature — a low/high band per tank, checked against the live
// reading. Each row draws a small gauge: the band in teal, the live reading as
// a marker. Values save when a box loses focus (Enter also commits); an
// invalid row (bad number, or Low > High) stays as typed and isn't saved.

const isNum = v => v !== '' && v !== undefined && Number.isFinite(Number(v));
const fieldBad = v => v !== '' && v !== undefined && !isNum(v);
const rowBad = ({ low = '', high = '' }) =>
  fieldBad(low) || fieldBad(high) || (isNum(low) && isNum(high) && Number(low) > Number(high));

function statusOf(actual, { low = '', high = '' }) {
  if (actual == null) return { key: 'nodata', label: 'No reading', tone: 'neutral' };
  if (!isNum(low) && !isNum(high)) return { key: 'noband', label: 'No band', tone: 'neutral' };
  if (isNum(low) && actual < Number(low)) return { key: 'low', label: 'Too cold', tone: 'warn' };
  if (isNum(high) && actual > Number(high)) return { key: 'high', label: 'Too hot', tone: 'danger' };
  return { key: 'ok', label: 'In band', tone: 'ok' };
}

// 0–100 °C scale gauge.
function BandGauge({ low, high, actual }) {
  const pct = v => `${Math.max(0, Math.min(100, Number(v)))}%`;
  const lo = isNum(low) ? Number(low) : 0, hi = isNum(high) ? Number(high) : 100;
  const hasBand = isNum(low) || isNum(high);
  return (
    <div style={{ position: 'relative', height: 10, borderRadius: 5, background: '#E6EAEE', minWidth: 140 }}>
      {hasBand && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})`, background: `${THEME.accent}55`, borderRadius: 5 }} />
      )}
      {actual != null && (
        <div style={{ position: 'absolute', top: -3, left: `calc(${pct(actual)} - 2px)`, width: 4, height: 16, borderRadius: 2, background: THEME.text }} />
      )}
    </div>
  );
}

const TempRow = memo(function TempRow({ id, name, low, high, actual, bad, onChange, onCommit }) {
  const st = statusOf(actual, { low, high });
  const key = e => e.key === 'Enter' && e.currentTarget.blur();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px minmax(160px,1.4fr) 90px minmax(150px,1.2fr) 110px 110px 110px', gap: 14, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #EEF1F3' }}>
      <Mono style={{ fontWeight: 700, color: THEME.accentDark }}>T{String(id).padStart(2, '0')}</Mono>
      <span style={{ fontWeight: 600, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
      <span style={{ fontFamily: FONT_COND, fontSize: 21, fontWeight: 700, color: st.key === 'high' ? THEME.danger : st.key === 'low' ? THEME.warn : THEME.text }}>
        {actual != null ? `${actual.toFixed(1)}°` : '—'}
      </span>
      <BandGauge low={low} high={high} actual={actual} />
      <Input type="number" step="any" value={low} placeholder="Low °C" invalid={bad || fieldBad(low)} style={{ textAlign: 'right', height: 34 }}
        onChange={e => onChange(id, 'low', e.target.value)} onBlur={() => onCommit(id)} onKeyDown={key} />
      <Input type="number" step="any" value={high} placeholder="High °C" invalid={bad || fieldBad(high)} style={{ textAlign: 'right', height: 34 }}
        onChange={e => onChange(id, 'high', e.target.value)} onBlur={() => onCommit(id)} onKeyDown={key} />
      <div style={{ textAlign: 'right' }}><Badge toneName={bad ? 'danger' : st.tone}>{bad ? 'Invalid' : st.label}</Badge></div>
    </div>
  );
});

export default function TemperatureSettingsPage({ stations = [], stationNames = [], grpcTags = {}, grpcConnected = false }) {
  const [values, setValues] = useState(loadTempSetpoints);
  const [flash, setFlash] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const flashTimer = useRef(null);

  const onChange = (id, field, value) => {
    setFlash(false);
    setValues(v => ({ ...v, [id]: { ...v[id], [field]: value } }));
  };

  // Saves that one row on blur. Also prunes an emptied row from `values`, so
  // it can't reappear when some other row's commit rebuilds the saved object.
  const commit = id => {
    const row = values[id] || {};
    if (rowBad(row)) return;
    const empty = (row.low ?? '') === '' && (row.high ?? '') === '';
    const next = { ...values };
    if (empty) delete next[id]; else next[id] = row;
    setValues(next);
    saveTempSetpoints(next);
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1400);
  };

  // Live readings only — without a connection nothing is shown, rather than a stale number.
  const rows = useMemo(() => stations.map((st, i) => {
    const live = grpcConnected ? parseFloat(grpcTags[`Tank_${st.id}_Temp`]?.value) : NaN;
    const sp = values[st.id] || {};
    return { id: st.id, name: stationNames[i] || `Station ${i + 1}`, low: sp.low ?? '', high: sp.high ?? '', actual: Number.isFinite(live) ? live : null };
  }), [stations, stationNames, grpcTags, grpcConnected, values]);

  const withStatus = rows.map(r => ({ ...r, st: statusOf(r.actual, r) }));
  const out = withStatus.filter(r => r.st.key === 'high' || r.st.key === 'low').length;
  const banded = withStatus.filter(r => r.st.key !== 'noband' && (isNum(r.low) || isNum(r.high))).length;
  const readings = withStatus.filter(r => r.actual != null);
  const avg = readings.length ? readings.reduce((a, r) => a + r.actual, 0) / readings.length : null;
  const hottest = readings.reduce((m, r) => (!m || r.actual > m.actual ? r : m), null);

  const shown = withStatus.filter(r => {
    if (query && !`${r.id} ${r.name}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'out') return r.st.key === 'high' || r.st.key === 'low';
    if (filter === 'banded') return isNum(r.low) || isNum(r.high);
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Grid min={210}>
        <Stat label="Out of band" value={out} toneName={out ? 'danger' : 'ok'} icon="⚠" sub="tanks outside their band" />
        <Stat label="Bands set" value={`${banded}/${rows.length}`} icon="⇿" />
        <Stat label="Average bath" value={avg != null ? `${avg.toFixed(1)}°` : '—'} icon="🌡" toneName="info" />
        <Stat label="Hottest" value={hottest ? `${hottest.actual.toFixed(1)}°` : '—'} icon="♨" sub={hottest?.name} toneName="warn" />
      </Grid>
      <Card title="Temperature bands" subtitle="Scale 0–100 °C · teal = allowed band · bar = live reading" icon="🌡" pad={0}
        actions={(
          <Row>
            <SavedNote show={flash} />
            <Segmented size="sm" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All' }, { value: 'out', label: 'Out of band' }, { value: 'banded', label: 'With band' },
            ]} />
            <SearchBox value={query} onChange={setQuery} placeholder="Find tank…" width={190} />
          </Row>
        )}>
        <div style={{ maxHeight: 'calc(100vh - 420px)', minHeight: 240, overflowY: 'auto' }}>
          {shown.map(r => (
            <TempRow key={r.id} id={r.id} name={r.name} low={r.low} high={r.high} actual={r.actual}
              bad={rowBad(values[r.id] || {})} onChange={onChange} onCommit={commit} />
          ))}
          {shown.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: THEME.textDim }}>No tanks match this filter</div>}
        </div>
      </Card>
    </div>
  );
}
