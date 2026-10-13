import { memo, useCallback, useMemo, useState } from 'react';
import { indexTags, ledStateOf } from '../config/ledState';
import { dunkingTags, DEFAULT_DUNKING_SWITCH, loadDunkingSwitches, saveDunkingSwitches } from '../config/dunking';
import { THEME, FONT_COND } from '../theme';
import { Card, Grid, Stat, Segmented, Toggle, SearchBox, Row, Badge } from '../ui/kit';

// Agitation (Dunking) — one tile per tank: Man/Auto selector and manual
// on/off (saved locally the moment they change), plus three live status dots
// (home position, output, healthy). Tiles are memoised on plain values so the
// grid doesn't repaint on every simulation tick.

const DOT = { on: THEME.ok, off: THEME.danger, unknown: '#C3CAD1' };

function Dot({ state, label }) {
  return (
    <span title={`${label}: ${state === 'on' ? 'on' : state === 'off' ? 'off' : 'no signal'}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: THEME.textMid }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: DOT[state], boxShadow: state === 'on' ? `0 0 6px ${THEME.ok}` : 'none' }} />
      {label}
    </span>
  );
}

const Tile = memo(function Tile({ id, name, mode, manual, home, output, healthy, onSet }) {
  const fault = healthy === 'off';
  return (
    <div style={{
      borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
      border: `1px solid ${fault ? '#F2C2BF' : '#E1E6EA'}`, background: fault ? '#FFF6F5' : '#FFFFFF',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: FONT_COND, fontSize: 22, fontWeight: 700, color: THEME.accentDark, minWidth: 34 }}>{String(id).padStart(2, '0')}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
        {output === 'on' && <Badge toneName="info">Agitating</Badge>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Segmented size="sm" value={mode} onChange={v => onSet(id, 'mode', v)} options={[
          { value: 'man', label: 'Man' }, { value: 'auto', label: 'Auto', color: THEME.accent },
        ]} />
        <Toggle size="sm" checked={manual === 'on'} disabled={mode === 'auto'} onChange={on => onSet(id, 'manual', on ? 'on' : 'off')} label="Run" />
      </div>
      <div style={{ display: 'flex', gap: 12, paddingTop: 8, borderTop: '1px solid #EEF1F3' }}>
        <Dot state={home} label="Home" />
        <Dot state={output} label="Output" />
        <Dot state={healthy} label="Healthy" />
      </div>
    </div>
  );
});

export default function DunkingPage({ stations = [], stationNames = [], grpcTags = {}, grpcConnected = false }) {
  const [switches, setSwitches] = useState(loadDunkingSwitches);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const setSwitch = useCallback((id, field, value) => setSwitches(prev => {
    const cur = { ...DEFAULT_DUNKING_SWITCH, ...prev[id], [field]: value };
    const next = { ...prev };
    if (cur.mode === DEFAULT_DUNKING_SWITCH.mode && cur.manual === DEFAULT_DUNKING_SWITCH.manual) delete next[id];
    else next[id] = cur;
    saveDunkingSwitches(next);
    return next;
  }), []);

  const tagIndex = useMemo(() => indexTags(grpcTags), [grpcTags]);

  const tiles = stations.map((st, i) => {
    const sw = switches[st.id] || DEFAULT_DUNKING_SWITCH;
    const t = dunkingTags(st.id);
    return {
      id: st.id, name: stationNames[i] || `Station ${i + 1}`, mode: sw.mode, manual: sw.manual,
      home: ledStateOf(tagIndex, grpcConnected, t.homeProxy),
      output: ledStateOf(tagIndex, grpcConnected, t.output),
      healthy: ledStateOf(tagIndex, grpcConnected, t.healthy),
    };
  });

  const autoCount = tiles.filter(t => t.mode === 'auto').length;
  const running = tiles.filter(t => t.output === 'on').length;
  const faults = tiles.filter(t => t.healthy === 'off').length;

  const shown = tiles.filter(t => {
    if (query && !`${t.id} ${t.name}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'auto') return t.mode === 'auto';
    if (filter === 'fault') return t.healthy === 'off';
    if (filter === 'running') return t.output === 'on';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Grid min={210}>
        <Stat label="Units" value={tiles.length} icon="↕" />
        <Stat label="In auto" value={autoCount} icon="A" toneName="info" />
        <Stat label="Agitating now" value={running} icon="≋" toneName="ok" />
        <Stat label="Faults" value={faults} icon="!" toneName={faults ? 'danger' : 'ok'} />
      </Grid>
      <Card title="Agitation units" subtitle={`${shown.length} shown`} icon="↕"
        actions={(
          <Row>
            <Segmented size="sm" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All' }, { value: 'auto', label: 'Auto' },
              { value: 'running', label: 'Running' }, { value: 'fault', label: 'Faults' },
            ]} />
            <SearchBox value={query} onChange={setQuery} placeholder="Find tank…" width={180} />
          </Row>
        )}>
        <Grid min={250} gap={12}>
          {shown.map(t => <Tile key={t.id} {...t} onSet={setSwitch} />)}
        </Grid>
        {shown.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: THEME.textDim }}>No units match this filter</div>}
      </Card>
    </div>
  );
}
