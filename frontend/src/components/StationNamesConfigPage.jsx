import { useState, useMemo, Fragment } from 'react';
import { TAG_DATA_TYPES } from '../config/tagConfig';
import StationParamsImportModal from './StationParamsImportModal';

// ── Default names — the plant's station list, in station order ───────────────
// Stations beyond this list fall back to "Station N" (see buildNamesArray).
// Still used as the fallback station label elsewhere (StationInfoPage, the
// App Builder's exe seed) when Mimic Page Configuration hasn't set a label
// for a tank — this page itself no longer edits these directly (see below).
export const DEFAULT_STATION_NAMES = [
  'Zincate 1', 'Zincate Stripping', 'Zincate 2',
  'EN Strike 1', 'EN Strike 2',
  'Nickel Plating 1', 'Nickel Plating 2', 'Nickel Plating 3', 'Nickel Plating 4',
  'Zinc-Cobalt Plating 1', 'Zinc-Cobalt Plating 2', 'Zinc-Cobalt Plating 3', 'Zinc-Cobalt Plating 4',
  'Zinc-Cobalt Plating 5', 'Zinc-Cobalt Plating 6', 'Zinc-Cobalt Plating 7', 'Zinc-Cobalt Plating 8',
  'Black Passivation', 'Post Dip', 'Rack Stripping',
];

// Build a names array of exactly `count` entries, merging stored values over defaults
export function buildNamesArray(stored, count) {
  return Array.from({ length: count }, (_, i) =>
    stored?.[i] ?? DEFAULT_STATION_NAMES[i] ?? `Station ${i + 1}`
  );
}

const T = {
  pageBg:   '#F0F2F6', panelBg:  '#FFFFFF', cardBg:   '#F4F5FA',
  cardHdr:  '#E8EBF4', inputBg:  '#FFFFFF', inputText:'#1A2035',
  border:   '#C4C8D4', teal:     '#1565C0', tealBr:   '#1565C0',
  accent:   '#1565C0', ok:       '#2E7D32', warn:     '#E65100',
  textWh:   '#1A2035', textLt:   '#3A4F6A', textDim:  '#8090A8',
  yellow:   '#1565C0',
};

// Fixed set of recognized parameter kinds — a dropdown rather than free
// text, so any code elsewhere that groups/identifies these across stations
// (e.g. "all Actual Temperature readings") can match on an exact known
// string instead of whatever variant spelling a free-text field would allow.
const PARAM_KINDS = ['Actual Temperature', 'Actual Current', 'Calculated Current', 'Set Current', 'Actual PH'];

// One flexible parameter entry: which kind it is (PARAM_KINDS), where to
// read it, what type it is, and its unit for display — no fixed set of
// HOW MANY, a station can have zero or many.
function newParamEntry() {
  return { label: PARAM_KINDS[0], address: '', type: 'float32', unit: '' };
}

export default function StationNamesConfigPage({
  stationNames, stationCount, stationParams, stationParamLabels, stationLoadNumbers, tankTags = {},
  onSave, onSaveParams, onSaveParamLabels, onSaveLoadNumbers, onBack,
}) {
  // Station identity now comes entirely from Mimic Page Configuration's own
  // label for each tank — this page doesn't edit names anymore, it just
  // shows them. `draft` is kept, unedited, only so Save can still pass
  // today's stationNames straight through unchanged (StationInfoPage and
  // the App Builder's exe seed still read it elsewhere).
  const draft = useMemo(() => buildNamesArray(stationNames, stationCount), [stationNames, stationCount]);

  const [filter, setFilter] = useState('');

  // paramsDraft — keyed by station id (1-based, matches tankTags' convention)
  const [paramsDraft, setParamsDraft] = useState(() => JSON.parse(JSON.stringify(stationParams || {})));
  // paramLabelDraft — one free-text tag per station (e.g. "Zone A"), separate
  // from each parameter entry's own Actual Temp/Current/PH kind dropdown.
  const [paramLabelDraft, setParamLabelDraft] = useState(() => ({ ...(stationParamLabels || {}) }));
  const [expanded, setExpanded] = useState(() => new Set());

  const toggleExpanded = id => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const addParam = id => setParamsDraft(p => ({ ...p, [id]: [...(p[id] || []), newParamEntry()] }));
  const removeParam = (id, idx) => setParamsDraft(p => ({ ...p, [id]: p[id].filter((_, i) => i !== idx) }));
  const setParamField = (id, idx, field, val) => setParamsDraft(p => ({
    ...p,
    [id]: p[id].map((entry, i) => (i === idx ? { ...entry, [field]: val } : entry)),
  }));
  const setParamLabel = (id, val) => setParamLabelDraft(p => ({ ...p, [id]: val }));

  // loadNumberDraft — one dedicated address per station (always int16),
  // separate from the flexible parameter list.
  const [loadNumberDraft, setLoadNumberDraft] = useState(() => ({ ...(stationLoadNumbers || {}) }));
  const setLoadNumber = (id, val) => setLoadNumberDraft(p => ({ ...p, [id]: val }));

  // Array fill: given a start address like "D500", auto-fills every
  // station's Load Number sequentially (station 1 -> D500, station 2 ->
  // D501, ...), preserving zero-padding if the start address has any.
  // Manual edits after this still work normally — it's a one-shot generator.
  const [arrayStart, setArrayStart] = useState('');
  const [arrayError, setArrayError] = useState('');
  const fillLoadNumberArray = () => {
    const m = arrayStart.trim().match(/^([A-Za-z]+)(\d+)$/);
    if (!m) {
      setArrayError('Start address must be letters followed by a number, e.g. D500');
      return;
    }
    setArrayError('');
    const [, prefix, digits] = m;
    const width = digits.length;
    const base = parseInt(digits, 10);
    const next = {};
    for (let i = 0; i < stationCount; i++) {
      next[String(i + 1)] = `${prefix}${String(base + i).padStart(width, '0')}`;
    }
    setLoadNumberDraft(next);
  };

  const [showImport, setShowImport] = useState(false);
  const [importedCount, setImportedCount] = useState(null);

  // Replaces each MENTIONED station's parameter list wholesale and merges
  // any Group values in — stations the file doesn't mention are untouched.
  const applyImport = (paramsByStation, groupByStation) => {
    setParamsDraft(p => ({ ...p, ...paramsByStation }));
    if (Object.keys(groupByStation).length) {
      setParamLabelDraft(p => ({ ...p, ...groupByStation }));
    }
    setImportedCount(Object.keys(paramsByStation).length);
    setShowImport(false);
    setExpanded(prev => new Set([...prev, ...Object.keys(paramsByStation)]));
  };

  // Filtered rows — search matches Mimic's label (station identity now lives there)
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = draft.map((name, i) => ({ i, name, mimicLabel: tankTags[String(i + 1)]?.label || '' }));
    if (!q) return all;
    return all.filter(({ i, mimicLabel }) => String(i + 1).includes(q) || mimicLabel.toLowerCase().includes(q));
  }, [draft, filter, tankTags]);

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
            fontSize: 18, padding: '6px 12px', borderRadius: 4, letterSpacing: 1,
          }}>≡</div>
          <div>
            <div style={{ fontSize: 11, color: T.tealBr, letterSpacing: 3, fontWeight: 600 }}>
              STATION INFO — NAME CONFIGURATION
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.textWh, marginTop: 2 }}>
              Station name (from Mimic Page Configuration) and optional live parameters
            </div>
          </div>
        </div>

        <div style={{
          background: `${T.accent}18`, border: `1px solid ${T.accent}55`,
          borderRadius: 8, padding: '6px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, color: T.accent, fontWeight: 700, letterSpacing: 2 }}>TOTAL</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{stationCount}</div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        background: '#F4F5FA', borderBottom: `1px solid ${T.border}`,
        padding: '8px 28px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 13, color: T.textDim, pointerEvents: 'none',
          }}>🔍</span>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by # or Mimic label…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: T.cardBg, color: T.textWh,
              border: `1.5px solid ${T.border}`, borderRadius: 6,
              padding: '6px 10px 6px 32px', fontSize: 12,
              fontFamily: 'inherit', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = T.teal}
            onBlur={e  => e.target.style.borderColor = T.border}
          />
        </div>

        <div style={{ flex: 1 }} />

        {filter && (
          <span style={{ fontSize: 11, color: T.textDim, fontFamily: 'monospace' }}>
            {rows.length} / {stationCount} shown
          </span>
        )}

        <button onClick={() => { setImportedCount(null); setShowImport(true); }} style={{
          padding: '7px 16px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          background: T.cardBg, border: `1.5px solid ${T.teal}`, color: T.tealBr, borderRadius: 6,
        }}>📤 Import Parameters from Excel</button>
      </div>

      {/* ── Load Number array fill ── */}
      <div style={{
        background: '#F4F5FA', borderBottom: `1px solid ${T.border}`,
        padding: '10px 28px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.tealBr, letterSpacing: 1 }}>LOAD NUMBER ARRAY FILL</span>
        <input
          value={arrayStart}
          onChange={e => setArrayStart(e.target.value)}
          placeholder="Start address, e.g. D500"
          style={{
            width: 160, boxSizing: 'border-box',
            background: T.inputBg, color: T.inputText,
            border: `1.5px solid ${T.border}`, borderRadius: 4,
            padding: '6px 9px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
          }}
        />
        <button onClick={fillLoadNumberArray} style={{
          padding: '7px 16px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          background: T.teal, border: 'none', color: '#FFFFFF', borderRadius: 6,
        }}>+ Auto-fill all {stationCount} stations</button>
        {arrayError && <span style={{ fontSize: 11, color: T.danger, fontWeight: 600 }}>{arrayError}</span>}
        <span style={{ fontSize: 10.5, color: T.textDim }}>
          e.g. start D500 → station 1 = D500, station 2 = D501, … — edit any row's address afterward if needed.
        </span>
      </div>

      {importedCount !== null && (
        <div style={{
          background: '#F1F8E9', borderBottom: `2px solid ${T.ok}55`,
          padding: '8px 28px', fontSize: 12, color: '#2E7D32', fontWeight: 600, flexShrink: 0,
        }}>
          ✔ Imported parameters for {importedCount} station(s) — review below, then press "Save Parameters" to keep them.
        </div>
      )}

      {showImport && (
        <StationParamsImportModal onApply={applyImport} onClose={() => setShowImport(false)} />
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr>
              {[['#', 52], ['STATION NAME', null], ['LOAD NUMBER', 150], ['PARAMETER LABEL', 200], ['PARAMETERS', 150]].map(([h, w]) => (
                <th key={h} style={{
                  width: w ?? undefined, padding: '8px 12px', fontSize: 9, fontWeight: 700,
                  color: T.tealBr, letterSpacing: 1.2, background: T.cardHdr,
                  borderBottom: `2px solid ${T.teal}`, borderRight: `1px solid ${T.border}`,
                  textAlign: h === '#' ? 'center' : 'left', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, name }) => {
              const rowBg = i % 2 === 0 ? T.cardBg : T.panelBg;
              const stationId = String(i + 1); // matches tankTags' 1-based station/tank id convention
              const params = paramsDraft[stationId] || [];
              const isOpen = expanded.has(stationId);
              const stationName = tankTags[stationId]?.label || name; // Mimic Page Configuration's label is the station's name now

              return (
                <Fragment key={i}>
                <tr style={{ background: rowBg }}>

                  {/* Station # */}
                  <td style={{
                    padding: '5px 8px', textAlign: 'center', width: 52,
                    borderBottom: `1px solid ${T.border}44`, borderRight: `1px solid ${T.border}44`,
                  }}>
                    <span style={{
                      display: 'inline-block',
                      background: T.teal + '22', color: T.tealBr,
                      fontWeight: 800, fontSize: 11, fontFamily: 'monospace',
                      padding: '2px 8px', borderRadius: 4,
                    }}>{i + 1}</span>
                  </td>

                  {/* Station name — read-only, from Mimic Page Configuration */}
                  <td style={{
                    padding: '5px 12px', fontSize: 13, color: T.textWh, fontWeight: 600,
                    borderBottom: `1px solid ${T.border}44`, borderRight: `1px solid ${T.border}44`,
                  }}>
                    {stationName}
                  </td>

                  {/* Load Number — one dedicated int16 tag per station, auto-fillable above */}
                  <td style={{
                    padding: '5px 10px', width: 150,
                    borderBottom: `1px solid ${T.border}44`, borderRight: `1px solid ${T.border}44`,
                  }}>
                    <input
                      value={loadNumberDraft[stationId] || ''}
                      onChange={e => setLoadNumber(stationId, e.target.value)}
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

                  {/* Parameter label — editable per-station tag, e.g. "Zone A",
                      separate from each parameter entry's own kind dropdown */}
                  <td style={{
                    padding: '5px 10px', width: 200,
                    borderBottom: `1px solid ${T.border}44`, borderRight: `1px solid ${T.border}44`,
                  }}>
                    <input
                      value={paramLabelDraft[stationId] || ''}
                      onChange={e => setParamLabel(stationId, e.target.value)}
                      placeholder="e.g. Zone A"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: T.inputBg, color: T.inputText,
                        border: `1.5px solid ${T.border}`, borderRadius: 4,
                        padding: '5px 9px', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                      }}
                      onFocus={e => e.target.style.borderColor = T.teal}
                      onBlur={e  => e.target.style.borderColor = T.border}
                    />
                  </td>

                  {/* Parameters toggle — flexible, optional extra live
                      values (Actual Temperature, Actual PH, etc.) shown on
                      this station's hover tooltip */}
                  <td style={{ padding: '5px 8px', textAlign: 'center', width: 150, borderBottom: `1px solid ${T.border}44` }}>
                    <button
                      onClick={() => toggleExpanded(stationId)}
                      style={{
                        padding: '4px 12px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                        background: params.length ? `${T.teal}18` : T.cardBg,
                        border: `1.5px solid ${params.length ? T.teal : T.border}`,
                        color: params.length ? T.tealBr : T.textDim, borderRadius: 5, fontFamily: 'inherit',
                      }}
                    >{isOpen ? '▾' : '▸'} {params.length} param{params.length !== 1 ? 's' : ''}</button>
                  </td>
                </tr>

                {isOpen && (
                  <tr style={{ background: rowBg }}>
                    <td colSpan={5} style={{ padding: '10px 16px 16px 60px', borderBottom: `2px solid ${T.teal}44` }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {params.length === 0 && (
                          <div style={{ fontSize: 11, color: T.textDim, fontStyle: 'italic' }}>
                            No parameters configured for this station yet.
                          </div>
                        )}
                        {params.map((p, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <select
                              value={p.label}
                              onChange={e => setParamField(stationId, idx, 'label', e.target.value)}
                              style={{ flex: '1 1 220px', boxSizing: 'border-box', background: T.inputBg, color: T.inputText,
                                border: `1.5px solid ${T.border}`, borderRadius: 4, padding: '5px 6px', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
                            >
                              {PARAM_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                            <input
                              value={p.address} placeholder="PLC address"
                              onChange={e => setParamField(stationId, idx, 'address', e.target.value)}
                              style={{ flex: '1 1 140px', boxSizing: 'border-box', background: T.inputBg, color: T.inputText,
                                border: `1.5px solid ${T.border}`, borderRadius: 4, padding: '5px 9px', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
                            />
                            <select
                              value={p.type} onChange={e => setParamField(stationId, idx, 'type', e.target.value)}
                              style={{ flex: '1 1 170px', boxSizing: 'border-box', background: T.inputBg, color: T.inputText,
                                border: `1.5px solid ${T.border}`, borderRadius: 4, padding: '5px 6px', fontSize: 11.5, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
                            >
                              {TAG_DATA_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                            <input
                              value={p.unit} placeholder="Unit, e.g. °C"
                              onChange={e => setParamField(stationId, idx, 'unit', e.target.value)}
                              style={{ flex: '0 0 90px', boxSizing: 'border-box', background: T.inputBg, color: T.inputText,
                                border: `1.5px solid ${T.border}`, borderRadius: 4, padding: '5px 9px', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                            />
                            <button
                              onClick={() => removeParam(stationId, idx)}
                              title="Remove"
                              style={{
                                flexShrink: 0, width: 28, height: 28, cursor: 'pointer',
                                background: T.cardBg, border: `1.5px solid ${T.border}`, color: T.warn,
                                borderRadius: 5, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                              }}
                            >✕</button>
                          </div>
                        ))}
                        <button
                          onClick={() => addParam(stationId)}
                          style={{
                            alignSelf: 'flex-start', marginTop: 2, padding: '6px 14px', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', background: T.cardBg, border: `1.5px solid ${T.border}`,
                            color: T.textLt, borderRadius: 5, fontFamily: 'inherit',
                          }}
                        >+ Add Parameter</button>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Info note — parameters */}
      <div style={{
        background: '#F0F4FF', borderTop: `1px solid ${T.teal}55`,
        padding: '8px 28px', flexShrink: 0,
        fontSize: 11, color: T.textLt, lineHeight: 1.6,
      }}>
        <strong style={{ color: T.tealBr }}>Station name:</strong> now comes from Mimic Page Configuration's own label
        for each tank — set it there, not here.{' '}
        <strong style={{ color: T.tealBr }}>Load Number:</strong> one dedicated int16 tag per station — type a start
        address above and click Auto-fill to assign every station sequentially, or edit any row's address by hand
        afterward. Read continuously and shown on that tank's hover tooltip.{' '}
        <strong style={{ color: T.tealBr }}>Parameter label:</strong> an optional free-text tag for the whole
        station's parameter set (e.g. "Zone A"), separate from each entry's own kind.{' '}
        <strong style={{ color: T.tealBr }}>Parameters:</strong> click a station's parameter badge to add optional
        live values beyond its name — pick a kind (Actual Temperature / Actual Current / Set Current / Actual PH), a
        PLC address, a data type, and a unit for display. The kind is a fixed dropdown, not free text, so other code
        can reliably group readings by kind across stations. Not every station needs any, and a station can have
        more than one of the same kind. Read continuously once a PLC is configured, and shown on that tank's hover
        tooltip alongside its name.
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

        <button
          onClick={() => {
            onSave(draft); // unchanged passthrough — station names are edited on Mimic Page Configuration now
            // Drop stations with zero parameters so saved config doesn't
            // accumulate empty arrays for every station that never uses this.
            onSaveParams?.(Object.fromEntries(Object.entries(paramsDraft).filter(([, v]) => v?.length)));
            onSaveParamLabels?.(Object.fromEntries(Object.entries(paramLabelDraft).filter(([, v]) => v?.trim())));
            onSaveLoadNumbers?.(Object.fromEntries(Object.entries(loadNumberDraft).filter(([, v]) => v?.trim())));
          }}
          style={{
            padding: '10px 32px', fontSize: 13, fontWeight: 700,
            background: T.teal, border: 'none', color: '#FFFFFF',
            cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
            boxShadow: `0 0 18px ${T.teal}55`,
          }}>✔ Save Parameters</button>
      </div>
    </div>
  );
}
