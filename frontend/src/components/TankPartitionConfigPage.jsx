import { useMemo, useState } from 'react';
import { tankIdRange } from '../config/userConfig';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, Button, Badge, Callout, EmptyState } from '../ui/kit';

// Tank Partitions — merge a run of adjacent tanks into one shell with internal
// divider walls (drawn that way in 2D/3D; each chamber stays its own station).
// Pick a range directly on the tank map: click the first tank, then the last.
// Groups: [{ id, lineId, lineLabel, fromId, toId }].

const GROUP_COLORS = ['#0E7C86', '#B45309', '#6B3FA8', '#2F855A', '#C53030', '#1F6FB2'];

export default function TankPartitionConfigPage({ userCfg, groups, onSave, onBack }) {
  const [draft, setDraft] = useState(() => groups.map(g => ({ ...g })));
  const [anchor, setAnchor] = useState(null);       // { lineId, id } — first click
  const [hoverId, setHoverId] = useState(null);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(groups);
  const names = userCfg.tankTags || {};

  const lines = useMemo(() => userCfg.lines.map((l, i) => {
    const [lo, hi] = tankIdRange(userCfg, i);
    return { ...l, lo, hi };
  }), [userCfg]);

  const groupOf = (lineId, id) => draft.find(g => g.lineId === lineId && id >= g.fromId && id <= g.toId);
  const colorOf = g => GROUP_COLORS[draft.indexOf(g) % GROUP_COLORS.length];

  const clickTank = (line, id) => {
    setError('');
    if (groupOf(line.id, id)) { setError(`Tank ${id} is already in a partition — remove that one first.`); setAnchor(null); return; }
    if (!anchor || anchor.lineId !== line.id) { setAnchor({ lineId: line.id, id }); return; }
    if (anchor.id === id) { setAnchor(null); return; }
    const from = Math.min(anchor.id, id), to = Math.max(anchor.id, id);
    for (let t = from; t <= to; t++) {
      if (groupOf(line.id, t)) { setError(`Tank ${t} is already part of another partition on this line.`); setAnchor(null); return; }
    }
    setDraft(d => [...d, { id: `grp_${Date.now()}`, lineId: line.id, lineLabel: line.label, fromId: from, toId: to }]);
    setAnchor(null);
  };

  const inPreview = (lineId, id) => {
    if (!anchor || anchor.lineId !== lineId || hoverId == null) return false;
    const a = Math.min(anchor.id, hoverId), b = Math.max(anchor.id, hoverId);
    return id >= a && id <= b;
  };

  return (
    <Page onBack={onBack} crumbs={['Configuration']} title="Tank Partitions"
      subtitle="Merge adjacent tanks into one partitioned shell (e.g. a long plating tank with several cells). Click the first tank, then the last."
      actions={(
        <>
          {dirty && <Badge toneName="amber" dot>Unsaved changes</Badge>}
          <Button disabled={!dirty} onClick={() => { setDraft(groups.map(g => ({ ...g }))); setAnchor(null); }}>Discard</Button>
          <Button variant="primary" icon="✓" disabled={!dirty} onClick={() => onSave(draft)}>Save partitions</Button>
        </>
      )}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <Callout toneName="danger" icon="!">{error}</Callout>}
          {anchor && !error && <Callout icon="➜">Start tank {anchor.id} selected — now click the last tank of the partition (or the same tank to cancel).</Callout>}
          {lines.map(line => {
            const ids = Array.from({ length: line.hi - line.lo + 1 }, (_, i) => line.lo + i);
            return (
              <Card key={line.id} title={line.label} subtitle={`Tanks ${line.lo}–${line.hi}`} icon="▥" pad={16}
                actions={<Badge>{draft.filter(g => g.lineId === line.id).length} partitions</Badge>}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 6 }}>
                  {ids.map(id => {
                    const g = groupOf(line.id, id);
                    const col = g ? colorOf(g) : null;
                    const isAnchor = anchor && anchor.lineId === line.id && anchor.id === id;
                    const preview = inPreview(line.id, id);
                    return (
                      <button key={id} title={names[id]?.label || `Tank ${id}`}
                        onClick={() => clickTank(line, id)}
                        onMouseEnter={() => setHoverId(id)} onMouseLeave={() => setHoverId(null)}
                        style={{
                          height: 64, borderRadius: 10, cursor: 'pointer', padding: 6, textAlign: 'left',
                          border: `2px solid ${isAnchor ? THEME.accent : col || (preview ? `${THEME.accent}88` : '#E1E6EA')}`,
                          background: col ? `${col}18` : preview ? THEME.accentSoft : '#FFFFFF',
                          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                        }}>
                        <span style={{ fontFamily: FONT_COND, fontSize: 19, fontWeight: 700, color: col || THEME.text }}>{id}</span>
                        <span style={{ fontSize: 10.5, color: THEME.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names[id]?.label || ''}</span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>

        <Card title="Partitions" icon="⧉" pad={draft.length ? 12 : 0} style={{ position: 'sticky', top: 0 }}>
          {draft.length === 0
            ? <EmptyState icon="▥" title="No partitions" text="Every tank is its own shell. Pick a range on the map to merge tanks." />
            : draft.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: '#F6F8FA', marginBottom: 8 }}>
                <span style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, background: colorOf(g) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>Tanks {g.fromId}–{g.toId}</div>
                  <div style={{ fontSize: 12.5, color: THEME.textDim }}>{g.lineLabel} · {g.toId - g.fromId + 1} chambers</div>
                </div>
                <Button size="sm" variant="danger" onClick={() => setDraft(d => d.filter(x => x.id !== g.id))}>Remove</Button>
              </div>
            ))}
        </Card>
      </div>
    </Page>
  );
}
