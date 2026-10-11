import { useRef, useState } from 'react';
import {
  ALARM_TIME_ROWS, ALARM_TIME_COLUMNS, loadAlarmTimes, saveAlarmTimes,
} from '../config/alarmTimes';

const T = {
  panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4', border: '#C4C8D4',
  accent: '#1565C0', ok: '#2E7D32', danger: '#C62828',
  textWh: '#1A2035', textDim: '#8090A8',
};

const COLS = `170px repeat(${ALARM_TIME_COLUMNS.length}, 1fr)`;

// '' means "no value"; anything else must be a number, and a time can't be negative.
const badValue = v => v !== '' && !(Number.isFinite(Number(v)) && Number(v) >= 0);

const cellInput = bad => ({
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, fontWeight: 600,
  fontFamily: 'inherit', textAlign: 'right', outline: 'none', borderRadius: 6,
  background: '#FFFFFF', color: T.textWh,
  border: `1.5px solid ${bad ? T.danger : T.border}`,
});

// The saved shape: empty and invalid cells are both dropped, so an in-progress
// bad value in one cell never gets persisted just because another cell nearby
// was blurred (each cell still shows exactly what was typed on screen).
function tidy(times) {
  const out = {};
  for (const [row, cols] of Object.entries(times)) {
    const kept = Object.fromEntries(Object.entries(cols || {}).filter(([, v]) => v !== '' && !badValue(v)));
    if (Object.keys(kept).length) out[row] = kept;
  }
  return out;
}

export default function AlarmTimeSettingsPage() {
  const [values, setValues] = useState(loadAlarmTimes);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);

  const setCell = (row, col, value) => {
    setFlash(false);
    setValues(v => ({ ...v, [row]: { ...v[row], [col]: value } }));
  };

  const anyBad = ALARM_TIME_ROWS.some(r => ALARM_TIME_COLUMNS.some(c => badValue(values[r.id]?.[c] ?? '')));

  // Saves on blur, never on every keystroke. A bad cell (not a number, or
  // negative) is left exactly as typed, red border and all, and is simply
  // not persisted until it's fixed — the rest of the grid still saves fine.
  // `tidy` (empty/invalid cells dropped) is recomputed fresh from `values`
  // every time, so this always reflects whatever's currently on screen.
  const commitCell = (row, col) => {
    if (badValue(values[row]?.[col] ?? '')) return;
    saveAlarmTimes(tidy(values));
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1200);
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
        flexWrap: 'wrap', marginBottom: 12,
      }}>
        {anyBad && <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>Times must be 0 or more</span>}
        {!anyBad && flash && <span style={{ fontSize: 12, fontWeight: 700, color: T.ok }}>✔ Saved</span>}
      </div>

      <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 16px',
          background: T.cardHdr, borderBottom: `2px solid ${T.accent}`,
          fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.accent,
        }}>
          <div>PARAMETER</div>
          {ALARM_TIME_COLUMNS.map(c => <div key={c} style={{ textAlign: 'right' }}>{c}</div>)}
        </div>

        {ALARM_TIME_ROWS.map((row, i) => (
          <div key={row.id} style={{
            display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
            padding: '9px 16px', borderBottom: i < ALARM_TIME_ROWS.length - 1 ? `1px solid ${T.border}55` : 'none',
            background: i % 2 ? T.cardBg : T.panelBg,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.textWh }}>{row.label}</div>
            {ALARM_TIME_COLUMNS.map(col => {
              const value = values[row.id]?.[col] ?? '';
              return (
                <input
                  key={col} type="number" step="any" min="0" placeholder="—"
                  aria-label={`${row.label} ${col}`}
                  value={value} style={cellInput(badValue(value))}
                  onChange={e => setCell(row.id, col, e.target.value)}
                  onBlur={() => commitCell(row.id, col)}
                  onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
