// Dairy reports — data API. Runs the seeded mock-data engine IN THE BROWSER
// (src/reports/engine/*): no backend, no database, no network request. The
// FastAPI /api/reports endpoints still exist for external API use and return
// the same envelopes, but the UI never depends on them.

import { meta, runReport, runBatchDetail, runTankTransfers, runTrace } from './engine/service';
import { download } from './engine/export';

// Async wrapper: lets React paint the loading state before the (synchronous)
// generator runs, and turns validation errors into rejected promises.
const later = fn => new Promise((resolve, reject) => setTimeout(() => { try { resolve(fn()); } catch (e) { reject(e); } }, 0));
const clean = p => Object.fromEntries(Object.entries(p || {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'All'));

export const getMeta = mode => later(() => meta(mode));
export const getReport = (report, params) => later(() => runReport(report, clean(params)));
export const getBatchDetail = (id, params) => later(() => runBatchDetail(id, clean(params)));
export const getTankTransfers = (tank, params) => later(() => runTankTransfers(tank, clean(params)));
export const getTrace = (id, params) => later(() => runTrace(id, clean(params)));

// CSV / PDF: full report (all rows, same filters) generated and downloaded locally.
export async function exportReport(report, format, params, traceId) {
  const { page, page_size, ...rest } = clean(params);
  const env = report === 'traceability'
    ? runTrace(traceId || '', rest)
    : runReport(report, { ...rest, page: 1, page_size: 10000 });
  download(env, format);
}

// Chart colours — validated with the dataviz palette checker (CVD + normal-vision
// separation pass). Colour follows the entity everywhere: cow green, buffalo blue.
export const SERIES = {
  Cow: '#1baf7a', Buffalo: '#2a78d6',
  'RT-01': '#eb6834', 'ST-COW-01': '#1baf7a', 'ST-BUF-01': '#2a78d6', 'ST-PM-01': '#eda100',
};
export const SEVERITY = { INFO: '#7A8591', WARNING: '#C2630A', CRITICAL: '#C53030', FAULT: '#6B3FA8' };
