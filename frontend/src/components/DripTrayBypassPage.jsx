import { memo, useCallback, useRef, useState } from 'react';
import RotarySwitch from './RotarySwitch';
import {
  DRIP_TRAY_STATIONS, loadDripBypass, saveDripBypass, loadDripTimes, saveDripTimes,
} from '../config/dripTrays';

const T = {
  panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4', border: '#C4C8D4',
  accent: '#1565C0', ok: '#2E7D32', danger: '#C62828',
  textWh: '#1A2035', textDim: '#8090A8',
};

const COLS = '1fr 130px 170px';
const STATIONS = Array.from({ length: DRIP_TRAY_STATIONS }, (_, i) => i + 1);

// '' = no value; otherwise a number, and a time can't be negative.
const badTime = v => v !== '' && !(Number.isFinite(Number(v)) && Number(v) >= 0);

// The saved shape: empty and invalid cells are both dropped, so an
// in-progress bad value in one cell never gets persisted just because a
// sibling cell was blurred.
const tidy = times => Object.fromEntries(Object.entries(times).filter(([, v]) => v !== '' && !badTime(v)));

const Row = memo(function Row({ n, name, bypassOn, time, onToggle, onTime, onCommit }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
      padding: '4px 16px', borderBottom: `1px solid ${T.border}55`,
      background: n % 2 ? T.panelBg : T.cardBg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{
          flexShrink: 0, minWidth: 26, textAlign: 'center', fontSize: 10.5, fontWeight: 800,
          color: T.accent, background: '#E3F2FD', borderRadius: 4, padding: '2px 6px',
        }}>{n}</span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: T.textWh,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={name}>{name}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <RotarySwitch
          label={`Drip Tray Station ${n} Bypass`} leftLabel="OFF" rightLabel="ON"
          isRight={bypassOn} onToggle={() => onToggle(n)}
        />
      </div>
      <input
        type="number" step="any" min="0" placeholder="—"
        aria-label={`Drip Tray Station ${n} Top Drip Time`}
        value={time}
        onChange={e => onTime(n, e.target.value)}
        onBlur={() => onCommit(n)}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 13, fontWeight: 600,
          fontFamily: 'inherit', textAlign: 'right', outline: 'none', borderRadius: 6,
          background: '#FFFFFF', color: T.textWh,
          border: `1.5px solid ${badTime(time) ? T.danger : T.border}`,
        }}
      />
    </div>
  );
});

// stationNames comes from the app shell through SettingsPage's pageContext, so
// each drip tray shows the same name the Stations page uses.
export default function DripTrayBypassPage({ stationNames = [] }) {
  const [bypass, setBypass] = useState(loadDripBypass);
  const [times, setTimes] = useState(loadDripTimes);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);

  // A switch: takes effect and is stored immediately.
  const toggle = useCallback(n => setBypass(prev => {
    const next = { ...prev };
    if (next[n] === 'on') delete next[n]; else next[n] = 'on';
    saveDripBypass(next);
    return next;
  }), []);

  const setTime = useCallback((n, value) => {
    setFlash(false);
    setTimes(prev => ({ ...prev, [n]: value }));
  }, []);

  const anyBad = STATIONS.some(n => badTime(times[n] ?? ''));

  // Saves on blur, never on every keystroke. A bad cell is left exactly as
  // typed, red border and all, and simply isn't persisted until it's fixed.
  // `tidy` (empty/invalid cells dropped) is recomputed fresh from `times`
  // every time, so this always reflects whatever's currently on screen.
  const commitTime = useCallback(n => {
    if (badTime(times[n] ?? '')) return;
    saveDripTimes(tidy(times));
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1200);
  }, [times]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        flexWrap: 'wrap', marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, color: T.textDim }}>
          Bypass and Top Drip Time both apply as soon as you set them
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {anyBad && <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>Times must be 0 or more</span>}
          {!anyBad && flash && <span style={{ fontSize: 12, fontWeight: 700, color: T.ok }}>✔ Saved</span>}
        </div>
      </div>

      <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 16px',
          background: T.cardHdr, borderBottom: `2px solid ${T.accent}`,
          fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.accent,
        }}>
          <div>DRIP TRAY</div>
          <div style={{ textAlign: 'center' }}>BYPASS</div>
          <div style={{ textAlign: 'right' }}>TOP DRIP TIME</div>
        </div>
        <div style={{ maxHeight: 'calc(100vh - 330px)', minHeight: 220, overflowY: 'auto' }}>
          {STATIONS.map(n => (
            <Row
              key={n} n={n} name={stationNames[n - 1] || `Station ${n}`}
              bypassOn={bypass[n] === 'on'} time={times[n] ?? ''}
              onToggle={toggle} onTime={setTime} onCommit={commitTime}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
