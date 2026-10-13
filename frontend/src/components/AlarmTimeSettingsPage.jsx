import { useRef, useState } from 'react';
import { ALARM_TIME_ROWS, ALARM_TIME_COLUMNS, loadAlarmTimes, saveAlarmTimes } from '../config/alarmTimes';
import { THEME, FONT_COND } from '../theme';
import { Card, Grid, Input, Button, Badge, SavedNote, Callout } from '../ui/kit';

// Motion Timeouts — one card per wagon, a watchdog time (seconds) for each
// motion. If a motion takes longer than this, the PLC raises an alarm.
// Stored as { <motion>: { <wagon>: "12" } }, strings as typed; values save on
// blur, empty means "no timeout".

const ICONS = { lift: '⤒', lower: '⤓', slowForward: '⇢', slowBackward: '⇠', topDrip: '💧' };
const badValue = v => v !== '' && !(Number.isFinite(Number(v)) && Number(v) >= 0);

function tidy(times) {
  const out = {};
  for (const [row, cols] of Object.entries(times)) {
    const kept = Object.fromEntries(Object.entries(cols || {}).filter(([, v]) => v !== '' && !badValue(v)));
    if (Object.keys(kept).length) out[row] = kept;
  }
  return out;
}

export default function AlarmTimeSettingsPage() {
  const [values, setValues] = useState(loadAlarmTimes);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);

  const persist = next => {
    saveAlarmTimes(tidy(next));
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1400);
  };

  const setCell = (row, col, value) => {
    setFlash(false);
    setValues(v => ({ ...v, [row]: { ...v[row], [col]: value } }));
  };

  const commitCell = (row, col) => {
    if (badValue(values[row]?.[col] ?? '')) return;
    persist(values);
  };

  const copyFirstToAll = () => {
    const src = ALARM_TIME_COLUMNS[0];
    const next = { ...values };
    ALARM_TIME_ROWS.forEach(r => {
      const v = values[r.id]?.[src] ?? '';
      if (v === '' || badValue(v)) return;
      next[r.id] = { ...next[r.id], ...Object.fromEntries(ALARM_TIME_COLUMNS.map(c => [c, v])) };
    });
    setValues(next);
    persist(next);
  };

  const anyBad = ALARM_TIME_ROWS.some(r => ALARM_TIME_COLUMNS.some(c => badValue(values[r.id]?.[c] ?? '')));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
        {anyBad && <Badge toneName="danger">Times must be 0 or more</Badge>}
        <SavedNote show={flash && !anyBad} />
        <Button size="sm" icon="⧉" onClick={copyFirstToAll}>Copy {ALARM_TIME_COLUMNS[0]} to all wagons</Button>
      </div>

      <Grid min={260}>
        {ALARM_TIME_COLUMNS.map(col => {
          const set = ALARM_TIME_ROWS.filter(r => (values[r.id]?.[col] ?? '') !== '').length;
          return (
            <Card key={col} pad={16}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: FONT_COND, fontSize: 24, fontWeight: 700, color: THEME.text }}>Wagon {col.replace(/\D/g, '')}</div>
                <Badge toneName={set === ALARM_TIME_ROWS.length ? 'ok' : set ? 'amber' : 'neutral'}>{set}/{ALARM_TIME_ROWS.length} set</Badge>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ALARM_TIME_ROWS.map(row => {
                  const value = values[row.id]?.[col] ?? '';
                  return (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 96px', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, color: THEME.accentDark, textAlign: 'center' }}>{ICONS[row.id] || '•'}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: THEME.text }}>{row.label}</span>
                      <div style={{ position: 'relative' }}>
                        <Input type="number" step="any" min="0" placeholder="—" aria-label={`${row.label} ${col}`}
                          value={value} invalid={badValue(value)} style={{ textAlign: 'right', paddingRight: 24, height: 34 }}
                          onChange={e => setCell(row.id, col, e.target.value)}
                          onBlur={() => commitCell(row.id, col)}
                          onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
                        <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 12, color: THEME.textDim, pointerEvents: 'none' }}>s</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </Grid>

      <Callout title="How timeouts work">
        If a wagon takes longer than its timeout to finish a motion (e.g. a lift doesn't reach the top), the PLC
        stops that wagon and raises a motion alarm. Leave a box empty to disable that check.
      </Callout>
    </div>
  );
}
