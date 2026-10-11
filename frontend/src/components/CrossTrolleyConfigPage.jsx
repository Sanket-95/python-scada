import { useState, useMemo } from 'react';
import { tankIdRange } from '../config/userConfig';

const T = {
  pageBg:   '#F0F2F6', panelBg:  '#FFFFFF', cardBg:   '#F4F5FA',
  cardHdr:  '#E8EBF4', inputBg:  '#FFFFFF', inputText:'#1A2035',
  border:   '#C4C8D4', teal:     '#1565C0', tealBr:   '#1565C0',
  accent:   '#1565C0', ok:       '#2E7D32', warn:     '#E65100',
  red:      '#C62828', textWh:   '#1A2035', textLt:   '#3A4F6A',
  textDim:  '#8090A8',
};

const inp = (extra = {}) => ({
  boxSizing: 'border-box', background: T.inputBg, color: T.inputText,
  border: `1.5px solid ${T.border}`, borderRadius: 5,
  padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
  ...extra,
});

// Schematic preview: two horizontal rails (the two lines) with a trolley
// device bridging the chosen tanks — a simplified stand-in for the real
// 2D/3D render, just to confirm which tanks are being linked before saving.
function TrolleyPreview({ label1, tank1, label2, tank2 }) {
  const w = 260, railY1 = 30, railY2 = 130, h = 160;
  const x1 = 70, x2 = 190;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <line x1={20} y1={railY1} x2={w - 20} y2={railY1} stroke="#FFB300" strokeWidth="6" strokeLinecap="round" />
      <line x1={20} y1={railY2} x2={w - 20} y2={railY2} stroke="#FF8F00" strokeWidth="6" strokeLinecap="round" />

      <text x={22} y={railY1 - 10} fontSize="11" fontWeight="700" fill={T.textLt}>{label1}</text>
      <text x={22} y={railY2 + 22} fontSize="11" fontWeight="700" fill={T.textLt}>{label2}</text>

      {/* Tank markers */}
      <rect x={x1 - 12} y={railY1 - 12} width="24" height="24" rx="3" fill="#0A1420" stroke="#FFB300" strokeWidth="2" />
      <text x={x1} y={railY1 + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">{tank1}</text>
      <rect x={x2 - 12} y={railY2 - 12} width="24" height="24" rx="3" fill="#0A1420" stroke="#FF8F00" strokeWidth="2" />
      <text x={x2} y={railY2 + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">{tank2}</text>

      {/* Connecting trolley track */}
      <line x1={x1} y1={railY1 + 12} x2={x2} y2={railY2 - 12} stroke="#C62828" strokeWidth="4" strokeDasharray="7,5" />
      <rect x={(x1 + x2) / 2 - 11} y={(railY1 + railY2) / 2 - 11} width="22" height="22" rx="4"
        fill="#C62828" stroke="#FFD740" strokeWidth="1.8" />
      <text x={(x1 + x2) / 2} y={(railY1 + railY2) / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#FFD740">⇄</text>
    </svg>
  );
}

export default function CrossTrolleyConfigPage({ userCfg, trolleys, onSave, onBack }) {
  const [draft, setDraft] = useState(() => trolleys.map(t => ({ ...t })));
  const [line1Idx, setLine1Idx] = useState(0);
  const [line2Idx, setLine2Idx] = useState(userCfg.lines.length > 1 ? 1 : 0);
  const [tank1, setTank1] = useState(null);
  const [tank2, setTank2] = useState(null);
  const [error, setError] = useState('');

  const lineRanges = useMemo(
    () => userCfg.lines.map((_, i) => tankIdRange(userCfg, i)),
    [userCfg]
  );

  const [r1Lo, r1Hi] = lineRanges[line1Idx] || [1, 1];
  const [r2Lo, r2Hi] = lineRanges[line2Idx] || [1, 1];
  const effTank1 = tank1 ?? r1Lo;
  const effTank2 = tank2 ?? r2Lo;

  const addTrolley = () => {
    if (line1Idx === line2Idx) {
      setError('Pick two different lines — a cross trolley bridges two separate lines.');
      return;
    }
    if (effTank1 < r1Lo || effTank1 > r1Hi || effTank2 < r2Lo || effTank2 > r2Hi) {
      setError('Selected tank is outside that line\'s tank range.');
      return;
    }
    setError('');
    setDraft(d => [...d, {
      id: `xt_${Date.now()}`,
      line1Id: userCfg.lines[line1Idx].id,
      line1Label: userCfg.lines[line1Idx].label,
      tank1Id: effTank1,
      line2Id: userCfg.lines[line2Idx].id,
      line2Label: userCfg.lines[line2Idx].label,
      tank2Id: effTank2,
    }]);
  };

  const removeTrolley = id => setDraft(d => d.filter(t => t.id !== id));

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'hidden', background: T.pageBg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, monospace",
    }}>
      {/* Header */}
      <div style={{
        background: T.cardHdr, borderBottom: `3px solid ${T.teal}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 14,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <div style={{
          background: T.teal, color: '#FFFFFF', fontWeight: 900,
          fontSize: 18, padding: '6px 12px', borderRadius: 4,
        }}>⇄</div>
        <div>
          <div style={{ fontSize: 11, color: T.tealBr, letterSpacing: 3, fontWeight: 600 }}>
            CROSS TROLLEY CONFIGURATION
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textWh, marginTop: 2 }}>
            Bridge a tank on one line to a tank on another
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* New trolley builder */}
        <div style={{
          background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 18,
          display: 'flex', gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.tealBr, letterSpacing: 1.5 }}>ADD CROSS TROLLEY</div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5 }}>LINE 1</div>
                <select
                  value={line1Idx}
                  onChange={e => { setLine1Idx(+e.target.value); setTank1(null); setError(''); }}
                  style={{ ...inp(), width: '100%', cursor: 'pointer' }}
                >
                  {userCfg.lines.map((l, i) => (
                    <option key={l.id} value={i}>{l.label} (#{lineRanges[i][0]}–#{lineRanges[i][1]})</option>
                  ))}
                </select>
              </div>
              <div style={{ width: 90 }}>
                <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5 }}>TANK</div>
                <input
                  type="number" min={r1Lo} max={r1Hi} value={effTank1}
                  onChange={e => { setTank1(Math.max(r1Lo, Math.min(r1Hi, +e.target.value || r1Lo))); setError(''); }}
                  style={{ ...inp(), width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5 }}>LINE 2</div>
                <select
                  value={line2Idx}
                  onChange={e => { setLine2Idx(+e.target.value); setTank2(null); setError(''); }}
                  style={{ ...inp(), width: '100%', cursor: 'pointer' }}
                >
                  {userCfg.lines.map((l, i) => (
                    <option key={l.id} value={i}>{l.label} (#{lineRanges[i][0]}–#{lineRanges[i][1]})</option>
                  ))}
                </select>
              </div>
              <div style={{ width: 90 }}>
                <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5 }}>TANK</div>
                <input
                  type="number" min={r2Lo} max={r2Hi} value={effTank2}
                  onChange={e => { setTank2(Math.max(r2Lo, Math.min(r2Hi, +e.target.value || r2Lo))); setError(''); }}
                  style={{ ...inp(), width: '100%' }}
                />
              </div>
            </div>

            <button onClick={addTrolley} style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: T.ok, border: 'none', color: '#fff', borderRadius: 6, fontFamily: 'inherit',
              boxShadow: `0 0 14px ${T.ok}55`,
            }}>+ Add Cross Trolley</button>

            {error && (
              <div style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>{error}</div>
            )}
          </div>

          {/* Live preview */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 1, marginBottom: 10 }}>PREVIEW — BEFORE SAVING</div>
            <div style={{
              background: '#0A1420', border: `1px solid ${T.border}`, borderRadius: 8,
              padding: '16px', display: 'flex', justifyContent: 'center', overflowX: 'auto',
            }}>
              <TrolleyPreview
                label1={userCfg.lines[line1Idx]?.label} tank1={effTank1}
                label2={userCfg.lines[line2Idx]?.label} tank2={effTank2}
              />
            </div>
            <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 8 }}>
              A trolley device renders bridging tank #{effTank1} on {userCfg.lines[line1Idx]?.label} to tank #{effTank2} on
              {' '}{userCfg.lines[line2Idx]?.label}, in both the 2D and 3D views. This is a visual device marker —
              wagon movement and load logic are unchanged.
            </div>
          </div>
        </div>

        {/* Existing trolleys */}
        <div style={{
          background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 18,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.tealBr, letterSpacing: 1.5, marginBottom: 12 }}>
            SAVED CROSS TROLLEYS ({draft.length})
          </div>
          {draft.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textDim, fontStyle: 'italic', padding: '8px 0' }}>
              No cross trolleys yet — lines run independently with no transfer point.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6,
                  padding: '10px 14px',
                }}>
                  <div style={{
                    background: T.accent, color: '#fff', fontWeight: 800, fontSize: 11,
                    padding: '4px 10px', borderRadius: 4, whiteSpace: 'nowrap',
                  }}>{t.line1Label || t.line1Id} #{t.tank1Id}</div>
                  <span style={{ fontSize: 16, color: T.red, fontWeight: 800 }}>⇄</span>
                  <div style={{
                    background: '#FF8F00', color: '#fff', fontWeight: 800, fontSize: 11,
                    padding: '4px 10px', borderRadius: 4, whiteSpace: 'nowrap',
                  }}>{t.line2Label || t.line2Id} #{t.tank2Id}</div>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => removeTrolley(t.id)} style={{
                    padding: '6px 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    background: T.panelBg, border: `1.5px solid ${T.border}`,
                    color: T.red, borderRadius: 5, fontFamily: 'inherit',
                  }}>✕ Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
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
        }}>← Back</button>

        <button onClick={() => onSave(draft)} style={{
          padding: '10px 32px', fontSize: 13, fontWeight: 700,
          background: T.teal, border: 'none', color: '#FFFFFF',
          cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
          boxShadow: `0 0 18px ${T.teal}55`,
        }}>✔ Save &amp; Apply</button>
      </div>
    </div>
  );
}
