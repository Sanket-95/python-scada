import { memo, useCallback, useRef, useState } from 'react';
import { DRIP_TRAY_STATIONS, loadDripBypass, saveDripBypass, loadDripTimes, saveDripTimes } from '../config/dripTrays';
import { THEME, FONT_COND } from '../theme';
import { Card, Grid, Stat, Input, Toggle, Segmented, SearchBox, Row, SavedNote, Badge, Button } from '../ui/kit';

// Drip Trays — one compact tile per tray: bypass switch (applied and saved the
// moment it's flipped) and top drip time in seconds (saved on blur).
//   bypass: { "3": "on" } — only bypassed trays stored
//   times:  { "3": "5.5" } — strings as typed

const TRAYS = Array.from({ length: DRIP_TRAY_STATIONS }, (_, i) => i + 1);
const badTime = v => v !== '' && !(Number.isFinite(Number(v)) && Number(v) >= 0);
const tidy = times => Object.fromEntries(Object.entries(times).filter(([, v]) => v !== '' && !badTime(v)));

const Tray = memo(function Tray({ n, name, bypassOn, time, onToggle, onTime, onCommit }) {
  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${bypassOn ? '#F4D3A6' : '#E1E6EA'}`,
      background: bypassOn ? '#FFF8EE' : '#FFFFFF', padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: FONT_COND, fontSize: 22, fontWeight: 700, color: THEME.accentDark, minWidth: 34 }}>{String(n).padStart(2, '0')}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
        {bypassOn && <Badge toneName="warn">Bypassed</Badge>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
        <Toggle size="sm" checked={bypassOn} onChange={() => onToggle(n)} label="Bypass" />
        <div style={{ position: 'relative', width: 100 }}>
          <Input type="number" step="any" min="0" placeholder="Drip" aria-label={`Drip tray ${n} top drip time`}
            value={time} invalid={badTime(time)}
            style={{ textAlign: 'right', paddingRight: 24, height: 32, opacity: bypassOn ? 0.6 : 1 }}
            onChange={e => onTime(n, e.target.value)} onBlur={() => onCommit(n)}
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
          <span style={{ position: 'absolute', right: 10, top: 8, fontSize: 12, color: THEME.textDim, pointerEvents: 'none' }}>s</span>
        </div>
      </div>
    </div>
  );
});

export default function DripTrayBypassPage({ stationNames = [] }) {
  const [bypass, setBypass] = useState(loadDripBypass);
  const [times, setTimes] = useState(loadDripTimes);
  const [flash, setFlash] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const flashTimer = useRef(null);

  const toggle = useCallback(n => setBypass(prev => {
    const next = { ...prev };
    if (next[n] === 'on') delete next[n]; else next[n] = 'on';
    saveDripBypass(next);
    return next;
  }), []);

  const setTime = useCallback((n, value) => { setFlash(false); setTimes(prev => ({ ...prev, [n]: value })); }, []);

  const commitTime = useCallback(n => {
    if (badTime(times[n] ?? '')) return;
    saveDripTimes(tidy(times));
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1400);
  }, [times]);

  const clearAllBypass = () => { setBypass({}); saveDripBypass({}); };

  const bypassed = TRAYS.filter(n => bypass[n] === 'on').length;
  const timed = TRAYS.filter(n => (times[n] ?? '') !== '' && !badTime(times[n])).length;
  const avg = timed ? TRAYS.reduce((a, n) => a + (badTime(times[n] ?? '') || (times[n] ?? '') === '' ? 0 : Number(times[n])), 0) / timed : null;

  const shown = TRAYS.filter(n => {
    const name = stationNames[n - 1] || `Station ${n}`;
    if (query && !`${n} ${name}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'bypassed') return bypass[n] === 'on';
    if (filter === 'unset') return (times[n] ?? '') === '';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Grid min={210}>
        <Stat label="Trays" value={TRAYS.length} icon="▤" />
        <Stat label="Bypassed" value={bypassed} toneName={bypassed ? 'warn' : 'ok'} icon="⤳" />
        <Stat label="Drip time set" value={`${timed}/${TRAYS.length}`} icon="💧" toneName="info" />
        <Stat label="Average drip" value={avg != null ? `${avg.toFixed(1)} s` : '—'} icon="⏱" />
      </Grid>
      <Card title="Drip trays" subtitle="Bypass applies immediately · drip time saves when you leave the box" icon="💧"
        actions={(
          <Row>
            <SavedNote show={flash} />
            <Segmented size="sm" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All' }, { value: 'bypassed', label: 'Bypassed' }, { value: 'unset', label: 'No time' },
            ]} />
            <SearchBox value={query} onChange={setQuery} placeholder="Find tray…" width={180} />
            {bypassed > 0 && <Button size="sm" variant="danger" onClick={clearAllBypass}>Clear all bypass</Button>}
          </Row>
        )}>
        <Grid min={250} gap={12}>
          {shown.map(n => (
            <Tray key={n} n={n} name={stationNames[n - 1] || `Station ${n}`}
              bypassOn={bypass[n] === 'on'} time={times[n] ?? ''}
              onToggle={toggle} onTime={setTime} onCommit={commitTime} />
          ))}
        </Grid>
        {shown.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: THEME.textDim }}>No trays match this filter</div>}
      </Card>
    </div>
  );
}
