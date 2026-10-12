import { useState, useRef } from 'react';

// ── Default column definitions — no fixed/width, fully deletable ──────────────
export const DEFAULT_STATION_COLS = [
  { id: 'stName', label: 'Station Name',enabled: true, dataType: 'STRING', tagName: '', address: '' },
  { id: 'loadNo', label: 'Load No',     enabled: true, dataType: 'INT',    tagName: '', address: '' },
  { id: 'dur',    label: 'Duration',    enabled: true, dataType: 'TIME',   tagName: '', address: '' },
  { id: 'client', label: 'Client Name', enabled: true, dataType: 'STRING', tagName: '', address: '' },
  { id: 'part',   label: 'Part Name',   enabled: true, dataType: 'STRING', tagName: '', address: '' },
  { id: 'tempPV', label: 'Temp PV',     enabled: true, dataType: 'REAL',   tagName: '', address: '' },
  { id: 'tempSV', label: 'Temp SV',     enabled: true, dataType: 'REAL',   tagName: '', address: '' },
  { id: 'currPV', label: 'Current PV',  enabled: true, dataType: 'REAL',   tagName: '', address: '' },
  { id: 'currSV', label: 'Current SV',  enabled: true, dataType: 'REAL',   tagName: '', address: '' },
  { id: 'pH',     label: 'pH PV',       enabled: true, dataType: 'REAL',   tagName: '', address: '' },
];

const DATA_TYPES = ['', 'INT', 'REAL', 'STRING', 'TIME', 'BOOL'];

const T = {
  pageBg:   '#F0F2F6', panelBg:  '#FFFFFF', cardBg:   '#F4F5FA',
  cardHdr:  '#E8EBF4', inputBg:  '#FFFFFF', inputText:'#1A2035',
  border:   '#C4C8D4', teal:     '#1565C0', tealBr:   '#1565C0',
  accent:   '#1565C0', ok:       '#2E7D32', warn:     '#E65100',
  red:      '#C62828', textWh:   '#1A2035', textLt:   '#3A4F6A',
  textDim:  '#8090A8', yellow:   '#1565C0',
};

const TYPE_COL = { INT: '#4DBAFF', REAL: '#FF8C42', STRING: '#CE93D8', TIME: '#80DEEA', BOOL: '#80FF80' };

const BLANK_NEW = { label: '', dataType: 'REAL', tagName: '', address: '' };

const inp = (extra = {}) => ({
  boxSizing: 'border-box', background: T.inputBg, color: T.inputText,
  border: `1.5px solid ${T.border}`, borderRadius: 4,
  padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
  ...extra,
});

export default function StationColumnConfigPage({ colConfig, onSave, onBack }) {
  const [draft,   setDraft]   = useState(() => JSON.parse(JSON.stringify(colConfig)));
  const [dropIdx, setDropIdx] = useState(-1);
  const [delConfirm, setDelConfirm] = useState(null); // id pending delete confirm
  const [addOpen, setAddOpen] = useState(false);
  const [newCol,  setNewCol]  = useState(BLANK_NEW);
  const dragIdx = useRef(-1);

  // ── Field update ──────────────────────────────────────────────────────────
  const update = (id, field, val) =>
    setDraft(d => d.map(c => c.id === id ? { ...c, [field]: val } : c));

  // ── Add column ────────────────────────────────────────────────────────────
  const addColumn = () => {
    if (!newCol.label.trim()) return;
    setDraft(d => [...d, {
      id: `col_${Date.now()}`,
      enabled: true,
      label:   newCol.label.trim(),
      dataType:newCol.dataType,
      tagName: newCol.tagName.trim(),
      address: newCol.address.trim(),
    }]);
    setNewCol(BLANK_NEW);
    setAddOpen(false);
  };

  // ── Delete column ─────────────────────────────────────────────────────────
  const deleteCol = id => {
    setDraft(d => d.filter(c => c.id !== id));
    setDelConfirm(null);
  };

  // ── Reorder ───────────────────────────────────────────────────────────────
  const moveRow = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    setDraft(d => {
      const next = [...d];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const moveUp   = i => moveRow(i, i - 1);
  const moveDown = i => moveRow(i, i + 1);

  // ── Drag ─────────────────────────────────────────────────────────────────
  const onDragStart = (e, i) => {
    dragIdx.current = i;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(e.currentTarget, 20, 14);
  };
  const onDragOver = (e, i) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropIdx !== i) setDropIdx(i);
  };
  const onDrop = (e, i) => {
    e.preventDefault();
    moveRow(dragIdx.current, i);
    dragIdx.current = -1;
    setDropIdx(-1);
  };
  const onDragEnd = () => { dragIdx.current = -1; setDropIdx(-1); };

  const enabledCount = draft.filter(c => c.enabled).length;
  const taggedCount  = draft.filter(c => c.tagName).length;

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
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'VISIBLE', val: enabledCount,  col: T.ok     },
            { label: 'TAGGED',  val: taggedCount,   col: T.tealBr },
            { label: 'TOTAL',   val: draft.length,  col: T.accent },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              background: `${col}18`, border: `1px solid ${col}55`,
              borderRadius: 8, padding: '6px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: col, fontWeight: 700, letterSpacing: 2 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: col }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        background: '#F4F5FA', borderBottom: `1px solid ${T.border}`,
        padding: '8px 20px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button
          onClick={() => { setAddOpen(v => !v); setNewCol(BLANK_NEW); }}
          style={{
            padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: addOpen ? `${T.ok}22` : T.ok,
            border: `2px solid ${T.ok}`,
            color: addOpen ? T.ok : '#001800',
            borderRadius: 6, fontFamily: 'inherit', letterSpacing: 0.5,
            boxShadow: addOpen ? 'none' : `0 0 10px ${T.ok}44`,
          }}
        >{addOpen ? '✕ Cancel' : '+ Add Column'}</button>

        <div style={{ width: 1, height: 26, background: T.border }} />

        <button
          onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_STATION_COLS)))}
          style={{
            padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: T.cardBg, border: `1.5px solid ${T.border}`,
            color: T.textDim, borderRadius: 5, fontFamily: 'inherit',
          }}
        >↺ Reset Defaults</button>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: T.textDim }}>
          <span style={{ color: '#888', fontSize: 13 }}>⠿</span> drag to reorder &nbsp;·&nbsp; ▲▼ arrows &nbsp;·&nbsp; toggle to show/hide
        </span>
      </div>

      {/* ── Add Column Panel ── */}
      {addOpen && (
        <div style={{
          background: '#F0F4FF', borderBottom: `2px solid ${T.ok}`,
          padding: '14px 20px', flexShrink: 0,
          display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px', minWidth: 140 }}>
            <label style={{ fontSize: 9, color: T.tealBr, letterSpacing: 1.5, fontWeight: 700 }}>STATION NAME *</label>
            <input
              value={newCol.label}
              onChange={e => setNewCol(v => ({ ...v, label: e.target.value }))}
              placeholder="e.g. Voltage PV"
              style={{ ...inp(), width: '100%' }}
              onFocus={e => e.target.style.borderColor = T.ok}
              onBlur={e  => e.target.style.borderColor = T.border}
              onKeyDown={e => e.key === 'Enter' && addColumn()}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 9, color: T.tealBr, letterSpacing: 1.5, fontWeight: 700 }}>DATA TYPE</label>
            <select
              value={newCol.dataType}
              onChange={e => setNewCol(v => ({ ...v, dataType: e.target.value }))}
              style={{
                ...inp(), width: 100, cursor: 'pointer',
                background: T.cardBg, color: TYPE_COL[newCol.dataType] || T.textLt,
                fontWeight: 700,
              }}
            >
              {DATA_TYPES.map(t => (
                <option key={t} value={t} style={{ color: TYPE_COL[t] || T.textLt, background: T.cardBg }}>
                  {t || '— none —'}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px', minWidth: 140 }}>
            <label style={{ fontSize: 9, color: T.tealBr, letterSpacing: 1.5, fontWeight: 700 }}>TAG NAME</label>
            <input
              value={newCol.tagName}
              onChange={e => setNewCol(v => ({ ...v, tagName: e.target.value }))}
              placeholder="e.g. STN_VOLT_PV"
              style={{ ...inp(), width: '100%' }}
              onFocus={e => e.target.style.borderColor = T.ok}
              onBlur={e  => e.target.style.borderColor = T.border}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px', minWidth: 140 }}>
            <label style={{ fontSize: 9, color: T.tealBr, letterSpacing: 1.5, fontWeight: 700 }}>PLC ADDRESS</label>
            <input
              value={newCol.address}
              onChange={e => setNewCol(v => ({ ...v, address: e.target.value }))}
              placeholder="e.g. DB10.REAL8"
              style={{ ...inp(), width: '100%' }}
              onFocus={e => e.target.style.borderColor = T.ok}
              onBlur={e  => e.target.style.borderColor = T.border}
              onKeyDown={e => e.key === 'Enter' && addColumn()}
            />
          </div>

          <button
            onClick={addColumn}
            disabled={!newCol.label.trim()}
            style={{
              padding: '8px 24px', fontSize: 13, fontWeight: 700, cursor: newCol.label.trim() ? 'pointer' : 'default',
              background: newCol.label.trim() ? T.ok : '#E8F5E9',
              border: 'none', color: '#001800', borderRadius: 6, fontFamily: 'inherit',
              opacity: newCol.label.trim() ? 1 : 0.5,
              boxShadow: newCol.label.trim() ? `0 0 14px ${T.ok}55` : 'none',
              alignSelf: 'flex-end',
            }}
          >＋ Add</button>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr>
              <TH w={28}>⠿</TH>
              <TH w={54}>SHOW</TH>
              <TH w={76}>MOVE</TH>
              <TH w={180} align="left">STATION NAME</TH>
              <TH w={80}>DATA TYPE</TH>
              <TH w={200} align="left">TAG NAME</TH>
              <TH w={200} align="left">PLC ADDRESS</TH>
              <TH w={58}>STATUS</TH>
              <TH w={46}>DEL</TH>
            </tr>
          </thead>
          <tbody>
            {draft.map((col, i) => {
              const isDrop  = dropIdx === i;
              const dimmed  = !col.enabled;
              const base    = i % 2 === 0 ? T.cardBg : T.panelBg;
              const rowBg   = isDrop ? `${T.teal}28` : dimmed ? `${base}77` : base;
              const typeCol = TYPE_COL[col.dataType] || T.textDim;
              const isPendingDel = delConfirm === col.id;

              return (
                <tr
                  key={col.id}
                  draggable
                  onDragStart={e => onDragStart(e, i)}
                  onDragOver={e  => onDragOver(e, i)}
                  onDrop={e      => onDrop(e, i)}
                  onDragEnd={onDragEnd}
                  style={{
                    background: rowBg,
                    outline: isDrop ? `2px solid ${T.teal}` : 'none',
                    outlineOffset: -2,
                    opacity: dimmed ? 0.55 : 1,
                    transition: 'opacity 0.15s, background 0.1s',
                  }}
                >
                  {/* Drag handle */}
                  <td style={{ ...TD, padding: '7px 4px', textAlign: 'center', cursor: 'grab', userSelect: 'none' }}>
                    <span style={{ fontSize: 15, color: T.textDim }}>⠿</span>
                  </td>

                  {/* Toggle */}
                  <td style={{ ...TD, padding: '7px 6px', textAlign: 'center' }}>
                    <button
                      onClick={() => update(col.id, 'enabled', !col.enabled)}
                      title={col.enabled ? 'Hide column' : 'Show column'}
                      style={{
                        width: 40, height: 20, borderRadius: 10, border: 'none',
                        cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                        background: col.enabled ? T.ok : '#D0D8E4',
                        boxShadow: col.enabled ? `0 0 7px ${T.ok}66` : 'none',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2,
                        left: col.enabled ? 21 : 3,
                        width: 15, height: 15, borderRadius: '50%',
                        background: col.enabled ? '#FFFFFF' : '#8090A8',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                  </td>

                  {/* Move ▲▼ */}
                  <td style={{ ...TD, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {[
                          { label: '▲', disabled: i === 0,              onClick: () => moveUp(i)   },
                          { label: '▼', disabled: i === draft.length-1, onClick: () => moveDown(i) },
                        ].map(({ label, disabled, onClick }) => (
                          <button key={label} onClick={onClick} disabled={disabled} style={{
                            width: 20, height: 17, fontSize: 9, lineHeight: 1,
                            background: disabled ? '#F0F2F6' : T.panelBg,
                            border: `1px solid ${disabled ? T.border + '33' : T.border}`,
                            color: disabled ? T.textDim + '44' : T.tealBr,
                            borderRadius: 3, cursor: disabled ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                          }}>{label}</button>
                        ))}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.textDim, minWidth: 16, textAlign: 'center' }}>
                        {i + 1}
                      </span>
                    </div>
                  </td>

                  {/* Column Name */}
                  <td style={{ ...TD, padding: '6px 10px' }}>
                    <input
                      value={col.label}
                      onChange={e => update(col.id, 'label', e.target.value)}
                      onDragStart={e => e.stopPropagation()}
                      style={{ ...inp(), width: '100%' }}
                      onFocus={e => e.target.style.borderColor = T.teal}
                      onBlur={e  => e.target.style.borderColor = T.border}
                    />
                  </td>

                  {/* Data Type */}
                  <td style={{ ...TD, padding: '6px 6px', textAlign: 'center' }}>
                    <select
                      value={col.dataType}
                      onChange={e => update(col.id, 'dataType', e.target.value)}
                      onDragStart={e => e.stopPropagation()}
                      style={{
                        ...inp({ padding: '4px 4px', textAlign: 'center', cursor: 'pointer' }),
                        width: 68, fontWeight: 700, fontSize: 10,
                        color: TYPE_COL[col.dataType] || T.textLt,
                        background: T.cardBg,
                      }}
                    >
                      {DATA_TYPES.map(t => (
                        <option key={t} value={t} style={{ color: TYPE_COL[t] || T.textLt, background: T.cardBg }}>
                          {t || '—'}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Tag Name */}
                  <td style={{ ...TD, padding: '6px 10px' }}>
                    <input
                      value={col.tagName}
                      onChange={e => update(col.id, 'tagName', e.target.value)}
                      placeholder={`e.g. STN_${col.id.toUpperCase()}_TAG`}
                      onDragStart={e => e.stopPropagation()}
                      style={{ ...inp(), width: '100%' }}
                      onFocus={e => e.target.style.borderColor = T.teal}
                      onBlur={e  => e.target.style.borderColor = T.border}
                    />
                  </td>

                  {/* PLC Address */}
                  <td style={{ ...TD, padding: '6px 10px' }}>
                    <input
                      value={col.address}
                      onChange={e => update(col.id, 'address', e.target.value)}
                      placeholder="e.g. DB10.REAL4"
                      onDragStart={e => e.stopPropagation()}
                      style={{ ...inp(), width: '100%' }}
                      onFocus={e => e.target.style.borderColor = T.teal}
                      onBlur={e  => e.target.style.borderColor = T.border}
                    />
                  </td>

                  {/* Status */}
                  <td style={{ ...TD, padding: '6px 6px', textAlign: 'center' }}>
                    {col.tagName ? (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: T.teal,
                        background: `${T.teal}20`, padding: '2px 6px', borderRadius: 10,
                      }}>LIVE</span>
                    ) : (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: T.warn,
                        background: `${T.warn}20`, padding: '2px 6px', borderRadius: 10,
                      }}>MOCK</span>
                    )}
                  </td>

                  {/* Delete */}
                  <td style={{ ...TD, padding: '6px 6px', textAlign: 'center' }}>
                    {isPendingDel ? (
                      <button
                        onClick={() => deleteCol(col.id)}
                        title="Confirm delete"
                        style={{
                          width: 34, height: 26, fontSize: 9, fontWeight: 800, cursor: 'pointer',
                          background: T.red, border: 'none', color: '#fff',
                          borderRadius: 4, fontFamily: 'inherit',
                          animation: 'none',
                        }}
                        onBlur={() => setDelConfirm(null)}
                      >OK?</button>
                    ) : (
                      <button
                        onClick={() => setDelConfirm(col.id)}
                        title="Delete column"
                        style={{
                          width: 34, height: 26, fontSize: 14, cursor: 'pointer',
                          background: 'transparent', border: `1px solid ${T.border}`,
                          color: T.textDim, borderRadius: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0, transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}
                      >✕</button>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Empty state */}
            {draft.length === 0 && (
              <tr>
                <td colSpan={9} style={{
                  padding: '40px', textAlign: 'center',
                  color: T.textDim, fontSize: 13, fontStyle: 'italic',
                }}>
                  No columns — click <strong style={{ color: T.ok }}>+ Add Column</strong> to add one
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
