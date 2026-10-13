import { useMemo } from 'react';
import { indexTags, ledStateOf } from '../config/ledState';
import { PREREQUISITE_SECTIONS, checkState } from '../config/prerequisites';
import { THEME, FONT_COND } from '../theme';
import { Card, Grid, Badge, Meter, Stat } from '../ui/kit';

// Start Readiness — every interlock that has to be healthy before the line can
// run in auto, shown as one checklist card per unit (each wagon, each cross
// trolley, each lidded tank) with a readiness meter. Live tag values only.

function unitsOf(section) {
  // One unit per table column; a unit's checks are that table's rows.
  return section.tables.flatMap(table => table.columns.map(col => ({
    key: `${table.id}:${col.id}`, label: col.label,
    checks: table.rows.map(r => ({ key: r.id, label: r.label, tag: table.tagName(r, col), row: r })),
  })));
}

const ITEM_ICON = { on: '✓', off: '✕', unknown: '–' };
const ITEM_TONE = { on: THEME.ok, off: THEME.danger, unknown: THEME.textDim };

export default function PrerequisitesPage({ grpcTags = {}, grpcConnected = false }) {
  const index = useMemo(() => indexTags(grpcTags), [grpcTags]);

  const groups = PREREQUISITE_SECTIONS.map(section => ({
    id: section.id, title: section.title,
    units: unitsOf(section).map(u => {
      const checks = u.checks.map(c => ({ ...c, state: checkState(c.row, ledStateOf(index, grpcConnected, c.tag)) }));
      return { ...u, checks, ok: checks.filter(c => c.state === 'on').length };
    }),
  }));
  const allUnits = groups.flatMap(g => g.units);
  const total = allUnits.reduce((a, u) => a + u.checks.length, 0);
  const ok = allUnits.reduce((a, u) => a + u.ok, 0);
  const readyUnits = allUnits.filter(u => u.ok === u.checks.length).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Grid min={220}>
        <Stat label="Line status" value={ok === total ? 'READY' : 'BLOCKED'} toneName={ok === total ? 'ok' : 'danger'} icon={ok === total ? '✓' : '!'} sub={grpcConnected ? 'all interlocks evaluated live' : 'no live data'} />
        <Stat label="Interlocks healthy" value={`${ok}/${total}`} toneName="info" icon="⛓" />
        <Stat label="Units ready" value={`${readyUnits}/${allUnits.length}`} icon="▣" />
      </Grid>

      {groups.map(g => (
        <div key={g.id}>
          <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textMid, margin: '4px 0 10px', textTransform: 'capitalize' }}>{g.title.toLowerCase()}</div>
          <Grid min={240}>
            {g.units.map(u => {
              const ready = u.ok === u.checks.length;
              return (
                <Card key={u.key} pad={16}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <div style={{ fontFamily: FONT_COND, fontSize: 21, fontWeight: 700, color: THEME.text }}>{u.label}</div>
                    <Badge toneName={ready ? 'ok' : 'danger'} dot>{ready ? 'Ready' : 'Not ready'}</Badge>
                  </div>
                  <Meter value={u.ok} max={u.checks.length} color={ready ? THEME.ok : THEME.warn} />
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {u.checks.map(c => (
                      <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: '#FFFFFF', background: ITEM_TONE[c.state],
                        }}>{ITEM_ICON[c.state]}</span>
                        <span style={{ flex: 1, color: THEME.text, fontWeight: 600 }}>{c.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: ITEM_TONE[c.state] }}>
                          {c.state === 'on' ? 'OK' : c.state === 'off' ? 'FAULT' : 'NO DATA'}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </Grid>
        </div>
      ))}
    </div>
  );
}
