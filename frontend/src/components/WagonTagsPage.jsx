import { useState } from 'react';
import { getWagonsByLine, TAG_DATA_TYPES } from '../config/tagConfig';

// ── Semi-dark config theme (mirrors TankTagsPage / ConfigPanel) ───────────────
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
  warn:      '#E65100',
  textWhite: '#1A2035',
  textLt:    '#3A4F6A',
  textDim:   '#8090A8',
};

const TYPE_COL = { barrel: '#4DBAFF', basket: '#30D878', rack: '#FFB300' };
const WAGON_COL = '#FF8C42';  // amber — distinct from tank tag green
const MODE_COL = { auto: '#2ECC40', manual: '#FF8C00', service: '#2196F3' };

function SubTagCell({ value, onChange, placeholder }) {
  return (
    <input
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: T.inputBg, color: T.inputText,
        border: `1.5px solid ${T.border}`, borderRadius: 4,
        padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
      }}
      onFocus={e => e.target.style.borderColor = WAGON_COL}
      onBlur={e  => e.target.style.borderColor = T.border}
    />
  );
}

export default function WagonTagsPage({ userCfg, wagonTags, onSave, onBack }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(wagonTags)));

  const setTag = (id, field, val) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], [field]: val } }));

  // which = 'upLiftTag' | 'downLiftTag' | 'autoTag' | 'manualTag' | 'serviceTag'
  const setSubTag = (id, which, field, val) =>
    setDraft(d => ({
      ...d,
      [id]: { ...d[id], [which]: { ...(d[id]?.[which] || {}), [field]: val } },
    }));

  const lineGroups = getWagonsByLine(userCfg);
  const totalTags  = Object.keys(draft).length;

  return (
    <div style={{
      width: '100%', height: '100%', overflowY: 'auto',
      background: T.pageBg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, monospace",
    }}>

      {/* ── Header ── */}
      <div style={{
        background: T.cardHdr, borderBottom: `3px solid ${WAGON_COL}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            background: WAGON_COL, color: '#1A0800',
            fontWeight: 900, fontSize: 18, padding: '6px 12px',
            borderRadius: 4, letterSpacing: 1,
          }}>🚂</div>
          <div>
            <div style={{ fontSize: 11, color: WAGON_COL, letterSpacing: 3, fontWeight: 600 }}>
              WAGON LOCATION TAG CONFIGURATION
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.textWhite, marginTop: 2 }}>
              Define PLC tag for each wagon's position
            </div>
          </div>
        </div>
        <div style={{
          background: `${WAGON_COL}18`, border: `1px solid ${WAGON_COL}55`,
          borderRadius: 8, padding: '6px 18px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, color: WAGON_COL, fontWeight: 700, letterSpacing: 2 }}>TOTAL TAGS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: WAGON_COL }}>{totalTags}</div>
        </div>
      </div>

      {/* ── Body — scrollable ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {lineGroups.map(({ line, wagons }) => {
          const lineCol = TYPE_COL[line.type] || T.accent;
          return (
            <div key={line.id}>
              {/* Line header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
                paddingBottom: 8, borderBottom: `2px solid ${WAGON_COL}`,
              }}>
                <div style={{
                  background: lineCol, color: '#0D1A10',
                  fontWeight: 800, fontSize: 11, padding: '4px 12px', borderRadius: 4, letterSpacing: 1,
                }}>{line.label}</div>
                <span style={{ fontSize: 12, color: T.textLt }}>
                  {wagons.length} wagon{wagons.length !== 1 ? 's' : ''} · load type:
                  <span style={{ color: lineCol, fontWeight: 700 }}> {line.type?.toUpperCase()}</span>
                </span>
              </div>

              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.cardHdr }}>
                    {['WAGON', 'TAG NAME', 'PLC ADDRESS', 'TYPE'].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left',
                        fontSize: 9, fontWeight: 700, color: T.textDim, letterSpacing: 1.5,
                        borderBottom: `1px solid ${T.border}`,
                        width: i === 0 ? 80 : i === 3 ? 180 : 'auto',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wagons.map(({ id, wagonIdx }, i) => {
                    const tag = draft[id] || {};
                    return (
                      <tr key={id} style={{
                        background: i % 2 === 0 ? T.cardBg : T.panelBg,
                      }}>
                        {/* Wagon badge */}
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <span style={{
                            fontWeight: 800, fontSize: 13, color: WAGON_COL,
                            background: `${WAGON_COL}18`, padding: '2px 8px', borderRadius: 4,
                          }}>W{id}</span>
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
                            onFocus={e => e.target.style.borderColor = WAGON_COL}
                            onBlur={e  => e.target.style.borderColor = T.border}
                          />
                        </td>

                        {/* PLC address */}
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <input
                            value={tag.address || ''}
                            onChange={e => setTag(id, 'address', e.target.value)}
                            placeholder="e.g. DB100.INT0"
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: T.inputBg, color: T.inputText,
                              border: `1.5px solid ${T.border}`, borderRadius: 4,
                              padding: '5px 8px', fontSize: 12, fontFamily: 'monospace',
                              outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = WAGON_COL}
                            onBlur={e  => e.target.style.borderColor = T.border}
                          />
                        </td>

                        {/* Data type — selectable, same ids the PLC client
                            layer accepts */}
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <select
                            value={tag.type || 'int16'}
                            onChange={e => setTag(id, 'type', e.target.value)}
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: T.inputBg, color: T.inputText,
                              border: `1.5px solid ${T.border}`, borderRadius: 4,
                              padding: '5px 6px', fontSize: 11, fontFamily: 'inherit',
                              outline: 'none', cursor: 'pointer',
                            }}
                            onFocus={e => e.target.style.borderColor = WAGON_COL}
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

              {/* ── Load lift tags — bit, SET/RESET the wagon's load flag ── */}
              <div style={{ fontSize: 10.5, color: WAGON_COL, letterSpacing: 1.5, fontWeight: 700, margin: '14px 0 6px' }}>
                WAGON LOAD LIFT TAG CONFIGURATION
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.cardHdr }}>
                    {['WAGON', 'UP-LIFT TAG NAME', 'UP-LIFT ADDRESS', 'DOWN-LIFT TAG NAME', 'DOWN-LIFT ADDRESS'].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left',
                        fontSize: 9, fontWeight: 700, color: T.textDim, letterSpacing: 1.5,
                        borderBottom: `1px solid ${T.border}`,
                        width: i === 0 ? 80 : 'auto',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wagons.map(({ id }, i) => {
                    const tag = draft[id] || {};
                    const up = tag.upLiftTag || {};
                    const down = tag.downLiftTag || {};
                    return (
                      <tr key={id} style={{ background: i % 2 === 0 ? T.cardBg : T.panelBg }}>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <span style={{
                            fontWeight: 800, fontSize: 13, color: WAGON_COL,
                            background: `${WAGON_COL}18`, padding: '2px 8px', borderRadius: 4,
                          }}>W{id}</span>
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <input
                            value={up.name || ''}
                            onChange={e => setSubTag(id, 'upLiftTag', 'name', e.target.value)}
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: T.inputBg, color: T.inputText,
                              border: `1.5px solid ${T.border}`, borderRadius: 4,
                              padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = WAGON_COL}
                            onBlur={e  => e.target.style.borderColor = T.border}
                          />
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <input
                            value={up.address || ''}
                            onChange={e => setSubTag(id, 'upLiftTag', 'address', e.target.value)}
                            placeholder="e.g. M100 (bit)"
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: T.inputBg, color: T.inputText,
                              border: `1.5px solid ${T.border}`, borderRadius: 4,
                              padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = WAGON_COL}
                            onBlur={e  => e.target.style.borderColor = T.border}
                          />
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <input
                            value={down.name || ''}
                            onChange={e => setSubTag(id, 'downLiftTag', 'name', e.target.value)}
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: T.inputBg, color: T.inputText,
                              border: `1.5px solid ${T.border}`, borderRadius: 4,
                              padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = WAGON_COL}
                            onBlur={e  => e.target.style.borderColor = T.border}
                          />
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <input
                            value={down.address || ''}
                            onChange={e => setSubTag(id, 'downLiftTag', 'address', e.target.value)}
                            placeholder="e.g. M101 (bit)"
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: T.inputBg, color: T.inputText,
                              border: `1.5px solid ${T.border}`, borderRadius: 4,
                              padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = WAGON_COL}
                            onBlur={e  => e.target.style.borderColor = T.border}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* ── Mode tags — Auto / Manual / Service, mutually exclusive ── */}
              <div style={{ fontSize: 10.5, color: WAGON_COL, letterSpacing: 1.5, fontWeight: 700, margin: '14px 0 6px' }}>
                WAGON MODE TAG CONFIGURATION
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.cardHdr }}>
                    {['WAGON', 'AUTO TAG NAME', 'AUTO ADDRESS', 'MANUAL TAG NAME', 'MANUAL ADDRESS', 'SERVICE TAG NAME', 'SERVICE ADDRESS'].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left',
                        fontSize: 9, fontWeight: 700, color: T.textDim, letterSpacing: 1.5,
                        borderBottom: `1px solid ${T.border}`,
                        width: i === 0 ? 80 : 'auto',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wagons.map(({ id }, i) => {
                    const tag = draft[id] || {};
                    const auto = tag.autoTag || {};
                    const manual = tag.manualTag || {};
                    const service = tag.serviceTag || {};
                    return (
                      <tr key={id} style={{ background: i % 2 === 0 ? T.cardBg : T.panelBg }}>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <span style={{
                            fontWeight: 800, fontSize: 13, color: WAGON_COL,
                            background: `${WAGON_COL}18`, padding: '2px 8px', borderRadius: 4,
                          }}>W{id}</span>
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <SubTagCell value={auto.name} onChange={v => setSubTag(id, 'autoTag', 'name', v)} />
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <SubTagCell value={auto.address} onChange={v => setSubTag(id, 'autoTag', 'address', v)} placeholder="e.g. M200 (bit)" />
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <SubTagCell value={manual.name} onChange={v => setSubTag(id, 'manualTag', 'name', v)} />
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <SubTagCell value={manual.address} onChange={v => setSubTag(id, 'manualTag', 'address', v)} placeholder="e.g. M201 (bit)" />
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <SubTagCell value={service.name} onChange={v => setSubTag(id, 'serviceTag', 'name', v)} />
                        </td>
                        <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}44` }}>
                          <SubTagCell value={service.address} onChange={v => setSubTag(id, 'serviceTag', 'address', v)} placeholder="e.g. M202 (bit)" />
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
          background: '#FFF8F0', border: `1px solid ${WAGON_COL}55`,
          borderRadius: 6, padding: '10px 16px',
          fontSize: 11, color: '#7A5030', lineHeight: 1.7,
        }}>
          <strong style={{ color: WAGON_COL }}>Live PLC read — no mock data:</strong> The tag value is a <strong>tank number</strong>.
          It's read continuously from the real PLC (whichever brand/IP is saved on the PLC Connection Test screen) —
          whenever it changes (e.g. W1_LOCATION → 7), the wagon animates at its current speed to tank #7. A wagon with
          no address set here simply stays put until one is configured (there's no simulated fallback anymore).
        </div>

        {/* Info note — load lift tags */}
        <div style={{
          background: '#FFF8F0', border: `1px solid ${WAGON_COL}55`,
          borderRadius: 6, padding: '10px 16px',
          fontSize: 11, color: '#7A5030', lineHeight: 1.7,
        }}>
          <strong style={{ color: WAGON_COL }}>Load lift tags (bit, SET/RESET):</strong> the wagon's "carrying load" flag
          turns ON the moment UP-LIFT reads 1/TRUE, and OFF the moment DOWN-LIFT reads 1/TRUE — it holds whatever it
          last was the rest of the time, it's not a live snapshot of either bit. While ON, the wagon shows carrying its
          line's load (barrel/basket/rack); while OFF, it shows empty. Leave both blank to leave a wagon's load display
          on the demo animation instead.
        </div>

        {/* Info note — mode tags */}
        <div style={{
          background: '#FFF8F0', border: `1px solid ${WAGON_COL}55`,
          borderRadius: 6, padding: '10px 16px',
          fontSize: 11, color: '#7A5030', lineHeight: 1.7,
        }}>
          <strong style={{ color: WAGON_COL }}>Mode tags (bit, mutually exclusive):</strong> only one of AUTO / MANUAL /
          SERVICE should read 1 on the PLC at a time — whichever currently does becomes the wagon's active mode, shown
          as a blinking LED on the wagon (
          <span style={{ color: MODE_COL.auto, fontWeight: 800 }}>green</span> = AUTO,{' '}
          <span style={{ color: MODE_COL.manual, fontWeight: 800 }}>orange</span> = MANUAL,{' '}
          <span style={{ color: MODE_COL.service, fontWeight: 800 }}>blue</span> = SERVICE) and a label suffix
          (W1-A / W1-M / W1-S). Leave all three blank to leave a wagon with no mode indicator.
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
        }}>← Back to Config</button>

        <button onClick={() => onSave(draft)} style={{
          padding: '10px 32px', fontSize: 13, fontWeight: 700,
          background: WAGON_COL, border: 'none', color: '#1A0800',
          cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
          boxShadow: `0 0 18px ${WAGON_COL}55`,
        }}>✔ Save Wagon Tags</button>
      </div>
    </div>
  );
}
