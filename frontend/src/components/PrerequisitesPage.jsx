import { useMemo } from 'react';
import StatusLed from './StatusLed';
import { indexTags, ledStateOf } from '../config/ledState';
import { PREREQUISITE_SECTIONS } from '../config/prerequisites';

const T = {
  panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4', border: '#C4C8D4',
  accent: '#1565C0', textWh: '#1A2035',
};

const LABEL_COL = 150;
const CELL_COL = 96;

function PrerequisiteTable({ table, index, connected }) {
  const cols = `${LABEL_COL}px repeat(${table.columns.length}, ${CELL_COL}px)`;
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '10px 14px',
        background: T.cardHdr, borderBottom: `2px solid ${T.accent}`,
        fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.accent,
      }}>
        <div />
        {table.columns.map(c => <div key={c.id} style={{ textAlign: 'center' }}>{c.label}</div>)}
      </div>
      {table.rows.map((row, i) => (
        <div key={row.id} style={{
          display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center',
          padding: '9px 14px', background: i % 2 ? T.cardBg : T.panelBg,
          borderBottom: i < table.rows.length - 1 ? `1px solid ${T.border}55` : 'none',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.textWh }}>{row.label}</div>
          {table.columns.map(col => (
            <div key={col.id} style={{ display: 'flex', justifyContent: 'center' }}>
              <StatusLed
                shape="rect"
                label={`${col.label} ${row.label}`}
                state={ledStateOf(index, connected, table.tagName(row, col))}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// grpcTags / grpcConnected come from the app shell through SettingsPage's
// pageContext. Every indicator shows live tag values only.
// Sections that share a `row` number sit side by side on one line.
function groupIntoRows(sections) {
  const rows = new Map();
  for (const section of sections) {
    if (!rows.has(section.row)) rows.set(section.row, []);
    rows.get(section.row).push(section);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

const ROWS = groupIntoRows(PREREQUISITE_SECTIONS);

// grpcTags / grpcConnected come from the app shell through SettingsPage's
// pageContext. Every indicator shows live tag values only.
export default function PrerequisitesPage({ grpcTags = {}, grpcConnected = false }) {
  const index = useMemo(() => indexTags(grpcTags), [grpcTags]);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {ROWS.map((group, r) => (
        <div key={r} style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch' }}>
          {group.map(section => (
            <div key={section.id} style={{
              // Sized to its content, not stretched across the page
              flex: '0 1 auto', minWidth: 0,
              background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: 20, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 1.5, textAlign: 'center' }}>
                {section.title}
              </div>
              <div style={{
                flex: 1, display: 'flex', gap: 24, flexWrap: 'wrap',
                justifyContent: 'center', alignItems: 'center',
              }}>
                {section.tables.map(table => (
                  <PrerequisiteTable key={table.id} table={table} index={index} connected={grpcConnected} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
