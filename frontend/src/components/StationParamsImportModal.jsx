import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { TAG_DATA_TYPES } from '../config/tagConfig';
import { THEME } from '../theme';
import { Modal, FilePick, Button, Badge, Callout } from '../ui/kit';

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
  pageBg: '#EDF0F3', panelBg: '#FFFFFF', cardBg: '#F5F7F8', cardHdr: '#E5EAEE',
  border: '#D2D8DE', accent: '#0E7C86', ok: '#2F855A', warn: '#C2630A', danger: '#C53030',
  textWh: '#1C232B', textLt: '#45505C', textDim: '#7A8591',
};
const FONT = 'inherit';

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
    <Modal title="Import station parameters" subtitle="One row per station — columns are detected automatically"
      steps={['Upload', 'Review', 'Import']} step={step === 'preview' ? 'Review' : 'Upload'} width={720}
      onClose={onClose}
      footer={step === 'preview' && (
        <>
          <Button onClick={() => setStep('upload')}>← Different file</Button>
          <Button variant="primary" icon="✓" disabled={!preview || preview.appliedCount === 0}
            onClick={() => { const { paramsByStation, groupByStation } = build(); onApply(paramsByStation, groupByStation); }}>
            Import {preview ? preview.appliedCount : ''} parameters
          </Button>
        </>
      )}>
      {step === 'upload' && (
        <>
          <Callout title="Sheet layout">
            Required: <b>Station #</b>. Optional: <b>Group</b>. For each reading a station has, a 3-column group named after
            it — e.g. <b>Actual Temperature Address</b>, <b>… Type</b>, <b>… Unit</b>. Leave groups blank where unused.
          </Callout>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{PARAM_KINDS.map(k => <Badge key={k} toneName="info">{k}</Badge>)}</div>
          {error && <Callout toneName="danger" icon="!">{error}</Callout>}
          <FilePick onClick={() => fileInputRef.current?.click()} label="Choose Excel file" hint=".xlsx, .xls or .csv" />
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
        </>
      )}
      {step === 'preview' && (
        <>
          <div style={{ fontSize: 13.5, color: THEME.textMid }}><Badge toneName="ok">{fileName}</Badge> {rows.length} station rows found.</div>
          <div style={{ borderRadius: 12, border: '1px solid #E1E6EA', overflow: 'hidden' }}>
            {[['Station #', headers[detected.stationCol]], ...(detected.groupCol != null ? [['Group', headers[detected.groupCol]]] : []),
              ...Object.entries(detected.kindCols).map(([kind, c]) => [kind, [headers[c.addrCol], c.typeCol != null && headers[c.typeCol], c.unitCol != null && headers[c.unitCol]].filter(Boolean).join(' · ')])]
              .map(([k, v], i) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 14px', background: i % 2 ? '#FFFFFF' : '#F8FAFB', fontSize: 13.5 }}>
                  <span style={{ fontWeight: 700, color: THEME.text }}>{k}</span><span style={{ color: THEME.textMid }}>{v}</span>
                </div>
              ))}
          </div>
          {PARAM_KINDS.filter(k => !detected.kindCols[k]).length > 0 && (
            <div style={{ fontSize: 12.5, color: THEME.textDim }}>Not in this file: {PARAM_KINDS.filter(k => !detected.kindCols[k]).join(', ')}</div>
          )}
          {preview && preview.warnings.length > 0 && <Callout toneName="warn" icon="⚠">{preview.warnings.map((w, i) => <div key={i}>{w}</div>)}</Callout>}
          {preview && <div style={{ fontSize: 14 }}>Ready to apply <b style={{ color: THEME.accentDark }}>{preview.appliedCount}</b> parameters across <b style={{ color: THEME.accentDark }}>{preview.stationCount}</b> stations.</div>}
        </>
      )}
    </Modal>
  );
}
