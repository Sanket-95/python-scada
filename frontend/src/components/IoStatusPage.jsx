import { useMemo, useState } from 'react';
import { indexTags, ledStateOf } from '../config/ledState';
import { dunkingTags } from '../config/dunking';
import { THEME, FONT_COND } from '../theme';
import { Card, Grid, Row, Spacer, SearchBox, Segmented, SignalPill, DataTable, Badge, Mono } from '../ui/kit';

// I/O Signals — live digital I/O for every wagon (lift proximity switches,
// mode selector) and every tank (load present, heater, rectifier, agitation).
// Everything is a live tag value (real PLC or the built-in simulation).

const WAGON_SIGNALS = [
  { id: 'upLiftTag',   label: 'Lift up' },
  { id: 'downLiftTag', label: 'Lift down' },
  { id: 'autoTag',     label: 'Auto' },
  { id: 'manualTag',   label: 'Manual' },
  { id: 'serviceTag',  label: 'Service' },
];

const TANK_SIGNALS = [
  { id: 'load',   label: 'Load',      tag: id => `STATION_${id}_LOADNUM` },
  { id: 'heater', label: 'Heater',    tag: id => `Tank_${id}_HeaterOn` },
  { id: 'rect',   label: 'Rectifier', tag: id => `Tank_${id}_RectifierOn` },
  { id: 'dunk',   label: 'Agitation', tag: id => dunkingTags(id).output },
];

// Numeric tags (e.g. a load number) count as ON when non-zero.
function ioState(index, connected, name) {
  const state = ledStateOf(index, connected, name);
  if (state !== 'unknown') return state;
  const v = Number(index.get(name.toLowerCase())?.value);
  if (!connected || !Number.isFinite(v)) return 'unknown';
  return v !== 0 ? 'on' : 'off';
}

export default function IoStatusPage({ stations = [], stationNames = [], wagonTags = {}, grpcTags = {}, grpcConnected = false }) {
  const index = useMemo(() => indexTags(grpcTags), [grpcTags]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => stations.map((st, i) => {
    const sig = Object.fromEntries(TANK_SIGNALS.map(s => {
      const name = s.tag(st.id);
      const present = !grpcConnected || index.has(name.toLowerCase());
      return [s.id, present ? ioState(index, grpcConnected, name) : null];
    }));
    return { id: st.id, name: stationNames[i] || `Station ${st.id}`, sig };
  }), [stations, stationNames, index, grpcConnected]);

  const shown = rows.filter(r => {
    if (query && !`${r.id} ${r.name}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'loaded') return r.sig.load === 'on';
    if (filter === 'heating') return r.sig.heater === 'on';
    if (filter === 'plating') return r.sig.rect === 'on';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Grid min={300}>
        {Object.entries(wagonTags).map(([id, wt]) => {
          const loc = grpcConnected ? grpcTags[wt?.name]?.value : null;
          return (
            <Card key={id} title={`Wagon ${id}`} subtitle={wt?.name} icon="⛟"
              actions={<Badge toneName={grpcConnected ? 'ok' : 'neutral'} dot>{grpcConnected ? 'Live' : 'Offline'}</Badge>}>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <div style={{ textAlign: 'center', padding: '6px 14px', borderRadius: 12, background: '#F4F6F8', minWidth: 86 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: THEME.textDim, letterSpacing: 1 }}>AT TANK</div>
                  <div style={{ fontFamily: FONT_COND, fontSize: 40, fontWeight: 700, color: THEME.accentDark, lineHeight: 1 }}>{loc ?? '—'}</div>
                </div>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, columnGap: 10, alignItems: 'center' }}>
                  {WAGON_SIGNALS.map(s => {
                    const name = wt?.[s.id]?.name;
                    return [
                      <span key={`${s.id}l`} style={{ fontSize: 13, color: THEME.textMid, fontWeight: 600 }}>{s.label}</span>,
                      <SignalPill key={`${s.id}p`} state={name ? ioState(index, grpcConnected, name) : 'unknown'} />,
                    ];
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </Grid>

      <Card title="Tank I/O" subtitle={`${shown.length} of ${rows.length} tanks`} icon="⇵"
        actions={(
          <Row>
            <Segmented size="sm" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All' }, { value: 'loaded', label: 'Loaded' },
              { value: 'heating', label: 'Heating' }, { value: 'plating', label: 'Plating' },
            ]} />
            <SearchBox value={query} onChange={setQuery} placeholder="Find tank…" width={200} />
          </Row>
        )}>
        <DataTable
          dense maxHeight="calc(100vh - 470px)"
          rows={shown} rowKey={r => r.id}
          empty="No tanks match this filter"
          columns={[
            { key: 'id', label: 'Tank', width: 70, render: r => <Mono style={{ fontWeight: 700, color: THEME.accentDark }}>T{String(r.id).padStart(2, '0')}</Mono> },
            { key: 'name', label: 'Process', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            ...TANK_SIGNALS.map(s => ({
              key: s.id, label: s.label, align: 'center', width: 120,
              render: r => r.sig[s.id] == null ? <span style={{ color: THEME.textDim }}>n/a</span> : <SignalPill state={r.sig[s.id]} />,
            })),
          ]}
        />
      </Card>
      <Spacer />
    </div>
  );
}
