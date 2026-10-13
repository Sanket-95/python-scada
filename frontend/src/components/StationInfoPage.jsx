import { useMemo, useState } from 'react';
import { DEFAULT_STATION_COLS } from './StationColumnConfigPage';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, Grid, Stat, Row, Segmented, SearchBox, Badge, DataTable, Mono, EmptyState } from '../ui/kit';

// Tank Overview — live state of every tank and wagon. Every value comes from
// the live tag feed (real PLC or the built-in simulation). Per-tank readings
// are taken from that tank's Station Info parameters (STATION_<id>_P<idx>, by
// kind) first, then the generic Tank_<id>_* tags; anything missing shows "—".

const PARAM_SCALE = { 'Actual PH': 1 / 100 }; // same as WagonScada3D.jsx

function paramValue(tags, stationParams, id, kind) {
  const params = stationParams[String(id)] || [];
  const idx = params.findIndex(p => p.label === kind);
  if (idx === -1) return null;
  const v = Number(tags[`STATION_${id}_P${idx}`]?.value);
  return Number.isFinite(v) ? v * (PARAM_SCALE[kind] ?? 1) : null;
}
function tagNum(tags, name) {
  const v = Number(tags[name]?.value);
  return tags[name] && Number.isFinite(v) ? v : null;
}
function fmtDur(secs) {
  if (secs == null) return '—';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
const fmtClock = s => (s == null ? '—' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`);

function Reading({ label, value, unit, warn }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: THEME.textDim, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: value == null ? '#B5BDC5' : warn ? THEME.danger : THEME.text }}>
        {value == null ? '—' : `${value}${unit ? ' ' + unit : ''}`}
      </div>
    </div>
  );
}

function TankCard({ t }) {
  const occupied = t.loadNo > 0;
  return (
    <div style={{
      borderRadius: 12, background: '#FFFFFF', padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
      border: `1px solid ${t.wagon ? THEME.accent : occupied ? '#F5DE9C' : '#E1E6EA'}`,
      boxShadow: t.wagon ? `0 0 0 3px ${THEME.accent}22` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontFamily: FONT_COND, fontSize: 20, fontWeight: 700, minWidth: 40, textAlign: 'center', borderRadius: 8, padding: '1px 6px',
          background: occupied ? THEME.amber : '#EEF1F4', color: occupied ? '#2A2100' : THEME.textMid,
        }}>{t.id}</span>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name}>{t.name}</span>
        {t.wagon && <Badge toneName="info">W{t.wagon.id}</Badge>}
      </div>
      {occupied ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Mono style={{ fontWeight: 700, color: THEME.text }}>#{t.loadNo}</Mono>
          <span style={{ color: THEME.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.client} · {t.part}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: THEME.accentDark }}>{fmtDur(t.dur)}</span>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: THEME.textDim }}>Empty{t.op ? ` · ${t.op}` : ''}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, paddingTop: 8, borderTop: '1px solid #EEF1F3' }}>
        <Reading label="Temp" value={t.temp != null ? t.temp.toFixed(1) : null} unit="°C" warn={t.tempAlert} />
        <Reading label="Current" value={t.curr != null ? Math.round(t.curr) : null} unit="A" />
        <Reading label="pH" value={t.ph != null ? t.ph.toFixed(2) : null} />
      </div>
    </div>
  );
}

export default function StationInfoPage({
  wagons = [], stations = [], colConfig, stationNames = [], tracks = [],
  liveTags = {}, connected = false, stationParams = {}, wagonLocations = {},
}) {
  const [mode, setMode] = useState('cards');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const activeCols = (colConfig ?? DEFAULT_STATION_COLS).filter(c => c.enabled);

  // Which wagon is parked at which tank (location tag, confirmed by position).
  const wagonAt = useMemo(() => {
    const m = {};
    wagons.forEach(w => {
      const loc = wagonLocations[String(w.id)];
      const st = stations.find(s => s.id === loc);
      if (st && Math.abs(st.x - w.x) < 18) m[st.id] = w;
    });
    return m;
  }, [wagons, stations, wagonLocations]);

  const tanks = stations.map((st, i) => {
    const id = st.id;
    const temp = paramValue(liveTags, stationParams, id, 'Actual Temperature') ?? tagNum(liveTags, `Tank_${id}_Temp`);
    const tempSV = tagNum(liveTags, `Tank_${id}_TempSV`);
    const wagon = wagonAt[id];
    return {
      id, trackId: st.trackId, name: stationNames[i] || `Station ${i + 1}`,
      loadNo: tagNum(liveTags, `STATION_${id}_LOADNUM`) ?? 0,
      dur: tagNum(liveTags, `Tank_${id}_Duration`),
      client: liveTags[`Tank_${id}_Client`]?.value || 'NA',
      part: liveTags[`Tank_${id}_Part`]?.value || 'NA',
      temp, tempSV, tempAlert: temp != null && tempSV != null && Math.abs(temp - tempSV) > 3,
      curr: paramValue(liveTags, stationParams, id, 'Actual Current') ?? tagNum(liveTags, `Tank_${id}_Current`),
      currSV: paramValue(liveTags, stationParams, id, 'Set Current') ?? tagNum(liveTags, `Tank_${id}_CurrentSV`),
      ph: paramValue(liveTags, stationParams, id, 'Actual PH') ?? tagNum(liveTags, `Tank_${id}_PH`),
      wagon, op: wagon ? liveTags[`W${wagon.id}_OPERATION`]?.value : null,
    };
  });

  const alarms = (liveTags.PLANT_ALARM_MSG?.value || '').split(' | ').filter(Boolean);
  const occupied = tanks.filter(t => t.loadNo > 0).length;
  const plantMode = liveTags.PLANT_MODE?.value || (connected ? 'Auto' : '—');
  const done = tagNum(liveTags, 'PLANT_LOADS_DONE');
  const inProcess = tagNum(liveTags, 'PLANT_LOADS_IN_PROCESS');

  const shown = tanks.filter(t => {
    if (query && !`${t.id} ${t.name} ${t.loadNo || ''} ${t.client} ${t.part}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'occupied') return t.loadNo > 0;
    if (filter === 'empty') return t.loadNo === 0;
    if (filter === 'attention') return t.tempAlert;
    return true;
  });

  // Table mode honours Col. Config (which columns, their order, custom columns).
  const tableCols = activeCols.map(c => {
    const base = { key: c.id, label: c.label };
    switch (c.id) {
      case 'wagon':  return { ...base, render: t => t.wagon ? <Badge toneName="info">W{t.wagon.id}</Badge> : '' };
      case 'op':     return { ...base, render: t => <span style={{ color: THEME.accentDark }}>{t.op || ''}</span> };
      case 'stNo':   return { ...base, render: t => <Mono style={{ fontWeight: 700 }}>{t.id}</Mono> };
      case 'stName': return { ...base, render: t => <span style={{ fontWeight: 600 }}>{t.name}</span> };
      case 'loadNo': return { ...base, render: t => t.loadNo > 0 ? <Mono style={{ fontWeight: 700 }}>#{t.loadNo}</Mono> : <span style={{ color: THEME.textDim }}>—</span> };
      case 'dur':    return { ...base, render: t => fmtDur(t.dur) };
      case 'client': return { ...base, render: t => t.client };
      case 'part':   return { ...base, render: t => t.part };
      case 'tempPV': return { ...base, align: 'right', render: t => <span style={{ color: t.tempAlert ? THEME.danger : THEME.text, fontWeight: 700 }}>{t.temp != null ? `${t.temp.toFixed(1)} °C` : '—'}</span> };
      case 'tempSV': return { ...base, align: 'right', render: t => t.tempSV != null ? `${t.tempSV.toFixed(0)} °C` : '' };
      case 'currPV': return { ...base, align: 'right', render: t => t.curr != null ? `${Math.round(t.curr)} A` : '' };
      case 'currSV': return { ...base, align: 'right', render: t => t.currSV != null ? `${Math.round(t.currSV)} A` : '' };
      case 'pH':     return { ...base, align: 'right', render: t => t.ph != null ? t.ph.toFixed(2) : '' };
      default:       return { ...base, render: () => { const live = c.tagName ? liveTags[c.tagName] : null; return live ? `${live.value}${live.unit ? ' ' + live.unit : ''}` : '—'; } };
    }
  });

  const lineGroups = (tracks.length ? tracks : [{ id: null, label: 'All tanks' }]).map(tr => ({
    tr, items: shown.filter(t => tr.id == null || t.trackId === tr.id),
  })).filter(g => g.items.length);

  return (
    <Page crumbs={['Monitor']} title="Tank Overview"
      subtitle="Live state of every tank and wagon — loads, time in tank and bath readings."
      width={1440}
      actions={(
        <Row>
          <Badge toneName={connected ? 'ok' : 'danger'} dot>{connected ? 'Live data' : 'No data'}</Badge>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'cards', label: '▦ Cards' }, { value: 'table', label: '☰ Table' }]} />
        </Row>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Grid min={200}>
          <Stat label="Loads in process" value={inProcess ?? occupied} icon="◉" toneName="info" />
          <Stat label="Tanks occupied" value={`${occupied}/${tanks.length}`} icon="▥" />
          <Stat label="Completed loads" value={done ?? '—'} icon="✓" toneName="ok" sub="since start" />
          <Stat label="Cycle time" value={fmtClock(tagNum(liveTags, 'PLANT_CYCLE_LAST'))} icon="⏱" sub={`target ${fmtClock(tagNum(liveTags, 'PLANT_CYCLE_SET'))}`} />
          <Stat label="Plant mode" value={plantMode} icon="⚙" toneName={plantMode === 'Auto' ? 'ok' : 'warn'} />
        </Grid>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 16 }}>
          <Card title="Active alarms" icon="⚠" actions={<Badge toneName={alarms.length ? 'danger' : 'ok'}>{alarms.length}</Badge>} pad={alarms.length ? 8 : 0}>
            {alarms.length === 0
              ? <EmptyState icon="✓" title="No active alarms" />
              : alarms.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: i % 2 ? '#FFFFFF' : '#FFF6F5' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: THEME.danger, flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, color: THEME.text, fontWeight: 600 }}>{a}</span>
                </div>
              ))}
          </Card>
          <Card title="Wagons" icon="⛟" pad={12}>
            <Grid min={220} gap={10}>
              {wagons.map(w => {
                const op = liveTags[`W${w.id}_OPERATION`]?.value;
                const loadNo = tagNum(liveTags, `W${w.id}_LOADNUM`);
                return (
                  <div key={w.id} style={{ borderRadius: 12, padding: 12, background: '#F6F8FA', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: FONT_COND, fontSize: 24, fontWeight: 700, color: '#FFFFFF', background: THEME.frame, borderRadius: 10, padding: '2px 10px' }}>W{w.id}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text }}>{op || (w.status === 'idle' ? 'Idle' : 'Moving')}</div>
                      <div style={{ fontSize: 12.5, color: THEME.textDim }}>
                        Tank {wagonLocations[String(w.id)] ?? '—'}{loadNo ? ` · carrying #${loadNo}` : ' · empty'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Grid>
          </Card>
        </div>

        <Card title="Tanks" subtitle={`${shown.length} of ${tanks.length}`} icon="▥"
          actions={(
            <Row>
              <Segmented size="sm" value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'All' }, { value: 'occupied', label: 'Occupied' },
                { value: 'empty', label: 'Empty' }, { value: 'attention', label: 'Needs attention' },
              ]} />
              <SearchBox value={query} onChange={setQuery} placeholder="Tank, load no., client…" width={230} />
            </Row>
          )}>
          {mode === 'table' ? (
            <DataTable dense rows={shown} rowKey={t => t.id} columns={tableCols} maxHeight="calc(100vh - 420px)"
              rowStyle={t => (t.wagon ? { background: '#F1FAF9' } : null)} empty="No tanks match this filter" />
          ) : lineGroups.length === 0 ? (
            <EmptyState title="No tanks match this filter" />
          ) : lineGroups.map(({ tr, items }) => (
            <div key={tr.id ?? 'all'} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ width: 4, height: 18, borderRadius: 2, background: THEME.amber }} />
                <span style={{ fontFamily: FONT_COND, fontSize: 19, fontWeight: 700, color: THEME.text, letterSpacing: 0.5 }}>{tr.label}</span>
                <Badge>{items.filter(t => t.loadNo > 0).length} loaded</Badge>
              </div>
              <Grid min={250} gap={12}>
                {items.map(t => <TankCard key={t.id} t={t} />)}
              </Grid>
            </div>
          ))}
        </Card>
      </div>
    </Page>
  );
}
