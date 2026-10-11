import { useState } from 'react';
import { LOAD_TYPES, LOAD_LABELS, LOAD_ICONS, tankIdRange } from '../config/userConfig';

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  pageBg:    '#F0F2F6',
  panelBg:   '#FFFFFF',
  cardBg:    '#F4F5FA',
  cardHdr:   '#E8EBF4',
  inputBg:   '#FFFFFF',
  inputText: '#1A2035',
  border:    '#C4C8D4',
  borderLt:  '#A0B0C4',
  yellow:    '#1565C0',
  accent:    '#1565C0',
  ok:        '#2E7D32',
  warn:      '#E65100',
  textWhite: '#1A2035',
  textLt:    '#3A4F6A',
  textDim:   '#8090A8',
};

const TYPE_COL = { barrel: '#4DBAFF', basket: '#30D878', rack: '#FFB300' };

function firstWagonIds(lines) {
  let n = 1;
  return lines.map(l => { const s = n; n += l.wagons; return s; });
}

// ── Shared page shell ─────────────────────────────────────────────────────────
function PageShell({ title, badge, children, footer }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: T.pageBg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, monospace",
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        background: T.cardHdr,
        borderBottom: `3px solid ${T.yellow}`,
        padding: '16px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            background: T.yellow, color: '#FFFFFF',
            fontWeight: 900, fontSize: 20, padding: '6px 12px',
            borderRadius: 4, letterSpacing: 1,
          }}>⚙</div>
          <div>
            <div style={{ fontSize: 11, color: T.yellow, letterSpacing: 3, fontWeight: 600 }}>
              PROTOVEC SCADA — SYSTEM CONFIGURATION
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.textWhite, marginTop: 2 }}>
              {title}
            </div>
          </div>
        </div>
        {badge}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {children}
      </div>

      {/* Footer */}
      <div style={{
        background: T.panelBg, borderTop: `2px solid ${T.border}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', justifyContent: 'flex-end', gap: 12,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
      }}>
        {footer}
      </div>
    </div>
  );
}

// ── VIEW MODE — read-only summary ─────────────────────────────────────────────
function ConfigView({ config, onEdit, onBack, onConfigureTags, onConfigureWagonTags, onConfigureStationCols, onConfigureStationNames, onConfigureTankPartitions, onConfigureCrossTrolley }) {
  const wFirst   = firstWagonIds(config.lines);
  const totalT   = config.lines.reduce((a, l) => a + l.tanks,  0);
  const totalW   = config.lines.reduce((a, l) => a + l.wagons, 0);

  const badge = (
    <div style={{ display: 'flex', gap: 14 }}>
      {[
        { label: 'LINES',   value: config.lines.length, col: T.yellow },
        { label: 'TANKS',   value: totalT,              col: T.ok     },
        { label: 'WAGONS',  value: totalW,              col: T.accent },
      ].map(({ label, value, col }) => (
        <div key={label} style={{
          textAlign: 'center',
          background: `${col}14`, border: `1px solid ${col}50`,
          borderRadius: 8, padding: '6px 18px',
        }}>
          <div style={{ fontSize: 9, color: col, fontWeight: 700, letterSpacing: 2 }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: col, lineHeight: 1.2 }}>{value}</div>
        </div>
      ))}
    </div>
  );

  return (
    <PageShell
      title="Current Configuration"
      badge={badge}
      footer={
        <>
          <button onClick={onBack} style={backBtn()}>← Back</button>
          {onConfigureTags && (
            <button onClick={onConfigureTags} style={{
              ...backBtn(),
              border: `1.5px solid ${T.accent}`,
              color: T.accent,
            }}>⊞ Tank Tags →</button>
          )}
          {onConfigureWagonTags && (
            <button onClick={onConfigureWagonTags} style={{
              ...backBtn(),
              border: `1.5px solid #FF8C42`,
              color: '#FF8C42',
            }}>🚂 Wagon Tags →</button>
          )}
          {onConfigureStationCols && (
            <button onClick={onConfigureStationCols} style={{
              ...backBtn(),
              border: `1.5px solid ${T.accent}`,
              color: T.accent,
            }}>⊟ Station Cols →</button>
          )}
          {onConfigureStationNames && (
            <button onClick={onConfigureStationNames} style={{
              ...backBtn(),
              border: `1.5px solid ${T.accent}`,
              color: T.accent,
            }}>≡ Station Names →</button>
          )}
          {onConfigureTankPartitions && (
            <button onClick={onConfigureTankPartitions} style={{
              ...backBtn(),
              border: `1.5px solid ${T.accent}`,
              color: T.accent,
            }}>▥ Tank Partitions →</button>
          )}
          {onConfigureCrossTrolley && (
            <button onClick={onConfigureCrossTrolley} style={{
              ...backBtn(),
              border: `1.5px solid ${T.accent}`,
              color: T.accent,
            }}>⇄ Cross Trolley →</button>
          )}
          <button onClick={onEdit} style={yellowBtn()}>✎ Edit Configuration</button>
        </>
      }
    >
      {config.lines.map((line, li) => {
        const col    = TYPE_COL[line.type] || T.accent;
        const wf     = wFirst[li];
        const wl     = wf + line.wagons - 1;
        const [tf, tl] = tankIdRange(config, li);

        return (
          <div key={li} style={{
            background: T.panelBg,
            border: `2px solid ${col}`,
            borderRadius: 12, padding: '22px 28px',
            display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
            boxShadow: `0 0 18px ${col}20`,
          }}>
            {/* Line badge */}
            <div style={{
              background: col, color: '#0D1A10',
              fontWeight: 800, fontSize: 14, padding: '10px 20px',
              borderRadius: 6, letterSpacing: 1, whiteSpace: 'nowrap', flexShrink: 0,
            }}>LINE {li + 1}</div>

            {/* Label */}
            <div style={{ fontSize: 22, fontWeight: 700, color: T.textWhite, minWidth: 110 }}>{line.label}</div>

            <div style={{ width: 1, height: 52, background: T.border, flexShrink: 0 }} />

            {/* Stats */}
            <div style={{ display: 'flex', gap: 32, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Load type */}
              <div>
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, fontWeight: 600, marginBottom: 4 }}>LOAD TYPE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 26 }}>{LOAD_ICONS[line.type]}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: col }}>{LOAD_LABELS[line.type]}</span>
                </div>
              </div>

              {/* Tanks */}
              <div>
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, fontWeight: 600, marginBottom: 4 }}>TANKS</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: T.ok, lineHeight: 1 }}>{line.tanks}</div>
                <div style={{ fontSize: 10, color: T.textLt, marginTop: 2 }}>#{tf} – #{tl}</div>
              </div>

              {/* Wagons */}
              <div>
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, fontWeight: 600, marginBottom: 4 }}>WAGONS</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: T.accent, lineHeight: 1 }}>{line.wagons}</div>
                <div style={{ fontSize: 10, color: T.textLt, marginTop: 2 }}>W{wf} – W{wl}</div>
              </div>
            </div>
          </div>
        );
      })}

      <div style={{
        background: T.cardBg, border: `1px solid ${T.border}`,
        borderRadius: 6, padding: '10px 16px',
        fontSize: 11, color: T.textDim, textAlign: 'center',
      }}>
        Configuration is saved to <span style={{ color: T.textLt, fontWeight: 600 }}>src/config/savedUserConfig.json</span> and persists across page reloads
      </div>
    </PageShell>
  );
}

// ── EDIT MODE — editable form ─────────────────────────────────────────────────
function ConfigEdit({ config, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(config)));

  const upLine = (li, key, val) =>
    setDraft(d => ({ ...d, lines: d.lines.map((l, i) => i === li ? { ...l, [key]: val } : l) }));

  const addLine = () => {
    if (draft.lines.length >= 4) return;
    setDraft(d => {
      const newId = Math.max(...d.lines.map(l => l.id)) + 1;
      return {
        ...d,
        lines: [...d.lines, { id: newId, label: `LINE-${String.fromCharCode(64 + newId)}`, tanks: 20, wagons: 2, type: 'barrel' }],
      };
    });
  };

  const removeLine = () => {
    if (draft.lines.length <= 1) return;
    setDraft(d => ({ ...d, lines: d.lines.slice(0, -1) }));
  };

  const wFirst = firstWagonIds(draft.lines);

  const badge = (
    <div style={{ display: 'flex', gap: 14 }}>
      {LOAD_TYPES.map(t => (
        <div key={t} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 20,
          background: `${TYPE_COL[t]}18`, border: `1px solid ${TYPE_COL[t]}60`,
        }}>
          <span style={{ fontSize: 16, color: TYPE_COL[t] }}>{LOAD_ICONS[t]}</span>
          <span style={{ fontSize: 11, color: TYPE_COL[t], fontWeight: 600, letterSpacing: 1 }}>
            {LOAD_LABELS[t]}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <PageShell
      title="Edit Configuration"
      badge={badge}
      footer={
        <>
          <button onClick={onCancel} style={backBtn()}>✕ Cancel</button>
          <button onClick={() => onSave(draft)} style={yellowBtn()}>✔ Save &amp; Apply</button>
        </>
      }
    >
      {/* Total lines control */}
      <div style={{
        background: T.panelBg, border: `1px solid ${T.border}`,
        borderRadius: 8, padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textWhite }}>Total Production Lines</div>
          <div style={{ fontSize: 12, color: T.textLt, marginTop: 2 }}>
            Each line has its own overhead rail, wagons and tank array
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={removeLine} disabled={draft.lines.length <= 1} style={ctrlBtn()}>−</button>
          <span style={{
            fontSize: 26, fontWeight: 800, color: T.textWhite,
            minWidth: 36, textAlign: 'center',
            background: T.cardBg, padding: '2px 10px', borderRadius: 6,
            border: `1px solid ${T.border}`,
          }}>{draft.lines.length}</span>
          <button onClick={addLine} disabled={draft.lines.length >= 4} style={ctrlBtn()}>+</button>
        </div>
      </div>

      {/* Line cards */}
      {draft.lines.map((line, li) => {
        const wf  = wFirst[li];
        const wl  = wf + line.wagons - 1;
        const col = TYPE_COL[line.type] || T.accent;

        return (
          <div key={li} style={{
            background: T.panelBg,
            border: `2px solid ${col}`,
            borderRadius: 10, overflow: 'hidden',
            boxShadow: `0 0 16px ${col}22`,
          }}>
            {/* Card header */}
            <div style={{
              background: T.cardHdr,
              padding: '12px 20px',
              display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{
                background: col, color: '#0D1A10',
                fontWeight: 800, fontSize: 12, padding: '4px 10px',
                borderRadius: 4, letterSpacing: 1, whiteSpace: 'nowrap',
              }}>LINE {li + 1}</div>

              <input
                value={line.label}
                onChange={e => upLine(li, 'label', e.target.value)}
                style={{
                  background: T.inputBg, color: T.inputText,
                  border: `1.5px solid ${T.border}`, borderRadius: 5,
                  padding: '5px 10px', fontSize: 13, fontWeight: 600,
                  outline: 'none', width: 120,
                }}
              />

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                <Chip label="WAGONS" value={`W${wf}${line.wagons > 1 ? `–W${wl}` : ''}`} col={T.accent} />
                <Chip label="TANKS"  value={line.tanks} col={T.ok} />
              </div>
            </div>

            {/* Card body */}
            <div style={{ padding: '20px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Field label="No. of Tanks" note="5 – 60">
                <CountCtrl value={line.tanks} min={5} max={60}
                  onChange={v => upLine(li, 'tanks', v)} accent={T.ok} />
              </Field>

              <Field label="No. of Wagons" note="1 – 8">
                <CountCtrl value={line.wagons} min={1} max={8}
                  onChange={v => upLine(li, 'wagons', v)} accent={T.accent} />
              </Field>

              <div style={{ width: 1, alignSelf: 'stretch', background: T.border }} />

              {/* Load type */}
              <div style={{ flex: 1, minWidth: 300 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textLt, marginBottom: 10, letterSpacing: 1 }}>
                  LOAD TYPE — All wagons on this line carry:
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {LOAD_TYPES.map(type => {
                    const active = line.type === type;
                    const c      = TYPE_COL[type];
                    return (
                      <button key={type} onClick={() => upLine(li, 'type', type)} style={{
                        flex: 1, padding: '14px 10px',
                        cursor: 'pointer', border: `2px solid ${active ? c : T.border}`,
                        background: active ? `${c}22` : T.cardBg,
                        color: active ? c : T.textDim,
                        borderRadius: 8,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        transition: 'all 0.14s',
                        boxShadow: active ? `0 0 14px ${c}44` : 'none',
                        fontFamily: 'inherit',
                      }}>
                        <span style={{ fontSize: 28 }}>{LOAD_ICONS[type]}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                          color: active ? c : T.textLt }}>
                          {LOAD_LABELS[type]}
                        </span>
                        {active && (
                          <span style={{ fontSize: 9, background: c, color: '#0D1A10',
                            padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                            SELECTED
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Warning */}
      <div style={{
        background: '#FFF3E0', border: `1px solid ${T.warn}`,
        borderRadius: 6, padding: '10px 16px',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 18, color: T.warn, flexShrink: 0 }}>⚠</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.warn }}>Restart required for count changes</div>
          <div style={{ fontSize: 11, color: '#7C5A30', marginTop: 2, lineHeight: 1.5 }}>
            Changing tank or wagon counts will reset and restart the simulation.
            Load type changes (barrel / basket / rack) apply instantly without restart.
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ── Main export — manages view vs edit mode ───────────────────────────────────
export default function ConfigPage({ config, onApply, onBack, onConfigureTags, onConfigureWagonTags, onConfigureStationCols, onConfigureStationNames, onConfigureTankPartitions, onConfigureCrossTrolley }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <ConfigView
        config={config}
        onEdit={() => setEditing(true)}
        onBack={onBack}
        onConfigureTags={onConfigureTags}
        onConfigureWagonTags={onConfigureWagonTags}
        onConfigureStationCols={onConfigureStationCols}
        onConfigureStationNames={onConfigureStationNames}
        onConfigureTankPartitions={onConfigureTankPartitions}
        onConfigureCrossTrolley={onConfigureCrossTrolley}
      />
    );
  }

  return (
    <ConfigEdit
      config={config}
      onSave={cfg => { onApply(cfg); }}
      onCancel={() => setEditing(false)}
    />
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function Chip({ label, value, col }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 9, color: col, fontWeight: 700, letterSpacing: 1.5 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.textWhite }}>{value}</div>
    </div>
  );
}

function Field({ label, note, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.textLt, marginBottom: 6, letterSpacing: 0.5 }}>
        {label}
      </div>
      {children}
      {note && <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

function CountCtrl({ value, min, max, onChange, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))} style={ctrlBtn()}>−</button>
      <input
        type="number" value={value} min={min} max={max}
        onChange={e => onChange(Math.max(min, Math.min(max, +e.target.value || min)))}
        style={{
          width: 56, textAlign: 'center',
          background: T.inputBg, color: T.inputText,
          border: `2px solid ${accent}`, borderRadius: 5,
          padding: '6px 4px', fontSize: 16, fontWeight: 700,
          outline: 'none', fontFamily: 'inherit',
        }}
      />
      <button onClick={() => onChange(Math.min(max, value + 1))} style={ctrlBtn()}>+</button>
    </div>
  );
}

function ctrlBtn() {
  return {
    width: 32, height: 32, fontSize: 18, fontWeight: 700,
    background: T.cardBg, border: `1.5px solid ${T.border}`,
    color: T.textWhite, cursor: 'pointer', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit',
  };
}

function backBtn() {
  return {
    padding: '10px 24px', fontSize: 13, fontWeight: 600,
    background: T.cardBg, border: `1.5px solid ${T.border}`,
    color: T.textLt, cursor: 'pointer', borderRadius: 6,
    fontFamily: 'inherit', letterSpacing: 0.5,
  };
}

function yellowBtn() {
  return {
    padding: '10px 32px', fontSize: 13, fontWeight: 700,
    background: T.yellow, border: 'none', color: '#FFFFFF',
    cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
    letterSpacing: 0.5, boxShadow: `0 0 18px ${T.yellow}55`,
  };
}
