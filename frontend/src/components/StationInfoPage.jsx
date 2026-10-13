import { useState, useEffect, useRef, useMemo } from 'react';
import { orderStationColumns } from '../config/tagConfig';

// This page shows exactly the columns configured on the Column Config page
// (StationColumnConfigPage.jsx, "Sourced from Mimic Page Config"), in that
// same order — its fixed Station No / Station Name / Load No Tag columns,
// below shown with their live value instead of the configured address, plus
// whatever custom columns were added there with "+ Add Column" (see
// activeCols below, built with the shared orderStationColumns() so both
// pages can never disagree on sequence). No other columns exist on this
// page — Wagon/Operation/Duration/Client Name/Part Name/Temp/Current/pH
// were all removed since none of them are part of the Column Config page's
// column set.
const COL_LABELS = { stNo: 'Station No', stName: 'Station Name', loadNo: 'Load No' };

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

export default function StationInfoPage({
  wagons = [], stations = [], colConfig, stationNames = [], tankTags = {},
  loadNumberValues = {}, extraCols = [], extraLiveValues = {}, columnOrder,
  connected = false, onBack,
}) {
  // Same column set AND sequence as the Column Config page (columnOrder is
  // its saved stationColOrder) — custom columns reflect that same column's
  // live PLC value below (see the cell() default case).
  const activeCols = useMemo(() => {
    const order = orderStationColumns(columnOrder, extraCols);
    return order.map(id => {
      if (COL_LABELS[id]) return { id, label: COL_LABELS[id] };
      const c = extraCols.find(c => c.id === id);
      return c ? { id, label: c.name } : null;
    }).filter(Boolean);
  }, [columnOrder, extraCols]);
  const [page, setPage]       = useState(0);
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

  // Map each wagon to the nearest station index — used only to highlight
  // that row (isActive below), not shown as its own column anymore (Wagon/
  // Operation aren't part of the Column Config page's column set).
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

  const totalPages  = Math.max(1, Math.ceil(stations.length / pageSize));
  const pagedSts    = paginationOn
    ? stations.slice(page * pageSize, (page + 1) * pageSize)
    : stations;

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

        <div style={{ flex: 1 }} />

        {[
          { label: 'LoadCount', val: loadCount,   col: T.amber },
          { label: 'Active',    val: activeCount, col: T.green },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flexShrink: 0, textAlign: 'center' }}>
            <div style={{ fontSize: 8.5, color: T.textDim, letterSpacing: 1.5 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: col }}>{val}</div>
          </div>
        ))}

        {/* CommStatus reflects the real live-tag WebSocket connection
            (useTagSocket's `connected`, threaded down from WagonScada3D.jsx)
            — not a hardcoded always-on indicator. */}
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 8.5, color: T.textDim, letterSpacing: 1 }}>CommStatus</div>
          <div style={{
            width: 18, height: 18, background: connected ? T.green : T.textDim,
            borderRadius: 3, margin: '2px auto 0',
            boxShadow: connected ? `0 0 8px ${T.green}` : 'none',
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

              // Load No reflects the live PLC tag (STATION_<id>_LOADNUM, same
              // source as the Column Config page's own Load No column) —
              // undefined (shown as "—") until a PLC is connected.
              const loadNo = loadNumberValues[String(sn)];

              // Cell renderer keyed by column id
              const cell = id => {
                switch (id) {
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
                      <td key={id} style={tdBase({ color: loadNo != null ? T.amber : T.textDim })}>
                        {loadNo != null ? loadNo : '—'}
                      </td>
                    );
                  default: {
                    // Custom user-added column (Column Config page's "+ Add
                    // Column") — live value from extraLiveValues, keyed the
                    // same way plc_publisher.py publishes it
                    // (STATION_<id>_X_<colId>). "—" until a PLC is connected
                    // and that station has an address configured for it.
                    const val = extraLiveValues[String(sn)]?.[id];
                    return (
                      <td key={id} style={tdBase({ color: val != null ? T.textWh : T.textDim })}>
                        {val != null ? val : '—'}
                      </td>
                    );
                  }
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
