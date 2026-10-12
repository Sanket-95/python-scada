import { useState } from 'react';

// ── Default column definitions — no fixed/width, fully deletable ──────────────
// Emptied on request (was: Station Name, Load No, Duration, Client Name, Part
// Name, Temp PV, Temp SV, Current PV, Current SV, pH PV) — page now starts
// blank; rows are added via "+ Add" only.
export const DEFAULT_STATION_COLS = [];

const T = {
  pageBg:   '#F0F2F6', panelBg:  '#FFFFFF', cardBg:   '#F4F5FA',
  cardHdr:  '#E8EBF4', inputBg:  '#FFFFFF', inputText:'#1A2035',
  border:   '#C4C8D4', teal:     '#1565C0', tealBr:   '#1565C0',
  accent:   '#1565C0', ok:       '#2E7D32', warn:     '#E65100',
  red:      '#C62828', textWh:   '#1A2035', textLt:   '#3A4F6A',
  textDim:  '#8090A8', yellow:   '#1565C0',
};

const inp = (extra = {}) => ({
  boxSizing: 'border-box', background: T.inputBg, color: T.inputText,
  border: `1.5px solid ${T.border}`, borderRadius: 4,
  padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
  ...extra,
});

// Rows keep their dataType/tagName/address/enabled fields (other code —
// StationInfoPage.jsx's column rendering — still reads them), this page just
// no longer exposes #, Show, Move, Data Type, Tag Name, PLC Address, Status,
// or Del as editable UI — only the Station Name label, per request.
export default function StationColumnConfigPage({ colConfig, onSave, onBack }) {
  const [draft,   setDraft]   = useState(() => JSON.parse(JSON.stringify(colConfig)));
  const [newName, setNewName] = useState('');

  const update = (id, field, val) =>
    setDraft(d => d.map(c => c.id === id ? { ...c, [field]: val } : c));

  const addRow = () => {
    if (!newName.trim()) return;
    setDraft(d => [...d, {
      id: `col_${Date.now()}`, enabled: true,
      label: newName.trim(), dataType: '', tagName: '', address: '',
    }]);
    setNewName('');
  };

  const TH = ({ children, w, align = 'center' }) => (
    <th style={{
      width: w, minWidth: w, padding: '8px 8px', fontSize: 9, fontWeight: 700,
      color: T.tealBr, letterSpacing: 1.1, background: T.cardHdr,
      borderBottom: `2px solid ${T.teal}`, textAlign: align,
      borderRight: `1px solid ${T.border}`, whiteSpace: 'nowrap',
    }}>{children}</th>
  );

  const TD = { borderBottom: `1px solid ${T.border}33`, borderRight: `1px solid ${T.border}33` };

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'hidden', background: T.pageBg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, monospace",
    }}>

      {/* ── Header ── */}
      <div style={{
        background: T.cardHdr, borderBottom: `3px solid ${T.teal}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            background: T.teal, color: '#FFFFFF', fontWeight: 900,
            fontSize: 18, padding: '6px 12px', borderRadius: 4,
          }}>⊟</div>
          <div>
            <div style={{ fontSize: 11, color: T.tealBr, letterSpacing: 3, fontWeight: 600 }}>
              STATION INFO — COLUMN CONFIGURATION
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.textWh, marginTop: 2 }}>
              Add · Remove · Reorder · Bind PLC tags
            </div>
          </div>
        </div>
        <div style={{
          background: `${T.accent}18`, border: `1px solid ${T.accent}55`,
          borderRadius: 8, padding: '6px 14px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, color: T.accent, fontWeight: 700, letterSpacing: 2 }}>TOTAL</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{draft.length}</div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        background: '#F4F5FA', borderBottom: `1px solid ${T.border}`,
        padding: '8px 20px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New station name, e.g. Voltage PV"
          style={{ ...inp(), width: 240 }}
          onFocus={e => e.target.style.borderColor = T.ok}
          onBlur={e  => e.target.style.borderColor = T.border}
          onKeyDown={e => e.key === 'Enter' && addRow()}
        />
        <button
          onClick={addRow}
          disabled={!newName.trim()}
          style={{
            padding: '7px 18px', fontSize: 12, fontWeight: 700,
            cursor: newName.trim() ? 'pointer' : 'default',
            background: newName.trim() ? T.ok : '#E8F5E9',
            border: `2px solid ${T.ok}`, color: newName.trim() ? '#001800' : T.textDim,
            borderRadius: 6, fontFamily: 'inherit', letterSpacing: 0.5,
            opacity: newName.trim() ? 1 : 0.6,
            boxShadow: newName.trim() ? `0 0 10px ${T.ok}44` : 'none',
          }}
        >+ Add</button>

        <div style={{ width: 1, height: 26, background: T.border }} />

        <button
          onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_STATION_COLS)))}
          style={{
            padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: T.cardBg, border: `1.5px solid ${T.border}`,
            color: T.textDim, borderRadius: 5, fontFamily: 'inherit',
          }}
        >↺ Reset Defaults</button>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr>
              <TH w={180} align="left">STATION NAME</TH>
            </tr>
          </thead>
          <tbody>
            {draft.map((col, i) => {
              const base  = i % 2 === 0 ? T.cardBg : T.panelBg;
              return (
                <tr key={col.id} style={{ background: base }}>
                  <td style={{ ...TD, padding: '6px 10px' }}>
                    <input
                      value={col.label}
                      onChange={e => update(col.id, 'label', e.target.value)}
                      style={{ ...inp(), width: '100%' }}
                      onFocus={e => e.target.style.borderColor = T.teal}
                      onBlur={e  => e.target.style.borderColor = T.border}
                    />
                  </td>
                </tr>
              );
            })}

            {/* Empty state */}
            {draft.length === 0 && (
              <tr>
                <td style={{
                  padding: '40px', textAlign: 'center',
                  color: T.textDim, fontSize: 13, fontStyle: 'italic',
                }}>
                  No entries — type a name above and click <strong style={{ color: T.ok }}>+ Add</strong>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div style={{
        background: T.panelBg, borderTop: `2px solid ${T.border}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
      }}>
        <button onClick={onBack} style={{
          padding: '10px 24px', fontSize: 13, fontWeight: 600,
          background: T.cardBg, border: `1.5px solid ${T.border}`,
          color: T.textLt, cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
        }}>← Back to Config</button>

        <button onClick={() => onSave(draft)} style={{
          padding: '10px 32px', fontSize: 13, fontWeight: 700,
          background: T.teal, border: 'none', color: '#FFFFFF',
          cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
          boxShadow: `0 0 18px ${T.teal}55`,
        }}>✔ Save Column Config</button>
      </div>
    </div>
  );
}
