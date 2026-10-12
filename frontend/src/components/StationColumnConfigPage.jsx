import { useMemo, useState } from 'react';
import { TAG_DATA_TYPES } from '../config/tagConfig';

// ── Default column definitions ─────────────────────────────────────────────
// Empty — StationInfoPage.jsx falls back to this only when stationColCfg has
// never been saved. Real rows now come from Mimic Page Config (see below),
// not from a fixed default list.
export const DEFAULT_STATION_COLS = [];

const T = {
  pageBg:   '#F0F2F6', panelBg:  '#FFFFFF', cardBg:   '#F4F5FA',
  cardHdr:  '#E8EBF4', inputBg:  '#FFFFFF', inputText:'#1A2035',
  border:   '#C4C8D4', teal:     '#1565C0', tealBr:   '#1565C0',
  accent:   '#1565C0', ok:       '#2E7D32', warn:     '#E65100',
  red:      '#C62828', textWh:   '#1A2035', textLt:   '#3A4F6A',
  textDim:  '#8090A8', yellow:   '#1565C0',
};

// Rows are a read-only mirror of Mimic Page Config's Label column
// (tankTags[id].label — the common/canonical Station Name source, same as
// StationNamesConfigPage.jsx), one row per configured tank/station. Station
// No/Name/Load No Tag are not independently editable; Save just persists
// this list (with the enabled/dataType/tagName/address fields
// StationInfoPage.jsx's rendering switch still reads) into stationColCfg.
// On top of that fixed set, "+ Add Column" lets the user add any number of
// extra columns (own name + PLC data type), each with a per-station editable
// address and a start-address box that auto-fills every row incrementally on
// blur (same scheme as StationNamesConfigPage.jsx's Load Number array
// fill) — persisted separately via onSaveExtra into
// stationExtraCols/stationExtraValues. StationInfoPage.jsx reflects these
// same columns with their live PLC values.
export default function StationColumnConfigPage({
  tankTags = {}, stationLoadNumbers = {}, extraCols = [], extraAddrs = {},
  onSave, onSaveExtra, onBack,
}) {
  // ── User-added custom columns ───────────────────────────────────────────
  // Local editable drafts, seeded once from the saved props (same pattern as
  // StationNamesConfigPage.jsx's loadNumberDraft) — Save persists both this
  // and the existing read-only rows below in one shot.
  const [cols, setCols]   = useState(() => extraCols);
  const [addrs, setAddrs] = useState(() => extraAddrs);

  const [addingCol, setAddingCol]   = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState(TAG_DATA_TYPES[0].id);
  const [colStarts, setColStarts]   = useState({});   // {colId: start-address input value}
  const [colErrors, setColErrors]   = useState({});   // {colId: error text}

  const addColumn = () => {
    const name = newColName.trim();
    if (!name) return;
    setCols(prev => [...prev, { id: `x${Date.now()}`, name, dataType: newColType }]);
    setNewColName('');
    setNewColType(TAG_DATA_TYPES[0].id);
    setAddingCol(false);
  };

  const removeColumn = colId => {
    setCols(prev => prev.filter(c => c.id !== colId));
    setAddrs(prev => {
      const next = {};
      Object.entries(prev).forEach(([stationId, map]) => {
        const { [colId]: _drop, ...rest } = map || {};
        next[stationId] = rest;
      });
      return next;
    });
  };

  const setCell = (stationId, colId, value) => {
    setAddrs(prev => ({ ...prev, [stationId]: { ...(prev[stationId] || {}), [colId]: value } }));
  };

  // On lost focus of a column's start-address input, auto-fills every
  // station's address for that column incrementally — same scheme as
  // StationNamesConfigPage.jsx's Load Number array fill (letters prefix +
  // zero-padded incrementing number). Manual edits after this still work.
  const fillColumnFromStart = colId => {
    const start = (colStarts[colId] || '').trim();
    if (!start) return;
    const m = start.match(/^([A-Za-z]+)(\d+)$/);
    if (!m) {
      setColErrors(prev => ({ ...prev, [colId]: 'Start address must be letters followed by a number, e.g. D500' }));
      return;
    }
    setColErrors(prev => ({ ...prev, [colId]: '' }));
    const [, prefix, digits] = m;
    const width = digits.length;
    const base  = parseInt(digits, 10);
    setAddrs(prev => {
      const next = { ...prev };
      rows.forEach((row, i) => {
        const stationId = String(row.stationNo);
        const address = `${prefix}${String(base + i).padStart(width, '0')}`;
        next[stationId] = { ...(next[stationId] || {}), [colId]: address };
      });
      return next;
    });
  };

  const rows = useMemo(() => (
    Object.keys(tankTags)
      .map(Number)
      .sort((a, b) => a - b)
      .map(id => ({
        id: `stn_${id}`,
        stationNo: id,
        label: tankTags[String(id)]?.label || `Tank ${id}`,
        // This is a CONFIGURATION page, so it shows the configured PLC
        // address/tag itself (set on StationNamesConfigPage.jsx's "LOAD
        // NUMBER" column) — not a live reading. The live VALUE belongs on
        // the actual StationWise Info page (StationInfoPage.jsx), which
        // reads the live tag instead.
        loadNoTag: stationLoadNumbers[String(id)] || '',
        enabled: true,
        dataType: 'STRING',
        tagName: '',
        address: '',
      }))
  ), [tankTags, stationLoadNumbers]);

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
              Sourced from Mimic Page Config
            </div>
          </div>
        </div>
        <div style={{
          background: `${T.accent}18`, border: `1px solid ${T.accent}55`,
          borderRadius: 8, padding: '6px 14px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, color: T.accent, fontWeight: 700, letterSpacing: 2 }}>TOTAL</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{rows.length}</div>
        </div>
      </div>

      {/* ── Add column ── */}
      <div style={{
        background: '#F4F5FA', borderBottom: `1px solid ${T.border}`,
        padding: '10px 28px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        {!addingCol ? (
          <button onClick={() => setAddingCol(true)} style={{
            padding: '7px 16px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            background: T.teal, border: 'none', color: '#FFFFFF', borderRadius: 6,
          }}>+ Add Column</button>
        ) : (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.tealBr, letterSpacing: 1 }}>NEW COLUMN</span>
            <input
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
              placeholder="Column name"
              autoFocus
              style={{
                width: 180, boxSizing: 'border-box',
                background: T.inputBg, color: T.inputText,
                border: `1.5px solid ${T.border}`, borderRadius: 4,
                padding: '6px 9px', fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <select
              value={newColType}
              onChange={e => setNewColType(e.target.value)}
              style={{
                background: T.inputBg, color: T.inputText,
                border: `1.5px solid ${T.border}`, borderRadius: 4,
                padding: '6px 9px', fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            >
              {TAG_DATA_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button onClick={addColumn} style={{
              padding: '7px 16px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: T.teal, border: 'none', color: '#FFFFFF', borderRadius: 6,
            }}>Add</button>
            <button onClick={() => { setAddingCol(false); setNewColName(''); }} style={{
              padding: '7px 16px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: T.panelBg, border: `1.5px solid ${T.border}`, color: T.textLt, borderRadius: 6,
            }}>Cancel</button>
          </>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr>
              <TH w={70}>STATION NO</TH>
              <TH w={180} align="left">STATION NAME</TH>
              <TH w={110}>LOAD NO TAG</TH>
              {cols.map(col => (
                <th key={col.id} style={{
                  width: 150, minWidth: 150, padding: '6px 8px', fontSize: 9, fontWeight: 700,
                  color: T.tealBr, letterSpacing: 1.1, background: T.cardHdr,
                  borderBottom: `2px solid ${T.teal}`, textAlign: 'center',
                  borderRight: `1px solid ${T.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ whiteSpace: 'nowrap' }}>{col.name.toUpperCase()}</span>
                    <button onClick={() => removeColumn(col.id)} title="Remove column" style={{
                      border: 'none', background: 'transparent', color: T.red,
                      fontWeight: 900, cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1,
                    }}>×</button>
                  </div>
                  <div style={{ fontSize: 8, fontWeight: 500, color: T.textDim, letterSpacing: 0.5, marginBottom: 4 }}>
                    {TAG_DATA_TYPES.find(t => t.id === col.dataType)?.label || col.dataType}
                  </div>
                  <input
                    value={colStarts[col.id] || ''}
                    onChange={e => setColStarts(prev => ({ ...prev, [col.id]: e.target.value }))}
                    onBlur={() => fillColumnFromStart(col.id)}
                    placeholder="Start addr, e.g. D500"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: T.inputBg, color: T.inputText,
                      border: `1.5px solid ${T.border}`, borderRadius: 4,
                      padding: '4px 6px', fontSize: 11, fontFamily: 'monospace', outline: 'none',
                      fontWeight: 400, letterSpacing: 0,
                    }}
                  />
                  {colErrors[col.id] && (
                    <div style={{ fontSize: 8, color: T.red, fontWeight: 600, marginTop: 2, whiteSpace: 'normal' }}>
                      {colErrors[col.id]}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const base = i % 2 === 0 ? T.cardBg : T.panelBg;
              const hasTag = !!row.loadNoTag;
              const stationId = String(row.stationNo);
              return (
                <tr key={row.id} style={{ background: base }}>
                  <td style={{ ...TD, padding: '6px 10px', fontSize: 12, color: T.textLt, textAlign: 'center', fontWeight: 700 }}>
                    {row.stationNo}
                  </td>
                  <td style={{ ...TD, padding: '6px 10px', fontSize: 12, color: T.textLt }}>
                    {row.label}
                  </td>
                  <td style={{
                    ...TD, padding: '6px 10px', fontSize: 12, textAlign: 'center', fontFamily: 'monospace',
                    color: hasTag ? T.textWh : T.textDim, fontWeight: hasTag ? 700 : 400,
                  }}>
                    {hasTag ? row.loadNoTag : 'Not configured'}
                  </td>
                  {cols.map(col => (
                    <td key={col.id} style={{ ...TD, padding: '5px 8px', textAlign: 'center' }}>
                      <input
                        value={addrs[stationId]?.[col.id] || ''}
                        onChange={e => setCell(stationId, col.id, e.target.value)}
                        placeholder="e.g. D500"
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: T.inputBg, color: T.inputText,
                          border: `1.5px solid ${T.border}`, borderRadius: 4,
                          padding: '5px 9px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                        }}
                        onFocus={e => e.target.style.borderColor = T.teal}
                        onBlur={e  => e.target.style.borderColor = T.border}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* Empty state */}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3 + cols.length} style={{
                  padding: '40px', textAlign: 'center',
                  color: T.textDim, fontSize: 13, fontStyle: 'italic',
                }}>
                  No stations configured
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

        <button onClick={() => { onSave(rows); onSaveExtra?.(cols, addrs); }} style={{
          padding: '10px 32px', fontSize: 13, fontWeight: 700,
          background: T.teal, border: 'none', color: '#FFFFFF',
          cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
          boxShadow: `0 0 18px ${T.teal}55`,
        }}>✔ Save Column Config</button>
      </div>
    </div>
  );
}
