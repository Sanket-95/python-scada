// CSV + PDF export built in the browser from the SAME envelope the screen
// shows (port of backend-fastapi/reports/export.py). Both carry the report ID,
// generated time, period, filters and the DEMO notice; the PDF adds a DEMO DATA
// watermark and "Page X of Y". No library, no backend.

import { DEMO_NOTICE } from './config';

const NOT_TESTED_KEYS = new Set(['fat_pct', 'snf_pct', 'density_kg_l', 'clr', 'protein_pct', 'lactose_pct', 'acidity_pct_la']);

function cell(key, v) {
  if (v == null) return NOT_TESTED_KEYS.has(key) ? 'Not tested' : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join('; ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function flatRows(env) {
  if (env.report === 'traceability') {
    const rows = env.rows.flatMap(ch => ch.nodes.map(n => ({ chain: ch.title, ...n })));
    return [rows, ['chain', 'stage', 'id', 'time', 'detail', 'status'].map(k => ({ key: k, label: k[0].toUpperCase() + k.slice(1) }))];
  }
  if (env.columns?.length && env.rows?.length) return [env.rows, env.columns];
  return [Object.entries(env.summary).map(([k, v]) => ({ item: k, value: cell(k, v) })), [{ key: 'item', label: 'Item' }, { key: 'value', label: 'Value' }]];
}

function headerLines(env) {
  const p = env.period;
  const filters = Object.entries(env.filters).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
  return [env.title, DEMO_NOTICE, `Report ID: ${env.report_id}`, `Generated: ${env.generated_at}`,
    `Period: ${p.start} to ${p.end} (${p.shift})`, `Filters: ${filters}`, `Data mode: ${env.mode} (in-browser mock data)`];
}

const csvEsc = s => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const label = c => c.label + (c.unit ? ` (${c.unit})` : '');

export function toCsv(env) {
  const [rows, cols] = flatRows(env);
  const out = headerLines(env).map(l => csvEsc(`# ${l}`));
  out.push(cols.map(c => csvEsc(label(c))).join(','));
  rows.forEach(r => out.push(cols.map(c => csvEsc(cell(c.key, r[c.key]))).join(',')));
  out.push('', '# Summary');
  Object.entries(env.summary).forEach(([k, v]) => out.push(`${csvEsc('# ' + k)},${csvEsc(cell(k, v))}`));
  if (env.pagination) out.push(csvEsc(`# Rows exported: ${rows.length} of ${env.pagination.total}`));
  return '﻿' + out.join('\r\n') + '\r\n';           // BOM so Excel reads UTF-8 (°C, —)
}

// ── Minimal PDF writer (Helvetica, WinAnsi) ──────────────────────────────────
const SUBST = { '—': '-', '–': '-', '−': '-', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '₂': '2', '₇': '7', 'ρ': 'rho', '…': '...', 'µ': 'u', '·': ' - ', '³': '3', '×': 'x', ' ': ' ' };
function pdfText(s) {
  s = String(s);
  for (const [a, b] of Object.entries(SUBST)) s = s.split(a).join(b);
  s = s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  return [...s].map(ch => (ch.charCodeAt(0) < 256 ? ch : '?')).join('');   // latin-1 (°, ± survive)
}
const fit = (s, widthPt, size) => { const max = Math.max(1, Math.floor(widthPt / (size * 0.5))); return s.length <= max ? s : s.slice(0, max - 1) + '~'; };
const f1 = n => n.toFixed(1), f2 = n => n.toFixed(2);

export function toPdf(env) {
  const W = 842, H = 595, M = 32;
  let [rows, cols] = flatRows(env);
  cols = cols.filter(c => !c.hidden).length ? cols.filter(c => !c.hidden) : cols;
  const font = cols.length > 10 ? 6.8 : 7.6, lineH = font + 3.4;
  const lens = cols.map(c => Math.min(Math.max(label(c).length, ...rows.slice(0, 200).map(r => cell(c.key, r[c.key]).length)), 42));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const widths = lens.map(L => ((W - 2 * M) * L) / total);
  const head = headerLines(env);
  const summ = Object.entries(env.summary).filter(([, v]) => v === null || typeof v !== 'object').map(([k, v]) => `${k}: ${cell(k, v)}`).slice(0, 18);

  const pages = [];
  let ops, y;
  const newPage = () => { ops = []; pages.push(ops); y = H - M; };
  const text = (x, yy, s, size = font, bold = false, gray = 0.1) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${f1(size)} Tf ${f2(gray)} g ${f1(x)} ${f1(yy)} Td (${pdfText(s)}) Tj ET`);
  const tableHeader = () => {
    let x = M;
    ops.push(`0.90 g ${f1(M)} ${f1(y - 3)} ${f1(W - 2 * M)} ${f1(lineH + 1)} re f`);
    cols.forEach((c, i) => { text(x + 2, y, fit(label(c), widths[i] - 3, font), font, true); x += widths[i]; });
    y -= lineH + 2;
  };

  newPage();
  text(M, y, head[0], 15, true); y -= 18;
  text(M, y, head[1], 9, true, 0.55); y -= 13;
  head.slice(2).forEach(l => { text(M, y, l, 8); y -= 10.5; });
  y -= 4;
  if (summ.length) {
    text(M, y, 'Summary', 9.5, true); y -= 12;
    const half = Math.ceil(summ.length / 2);
    for (let i = 0; i < half; i++) {
      text(M, y, fit(summ[i], 380, 8), 8);
      if (i + half < summ.length) text(M + 400, y, fit(summ[i + half], 380, 8), 8);
      y -= 10;
    }
    y -= 6;
  }
  tableHeader();
  for (const r of rows) {
    if (y < M + 24) { newPage(); tableHeader(); }
    let x = M;
    cols.forEach((c, i) => { text(x + 2, y, fit(cell(c.key, r[c.key]), widths[i] - 3, font)); x += widths[i]; });
    y -= lineH;
  }
  if (env.notes?.length) {
    y -= 6;
    for (const n of env.notes) { if (y < M + 24) newPage(); text(M, y, fit('Note: ' + n, W - 2 * M, 7.2), 7.2, false, 0.35); y -= 10; }
  }

  const n = pages.length;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${6 + 2 * i} 0 R`).join(' ')}] /Count ${n} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((pageOps, i) => {
    const wm = 'q BT /F2 88 Tf 0.93 g 0.866 0.5 -0.5 0.866 200 120 Tm (DEMO DATA) Tj ET Q';
    const foot = `BT /F1 7 Tf 0.45 g ${M} 16 Td (${pdfText(`${env.report_id}  -  ${DEMO_NOTICE}`)}) Tj ET BT /F1 7 Tf 0.45 g ${W - M - 60} 16 Td (${pdfText(`Page ${i + 1} of ${n}`)}) Tj ET`;
    const stream = `${wm}\n${pageOps.join('\n')}\n${foot}`;
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`);
  });
  // Every character is < 256, so string length == byte length.
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(off => { out += `${String(off).padStart(10, '0')} 00000 n \n`; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Title (${pdfText(env.title)}) /Producer (SSIT dairy demo reports) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

export function download(env, format) {
  const blob = format === 'pdf' ? new Blob([toPdf(env)], { type: 'application/pdf' }) : new Blob([toCsv(env)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${env.report_id}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
