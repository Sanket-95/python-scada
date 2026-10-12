import { useMemo } from 'react';

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
// StationNamesConfigPage.jsx), one row per configured tank/station. Nothing
// here is independently editable; Save just persists this list (with the
// enabled/dataType/tagName/address fields StationInfoPage.jsx's rendering
// switch still reads) into stationColCfg.
export default function StationColumnConfigPage({ tankTags = {}, onSave, onBack }) {
  const rows = useMemo(() => (
    Object.keys(tankTags)
      .map(Number)
      .sort((a, b) => a - b)
      .map(id => ({
        id: `stn_${id}`,
        stationNo: id,
        label: tankTags[String(id)]?.label || `Tank ${id}`,
        enabled: true,
        dataType: 'STRING',
        tagName: '',
        address: '',
      }))
  ), [tankTags]);

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

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr>
              <TH w={70}>STATION NO</TH>
              <TH w={180} align="left">STATION NAME</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const base = i % 2 === 0 ? T.cardBg : T.panelBg;
              return (
                <tr key={row.id} style={{ background: base }}>
                  <td style={{ ...TD, padding: '6px 10px', fontSize: 12, color: T.textLt, textAlign: 'center', fontWeight: 700 }}>
                    {row.stationNo}
                  </td>
                  <td style={{ ...TD, padding: '6px 10px', fontSize: 12, color: T.textLt }}>
                    {row.label}
                  </td>
                </tr>
              );
            })}

            {/* Empty state */}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} style={{
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

        <button onClick={() => onSave(rows)} style={{
          padding: '10px 32px', fontSize: 13, fontWeight: 700,
          background: T.teal, border: 'none', color: '#FFFFFF',
          cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
          boxShadow: `0 0 18px ${T.teal}55`,
        }}>✔ Save Column Config</button>
      </div>
    </div>
  );
}
