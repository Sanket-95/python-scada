import { useState, useEffect, useMemo } from 'react';
import { getTankIdsByLine } from '../config/tagConfig';

// SCADA runtime palette (matches main app header)
const P = {
  bg:     '#F0F2F6',
  panel:  '#FFFFFF',
  border: '#C4C8D4',
  text:   '#3A4F6A',
  bright: '#1A2035',
  dim:    '#8090A8',
  accent: '#1565C0',
  ok:     '#2E7D32',
  warn:   '#E65100',
  danger: '#C62828',
};

export default function TagMonitorPage({
  tankTags, tagValues, userCfg,
  wagonTags = {}, wagonLocationValues = {},
  grpcTags = {}, grpcConnected = false,
  simWagons = [], simStations = [],
  onTankTagChange,
  onWagonLocationChange,
  onBack,
}) {
  const [blink, setBlink]         = useState(false);
  const [wagonInputs, setWagonInputs] = useState({}); // { wagonId: string } — typed values

  useEffect(() => {
    const id = setInterval(() => setBlink(t => !t), 800);
    return () => clearInterval(id);
  }, []);

  // Build simulation tags from wagons+stations; gRPC tags override on same name
  const displayTags = useMemo(() => {
    const now = new Date().toISOString();
    const sim = {};
    simStations.forEach(st => {
      const k = `Tank_${st.id}`;
      sim[`${k}_Loaded`] = { name: `${k}_Loaded`, value: st.hasLoad ? '1' : '0',           unit: '',   timestamp: now };
      sim[`${k}_Temp`]   = { name: `${k}_Temp`,   value: st.temperature.toFixed(1),         unit: '°C', timestamp: now };
    });
    simWagons.forEach(w => {
      const k = `Wagon_${w.id}`;
      sim[`${k}_Status`] = { name: `${k}_Status`, value: w.status,                          unit: '',   timestamp: now };
      sim[`${k}_Load`]   = { name: `${k}_Load`,   value: String(Math.round(w.loadPercent)), unit: '%',  timestamp: now };
      sim[`${k}_PosX`]   = { name: `${k}_PosX`,   value: w.x.toFixed(1),                   unit: 'm',  timestamp: now };
    });
    return grpcConnected ? { ...sim, ...grpcTags } : sim;
  }, [simStations, simWagons, grpcTags, grpcConnected]);

  const allIds    = Object.keys(tankTags);
  const loaded    = allIds.filter(id => (tagValues[id] ?? 0) === 1).length;
  const empty     = allIds.length - loaded;
  const pctLoaded = allIds.length ? Math.round((loaded / allIds.length) * 100) : 0;
  const wagonIds  = Object.keys(wagonTags);

  const lineGroups = getTankIdsByLine(userCfg).map((ids, idx) => ({
    line: userCfg.lines[idx],
    ids:  ids.map(String),
  }));

  // Apply a typed wagon location command
  const applyWagonTarget = (wagonId) => {
    const raw = wagonInputs[wagonId];
    const v   = parseInt(raw, 10);
    if (!isNaN(v) && v > 0 && onWagonLocationChange) {
      onWagonLocationChange(wagonId, v);
    }
  };

  const editable = !!(onTankTagChange || onWagonLocationChange);

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'hidden',
      background: P.bg, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace',
    }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(90deg,#DDE4F0,#E8EDF8,#DDE4F0)',
        borderBottom: `1px solid ${P.border}`,
        padding: '8px 20px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 9, color: P.dim, letterSpacing: 3 }}>PROTOVEC SCADA  v2.0</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 'bold', color: P.bright, letterSpacing: 2 }}>
              TAG MONITOR — LIVE VALUES
            </div>
            {editable && (
              <div style={{
                fontSize: 8, letterSpacing: 1.5, color: '#FF8C42', fontWeight: 700,
                background: '#FF8C4218', border: '1px solid #FF8C4255',
                padding: '2px 8px', borderRadius: 3,
              }}>✎ EDIT MODE</div>
            )}
          </div>
        </div>

        {/* Summary stat blocks */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {[
            { l: 'TANK TAGS',  v: allIds.length,   c: P.accent   },
            { l: 'LOADED',     v: loaded,           c: P.ok       },
            { l: 'EMPTY',      v: empty,            c: P.dim      },
            { l: 'LOAD %',     v: `${pctLoaded}%`, c: P.warn     },
            { l: 'WAGON TAGS', v: wagonIds.length,  c: '#FF8C42'  },
          ].map(({ l, v, c }) => (
            <div key={l} style={{
              border: `1px solid ${c}`, borderRadius: 3,
              padding: '4px 12px', textAlign: 'center', minWidth: 80, background: '#FFFFFF',
            }}>
              <div style={{ fontSize: 7.5, color: c, letterSpacing: 1 }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 'bold', color: c }}>{v}</div>
            </div>
          ))}

          {/* Mock live indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            border: `1px solid ${P.ok}`, borderRadius: 3,
            padding: '4px 12px', background: '#FFFFFF',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: blink ? P.ok : '#E8F5E9',
              boxShadow: blink ? `0 0 6px ${P.ok}` : 'none',
              transition: 'background 0.15s, box-shadow 0.15s',
            }} />
            <span style={{ fontSize: 9, color: P.ok, letterSpacing: 1 }}>MOCK LIVE</span>
          </div>

          {/* Simulation indicator */}
          {simStations.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              border: `1px solid #7B61FF`, borderRadius: 3,
              padding: '4px 12px', background: '#FFFFFF',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: blink ? '#7B61FF' : '#EDE7FF',
                boxShadow: blink ? '0 0 6px #7B61FF' : 'none',
                transition: 'background 0.15s, box-shadow 0.15s',
              }} />
              <span style={{ fontSize: 9, color: '#7B61FF', letterSpacing: 1 }}>SIM LIVE</span>
            </div>
          )}

          {/* gRPC live indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            border: `1px solid ${grpcConnected ? P.accent : P.border}`, borderRadius: 3,
            padding: '4px 12px', background: '#FFFFFF',
            transition: 'border-color 0.3s',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: grpcConnected ? (blink ? P.accent : '#E3F2FD') : P.border,
              boxShadow: grpcConnected && blink ? `0 0 6px ${P.accent}` : 'none',
              transition: 'background 0.15s, box-shadow 0.15s',
            }} />
            <span style={{ fontSize: 9, color: grpcConnected ? P.accent : P.dim, letterSpacing: 1 }}>
              {grpcConnected ? 'gRPC LIVE' : 'gRPC OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Load bar ── */}
      <div style={{ height: 3, background: P.border, flexShrink: 0, position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%',
          width: `${pctLoaded}%`, background: P.ok, transition: 'width 0.5s',
        }} />
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Tank tags by line ── */}
        {lineGroups.map(({ line, ids }) => (
          <div key={line.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                fontSize: 8, letterSpacing: 3, color: P.warn, fontWeight: 700,
                padding: '2px 10px', border: `1px solid ${P.warn}40`, borderRadius: 2,
              }}>{line.label}</div>
              <div style={{ flex: 1, height: 1, background: P.border }} />
              <span style={{ fontSize: 8, color: P.dim, letterSpacing: 1 }}>
                {ids.filter(id => (tagValues[id] ?? 0) === 1).length}/{ids.length} LOADED
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ids.map(id => {
                const tag = tankTags[id] || {};
                const val = tagValues[id] ?? 0;
                const on  = val === 1;

                return (
                  <div key={id} style={{
                    background: P.panel,
                    border: `1px solid ${on ? P.ok : P.border}`,
                    borderRadius: 4, padding: '8px 10px',
                    minWidth: 115, maxWidth: 135,
                    boxShadow: on ? `0 0 10px ${P.ok}22` : 'none',
                    transition: 'border-color 0.3s, box-shadow 0.3s',
                    display: 'flex', flexDirection: 'column', gap: 0,
                  }}>
                    {/* Tank # + LED */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: on ? P.ok : P.text }}>#{id}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: on ? P.ok : P.border,
                          boxShadow: on ? `0 0 5px ${P.ok}` : 'none',
                          transition: 'background 0.3s',
                        }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: on ? P.ok : P.dim }}>{val}</span>
                      </div>
                    </div>

                    {/* Tag name */}
                    <div style={{
                      fontSize: 8, color: P.dim, marginBottom: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={tag.name}>{tag.name || '—'}</div>

                    {/* Label */}
                    <div style={{
                      fontSize: 10, color: on ? P.bright : P.text, marginBottom: 6,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={tag.label}>{tag.label || '—'}</div>

                    {/* Status row */}
                    <div style={{
                      fontSize: 8, fontWeight: 700, letterSpacing: 1,
                      color: on ? P.ok : P.dim,
                      display: 'flex', alignItems: 'center', gap: 4, marginBottom: onTankTagChange ? 6 : 0,
                    }}>
                      <span style={{ fontSize: 10 }}>{on ? '■' : '□'}</span>
                      {on ? 'LOADED' : 'EMPTY'}
                    </div>

                    {/* ── Toggle button (edit mode only) ── */}
                    {onTankTagChange && (
                      <button
                        onClick={() => onTankTagChange(id, on ? 0 : 1)}
                        style={{
                          width: '100%', padding: '4px 0', fontSize: 9, fontWeight: 700,
                          letterSpacing: 1, cursor: 'pointer', border: 'none', borderRadius: 3,
                          background: on ? '#FFEBEE' : '#E8F5E9',
                          color: on ? P.danger : P.ok,
                          outline: `1px solid ${on ? P.danger : P.ok}`,
                          fontFamily: 'monospace',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = on ? '#FFCDD2' : '#C8E6C9'}
                        onMouseLeave={e => e.currentTarget.style.background = on ? '#FFEBEE' : '#E8F5E9'}
                      >
                        {on ? '✕ CLEAR LOAD' : '✔ SET LOAD'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* ── Wagon location tags ── */}
        {wagonIds.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                fontSize: 8, letterSpacing: 3, color: '#FF8C42', fontWeight: 700,
                padding: '2px 10px', border: `1px solid #FF8C4240`, borderRadius: 2,
              }}>WAGON LOCATIONS</div>
              <div style={{ flex: 1, height: 1, background: P.border }} />
              <span style={{ fontSize: 8, color: P.dim, letterSpacing: 1 }}>
                {wagonIds.filter(id => wagonLocationValues[id] != null).length}/{wagonIds.length} ASSIGNED
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {wagonIds.map(id => {
                const tag    = wagonTags[id] || {};
                const val    = wagonLocationValues[id];
                const hasVal = val != null;
                const inputVal = wagonInputs[id] ?? (hasVal ? String(val) : '');

                return (
                  <div key={id} style={{
                    background: P.panel, borderRadius: 5, padding: '10px 12px',
                    border: `1px solid ${hasVal ? '#FF8C42' : P.border}`,
                    minWidth: 155, maxWidth: 180,
                    boxShadow: hasVal ? '0 0 12px #FF8C4222' : 'none',
                    transition: 'border-color 0.3s, box-shadow 0.3s',
                  }}>
                    {/* Wagon ID + current target value */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 800,
                        color: hasVal ? '#FF8C42' : P.text,
                        background: hasVal ? '#FF8C4218' : 'transparent',
                        padding: '1px 6px', borderRadius: 3,
                      }}>W{id}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: hasVal ? '#FF8C42' : P.border,
                          boxShadow: hasVal ? '0 0 5px #FF8C42' : 'none',
                        }} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: hasVal ? '#FF8C42' : P.dim }}>
                          {hasVal ? val : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Tag name */}
                    <div style={{
                      fontSize: 8, color: P.dim, marginBottom: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={tag.name}>{tag.name || '—'}</div>

                    {/* Address */}
                    <div style={{
                      fontSize: 9, color: hasVal ? '#C87848' : P.dim, marginBottom: 6,
                      fontFamily: 'monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={tag.address}>{tag.address || '—'}</div>

                    {/* Current status */}
                    <div style={{
                      fontSize: 8, fontWeight: 700, letterSpacing: 1,
                      color: hasVal ? '#FF8C42' : P.dim,
                      marginBottom: onWagonLocationChange ? 8 : 0,
                    }}>
                      ▸ {hasVal ? `→ TANK #${val}` : 'NO TARGET'}
                    </div>

                    {/* ── Tank # input + GO button (edit mode only) ── */}
                    {onWagonLocationChange && (
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input
                          type="number" min={1}
                          value={inputVal}
                          placeholder="Tank #"
                          onChange={e => setWagonInputs(prev => ({ ...prev, [id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') applyWagonTarget(id); }}
                          style={{
                            flex: 1, minWidth: 0,
                            background: '#FFFFFF', color: '#E65100',
                            border: `1px solid #E6510066`, borderRadius: 3,
                            padding: '4px 6px', fontSize: 11, fontFamily: 'monospace',
                            outline: 'none',
                            textAlign: 'center',
                          }}
                          onFocus={e => e.target.style.borderColor = '#E65100'}
                          onBlur={e  => e.target.style.borderColor = '#E6510066'}
                        />
                        <button
                          onClick={() => applyWagonTarget(id)}
                          style={{
                            padding: '4px 8px', fontSize: 9, fontWeight: 700, letterSpacing: 1,
                            background: '#FFF3E0', color: '#E65100',
                            border: '1px solid #E65100', borderRadius: 3,
                            cursor: 'pointer', fontFamily: 'monospace',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#FFE0B2'}
                          onMouseLeave={e => e.currentTarget.style.background = '#FFF3E0'}
                        >GO</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* ── gRPC live tags ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              fontSize: 8, letterSpacing: 3, color: P.accent, fontWeight: 700,
              padding: '2px 10px', border: `1px solid ${P.accent}40`, borderRadius: 2,
            }}>{grpcConnected ? 'gRPC + SIM TAGS' : 'SIM TAGS'}</div>
            <div style={{ flex: 1, height: 1, background: P.border }} />
            <span style={{ fontSize: 8, color: P.accent, letterSpacing: 1 }}>
              {Object.keys(displayTags).length} TAG(S)
              {grpcConnected ? '  ·  gRPC LIVE' : '  ·  SIMULATION'}
            </span>
          </div>

          {Object.keys(displayTags).length === 0 ? (
            <div style={{
              padding: '20px', textAlign: 'center',
              color: P.dim, fontSize: 10, letterSpacing: 1,
              border: `1px dashed ${P.border}`, borderRadius: 4,
            }}>
              Simulation starting…
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.values(displayTags)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(tag => (
                  <div key={tag.name} style={{
                    display: 'flex', alignItems: 'center', gap: 0,
                    background: P.panel, border: `1px solid ${P.border}`,
                    borderRadius: 4, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: 4, flexShrink: 0, alignSelf: 'stretch',
                      background: P.accent,
                    }} />
                    <div style={{ flex: '0 0 240px', padding: '7px 12px', fontSize: 11, color: P.text, fontWeight: 700 }}>
                      {tag.name}
                    </div>
                    <div style={{ flex: 1, padding: '7px 12px', fontSize: 13, color: P.bright, fontWeight: 800 }}>
                      {tag.value}
                      {tag.unit && <span style={{ fontSize: 9, color: P.dim, marginLeft: 6, fontWeight: 400 }}>{tag.unit}</span>}
                    </div>
                    <div style={{ padding: '7px 12px', fontSize: 8, color: P.dim, flexShrink: 0 }}>
                      {new Date(tag.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Footer ── */}
      <div style={{
        background: P.panel, borderTop: `1px solid ${P.border}`,
        padding: '8px 20px', flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 8, color: P.dim, letterSpacing: 1.5 }}>
          {editable
            ? 'CLICK TANK CARD TO TOGGLE LOAD  ·  TYPE TANK # AND PRESS GO TO COMMAND WAGON'
            : `SIMULATION TAGS: ${Object.keys(displayTags).length}  ·  gRPC SERVER: ${grpcConnected ? 'CONNECTED' : 'OFFLINE'}`}
        </div>
        <button onClick={onBack} style={{
          padding: '7px 20px', background: P.panel,
          border: `1px solid ${P.border}`, color: P.text,
          cursor: 'pointer', fontFamily: 'monospace', fontSize: 11,
          borderRadius: 3, letterSpacing: 1,
        }}>← BACK</button>
      </div>
    </div>
  );
}
