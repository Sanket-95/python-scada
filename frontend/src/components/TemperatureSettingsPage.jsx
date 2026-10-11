import { memo, useRef, useState } from 'react';
import { loadTempSetpoints, saveTempSetpoints } from '../config/temperatureSetpoints';

const T = {
  panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4', border: '#C4C8D4',
  accent: '#1565C0', ok: '#2E7D32', danger: '#C62828',
  textWh: '#1A2035', textLt: '#3A4F6A', textDim: '#8090A8',
};

const COLS = '1fr 150px 150px 150px';

// '' is allowed (no set point); anything else must be a finite number.
const isNum = v => v !== '' && Number.isFinite(Number(v));
const fieldBad = v => v !== '' && !isNum(v);
const rowBad = ({ low = '', high = '' }) =>
  fieldBad(low) || fieldBad(high) || (isNum(low) && isNum(high) && Number(low) > Number(high));

const input = (bad) => ({
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 13, fontWeight: 600,
  fontFamily: 'inherit', textAlign: 'right', outline: 'none', borderRadius: 6,
  background: '#FFFFFF', color: T.textWh,
  border: `1.5px solid ${bad ? T.danger : T.border}`,
});

// Only re-renders when its own numbers change — the simulation ticks the
// stations constantly, and 60+ rows shouldn't all repaint for that.
const Row = memo(function Row({ id, no, name, low, high, actual, bad, onChange, onCommit }) {
  const onKeyDown = e => e.key === 'Enter' && e.currentTarget.blur();
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
      padding: '7px 16px', borderBottom: `1px solid ${T.border}55`,
      background: no % 2 ? T.panelBg : T.cardBg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{
          flexShrink: 0, minWidth: 26, textAlign: 'center', fontSize: 10.5, fontWeight: 800,
          color: T.accent, background: '#E3F2FD', borderRadius: 4, padding: '2px 6px',
        }}>{no}</span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: T.textWh,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={name}>{name}</span>
      </div>
      <input type="number" step="any" value={low} placeholder="—" style={input(bad || fieldBad(low))}
        onChange={e => onChange(id, 'low', e.target.value)}
        onBlur={() => onCommit(id)} onKeyDown={onKeyDown} />
      <input type="number" step="any" value={high} placeholder="—" style={input(bad || fieldBad(high))}
        onChange={e => onChange(id, 'high', e.target.value)}
        onBlur={() => onCommit(id)} onKeyDown={onKeyDown} />
      {/* Read-only: a value, not an input, so it can't be mistaken for editable */}
      <div style={{
        textAlign: 'right', padding: '7px 10px', fontSize: 13, fontWeight: 700,
        color: T.textLt, background: '#ECEFF4', border: `1.5px solid ${T.border}`, borderRadius: 6,
      }}>{actual}</div>
    </div>
  );
});

// stations / stationNames / grpcTags / grpcConnected come from the app shell
// through SettingsPage's pageContext. `stations` is only the configured list
// (id per row, in order) — nothing from the simulation is read here.
export default function TemperatureSettingsPage({ stations = [], stationNames = [], grpcTags = {}, grpcConnected = false }) {
  const [values, setValues] = useState(loadTempSetpoints);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);

  const onChange = (id, field, value) => {
    setFlash(false);
    setValues(v => ({ ...v, [id]: { ...v[id], [field]: value } }));
  };

  const anyBad = stations.some(st => rowBad(values[st.id] || {}));

  // Saves that one row when a box loses focus — never on every keystroke.
  // An invalid row (bad number, or Low > High) is left exactly as typed, red
  // border and all, and is simply not persisted until it's fixed.
  //
  // Also updates `values` (not just storage) with the same pruned object:
  // leaving a just-emptied row sitting in `values` while only removing it
  // from storage would let it silently reappear the next time some other,
  // unrelated row gets committed — that commit rebuilds the whole saved
  // object from `values`, so anything still sitting there gets resaved.
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
    flashTimer.current = setTimeout(() => setFlash(false), 1200);
  };

  // Live tag values only — no simulated fallback. Without a connection, or
  // without a value for that station, it shows "—" rather than a made-up
  // number. (A dropped connection also stops showing the last value it had,
  // since that would pass off stale data as current.)
  const actualOf = st => {
    const live = grpcConnected ? parseFloat(grpcTags[`Tank_${st.id}_Temp`]?.value) : NaN;
    return Number.isFinite(live) ? `${live.toFixed(1)} °C` : '—';
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        flexWrap: 'wrap', marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, color: T.textDim }}>
          {stations.length} station{stations.length === 1 ? '' : 's'} · set points are optional — leave a box empty for none
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {anyBad && <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>Low must be ≤ High</span>}
          {!anyBad && flash && <span style={{ fontSize: 12, fontWeight: 700, color: T.ok }}>✔ Saved</span>}
        </div>
      </div>

      <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 16px',
          background: T.cardHdr, borderBottom: `2px solid ${T.accent}`,
          fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.accent,
        }}>
          <div>STATION NAME</div>
          <div style={{ textAlign: 'right' }}>LOW SET POINT</div>
          <div style={{ textAlign: 'right' }}>HIGH SET POINT</div>
          <div style={{ textAlign: 'right' }}>ACTUAL TEMP</div>
        </div>
        <div style={{ maxHeight: 'calc(100vh - 330px)', minHeight: 200, overflowY: 'auto' }}>
          {stations.map((st, i) => {
            const sp = values[st.id] || {};
            return (
              <Row
                key={st.id} id={st.id} no={i + 1}
                name={stationNames[i] || `Station ${i + 1}`}
                low={sp.low ?? ''} high={sp.high ?? ''}
                actual={actualOf(st)} bad={rowBad(sp)}
                onChange={onChange} onCommit={commit}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
