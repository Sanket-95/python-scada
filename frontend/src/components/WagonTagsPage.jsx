import { useState } from 'react';
import { getWagonsByLine, TAG_DATA_TYPES } from '../config/tagConfig';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, Button, Badge, Input, Select, Callout, Mono } from '../ui/kit';

// Wagon Signals — one sheet per wagon with every PLC signal it uses:
//   location   (tank number; data type selectable)            → tag.name/address/type
//   lift up / lift down  (bits — SET/RESET the carried-load latch)  → upLiftTag / downLiftTag
//   auto / manual / service (bits — mode LED + label suffix)        → autoTag / manualTag / serviceTag
// A signal with no PLC address is simply not read. Saved via onSave(draft).

const SIGNALS = [
  { key: 'location',    label: 'Location',     hint: 'Tank number the wagon is at', icon: '⌖' },
  { key: 'upLiftTag',   label: 'Lift up',      hint: '1 = load picked up',          icon: '⤒' },
  { key: 'downLiftTag', label: 'Lift down',    hint: '1 = load set down',           icon: '⤓' },
  { key: 'autoTag',     label: 'Auto mode',    hint: 'Mode selector bit',           icon: 'A' },
  { key: 'manualTag',   label: 'Manual mode',  hint: 'Mode selector bit',           icon: 'M' },
  { key: 'serviceTag',  label: 'Service mode', hint: 'Mode selector bit',           icon: 'S' },
];

export default function WagonTagsPage({ userCfg, wagonTags, onSave, onBack }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(wagonTags)));
  const dirty = JSON.stringify(draft) !== JSON.stringify(wagonTags);

  const get = (id, key) => (key === 'location' ? draft[id] || {} : draft[id]?.[key] || {});
  const set = (id, key, field, val) => setDraft(d => (key === 'location'
    ? { ...d, [id]: { ...d[id], [field]: val } }
    : { ...d, [id]: { ...d[id], [key]: { ...(d[id]?.[key] || {}), [field]: val } } }));

  const lineGroups = getWagonsByLine(userCfg);
  const mapped = Object.keys(draft).reduce((a, id) => a + SIGNALS.filter(s => (get(id, s.key).address || '').trim()).length, 0);
  const total = Object.keys(draft).length * SIGNALS.length;

  return (
    <Page onBack={onBack} crumbs={['Configuration']} title="Wagon Signals"
      subtitle="PLC signals for each wagon — where it is, whether its hoist is up or down, and which mode it's in."
      actions={(
        <>
          <Badge toneName={mapped === total ? 'ok' : 'info'}>{mapped}/{total} signals mapped</Badge>
          {dirty && <Badge toneName="amber" dot>Unsaved changes</Badge>}
          <Button disabled={!dirty} onClick={() => setDraft(JSON.parse(JSON.stringify(wagonTags)))}>Discard</Button>
          <Button variant="primary" icon="✓" disabled={!dirty} onClick={() => onSave(draft)}>Save signals</Button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {lineGroups.map(({ line, wagons }) => (
          <div key={line.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 4, height: 18, borderRadius: 2, background: THEME.amber }} />
              <span style={{ fontFamily: FONT_COND, fontSize: 20, fontWeight: 700, color: THEME.text }}>{line.label}</span>
              <Badge>{line.type} line</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))', gap: 16 }}>
              {wagons.map(({ id }) => {
                const done = SIGNALS.filter(s => (get(id, s.key).address || '').trim()).length;
                return (
                  <Card key={id} pad={0}
                    title={<span style={{ fontFamily: FONT_COND, fontSize: 22 }}>Wagon {id}</span>}
                    actions={<Badge toneName={done === SIGNALS.length ? 'ok' : done ? 'amber' : 'neutral'}>{done}/{SIGNALS.length} mapped</Badge>}>
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 120px 150px', gap: 10, padding: '10px 18px', background: '#F4F6F8', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: THEME.textDim }}>
                      <span>SIGNAL</span><span>TAG NAME</span><span>PLC ADDRESS</span><span>TYPE</span>
                    </div>
                    {SIGNALS.map(s => {
                      const v = get(id, s.key);
                      return (
                        <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 120px 150px', gap: 10, alignItems: 'center', padding: '8px 18px', borderTop: '1px solid #EEF1F3' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 26, height: 26, borderRadius: 8, background: THEME.accentSoft, color: THEME.accentDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{s.icon}</span>
                            <div>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: THEME.text }}>{s.label}</div>
                              <div style={{ fontSize: 11, color: THEME.textDim }}>{s.hint}</div>
                            </div>
                          </div>
                          <Input mono value={v.name || ''} placeholder="Tag name" onChange={e => set(id, s.key, 'name', e.target.value)} style={{ height: 34 }} />
                          <Input mono value={v.address || ''} placeholder={s.key === 'location' ? 'e.g. D107' : 'e.g. M200'} onChange={e => set(id, s.key, 'address', e.target.value)} style={{ height: 34 }} />
                          {s.key === 'location'
                            ? <Select value={v.type || 'int16'} onChange={e => set(id, 'location', 'type', e.target.value)} style={{ height: 34, fontSize: 13 }}
                                options={TAG_DATA_TYPES.filter(t => t.id !== 'bool').map(t => ({ value: t.id, label: t.label }))} />
                            : <Mono style={{ color: THEME.textDim, paddingLeft: 4 }}>BOOL (bit)</Mono>}
                        </div>
                      );
                    })}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
        <Callout title="How these are used">
          The location value moves the wagon to that tank in 2D/3D. Lift up = 1 marks the wagon as carrying a load
          (and plays the hoist animation), lift down = 1 clears it. Exactly one mode bit should be 1 at a time.
        </Callout>
      </div>
    </Page>
  );
}
