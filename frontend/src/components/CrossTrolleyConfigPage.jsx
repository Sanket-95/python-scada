import { useMemo, useState } from 'react';
import { tankIdRange } from '../config/userConfig';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, Button, Badge, Callout, Select, Field, Segmented, EmptyState } from '../ui/kit';

// Transfer Links (cross trolleys) — a trolley that carries a load from a tank
// on one line to a tank on another. Shown as a link between the two tanks in
// 2D/3D. Stored: [{ id, line1Id, line1Label, tank1Id, line2Id, line2Label, tank2Id }].

function EndPicker({ title, lines, lineIdx, setLineIdx, tank, setTank, names }) {
  const line = lines[lineIdx];
  return (
    <div style={{ flex: 1, minWidth: 240, padding: 16, borderRadius: 12, background: '#F6F8FA', border: '1px solid #E1E6EA', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: THEME.textDim }}>{title}</div>
      <Segmented size="sm" value={lineIdx} onChange={i => { setLineIdx(i); setTank(lines[i].lo); }}
        options={lines.map((l, i) => ({ value: i, label: l.label }))} />
      <Field label="Tank">
        <Select value={tank} onChange={e => setTank(Number(e.target.value))}
          options={Array.from({ length: line.hi - line.lo + 1 }, (_, i) => {
            const id = line.lo + i;
            return { value: id, label: `T${id} · ${names[id]?.label || `Tank ${id}`}` };
          })} />
      </Field>
    </div>
  );
}

export default function CrossTrolleyConfigPage({ userCfg, trolleys, onSave, onBack }) {
  const lines = useMemo(() => userCfg.lines.map((l, i) => {
    const [lo, hi] = tankIdRange(userCfg, i);
    return { ...l, lo, hi };
  }), [userCfg]);
  const names = userCfg.tankTags || {};

  const [draft, setDraft] = useState(() => trolleys.map(t => ({ ...t })));
  const [l1, setL1] = useState(0);
  const [l2, setL2] = useState(lines.length > 1 ? 1 : 0);
  const [t1, setT1] = useState(lines[0]?.hi ?? 1);
  const [t2, setT2] = useState(lines[lines.length > 1 ? 1 : 0]?.lo ?? 1);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(trolleys);

  const add = () => {
    if (l1 === l2) { setError('Pick two different lines — a transfer link bridges two separate lines.'); return; }
    if (draft.some(d => d.tank1Id === t1 && d.tank2Id === t2)) { setError('That link already exists.'); return; }
    setError('');
    setDraft(d => [...d, {
      id: `xt_${Date.now()}`,
      line1Id: lines[l1].id, line1Label: lines[l1].label, tank1Id: t1,
      line2Id: lines[l2].id, line2Label: lines[l2].label, tank2Id: t2,
    }]);
  };

  const End = ({ label, tank }) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.textDim, letterSpacing: 1 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: FONT_COND, fontSize: 24, fontWeight: 700, color: THEME.accentDark }}>T{tank}</span>
        <span style={{ fontSize: 13, color: THEME.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names[tank]?.label || ''}</span>
      </div>
    </div>
  );

  return (
    <Page onBack={onBack} crumbs={['Configuration']} title="Transfer Links"
      subtitle="Cross trolleys that move a load between lines — pick the tank it collects from and the tank it delivers to."
      actions={(
        <>
          {dirty && <Badge toneName="amber" dot>Unsaved changes</Badge>}
          <Button disabled={!dirty} onClick={() => setDraft(trolleys.map(t => ({ ...t })))}>Discard</Button>
          <Button variant="primary" icon="✓" disabled={!dirty} onClick={() => onSave(draft)}>Save links</Button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {lines.length < 2 && <Callout toneName="warn" icon="⚠">Only one line is configured — add a second line in Plant Layout to create transfer links.</Callout>}
        <Card title="New link" icon="⇄">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <EndPicker title="COLLECT FROM" lines={lines} lineIdx={l1} setLineIdx={setL1} tank={t1} setTank={setT1} names={names} />
            <span style={{ fontSize: 26, color: THEME.accent }}>⇄</span>
            <EndPicker title="DELIVER TO" lines={lines} lineIdx={l2} setLineIdx={setL2} tank={t2} setTank={setT2} names={names} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <Button variant="primary" icon="+" onClick={add} disabled={lines.length < 2}>Add link</Button>
            {error && <span style={{ fontSize: 13, color: THEME.danger, fontWeight: 600 }}>{error}</span>}
          </div>
        </Card>

        <Card title="Links" subtitle={`${draft.length} configured`} icon="☷" pad={draft.length ? 14 : 0}>
          {draft.length === 0
            ? <EmptyState icon="⇄" title="No transfer links" text="Loads stay on their own line." />
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
                {draft.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, border: '1px solid #E1E6EA' }}>
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <End label={t.line1Label} tank={t.tank1Id} />
                      <span style={{ color: THEME.amber, fontSize: 20, fontWeight: 800 }}>⟶</span>
                      <End label={t.line2Label} tank={t.tank2Id} />
                    </div>
                    <Button size="sm" variant="danger" onClick={() => setDraft(d => d.filter(x => x.id !== t.id))}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
        </Card>
      </div>
    </Page>
  );
}
