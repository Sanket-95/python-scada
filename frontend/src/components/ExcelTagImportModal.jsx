import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { getTankIdsByLine, TAG_DATA_TYPES } from '../config/tagConfig';
import { THEME } from '../theme';
import { Modal, FilePick, Button, Badge, Callout, Field, Select } from '../ui/kit';

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
  pageBg: '#EDF0F3', panelBg: '#FFFFFF', cardBg: '#F5F7F8', cardHdr: '#E5EAEE',
  border: '#D2D8DE', accent: '#0E7C86', ok: '#2F855A', warn: '#C2630A', danger: '#C53030',
  textWh: '#1C232B', textLt: '#45505C', textDim: '#7A8591',
};
const FONT = 'inherit';

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

  const importable = canImport && preview && preview.appliedCount > 0;
  return (
    <Modal title="Import tanks from Excel" subtitle="One row per tank — map your sheet's columns to tank fields"
      steps={['Upload', 'Map columns', 'Import']} step={step === 'map' ? (importable ? 'Import' : 'Map columns') : 'Upload'}
      onClose={onClose}
      footer={step === 'map' && (
        <>
          <Button onClick={() => setStep('upload')}>← Different file</Button>
          <Button variant="primary" icon="✓" disabled={!importable} onClick={() => { const { patch } = build(); onApply(patch); }}>
            Import {preview ? preview.appliedCount : ''} tanks
          </Button>
        </>
      )}>
      {step === 'upload' && (
        <>
          <Callout title="Expected columns">
            Tag Name, Label, PLC Address, Type and Line Number — your headers can be named anything, you'll map them next.
            There's no tank-number column: rows fill a line's tanks in order.
          </Callout>
          {error && <Callout toneName="danger" icon="!">{error}</Callout>}
          <FilePick onClick={() => fileInputRef.current?.click()} label="Choose Excel file" hint=".xlsx, .xls or .csv" />
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
        </>
      )}
      {step === 'map' && (
        <>
          <div style={{ fontSize: 13.5, color: THEME.textMid }}><Badge toneName="ok">{fileName}</Badge> {rows.length} data rows found. Leave a field unmapped to keep current values.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {FIELDS.map(f => (
              <Field key={f.id} label={<>{f.label}{f.id === 'line' && <span style={{ color: THEME.danger }}> *</span>}</>}>
                <Select value={mapping[f.id] ?? ''} onChange={e => setMap(f.id, e.target.value)}
                  options={[{ value: '', label: '— not mapped —' }, ...headers.map((h, i) => ({ value: i, label: h || `(column ${i + 1})` }))]} />
              </Field>
            ))}
          </div>
          {!canImport && <Callout toneName="warn" icon="⚠">Map Line Number plus at least one of Tag Name / Label / PLC Address / Type.</Callout>}
          {preview && preview.warnings.length > 0 && <Callout toneName="warn" icon="⚠">{preview.warnings.map((w, i) => <div key={i}>{w}</div>)}</Callout>}
          {preview && <div style={{ fontSize: 14, color: THEME.text }}>Ready to update <b style={{ color: THEME.accentDark }}>{preview.appliedCount}</b> tanks.</div>}
        </>
      )}
    </Modal>
  );
}
