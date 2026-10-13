import { useMemo, useState } from 'react';
import { TAG_DATA_TYPES } from '../config/tagConfig';
import StationParamsImportModal from './StationParamsImportModal';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, Button, Badge, Input, Select, Field, SearchBox, Callout, EmptyState, Mono } from '../ui/kit';

// No built-in names — a station's name is its Tank Register (Mimic Page
// Config) label; a tank without one just shows "Station N".
export const DEFAULT_STATION_NAMES = [];

// Build a names array of exactly `count` entries, merging stored values over defaults
export function buildNamesArray(stored, count) {
  return Array.from({ length: count }, (_, i) =>
    stored?.[i] ?? DEFAULT_STATION_NAMES[i] ?? `Station ${i + 1}`
  );
}

// Station Parameters — per station: the Load Number register (always int16)
// and a flexible list of live parameters (kind / address / type / unit) shown
// on the tank's hover tooltip and the Tank Overview. Kind is a closed list so
// other screens can group by it. Saved in one go via onSaveAll.
const PARAM_KINDS = ['Actual Temperature', 'Actual Current', 'Calculated Current', 'Set Current', 'Actual PH'];
const DEFAULT_UNIT = { 'Actual Temperature': '°C', 'Actual Current': 'A', 'Calculated Current': 'A', 'Set Current': 'A', 'Actual PH': 'pH' };
const newParam = () => ({ label: PARAM_KINDS[0], address: '', type: 'int16', unit: '°C' });

export default function StationNamesConfigPage({
  stationCount, stationParams, stationParamLabels, stationLoadNumbers, tankTags = {},
  onSaveAll, onBack,
}) {
  const initial = useMemo(() => JSON.stringify([stationParams || {}, stationParamLabels || {}, stationLoadNumbers || {}]), [stationParams, stationParamLabels, stationLoadNumbers]);
  const [params, setParams] = useState(() => JSON.parse(JSON.stringify(stationParams || {})));
  const [groups, setGroups] = useState(() => ({ ...(stationParamLabels || {}) }));
  const [loadNos, setLoadNos] = useState(() => ({ ...(stationLoadNumbers || {}) }));
  const [selected, setSelected] = useState('1');
  const [query, setQuery] = useState('');
  const [fillStart, setFillStart] = useState('');
  const [fillError, setFillError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [notice, setNotice] = useState('');
  const dirty = JSON.stringify([params, groups, loadNos]) !== initial;

  const nameOf = id => tankTags[id]?.label || `Station ${id}`;
  const ids = Array.from({ length: stationCount }, (_, i) => String(i + 1));
  const listed = ids.filter(id => !query || `${id} ${nameOf(id)}`.toLowerCase().includes(query.toLowerCase()));

  const list = params[selected] || [];
  const setList = next => setParams(p => ({ ...p, [selected]: next }));
  const setParam = (idx, field, val) => setList(list.map((p, i) => (i === idx ? { ...p, [field]: val, ...(field === 'label' && !p.unit ? { unit: DEFAULT_UNIT[val] } : {}) } : p)));

  const fillLoadNumbers = () => {
    const m = fillStart.trim().match(/^([A-Za-z]+)(\d+)$/);
    if (!m) { setFillError('Use letters then a number, e.g. D500'); return; }
    const [, prefix, digits] = m;
    const base = parseInt(digits, 10);
    setLoadNos(Object.fromEntries(ids.map((id, i) => [id, `${prefix}${String(base + i).padStart(digits.length, '0')}`])));
    setFillError(''); setFillStart('');
    setNotice(`Load-number registers filled for all ${stationCount} stations — review and save.`);
  };

  const applyImport = (byStation, groupByStation) => {
    setParams(p => ({ ...p, ...byStation }));
    if (Object.keys(groupByStation).length) setGroups(g => ({ ...g, ...groupByStation }));
    setNotice(`Imported parameters for ${Object.keys(byStation).length} stations — review and save.`);
    setShowImport(false);
  };

  const save = () => onSaveAll({
    stationParams: Object.fromEntries(Object.entries(params).filter(([, v]) => v?.length)),
    stationParamLabels: Object.fromEntries(Object.entries(groups).filter(([, v]) => v?.trim())),
    stationLoadNumbers: Object.fromEntries(Object.entries(loadNos).filter(([, v]) => v?.trim())),
  });

  const discard = () => {
    const [p, g, l] = JSON.parse(initial);
    setParams(p); setGroups(g); setLoadNos(l); setNotice('');
  };

  return (
    <Page onBack={onBack} crumbs={['Configuration']} title="Station Parameters"
      subtitle="Live readings per station (temperature, current, pH…) and the register holding the load number in each tank."
      width={1320}
      actions={(
        <>
          {dirty && <Badge toneName="amber" dot>Unsaved changes</Badge>}
          <Button icon="⇪" onClick={() => setShowImport(true)}>Import Excel</Button>
          <Button disabled={!dirty} onClick={discard}>Discard</Button>
          <Button variant="primary" icon="✓" disabled={!dirty} onClick={save}>Save parameters</Button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {notice && <Callout toneName="ok" icon="✓">{notice}</Callout>}
        <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          <Card pad={10} title="Stations" icon="≡" actions={<Badge>{stationCount}</Badge>}>
            <div style={{ padding: '0 4px 10px' }}><SearchBox value={query} onChange={setQuery} placeholder="Find station…" width="100%" /></div>
            <div style={{ maxHeight: 'calc(100vh - 380px)', minHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {listed.map(id => {
                const n = (params[id] || []).length, active = id === selected, hasLoad = !!(loadNos[id] || '').trim();
                return (
                  <button key={id} onClick={() => setSelected(id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: active ? THEME.accentSoft : 'transparent',
                  }}>
                    <Mono style={{ fontWeight: 700, color: THEME.accentDark, minWidth: 30 }}>T{id.padStart(2, '0')}</Mono>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: active ? 700 : 600, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(id)}</span>
                    {n > 0 && <Badge toneName="info" style={{ height: 20 }}>{n}</Badge>}
                    <span title={hasLoad ? 'Load number mapped' : 'No load number'} style={{ width: 8, height: 8, borderRadius: '50%', background: hasLoad ? THEME.ok : '#D2D8DE' }} />
                  </button>
                );
              })}
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <Card pad={18} title={<span style={{ fontFamily: FONT_COND, fontSize: 24 }}>T{selected.padStart(2, '0')} · {nameOf(selected)}</span>}
              subtitle="Name comes from the Tank Register">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <Field label="Load number register" hint="Always INT (16-bit)">
                  <Input mono value={loadNos[selected] || ''} placeholder="e.g. D601" onChange={e => setLoadNos(l => ({ ...l, [selected]: e.target.value }))} />
                </Field>
                <Field label="Group label" hint="Optional, e.g. Zone A">
                  <Input value={groups[selected] || ''} placeholder="—" onChange={e => setGroups(g => ({ ...g, [selected]: e.target.value }))} />
                </Field>
              </div>
            </Card>

            <Card pad={list.length ? 0 : 18} title="Live parameters" subtitle={`${list.length} configured`} icon="∿"
              actions={<Button size="sm" variant="primary" icon="+" onClick={() => setList([...list, newParam()])}>Add parameter</Button>}>
              {list.length === 0 ? (
                <EmptyState icon="∿" title="No parameters" text="This station shows just its name on hover. Add a reading such as Actual Temperature." />
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.2fr) 140px minmax(170px,1fr) 90px 40px', gap: 10, padding: '10px 18px', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: THEME.textDim, background: '#F4F6F8' }}>
                    <span>READING</span><span>PLC ADDRESS</span><span>DATA TYPE</span><span>UNIT</span><span />
                  </div>
                  {list.map((p, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.2fr) 140px minmax(170px,1fr) 90px 40px', gap: 10, alignItems: 'center', padding: '8px 18px', borderTop: '1px solid #EEF1F3' }}>
                      <Select value={p.label} onChange={e => setParam(idx, 'label', e.target.value)} options={PARAM_KINDS} style={{ height: 34, fontSize: 13 }} />
                      <Input mono value={p.address} placeholder="e.g. D4181" onChange={e => setParam(idx, 'address', e.target.value)} style={{ height: 34 }} />
                      <Select value={p.type} onChange={e => setParam(idx, 'type', e.target.value)} options={TAG_DATA_TYPES.map(t => ({ value: t.id, label: t.label }))} style={{ height: 34, fontSize: 13 }} />
                      <Input value={p.unit} onChange={e => setParam(idx, 'unit', e.target.value)} style={{ height: 34 }} />
                      <button title="Remove" onClick={() => setList(list.filter((_, i) => i !== idx))} style={{ height: 34, border: 'none', borderRadius: 8, background: '#FBE7E6', color: THEME.danger, cursor: 'pointer', fontWeight: 800 }}>✕</button>
                    </div>
                  ))}
                </>
              )}
            </Card>

            <Card pad={16} title="Bulk fill load-number registers" icon="⇣" subtitle="Assigns every station in order: start D500 → T1 = D500, T2 = D501, …">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Input mono value={fillStart} invalid={!!fillError} placeholder="Start, e.g. D500" onChange={e => { setFillStart(e.target.value); setFillError(''); }} style={{ width: 190 }} />
                <Button onClick={fillLoadNumbers} disabled={!fillStart.trim()}>Fill all {stationCount}</Button>
                {fillError && <span style={{ fontSize: 13, color: THEME.danger, fontWeight: 600 }}>{fillError}</span>}
              </div>
            </Card>
          </div>
        </div>
      </div>
      {showImport && <StationParamsImportModal onApply={applyImport} onClose={() => setShowImport(false)} />}
    </Page>
  );
}
