import { useMemo, useState } from 'react';
import { LOAD_TYPES, LOAD_LABELS, LOAD_ICONS, countsChanged } from '../config/userConfig';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, Button, Input, Segmented, Badge, Callout, Field } from '../ui/kit';

// Plant Layout (System Config) — edit lines, tank/wagon counts and load type
// in place, with a live schematic of each line. Save & apply goes through the
// parent's onApply (which reloads when counts changed).

const MAX_LINES = 4;
const LIMITS = { tanks: [5, 60], wagons: [1, 8] };

function lineRanges(lines) {
  let t = 1, w = 1;
  return lines.map(l => {
    const r = { tFrom: t, tTo: t + l.tanks - 1, wFrom: w, wTo: w + l.wagons - 1 };
    t += l.tanks; w += l.wagons;
    return r;
  });
}

function Stepper({ value, min, max, onChange }) {
  const btn = disabled => ({
    width: 34, height: 34, borderRadius: 10, border: '1px solid #D2D8DE', background: '#FFFFFF',
    fontSize: 18, fontWeight: 700, color: THEME.text, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
  });
  const clamp = v => Math.max(min, Math.min(max, v));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button style={btn(value <= min)} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>−</button>
      <Input type="number" value={value} min={min} max={max} style={{ width: 70, textAlign: 'center', fontWeight: 700 }}
        onChange={e => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) onChange(clamp(v)); }} />
      <button style={btn(value >= max)} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>+</button>
      <span style={{ fontSize: 12, color: THEME.textDim }}>{min}–{max}</span>
    </div>
  );
}

// Mini schematic: rail, wagon markers, one block per tank.
function LineSchematic({ line, range }) {
  const n = line.tanks;
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: '#F4F6F8', border: '1px solid #E1E6EA' }}>
      <div style={{ position: 'relative', height: 14, marginBottom: 6 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 3, borderRadius: 2, background: '#56626E' }} />
        {Array.from({ length: line.wagons }, (_, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, left: `calc(${((i + 0.5) / line.wagons) * 100}% - 12px)`,
            width: 24, height: 14, borderRadius: 4, background: THEME.amber, fontSize: 9, fontWeight: 800,
            color: '#2A2100', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>W{range.wFrom + i}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: n > 40 ? 1 : 2 }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} title={`Tank ${range.tFrom + i}`} style={{ flex: 1, height: 22, borderRadius: 3, background: i === 0 || i === n - 1 ? '#9AA4AD' : THEME.accent, opacity: 0.85 }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5, color: THEME.textDim, fontWeight: 600 }}>
        <span>T{range.tFrom} · load</span><span>{n} tanks</span><span>T{range.tTo} · unload</span>
      </div>
    </div>
  );
}

export default function ConfigPage({ config, onApply, onConfigureTags, onConfigureWagonTags, onConfigureStationCols, onConfigureStationNames, onConfigureTankPartitions, onConfigureCrossTrolley }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(config)));
  const ranges = useMemo(() => lineRanges(draft.lines), [draft.lines]);
  const dirty = JSON.stringify(draft.lines) !== JSON.stringify(config.lines);
  const needsRestart = countsChanged(config, draft);

  const upLine = (li, key, val) => setDraft(d => ({ ...d, lines: d.lines.map((l, i) => (i === li ? { ...l, [key]: val } : l)) }));
  const addLine = () => setDraft(d => {
    if (d.lines.length >= MAX_LINES) return d;
    const newId = Math.max(...d.lines.map(l => l.id)) + 1;
    return { ...d, lines: [...d.lines, { id: newId, label: `LINE ${String.fromCharCode(64 + newId)}`, tanks: 20, wagons: 1, type: 'barrel' }] };
  });
  const removeLast = () => setDraft(d => (d.lines.length <= 1 ? d : { ...d, lines: d.lines.slice(0, -1) }));

  const totals = { tanks: draft.lines.reduce((a, l) => a + l.tanks, 0), wagons: draft.lines.reduce((a, l) => a + l.wagons, 0) };

  const links = [
    ['Tank names & tags', onConfigureTags], ['Wagon tags', onConfigureWagonTags], ['Station parameters', onConfigureStationNames],
    ['Tank partitions', onConfigureTankPartitions], ['Cross trolleys', onConfigureCrossTrolley], ['Table columns', onConfigureStationCols],
  ].filter(([, fn]) => fn);

  return (
    <Page crumbs={['Configuration']} title="Plant Layout"
      subtitle="Production lines, how many tanks and wagons each has, and what the wagons carry."
      actions={(
        <>
          {dirty && <Badge toneName="amber" dot>Unsaved changes</Badge>}
          <Button disabled={!dirty} onClick={() => setDraft(JSON.parse(JSON.stringify(config)))}>Discard</Button>
          <Button variant="primary" icon="✓" disabled={!dirty} onClick={() => onApply(draft)}>Save &amp; apply</Button>
        </>
      )}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {needsRestart && (
            <Callout toneName="warn" icon="⚠" title="Applying will restart the view">
              Tank or wagon counts changed — the 2D/3D views rebuild and wagons re-home after saving. Name and load-type changes apply instantly.
            </Callout>
          )}
          {draft.lines.map((line, li) => (
            <Card key={line.id} pad={18}
              title={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: FONT_COND, fontSize: 15, fontWeight: 700, color: '#FFFFFF', background: THEME.frame, borderRadius: 8, padding: '2px 10px' }}>LINE {li + 1}</span>
                  <Input value={line.label} onChange={e => upLine(li, 'label', e.target.value)} style={{ width: 220, fontWeight: 700 }} />
                </div>
              )}
              actions={<Badge toneName="info">T{ranges[li].tFrom}–T{ranges[li].tTo}</Badge>}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18, marginBottom: 16 }}>
                <Field label="Tanks"><Stepper value={line.tanks} min={LIMITS.tanks[0]} max={LIMITS.tanks[1]} onChange={v => upLine(li, 'tanks', v)} /></Field>
                <Field label="Wagons"><Stepper value={line.wagons} min={LIMITS.wagons[0]} max={LIMITS.wagons[1]} onChange={v => upLine(li, 'wagons', v)} /></Field>
                <Field label="Load carried by every wagon on this line">
                  <Segmented value={line.type} onChange={v => upLine(li, 'type', v)}
                    options={LOAD_TYPES.map(t => ({ value: t, label: `${LOAD_ICONS[t]} ${LOAD_LABELS[t][0]}${LOAD_LABELS[t].slice(1).toLowerCase()}` }))} />
                </Field>
              </div>
              <LineSchematic line={line} range={ranges[li]} />
            </Card>
          ))}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button icon="+" disabled={draft.lines.length >= MAX_LINES} onClick={addLine}>Add line</Button>
            <Button variant="danger" disabled={draft.lines.length <= 1} onClick={removeLast}>Remove last line</Button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0 }}>
          <Card title="Summary" icon="Σ" pad={16}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
              {[['Lines', draft.lines.length], ['Tanks', totals.tanks], ['Wagons', totals.wagons]].map(([l, v]) => (
                <div key={l} style={{ padding: '8px 4px', borderRadius: 10, background: '#F4F6F8' }}>
                  <div style={{ fontFamily: FONT_COND, fontSize: 28, fontWeight: 700, color: THEME.text, lineHeight: 1 }}>{v}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.textDim, letterSpacing: 0.8 }}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.lines.map((l, i) => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: THEME.text }}>{l.label}</span>
                  <span style={{ color: THEME.textMid }}>W{ranges[i].wFrom}{l.wagons > 1 ? `–W${ranges[i].wTo}` : ''} · {LOAD_LABELS[l.type].toLowerCase()}</span>
                </div>
              ))}
            </div>
          </Card>
          {links.length > 0 && (
            <Card title="Related setup" icon="↗" pad={8}>
              {links.map(([label, fn]) => (
                <button key={label} onClick={fn} style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer',
                  fontSize: 14, fontWeight: 600, color: THEME.text,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F2F5F7'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  {label}<span style={{ color: THEME.accent }}>→</span>
                </button>
              ))}
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
