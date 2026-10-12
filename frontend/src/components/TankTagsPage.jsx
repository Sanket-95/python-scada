import { useState, useMemo } from 'react';
import { getTankIdsByLine, TAG_DATA_TYPES } from '../config/tagConfig';
import ExcelTagImportModal from './ExcelTagImportModal';
import { DEFAULT_STATION_NAMES } from './StationNamesConfigPage';

// ── Semi-dark config theme (same as ConfigPanel) ──────────────────────────────
const T = {
  pageBg:    '#F0F2F6',
  panelBg:   '#FFFFFF',
  cardBg:    '#F4F5FA',
  cardHdr:   '#E8EBF4',
  inputBg:   '#FFFFFF',
  inputText: '#1A2035',
  border:    '#C4C8D4',
  yellow:    '#1565C0',
  accent:    '#1565C0',
  ok:        '#2E7D32',
  textWhite: '#1A2035',
  textLt:    '#3A4F6A',
  textDim:   '#8090A8',
};

const TYPE_COL = { barrel: '#4DBAFF', basket: '#30D878', rack: '#FFB300' };

export default function TankTagsPage({ userCfg, tankTags, onSave, onBack }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(tankTags)));
  const [showImport, setShowImport] = useState(false);
  const [importedCount, setImportedCount] = useState(null);

  const setTag = (id, field, val) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], [field]: val } }));

  // Label is predefined, not user-editable here — it always mirrors the
  // common Station Name source (StationNamesConfigPage.jsx's
  // DEFAULT_STATION_NAMES), the same list StationNamesConfigPage and
  // StationInfoPage key off of.
  const stationNameFor = id => DEFAULT_STATION_NAMES[Number(id) - 1] ?? `Tank ${id}`;

  const handleSave = () => {
    const withNames = Object.fromEntries(
      Object.entries(draft).map(([id, tag]) => [id, { ...tag, label: stationNameFor(id) }])
    );
    onSave(withNames);
  };

  // Merge an Excel import's patch into the draft — only the fields that
  // were actually mapped+non-empty for each tank, leaving everything else
  // (including fields the user already hand-edited) untouched.
  const applyImport = patch => {
    setDraft(d => {
      const next = { ...d };
      Object.entries(patch).forEach(([tankId, update]) => {
        next[tankId] = { ...next[tankId], ...update };
      });
      return next;
    });
    setImportedCount(Object.keys(patch).length);
    setShowImport(false);
  };

  const lineGroups = useMemo(() =>
    getTankIdsByLine(userCfg).map((ids, idx) => ({
      line: userCfg.lines[idx],
      ids:  ids.map(String),
    }))
  , [userCfg]);

  const totalTags = Object.keys(draft).length;

  return (
    <div style={{
      width: '100%', height: '100%', overflowY: 'auto',
      background: T.pageBg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, monospace",
    }}>

      {/* ── Header ── */}
      <div style={{
        background: T.cardHdr, borderBottom: `3px solid ${T.accent}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            background: T.accent, color: '#001820',
            fontWeight: 900, fontSize: 18, padding: '6px 12px',
            borderRadius: 4, letterSpacing: 1,
          }}>⊞</div>
          <div>
            <div style={{ fontSize: 11, color: T.accent, letterSpacing: 3, fontWeight: 600 }}>
              MIMIC PAGE CONFIGURATION
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.textWhite, marginTop: 2 }}>
              Define tag name, label, and PLC address for each tank
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => { setImportedCount(null); setShowImport(true); }} style={{
            padding: '9px 18px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            background: T.cardBg, border: `1.5px solid ${T.accent}`, color: T.accent, borderRadius: 6,
          }}>📤 Import from Excel</button>
          <div style={{
            background: `${T.accent}18`, border: `1px solid ${T.accent}55`,
            borderRadius: 8, padding: '6px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, color: T.accent, fontWeight: 700, letterSpacing: 2 }}>TOTAL TAGS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.accent }}>{totalTags}</div>
          </div>
        </div>
      </div>

      {importedCount !== null && (
        <div style={{
          background: '#F1F8E9', borderBottom: `2px solid ${T.ok}55`,
          padding: '8px 28px', fontSize: 12, color: '#2E7D32', fontWeight: 600,
        }}>
          ✔ Imported {importedCount} tag(s) from Excel — review below, then press "Save Tags" to keep them.
        </div>
      )}

      {showImport && (
        <ExcelTagImportModal
          userCfg={userCfg}
          onApply={applyImport}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* ── Body — scrollable table per line ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {lineGroups.map(({ line, ids }) => {
          const col = TYPE_COL[line.type] || T.accent;
          return (
            <div key={line.id}>
              {/* Line label */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
                paddingBottom: 8, borderBottom: `2px solid ${col}`,
              }}>
                <div style={{
                  background: col, color: '#0D1A10',
                  fontWeight: 800, fontSize: 11, padding: '4px 12px', borderRadius: 4, letterSpacing: 1,
                }}>{line.label}</div>
                <span style={{ fontSize: 12, color: T.textLt }}>
                  {ids.length} tanks · type: <span style={{ color: col, fontWeight: 700 }}>{line.type?.toUpperCase()}</span>
                </span>
              </div>

              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.cardHdr }}>
                    {['TANK #', 'TAG NAME', 'LABEL', 'PLC ADDRESS', 'TYPE'].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left',
                        fontSize: 9, fontWeight: 700, color: T.textDim, letterSpacing: 1.5,
                        borderBottom: `1px solid ${T.border}`,
                        width: i === 0 ? 80 : i === 4 ? 180 : 'auto',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ids.map((id, i) => {
                    const tag = draft[id] || {};
                    return (
                      <tr key={id} style={{
                        background: i % 2 === 0 ? T.cardBg : T.panelBg,
                        transition: 'background 0.1s',
                      }}>
                        {/* Tank # */}
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <span style={{
                            fontWeight: 800, fontSize: 13, color: col,
                            background: `${col}18`, padding: '2px 8px', borderRadius: 4,
                          }}>#{id}</span>
                        </td>

                        {/* Tag name */}
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <input
                            value={tag.name || ''}
                            onChange={e => setTag(id, 'name', e.target.value)}
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: T.inputBg, color: T.inputText,
                              border: `1.5px solid ${T.border}`, borderRadius: 4,
                              padding: '5px 8px', fontSize: 12, fontFamily: 'monospace',
                              outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = T.accent}
                            onBlur={e  => e.target.style.borderColor = T.border}
                          />
                        </td>

                        {/* Label — predefined, not editable; common Station
                            Name source (see stationNameFor above) */}
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <div style={{
                            width: '100%', boxSizing: 'border-box',
                            background: T.cardBg, color: T.textLt,
                            border: `1.5px solid ${T.border}66`, borderRadius: 4,
                            padding: '5px 8px', fontSize: 12, fontFamily: "'Segoe UI', sans-serif",
                          }}>{stationNameFor(id)}</div>
                        </td>

                        {/* PLC address — where the real tank-loaded bit is
                            read from; blank means this tank keeps following
                            the mock simulation (see plc_publisher.py) */}
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <input
                            value={tag.address || ''}
                            onChange={e => setTag(id, 'address', e.target.value)}
                            placeholder="e.g. DB200.DBX0.0"
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: T.inputBg, color: T.inputText,
                              border: `1.5px solid ${T.border}`, borderRadius: 4,
                              padding: '5px 8px', fontSize: 12, fontFamily: 'monospace',
                              outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = T.accent}
                            onBlur={e  => e.target.style.borderColor = T.border}
                          />
                        </td>

                        {/* Data type — selectable so a tag can be read as
                            anything the PLC client layer supports, not just
                            a bare bit */}
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <select
                            value={tag.type || 'bool'}
                            onChange={e => setTag(id, 'type', e.target.value)}
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: T.inputBg, color: T.inputText,
                              border: `1.5px solid ${T.border}`, borderRadius: 4,
                              padding: '5px 6px', fontSize: 11, fontFamily: 'inherit',
                              outline: 'none', cursor: 'pointer',
                            }}
                            onFocus={e => e.target.style.borderColor = T.accent}
                            onBlur={e  => e.target.style.borderColor = T.border}
                          >
                            {TAG_DATA_TYPES.map(t => (
                              <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Info note */}
        <div style={{
          background: '#F1F8E9', border: `1px solid ${T.ok}55`,
          borderRadius: 6, padding: '10px 16px',
          fontSize: 11, color: '#4A8A30', lineHeight: 1.6,
        }}>
          <strong style={{ color: T.ok }}>Live PLC read — no mock data:</strong> A tank's loaded status comes entirely
          from its configured PLC address, read continuously from the real PLC (whichever brand/IP is saved on the PLC
          Connection Test screen) — any non-zero value shows the tank as loaded in the 3D/2D view. A tank with no
          address set here simply shows as never loaded until one is configured (there's no simulated fallback anymore).
        </div>
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
        }}>← Back to Lines</button>

        <button onClick={handleSave} style={{
          padding: '10px 32px', fontSize: 13, fontWeight: 700,
          background: T.yellow, border: 'none', color: '#FFFFFF',
          cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
          boxShadow: `0 0 18px ${T.yellow}55`,
        }}>✔ Save Tags</button>
      </div>
    </div>
  );
}
