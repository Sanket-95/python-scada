import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { TAG_DATA_TYPES } from '../config/tagConfig';

// Bulk-import station parameters from an uploaded Excel file — ONE ROW PER
// STATION (wide format), with a fixed 3-column group per recognized
// parameter kind: "<Kind> Address", "<Kind> Type", "<Kind> Unit". Mention
// only the station + whichever kinds it actually has — leave the rest of
// that row's groups blank. No manual column mapping: headers are matched
// automatically (case/whitespace-insensitive) against the known kinds
// below, so a station with several parameters just has several groups
// filled in on its one row, and a station with none simply isn't a row.
//
// Expected headers (any order, case-insensitive):
//   Station #, Actual Temperature Address/Type/Unit,
//   Actual Current Address/Type/Unit, Set Current Address/Type/Unit,
//   Actual PH Address/Type/Unit, Group (optional)

const T = {
  pageBg: '#F0F2F6', panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4',
  border: '#C4C8D4', accent: '#1565C0', ok: '#2E7D32', warn: '#E65100', danger: '#C62828',
  textWh: '#1A2035', textLt: '#3A4F6A', textDim: '#8090A8',
};
const FONT = "'Segoe UI', system-ui, monospace";

// Same fixed set as StationNamesConfigPage.jsx's PARAM_KINDS — kept in sync
// manually since it's a small closed list, not worth a shared import for.
const PARAM_KINDS = ['Actual Temperature', 'Actual Current', 'Calculated Current', 'Set Current', 'Actual PH'];
const VALID_TYPES = new Set(TAG_DATA_TYPES.map(t => t.id));

const STATION_GUESS = ['station #', 'station', 'tank #', 'tank', 'station no', 'station number'];
const GROUP_GUESS   = ['group', 'parameter label', 'zone'];

const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function guessColumn(headers, guesses) {
  const lower = headers.map(norm);
  for (const g of guesses) {
    const i = lower.indexOf(g);
    if (i !== -1) return i;
  }
  for (const g of guesses) {
    const i = lower.findIndex(h => h.includes(g));
    if (i !== -1) return i;
  }
  return null;
}

function findExact(headers, wanted) {
  const w = norm(wanted);
  const i = headers.findIndex(h => norm(h) === w);
  return i !== -1 ? i : null;
}

// Scans the header row for the Station # column, the optional Group
// column, and each recognized kind's Address/Type/Unit column group.
function detectColumns(headers) {
  const stationCol = guessColumn(headers, STATION_GUESS);
  const groupCol = guessColumn(headers, GROUP_GUESS);
  const kindCols = {}; // kind -> { addrCol, typeCol, unitCol }
  PARAM_KINDS.forEach(kind => {
    const addrCol = findExact(headers, `${kind} Address`);
    if (addrCol == null) return; // this kind's columns aren't in this sheet at all — fine, just skip it
    kindCols[kind] = {
      addrCol,
      typeCol: findExact(headers, `${kind} Type`),
      unitCol: findExact(headers, `${kind} Unit`),
    };
  });
  return { stationCol, groupCol, kindCols };
}

export default function StationParamsImportModal({ onApply, onClose }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'preview'
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]); // array of raw row arrays (no header)
  const [detected, setDetected] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
      if (grid.length < 2) {
        setError('That sheet has no data rows (just a header, or nothing at all).');
        setStep('upload');
        return;
      }
      const [headerRow, ...dataRows] = grid;
      const cleanHeaders = headerRow.map(h => String(h ?? '').trim());
      const nonEmptyRows = dataRows.filter(r => r.some(c => String(c ?? '').trim() !== ''));
      const det = detectColumns(cleanHeaders);

      if (det.stationCol == null) {
        setError(`Couldn't find a "Station #" column in the header row. Found: ${cleanHeaders.filter(Boolean).join(', ') || '(no headers)'}`);
        setStep('upload');
        return;
      }
      if (Object.keys(det.kindCols).length === 0) {
        setError(`Couldn't find any recognized parameter column (e.g. "Actual Temperature Address") in the header row. `
          + `Expected one of: ${PARAM_KINDS.map(k => `"${k} Address"`).join(', ')}.`);
        setStep('upload');
        return;
      }

      setHeaders(cleanHeaders);
      setRows(nonEmptyRows);
      setDetected(det);
      setStep('preview');
    } catch (err) {
      setError(`Could not read that file: ${err.message}`);
      setStep('upload');
    }
  };

  // Builds each mentioned station's full param list from the detected columns.
  const build = () => {
    const paramsByStation = {};
    const groupByStation = {};
    const warnings = [];
    let skippedNoStation = 0, badTypeCount = 0, appliedCount = 0;

    rows.forEach(r => {
      const stationRaw = r[detected.stationCol];
      const stationNum = parseInt(stationRaw, 10);
      if (!Number.isFinite(stationNum) || stationNum < 1) { skippedNoStation++; return; }
      const stationId = String(stationNum);

      if (detected.groupCol != null) {
        const group = String(r[detected.groupCol] ?? '').trim();
        if (group) groupByStation[stationId] = group;
      }

      Object.entries(detected.kindCols).forEach(([kind, cols]) => {
        const address = String(r[cols.addrCol] ?? '').trim();
        if (!address) return; // this station doesn't have this parameter — skip, not an error

        const typeRaw = cols.typeCol != null ? String(r[cols.typeCol] ?? '').trim().toLowerCase() : '';
        const hasValidType = VALID_TYPES.has(typeRaw);
        if (typeRaw && !hasValidType) badTypeCount++;
        const type = hasValidType ? typeRaw : 'float32';

        const unit = cols.unitCol != null ? String(r[cols.unitCol] ?? '').trim() : '';

        (paramsByStation[stationId] ||= []).push({ label: kind, address, type, unit });
        appliedCount++;
      });
    });

    if (skippedNoStation > 0) warnings.push(`${skippedNoStation} row(s) had no valid Station # — skipped entirely.`);
    if (badTypeCount > 0) warnings.push(`${badTypeCount} value(s) had an unrecognized Type — defaulted to float32.`);

    return { paramsByStation, groupByStation, warnings, appliedCount, stationCount: Object.keys(paramsByStation).length };
  };

  const preview = step === 'preview' ? build() : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,20,34,0.55)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: T.panelBg, borderRadius: 10, width: 700, maxWidth: '92vw',
        maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        fontFamily: FONT, boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          background: T.cardHdr, borderBottom: `3px solid ${T.accent}`,
          padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: T.accent, letterSpacing: 2, fontWeight: 700 }}>IMPORT STATION PARAMETERS</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.textWh, marginTop: 2 }}>Upload Excel — columns auto-detected</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', fontSize: 18, color: T.textDim, cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {step === 'upload' && (
            <>
              <div style={{ fontSize: 12.5, color: T.textLt, lineHeight: 1.6 }}>
                Upload an .xlsx/.xls/.csv file with <strong>one row per station</strong>. For each parameter a
                station has, fill in its 3-column group — e.g. <strong>Actual Temperature Address</strong>,{' '}
                <strong>Actual Temperature Type</strong>, <strong>Actual Temperature Unit</strong> — and leave the
                groups for parameters it doesn't have blank. Mention only the stations that need something; one with
                none at all just isn't a row.
              </div>
              <div style={{ fontSize: 11.5, color: T.textDim, lineHeight: 1.7, background: T.cardBg, borderRadius: 6, padding: '10px 14px' }}>
                Recognized kinds (one 3-column group each): {PARAM_KINDS.map(k => <strong key={k} style={{ color: T.textWh }}> {k} </strong>)}
                <br />Required: <strong style={{ color: T.textWh }}>Station #</strong>. Optional: <strong style={{ color: T.textWh }}>Group</strong>.
              </div>
              {error && (
                <div style={{ background: '#FDECEA', border: `1px solid ${T.danger}55`, borderRadius: 6, padding: '8px 12px', fontSize: 12, color: T.danger, lineHeight: 1.6 }}>
                  {error}
                </div>
              )}
              <button onClick={() => fileInputRef.current?.click()} style={{
                padding: '14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                background: T.cardBg, border: `2px dashed ${T.border}`, color: T.accent, borderRadius: 8,
              }}>📤 Choose Excel file…</button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
            </>
          )}

          {step === 'preview' && (
            <>
              <div style={{ fontSize: 12, color: T.textDim }}>
                <strong style={{ color: T.ok }}>{fileName}</strong> — {rows.length} station row(s) found.
              </div>

              <div style={{ fontSize: 12, color: T.textLt, lineHeight: 1.7 }}>
                Detected columns:
                <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  <li>Station #: <strong style={{ color: T.textWh }}>{headers[detected.stationCol]}</strong></li>
                  {detected.groupCol != null && (
                    <li>Group: <strong style={{ color: T.textWh }}>{headers[detected.groupCol]}</strong></li>
                  )}
                  {Object.entries(detected.kindCols).map(([kind, cols]) => (
                    <li key={kind}>
                      <strong style={{ color: T.tealBr }}>{kind}</strong>: {headers[cols.addrCol]}
                      {cols.typeCol != null && `, ${headers[cols.typeCol]}`}
                      {cols.unitCol != null && `, ${headers[cols.unitCol]}`}
                    </li>
                  ))}
                </ul>
                {PARAM_KINDS.filter(k => !detected.kindCols[k]).length > 0 && (
                  <div style={{ marginTop: 6, color: T.textDim }}>
                    Not found in this file (fine if none of your stations use it): {PARAM_KINDS.filter(k => !detected.kindCols[k]).join(', ')}
                  </div>
                )}
              </div>

              {preview && preview.warnings.length > 0 && (
                <div style={{ background: '#FFF3E0', border: `1px solid ${T.warn}55`, borderRadius: 6, padding: '8px 12px', fontSize: 11.5, color: '#7A4A00', lineHeight: 1.6 }}>
                  {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              {preview && (
                <div style={{ fontSize: 12.5, color: T.textLt }}>
                  Ready to apply <strong style={{ color: T.accent }}>{preview.appliedCount}</strong> parameter(s)
                  across <strong style={{ color: T.accent }}>{preview.stationCount}</strong> station(s).
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={() => setStep('upload')} style={{
                  padding: '9px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: T.cardBg, border: `1.5px solid ${T.border}`, color: T.textLt, borderRadius: 6,
                }}>← Choose different file</button>
                <button
                  onClick={() => { const { paramsByStation, groupByStation } = build(); onApply(paramsByStation, groupByStation); }}
                  disabled={!preview || preview.appliedCount === 0}
                  style={{
                    padding: '9px 24px', fontSize: 12.5, fontWeight: 700, cursor: preview?.appliedCount === 0 ? 'default' : 'pointer',
                    fontFamily: 'inherit', borderRadius: 6, border: 'none', color: '#FFFFFF',
                    background: preview?.appliedCount === 0 ? T.textDim : T.accent,
                  }}
                >✔ Import {preview ? preview.appliedCount : ''} parameter(s)</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
