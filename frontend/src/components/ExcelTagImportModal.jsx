import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { getTankIdsByLine, TAG_DATA_TYPES } from '../config/tagConfig';

// Bulk-import tank tags from an uploaded Excel file. Expected columns: Tag
// Name, Label, PLC Address, Type, Line Number — but headers can be named
// anything; the user maps whichever uploaded column means what via the
// dropdowns below (with a best-effort auto-guess to start from).
//
// Row -> tank assignment: there's no explicit tank-number column, so rows
// are assigned to tanks IN ORDER within each line — the Nth row whose Line
// Number matches a given line becomes that line's Nth tank. A line with
// more rows than tanks has its extra rows ignored (warned); a line with
// fewer rows just leaves its remaining tanks untouched.

const T = {
  pageBg: '#F0F2F6', panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4',
  border: '#C4C8D4', accent: '#1565C0', ok: '#2E7D32', warn: '#E65100', danger: '#C62828',
  textWh: '#1A2035', textLt: '#3A4F6A', textDim: '#8090A8',
};
const FONT = "'Segoe UI', system-ui, monospace";

const FIELDS = [
  { id: 'name',    label: 'Tag Name',    guess: ['tag name', 'tagname', 'name'] },
  { id: 'label',   label: 'Label',       guess: ['label', 'station name', 'display name'] },
  { id: 'address', label: 'PLC Address', guess: ['plc address', 'address', 'plc addr'] },
  { id: 'type',    label: 'Type',        guess: ['type', 'data type', 'datatype'] },
  { id: 'line',    label: 'Line Number', guess: ['line number', 'line no', 'line', 'line#', 'line #'] },
];

const VALID_TYPES = new Set(TAG_DATA_TYPES.map(t => t.id));

function guessColumn(headers, guesses) {
  const lower = headers.map(h => String(h ?? '').trim().toLowerCase());
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

function textInput(extra = {}) {
  return {
    width: '100%', boxSizing: 'border-box',
    background: '#FFFFFF', color: T.textWh,
    border: `1.5px solid ${T.border}`, borderRadius: 6,
    padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
    ...extra,
  };
}

export default function ExcelTagImportModal({ userCfg, onApply, onClose }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'map' | 'error'
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]); // array of raw row arrays (no header)
  const [mapping, setMapping] = useState({ name: null, label: null, address: null, type: null, line: null });
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
      setHeaders(cleanHeaders);
      setRows(nonEmptyRows);
      setMapping({
        name:    guessColumn(cleanHeaders, FIELDS[0].guess),
        label:   guessColumn(cleanHeaders, FIELDS[1].guess),
        address: guessColumn(cleanHeaders, FIELDS[2].guess),
        type:    guessColumn(cleanHeaders, FIELDS[3].guess),
        line:    guessColumn(cleanHeaders, FIELDS[4].guess),
      });
      setStep('map');
    } catch (err) {
      setError(`Could not read that file: ${err.message}`);
      setStep('upload');
    }
  };

  const setMap = (field, value) => setMapping(m => ({ ...m, [field]: value === '' ? null : Number(value) }));

  // Build the tank-id patch from the current mapping, plus any warnings.
  const build = () => {
    const tankIdsByLine = getTankIdsByLine(userCfg); // [ [ids for line 0], [ids for line 1], ... ]
    const lineIdToTankIds = {};
    userCfg.lines.forEach((line, idx) => { lineIdToTankIds[String(line.id)] = tankIdsByLine[idx]; });

    const rowsByLine = {}; // lineId -> ordered list of mapped row objects
    const warnings = [];
    let unmatchedLineRows = 0;

    rows.forEach(r => {
      const lineRaw = mapping.line != null ? r[mapping.line] : null;
      const lineId = lineRaw != null ? String(Number(lineRaw)).trim() : null;
      if (!lineId || !lineIdToTankIds[lineId]) { unmatchedLineRows++; return; }
      const entry = {
        name:    mapping.name    != null ? String(r[mapping.name]    ?? '').trim() : '',
        label:   mapping.label   != null ? String(r[mapping.label]   ?? '').trim() : '',
        address: mapping.address != null ? String(r[mapping.address] ?? '').trim() : '',
        type:    mapping.type    != null ? String(r[mapping.type]    ?? '').trim().toLowerCase() : '',
      };
      (rowsByLine[lineId] ||= []).push(entry);
    });

    if (unmatchedLineRows > 0) {
      warnings.push(`${unmatchedLineRows} row(s) had a Line Number that doesn't match any configured line — skipped.`);
    }

    const patch = {};
    let appliedCount = 0;
    Object.entries(rowsByLine).forEach(([lineId, entries]) => {
      const tankIds = lineIdToTankIds[lineId];
      if (entries.length > tankIds.length) {
        warnings.push(`Line ${lineId}: ${entries.length} rows but only ${tankIds.length} tank(s) — ${entries.length - tankIds.length} extra row(s) ignored.`);
      }
      entries.slice(0, tankIds.length).forEach((entry, i) => {
        const tankId = tankIds[i];
        const update = {};
        if (mapping.name    != null && entry.name)    update.name    = entry.name;
        if (mapping.label   != null && entry.label)   update.label   = entry.label;
        if (mapping.address != null && entry.address) update.address = entry.address;
        if (mapping.type    != null && entry.type) {
          if (VALID_TYPES.has(entry.type)) {
            update.type = entry.type;
          } else {
            warnings.push(`Tank ${tankId}: type "${entry.type}" isn't recognized — left unchanged.`);
          }
        }
        if (Object.keys(update).length > 0) {
          patch[tankId] = update;
          appliedCount++;
        }
      });
    });

    return { patch, warnings, appliedCount };
  };

  const canImport = mapping.line != null && (mapping.name != null || mapping.label != null || mapping.address != null || mapping.type != null);
  const preview = step === 'map' ? build() : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,20,34,0.55)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: T.panelBg, borderRadius: 10, width: 680, maxWidth: '92vw',
        maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        fontFamily: FONT, boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          background: T.cardHdr, borderBottom: `3px solid ${T.accent}`,
          padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: T.accent, letterSpacing: 2, fontWeight: 700 }}>IMPORT TANK TAGS</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.textWh, marginTop: 2 }}>Upload Excel &amp; map columns</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', fontSize: 18, color: T.textDim, cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {step === 'upload' && (
            <>
              <div style={{ fontSize: 12.5, color: T.textLt, lineHeight: 1.6 }}>
                Upload an .xlsx/.xls/.csv file with one row per tank. Expected columns —
                <strong> Tag Name, Label, PLC Address, Type, Line Number</strong> — but your
                headers can be named anything; you'll map them on the next step.
                There's no tank-number column: rows are assigned to tanks <strong>in order</strong> within
                each matching Line Number.
              </div>
              {error && (
                <div style={{ background: '#FDECEA', border: `1px solid ${T.danger}55`, borderRadius: 6, padding: '8px 12px', fontSize: 12, color: T.danger }}>
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

          {step === 'map' && (
            <>
              <div style={{ fontSize: 12, color: T.textDim }}>
                <strong style={{ color: T.ok }}>{fileName}</strong> — {rows.length} data row(s) found.
                Map each uploaded column below (leave a field as "— not mapped —" to skip it, leaving those values unchanged).
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {FIELDS.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 120, fontSize: 12, fontWeight: 700, color: T.textWh }}>
                      {f.label}{f.id === 'line' && <span style={{ color: T.danger }}> *</span>}
                    </div>
                    <select
                      value={mapping[f.id] ?? ''}
                      onChange={e => setMap(f.id, e.target.value)}
                      style={{ ...textInput(), flex: 1, cursor: 'pointer' }}
                    >
                      <option value="">— not mapped —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `(column ${i + 1})`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {!canImport && (
                <div style={{ fontSize: 11.5, color: T.warn }}>
                  Map at least Line Number plus one of Tag Name / Label / PLC Address / Type to continue.
                </div>
              )}

              {preview && preview.warnings.length > 0 && (
                <div style={{ background: '#FFF3E0', border: `1px solid ${T.warn}55`, borderRadius: 6, padding: '8px 12px', fontSize: 11.5, color: '#7A4A00', lineHeight: 1.6 }}>
                  {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              {preview && (
                <div style={{ fontSize: 12.5, color: T.textLt }}>
                  Ready to update <strong style={{ color: T.accent }}>{preview.appliedCount}</strong> tank tag(s).
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={() => setStep('upload')} style={{
                  padding: '9px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: T.cardBg, border: `1.5px solid ${T.border}`, color: T.textLt, borderRadius: 6,
                }}>← Choose different file</button>
                <button
                  onClick={() => { const { patch } = build(); onApply(patch); }}
                  disabled={!canImport || !preview || preview.appliedCount === 0}
                  style={{
                    padding: '9px 24px', fontSize: 12.5, fontWeight: 700, cursor: (!canImport || preview?.appliedCount === 0) ? 'default' : 'pointer',
                    fontFamily: 'inherit', borderRadius: 6, border: 'none', color: '#FFFFFF',
                    background: (!canImport || preview?.appliedCount === 0) ? T.textDim : T.accent,
                  }}
                >✔ Import {preview ? preview.appliedCount : ''} tag(s)</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
