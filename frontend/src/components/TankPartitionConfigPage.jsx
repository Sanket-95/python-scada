import { useState, useMemo } from 'react';
import { tankIdRange } from '../config/userConfig';

// Same hues Tank3D cycles through — keeps this preview visually honest to
// what the 3D view will actually show.
const CHAMBER_COLORS = ['#0E6A9A', '#C2185B', '#7B1FA2', '#00897B', '#558B2F', '#AFB42B'];

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

// Schematic preview of one merged/partitioned tank: one outer shell, N-1
// internal dividers, each chamber labeled with its own tank number — this is
// what the group will look like once applied (a simplified stand-in for the
// real 3D render, not to exact scale).
function GroupPreview({ fromId, count }) {
  const chamberW = 84, h = 92, gap = 3;
  const w = count * chamberW;
  return (
    <svg width={w + 20} height={h + 46} style={{ display: 'block' }}>
      <text x={(w + 20) / 2} y={16} textAnchor="middle" fontSize="11" fontWeight="700" fill={T.textLt}>
        1 shell · {count} chambers
      </text>
      <g transform="translate(10,26)">
        {/* outer shell */}
        <rect x={-3} y={-3} width={w + 6} height={h + 6} rx={4}
          fill="#0A1420" stroke="#FFB300" strokeWidth={2} />
        {Array.from({ length: count }, (_, i) => (
          <g key={i}>
            <rect x={i * chamberW + gap} y={0} width={chamberW - gap * 2} height={h}
              fill={CHAMBER_COLORS[i % CHAMBER_COLORS.length]} opacity={0.55} />
            {i > 0 && (
              <rect x={i * chamberW - 1.5} y={0} width={3} height={h} fill="#0A1420" />
            )}
            <text x={i * chamberW + chamberW / 2} y={h + 20} textAnchor="middle"
              fontSize="12" fontWeight="800" fill={T.textWh}>
              #{fromId + i}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function TankPartitionConfigPage({ userCfg, groups, onSave, onBack }) {
  const [draft, setDraft] = useState(() => groups.map(g => ({ ...g })));
  const [lineIdx, setLineIdx] = useState(0);
  const [fromId, setFromId] = useState(null);
  const [count, setCount] = useState(3);
  const [error, setError] = useState('');

  const lineRanges = useMemo(
    () => userCfg.lines.map((_, i) => tankIdRange(userCfg, i)),
    [userCfg]
  );

  const [rangeLo, rangeHi] = lineRanges[lineIdx] || [1, 1];
  const effectiveFrom = fromId ?? rangeLo;
  const maxCount = Math.max(2, rangeHi - effectiveFrom + 1);

  // Tanks already claimed by a saved group on this line, so a new group can't
  // straddle or duplicate them.
  const takenOnLine = useMemo(() => {
    const set = new Set();
    draft.forEach(g => {
      if (g.lineId !== userCfg.lines[lineIdx]?.id) return;
      for (let id = g.fromId; id <= g.toId; id++) set.add(id);
    });
    return set;
  }, [draft, lineIdx, userCfg]);

  const addGroup = () => {
    const from = effectiveFrom;
    const to = from + count - 1;
    if (from < rangeLo || to > rangeHi) {
      setError(`Tanks #${from}–#${to} are outside this line's range (#${rangeLo}–#${rangeHi}).`);
      return;
    }
    for (let id = from; id <= to; id++) {
      if (takenOnLine.has(id)) {
        setError(`Tank #${id} is already part of another partition group on this line.`);
        return;
      }
    }
    setError('');
    setDraft(d => [...d, {
      id: `grp_${Date.now()}`,
      lineId: userCfg.lines[lineIdx].id,
      lineLabel: userCfg.lines[lineIdx].label,
      fromId: from,
      toId: to,
    }]);
  };

  const removeGroup = id => setDraft(d => d.filter(g => g.id !== id));

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
        }}>▥</div>
        <div>
          <div style={{ fontSize: 11, color: T.tealBr, letterSpacing: 3, fontWeight: 600 }}>
            TANK PARTITION CONFIGURATION
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textWh, marginTop: 2 }}>
            Merge adjacent tanks into one partitioned shell
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* New group builder */}
        <div style={{
          background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 18,
          display: 'flex', gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.tealBr, letterSpacing: 1.5 }}>ADD PARTITION GROUP</div>

            <div>
              <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5 }}>LINE</div>
              <select
                value={lineIdx}
                onChange={e => { setLineIdx(+e.target.value); setFromId(null); setError(''); }}
                style={{ ...inp(), width: '100%', cursor: 'pointer' }}
              >
                {userCfg.lines.map((l, i) => (
                  <option key={l.id} value={i}>{l.label} (#{lineRanges[i][0]}–#{lineRanges[i][1]})</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5 }}>START TANK</div>
              <input
                type="number" min={rangeLo} max={rangeHi} value={effectiveFrom}
                onChange={e => { setFromId(Math.max(rangeLo, Math.min(rangeHi, +e.target.value || rangeLo))); setError(''); }}
                style={{ ...inp(), width: '100%' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5 }}>NUMBER OF PARTITIONS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => { setCount(c => Math.max(2, c - 1)); setError(''); }} style={ctrlBtn()}>−</button>
                <span style={{
                  fontSize: 20, fontWeight: 800, color: T.textWh, minWidth: 32, textAlign: 'center',
                  background: T.cardBg, padding: '3px 8px', borderRadius: 5, border: `1px solid ${T.border}`,
                }}>{count}</span>
                <button onClick={() => { setCount(c => Math.min(maxCount, c + 1)); setError(''); }} style={ctrlBtn()}>+</button>
              </div>
              <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>2 – {maxCount} chambers</div>
            </div>

            <button onClick={addGroup} style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: T.ok, border: 'none', color: '#fff', borderRadius: 6, fontFamily: 'inherit',
              boxShadow: `0 0 14px ${T.ok}55`,
            }}>+ Add Group</button>

            {error && (
              <div style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>{error}</div>
            )}
          </div>

          {/* Live preview of the group about to be added */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 1, marginBottom: 10 }}>PREVIEW — BEFORE SAVING</div>
            <div style={{
              background: '#0A1420', border: `1px solid ${T.border}`, borderRadius: 8,
              padding: '16px', display: 'flex', justifyContent: 'center', overflowX: 'auto',
            }}>
              <GroupPreview fromId={effectiveFrom} count={count} />
            </div>
            <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 8 }}>
              Tanks #{effectiveFrom}–#{effectiveFrom + count - 1} render as one continuous shell with
              {' '}{count - 1} internal divider{count - 1 === 1 ? '' : 's'}. Each chamber keeps its own fill level,
              load, and tag data — only the outer shape changes.
            </div>
          </div>
        </div>

        {/* Existing groups */}
        <div style={{
          background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 18,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.tealBr, letterSpacing: 1.5, marginBottom: 12 }}>
            SAVED PARTITION GROUPS ({draft.length})
          </div>
          {draft.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textDim, fontStyle: 'italic', padding: '8px 0' }}>
              No partition groups yet — every tank renders as its own individual shell.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.map(g => (
                <div key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6,
                  padding: '10px 14px',
                }}>
                  <div style={{
                    background: T.accent, color: '#fff', fontWeight: 800, fontSize: 11,
                    padding: '4px 10px', borderRadius: 4, whiteSpace: 'nowrap',
                  }}>{g.lineLabel || g.lineId}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.textWh }}>
                    Tanks #{g.fromId}–#{g.toId}
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim }}>
                    {g.toId - g.fromId + 1} chambers
                  </div>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => removeGroup(g.id)} style={{
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

function ctrlBtn() {
  return {
    width: 30, height: 30, fontSize: 16, fontWeight: 700,
    background: T.cardBg, border: `1.5px solid ${T.border}`,
    color: T.textWh, cursor: 'pointer', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit',
  };
}
