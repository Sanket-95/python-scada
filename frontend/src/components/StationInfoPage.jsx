import { useState, useEffect, useRef } from 'react';

// This page's own fixed report-column list — no longer driven by
// StationColumnConfigPage.jsx's colConfig, since that page now holds a
// per-station Station No/Name snapshot (one row per tank), not a column
// schema. colConfig is still used below, but only to feed this page's
// Station No / Station Name cell VALUES (see stNo/stName), matching it by
// row position against the Column Config page's saved list.
const INFO_COLS = [
  { id: 'wagon',  label: 'Wagon' },
  { id: 'op',     label: 'Operation' },
  { id: 'stNo',   label: 'Station No' },
  { id: 'stName', label: 'Station Name' },
  { id: 'loadNo', label: 'Load No' },
  { id: 'dur',    label: 'Duration' },
  { id: 'client', label: 'Client Name' },
  { id: 'part',   label: 'Part Name' },
  { id: 'tempPV', label: 'Temp PV' },
  { id: 'tempSV', label: 'Temp SV' },
  { id: 'currPV', label: 'Current PV' },
  { id: 'currSV', label: 'Current SV' },
  { id: 'pH',     label: 'pH PV' },
];

// Stations that have current monitoring (electrolytic)
const CURR_STATIONS = new Set([16, 22, 28, 34, 37, 46, 54, 61]);
// Per-station base current (A) when active — varies by station
const BASE_CURR = { 16: 904, 22: 902, 28: 910, 34: 896, 37: 908, 46: 903, 54: 899, 61: 915 };

// Stations that have pH monitoring
const PH_STATIONS = new Set([4, 8, 11, 13, 19, 25, 31, 46, 54, 58]);
const PH_VALUES   = [3.67, 5.26, 2.92, 2.97, 1.13, 4.08, 6.21, 7.45, 3.15, 2.74];

function fmtDur(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h} h : ${m} m : ${s} s`;
  if (m > 0) return `${m} m : ${s} s`;
  return `${s} s`;
}

const T = {
  bg:      '#F0F2F6', panelBg: '#FFFFFF', headerBg: '#E8EBF4',
  tealDark:'#1565C0', teal:    '#1565C0', tealBr:   '#1565C0',
  green:   '#2E7D32', red:     '#C62828', amber:    '#E65100', cyan: '#1565C0',
  textWh:  '#1A2035', textLt:  '#3A4F6A', textDim:  '#8090A8',
  rowEven: '#FFFFFF', rowOdd:  '#F4F5FA', active:   '#E3F2FD',
  border:  '#C4C8D4',
};

const DEFAULT_PAGE_SIZE = 25;
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

// ── Table display prefs (pagination on/off + rows per page) — persisted ────────
const TABLE_PREFS_KEY = 'scada_station_table_prefs_v1';

function loadTablePrefs() {
  try {
    const raw = localStorage.getItem(TABLE_PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        paginationOn: typeof p.paginationOn === 'boolean' ? p.paginationOn : true,
        pageSize: ROWS_PER_PAGE_OPTIONS.includes(p.pageSize) ? p.pageSize : DEFAULT_PAGE_SIZE,
      };
    }
  } catch {}
  return { paginationOn: true, pageSize: DEFAULT_PAGE_SIZE };
}

function saveTablePrefs(prefs) {
  try { localStorage.setItem(TABLE_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

const ALARMS = [
  'W1 Lift End Not Sensed Within Alarmtime At Stn 1',
  'W2 Transfer Timeout At Station 20',
  'Temperature High At Electro Degreasing 1 (Stn 16)',
  'W1 Lift Start Not Sensed Within Alarmtime At Stn 12',
  'Communication Timeout: PLC Rack 2',
];

export default function StationInfoPage({ wagons = [], stations = [], colConfig, stationNames = [], tankTags = {}, onBack }) {
  const activeCols = INFO_COLS;
  const [page, setPage]       = useState(0);
  const [alarmIdx, setAlarmIdx] = useState(0);
  const [tablePrefs, setTablePrefs] = useState(loadTablePrefs);
  const { paginationOn, pageSize } = tablePrefs;

  function togglePagination() {
    setPage(0);
    setTablePrefs(p => {
      const next = { ...p, paginationOn: !p.paginationOn };
      saveTablePrefs(next);
      return next;
    });
  }

  function changePageSize(size) {
    setPage(0);
    setTablePrefs(p => {
      const next = { ...p, pageSize: size };
      saveTablePrefs(next);
      return next;
    });
  }

  // ── Table fullscreen ─────────────────────────────────────────────────────────
  const tableSectionRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === tableSectionRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      tableSectionRef.current?.requestFullscreen?.();
    }
  }

  // ── Live current per electro station (updates every 500 ms) ─────────────────
  // Keyed by 1-based station number → amps (0 when idle)
  const [currents, setCurrents] = useState(() => {
    const init = {};
    CURR_STATIONS.forEach(sn => { init[sn] = 0; });
    return init;
  });

  useEffect(() => {
    const id = setInterval(() => {
      setCurrents(() => {
        const next = {};
        stations.forEach((st, idx) => {
          const sn = idx + 1;
          if (!CURR_STATIONS.has(sn)) return;
          const base = BASE_CURR[sn] ?? 900;
          // Active station → base ± up to 18 A noise; idle → 0
          next[sn] = st.isActive
            ? Math.round(base + (Math.random() - 0.5) * 36)
            : 0;
        });
        return next;
      });
    }, 500);
    return () => clearInterval(id);
  }, [stations]);

  // Alarm ticker
  useEffect(() => {
    const id = setInterval(() => setAlarmIdx(i => (i + 1) % ALARMS.length), 4000);
    return () => clearInterval(id);
  }, []);

  // Map each wagon to the nearest station index
  const wagonAtStation = {};
  wagons.forEach(w => {
    if (!stations.length) return;
    let best = 0, bestDist = Infinity;
    stations.forEach((st, i) => {
      const d = Math.abs(st.x - w.x);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (bestDist < 18) wagonAtStation[best] = w;
  });

  // Wagon operation label
  const wagonOps = {};
  wagons.forEach(w => {
    const entry = Object.entries(wagonAtStation).find(([, ww]) => ww.id === w.id);
    if (!entry) return;
    const st = stations[Number(entry[0])];
    if (!st) return;
    if (w.status === 'arm_extending_load'   || w.status === 'moving_to_source') wagonOps[w.id] = `Get Stn:${st.id}`;
    else if (w.status === 'arm_extending_unload' || w.status === 'moving_to_dest') wagonOps[w.id] = `Put Stn:${st.id}`;
    else if (w.status === 'arm_retracting_loaded') wagonOps[w.id] = `Loaded`;
    else if (w.status === 'arm_retracting_empty')  wagonOps[w.id] = `Empty`;
    else wagonOps[w.id] = `At Stn:${st.id}`;
  });

  const totalPages  = Math.max(1, Math.ceil(stations.length / pageSize));
  const pagedSts    = paginationOn
    ? stations.slice(page * pageSize, (page + 1) * pageSize)
    : stations;

  const alarmCount  = wagons.filter(w => w.status.startsWith('arm_')).length + 14;
  const loadCount   = stations.filter(s => s.hasLoad).length;
  const activeCount = wagons.filter(w => w.status !== 'idle').length;

  const thStyle = () => ({
    padding: '8px 6px', fontSize: 13, fontWeight: 700,
    color: T.tealBr, fontFamily: 'monospace', letterSpacing: 0.3,
    borderBottom: `2px solid ${T.teal}`, borderRight: `1px solid ${T.border}`,
    background: T.headerBg, textAlign: 'center', whiteSpace: 'nowrap', userSelect: 'none',
    // width:'1%' + whiteSpace:'nowrap' makes every column shrink-wrap to its own
    // content instead of the browser stretching columns to fill 100% table width.
    width: '1%',
  });

  const tdBase = (extra = {}) => ({
    padding: '6px 8px', fontSize: 13,
    fontFamily: 'monospace', borderRight: `1px solid ${T.border}`,
    color: T.textLt, textAlign: 'center',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    ...extra,
  });

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'hidden',
      background: T.bg, display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', monospace, system-ui",
    }}>

      {/* ── Header ── */}
      <div style={{
        background: T.headerBg, borderBottom: `2px solid ${T.teal}`,
        padding: '8px 18px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 18,
        boxShadow: `0 2px 8px rgba(21,101,192,0.08)`,
      }}>
        <button onClick={onBack} title="Back" style={{
          width: 30, height: 30, fontSize: 15, fontWeight: 700,
          background: T.tealDark, border: `1.5px solid ${T.teal}`,
          color: T.textWh, cursor: 'pointer', borderRadius: 4,
          fontFamily: 'monospace', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>

        <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen table'} style={{
          width: 30, height: 30, fontSize: 15, fontWeight: 700,
          background: T.tealDark, border: `1.5px solid ${T.teal}`,
          color: T.textWh, cursor: 'pointer', borderRadius: 4,
          fontFamily: 'monospace', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{isFullscreen ? '✕' : '⛶'}</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: T.textLt, fontWeight: 600 }}>Plant Status</span>
          <span style={{
            background: T.green, color: '#FFFFFF', fontWeight: 800,
            fontSize: 11, padding: '3px 14px', borderRadius: 20,
            boxShadow: `0 0 8px ${T.green}88`,
          }}>Auto</span>
        </div>

        <div style={{
          flex: 1, overflow: 'hidden', padding: '4px 10px',
          border: `1px solid ${T.red}55`, borderRadius: 4, background: '#FFF5F5',
          color: T.red, fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
          whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          ⚠ {ALARMS[alarmIdx]}
        </div>

        {[
          { label: 'Alarm Count', val: alarmCount,  col: T.red   },
          { label: 'LoadCount',   val: loadCount,   col: T.amber },
          { label: 'Active',      val: activeCount, col: T.green },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flexShrink: 0, textAlign: 'center' }}>
            <div style={{ fontSize: 8.5, color: T.textDim, letterSpacing: 1.5 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: col }}>{val}</div>
          </div>
        ))}

        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 8.5, color: T.textDim, letterSpacing: 1 }}>CommStatus</div>
          <div style={{
            width: 18, height: 18, background: T.green, borderRadius: 3,
            margin: '2px auto 0', boxShadow: `0 0 8px ${T.green}`,
          }} />
        </div>
      </div>

      {/* ── Table + controls (fullscreen target) ── */}
      <div ref={tableSectionRef} style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        position: 'relative', background: T.bg,
      }}>
        {/* Header's own ⛶/✕ button isn't part of the fullscreen element, so it
            disappears once fullscreen is entered — this floating × is the way
            to close it with a click instead of only Esc. */}
        {isFullscreen && (
          <button onClick={toggleFullscreen} title="Exit fullscreen" style={{
            position: 'absolute', top: 10, right: 14, zIndex: 30,
            width: 30, height: 30, fontSize: 16, fontWeight: 700,
            background: T.tealDark, border: `1.5px solid ${T.teal}`,
            color: '#FFFFFF', cursor: 'pointer', borderRadius: 4,
            fontFamily: 'monospace',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              {activeCols.map(c => (
                <th key={c.id} style={thStyle()}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedSts.map((st, rowIdx) => {
              const absIdx    = paginationOn ? page * pageSize + rowIdx : rowIdx;
              const sn        = absIdx + 1;
              const wagonHere = wagonAtStation[absIdx];
              const isActive  = !!wagonHere || st.isActive;
              const rowBg     = isActive ? T.active
                              : rowIdx % 2 === 0 ? T.rowEven : T.rowOdd;

              // Station No / Station Name reflect the Column Config page's
              // saved snapshot (stationColCfg, matched by row position) when
              // present, since that's now the common/canonical source for
              // both (itself sourced from Mimic Page Config's label — see
              // StationColumnConfigPage.jsx / StationNamesConfigPage.jsx).
              // Falls back to computing them directly if that snapshot
              // hasn't been saved yet.
              const stNo    = colConfig?.[absIdx]?.stationNo ?? sn;
              const stName  = colConfig?.[absIdx]?.label
                || tankTags[String(sn)]?.label || stationNames[absIdx] || `Station ${sn}`;
              const loadNo  = st.hasLoad ? 50 + ((absIdx * 17) % 30) : 0;
              const durSecs = isActive ? 120 + ((absIdx * 37) % 7200) : (absIdx * 11) % 90;
              const client  = isActive ? 'Test' : 'NA';
              const part    = isActive ? `Part-${sn}` : 'NA';

              const tempPV    = st.temperature;
              const tempSV    = st.baseTemp + (st.isActive ? 8 : 0);
              const hasCurr   = CURR_STATIONS.has(sn);
              const currPV    = hasCurr ? (currents[sn] ?? 0) : null;
              const phIdx     = [...PH_STATIONS].indexOf(sn);
              const phPV      = phIdx !== -1 ? PH_VALUES[phIdx % PH_VALUES.length] : null;
              const tempAlert = tempPV > tempSV + 2;
              const tempColor = tempAlert ? T.red : '#FF8A65';
              const currColor = currPV > 0 ? '#80DEEA' : T.textDim;

              // Cell renderer keyed by column id
              const cell = id => {
                switch (id) {
                  case 'wagon':
                    return (
                      <td key={id} style={tdBase()}>
                        {wagonHere ? (
                          <span style={{
                            display:'inline-block', background:T.green, color:'#FFFFFF',
                            fontWeight:800, fontSize:10.5, padding:'2px 10px', borderRadius:20,
                            boxShadow:`0 0 8px ${T.green}99`,
                          }}>W{wagonHere.id}</span>
                        ) : (
                          <span style={{
                            display:'inline-block', width:30, height:16,
                            border:`1.5px solid ${T.border}`, borderRadius:20, background:'#F0F2F6',
                          }} />
                        )}
                      </td>
                    );
                  case 'op':
                    return (
                      <td key={id} style={tdBase({ color: wagonHere ? T.cyan : T.textDim })}>
                        {wagonHere ? (wagonOps[wagonHere.id] ?? '—') : ''}
                      </td>
                    );
                  case 'stNo':
                    return (
                      <td key={id} style={tdBase({
                        background:T.tealDark, color:'#FFFFFF', fontWeight:700, fontSize:15,
                        borderRight:`2px solid ${T.teal}`,
                      })}>{stNo}</td>
                    );
                  case 'stName':
                    return (
                      <td key={id} style={tdBase({ textAlign:'left', color:T.textWh })}>{stName}</td>
                    );
                  case 'loadNo':
                    return (
                      <td key={id} style={tdBase({ color: loadNo > 0 ? T.amber : T.textDim })}>
                        {loadNo > 0 ? loadNo : 0}
                      </td>
                    );
                  case 'dur':
                    return (
                      <td key={id} style={tdBase({ color: isActive ? T.tealBr : T.textDim })}>
                        {fmtDur(durSecs)}
                      </td>
                    );
                  case 'client':
                    return (
                      <td key={id} style={tdBase({ color: isActive ? T.textWh : T.textDim })}>{client}</td>
                    );
                  case 'part':
                    return (
                      <td key={id} style={tdBase({ color: isActive ? T.textWh : T.textDim })}>{part}</td>
                    );
                  case 'tempPV':
                    return (
                      <td key={id} style={tdBase({ color:tempColor, fontWeight: tempAlert ? 700 : 400 })}>
                        {tempPV.toFixed(1)} °C{tempAlert && <span style={{ marginLeft:4, fontSize:9 }}>▲</span>}
                      </td>
                    );
                  case 'tempSV':
                    return (
                      <td key={id} style={tdBase({ color:'#FFAB40' })}>{tempSV.toFixed(0)} °C</td>
                    );
                  case 'currPV':
                    return (
                      <td key={id} style={tdBase({ color:currColor, fontWeight: currPV > 0 ? 700 : 400 })}>
                        {hasCurr ? `${currPV} A` : ''}
                      </td>
                    );
                  case 'currSV':
                    return (
                      <td key={id} style={tdBase({ color: hasCurr ? '#B2EBF2' : T.textDim })}>
                        {hasCurr ? '0 V' : ''}
                      </td>
                    );
                  case 'pH':
                    return (
                      <td key={id} style={tdBase({ color: phPV != null ? '#CE93D8' : T.textDim })}>
                        {phPV != null ? `${phPV.toFixed(2)} pl` : ''}
                      </td>
                    );
                  default:
                    // Custom user-added column — shows tag name as placeholder until PLC connected
                    return <td key={id} style={tdBase({ color: T.textDim, fontStyle: 'italic' })}>—</td>;
                }
              };

              return (
                <tr key={st.id} style={{ background: rowBg }}>
                  {activeCols.map(c => cell(c.id))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination / table display controls ── */}
      <div style={{
        background: T.panelBg, borderTop: `1.5px solid ${T.border}`,
        padding: '8px 12px', flexShrink: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
        flexWrap: 'wrap',
      }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, marginRight: 10,
          fontSize: 10, color: T.textLt, fontFamily: 'monospace', cursor: 'pointer', userSelect: 'none',
        }}>
          <input type="checkbox" checked={paginationOn} onChange={togglePagination} />
          Pagination
        </label>

        {paginationOn && (
          <>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6, marginRight: 10,
              fontSize: 10, color: T.textLt, fontFamily: 'monospace',
            }}>
              Rows/page
              <select
                value={pageSize}
                onChange={e => changePageSize(Number(e.target.value))}
                style={{
                  fontSize: 10, fontFamily: 'monospace', padding: '2px 4px',
                  border: `1px solid ${T.border}`, borderRadius: 4, background: '#FFFFFF', color: T.textWh,
                }}
              >
                {ROWS_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <PagBtn label="«" onClick={() => setPage(0)}             disabled={page === 0} />
            <PagBtn label="‹" onClick={() => setPage(p => p - 1)}   disabled={page === 0} />
            {Array.from({ length: totalPages }, (_, i) => (
              <PagBtn key={i} label={String(i + 1)} active={i === page} onClick={() => setPage(i)} />
            ))}
            <PagBtn label="›" onClick={() => setPage(p => p + 1)}   disabled={page >= totalPages - 1} />
            <PagBtn label="»" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} />
            <span style={{ fontSize: 10, color: T.textDim, marginLeft: 12, fontFamily: 'monospace' }}>
              {stations.length} stations · page {page + 1} / {totalPages}
            </span>
          </>
        )}

        {!paginationOn && (
          <span style={{ fontSize: 10, color: T.textDim, fontFamily: 'monospace' }}>
            {stations.length} stations · scroll to view all
          </span>
        )}
      </div>
      </div>
    </div>
  );
}

function PagBtn({ label, onClick, disabled, active }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 30, height: 28, fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
      background: active ? '#1565C0' : disabled ? '#F0F2F6' : '#FFFFFF',
      border: `1.5px solid ${active ? '#1565C0' : '#C4C8D4'}`,
      color: active ? '#FFFFFF' : disabled ? '#8090A8' : '#1565C0',
      cursor: disabled ? 'default' : 'pointer', borderRadius: 4,
      boxShadow: active ? '0 2px 8px #1565C033' : 'none',
    }}>{label}</button>
  );
}
