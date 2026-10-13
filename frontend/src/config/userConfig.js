import { C } from './scadaConfig';

export const LOAD_TYPES  = ['barrel', 'basket', 'rack'];
export const LOAD_LABELS = { barrel: 'BARREL', basket: 'BASKET', rack: 'RACK' };
export const LOAD_ICONS  = { barrel: '⬤', basket: '⬡', rack: '⊞' };

// Default built from the static config
export function defaultUserConfig() {
  return {
    lines: C.tracks.map(tr => ({
      id:     tr.id,
      label:  tr.label,
      tanks:  tr.stations.length,
      wagons: tr.wagonIds.length,   // count only
      type:   'barrel',              // ONE load type per line
    })),
  };
}

// New key so stale v1 data (per-wagon type) doesn't collide
const KEY = 'scada_user_config_v2';

export function loadUserConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      // validate new format: type is on line, wagons is a number
      if (p.lines && typeof p.lines[0]?.wagons === 'number' && p.lines[0]?.type) {
        return p;
      }
    }
  } catch {}
  return defaultUserConfig();
}

export function saveUserConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

// Derive sequential wagon IDs: line-0 → [1..n0], line-1 → [n0+1..n0+n1], …
export function getLineWagonIds(userCfg) {
  let next = 1;
  return userCfg.lines.map(line => {
    const count = line.wagons;
    const ids   = Array.from({ length: count }, (_, i) => next + i);
    next += count;
    return ids;
  });
}

// Build a C-compatible simConfig so the unchanged simulation hook can use it
// First tank id for the line at `idx` = 1 + every earlier line's actual
// configured tank count — tank numbers run continuously across the whole
// plant, so line 2's starting number depends on how many tanks line 1
// ACTUALLY has, not a fixed assumption about line 1's original default size.
function lineBaseId(userCfg, idx) {
  let base = 1;
  for (let i = 0; i < idx; i++) base += userCfg.lines[i].tanks;
  return base;
}

export function buildSimConfig(userCfg) {
  const wagonIdsByLine = getLineWagonIds(userCfg);

  // True serpentine layout: line 0 runs left→right starting at the rail's
  // left margin; EVERY later line continues from exactly the x position
  // where the previous line's last tank sits, running the opposite
  // direction — line 1 starts where line 0 ends, line 2 starts where line 1
  // ends, and so on. Spacing between tank centers is shared across every
  // line (so tanks are the same visual size everywhere) and always fills
  // the whole available rail width — tank WIDTH itself (below) scales with
  // that spacing too, so fewer tanks render as bigger tanks spread evenly
  // across the full width, instead of small fixed-size tanks bunched on
  // one side with empty space left over.
  const RAIL_LEFT   = 16;
  const RAIL_RIGHT  = C.svg.w - 60;
  const LEFT_MARGIN = 40;  // gap from the rail's left edge to the first tank — also
                            // where parked wagons sit, so this stays wide enough to
                            // hold a wagon sprite without clipping off-canvas
  const END_MARGIN  = 14;  // gap from a line's own last tank to its own rail's end
  const HOME_GAP    = 30;  // gap from the ascending-start tank to the HOME marker
  // Tank width as a fraction of the gap between tank centers — calibrated so
  // this app's original 39-tank default (spacing ~49.2px) still renders at
  // its original 26px tank width (26/49.2 ≈ 0.528); any other tank count
  // scales proportionally from there, since spacing itself is no longer
  // capped.
  const STATION_W_RATIO = 0.528;
  const MIN_STATION_W   = 14; // floor so a very large tank count never shrinks past legibility

  const usableSpan = (RAIL_RIGHT - END_MARGIN) - (RAIL_LEFT + LEFT_MARGIN);

  // Pass 1 (unit space, spacing=1): walk the whole zigzag to find each
  // line's relative start position and how far the path reaches in either
  // direction. Needed because a LATER line can run further left (or right)
  // than line 0 ever does — e.g. a longer line 2 continuing leftward from a
  // short line 1 can overshoot past line 0's own start — so the real
  // spacing has to fit the path's FULL reach, not just whichever single
  // line happens to have the most tanks.
  let unitCursor = 0, unitMin = 0, unitMax = 0;
  const unitStart = userCfg.lines.map((line, idx) => {
    const dir = idx % 2 === 1 ? -1 : 1;
    const start = unitCursor;
    const end = start + dir * (line.tanks - 1);
    unitMin = Math.min(unitMin, start, end);
    unitMax = Math.max(unitMax, start, end);
    unitCursor = end;
    return start;
  });
  const unitSpan = Math.max(unitMax - unitMin, 1);
  const spacing  = usableSpan / unitSpan;
  const stationW = Math.max(spacing * STATION_W_RATIO, MIN_STATION_W);
  // Shifts the whole path so its own leftmost point lands at the left
  // margin — whichever line that turns out to be, not necessarily line 0.
  const originX  = (RAIL_LEFT + LEFT_MARGIN) - unitMin * spacing;

  const tracks = userCfg.lines.map((line, idx) => {
    const orig   = C.tracks[idx] || C.tracks[0];
    const baseId = lineBaseId(userCfg, idx);

    // Even lines (0,2…) run left→right; odd lines (1,3…) run right→left,
    // continuing from wherever the previous line physically ended.
    const reversed = idx % 2 === 1;
    const dir = reversed ? -1 : 1;

    const startX = originX + unitStart[idx] * spacing;         // this line's lowest tank number
    const endX   = startX + dir * (line.tanks - 1) * spacing;  // this line's highest tank number

    // Tank numbers ascend from the wagon's home side — always wherever this
    // line itself begins (the point it connects to the previous line).
    const ascStartX = startX;
    const ascEndX   = endX;

    const railX1 = Math.min(startX, endX) - END_MARGIN;
    const railX2 = Math.max(startX, endX) + END_MARGIN;
    const homeX   = !reversed ? ascStartX - HOME_GAP : ascStartX + HOME_GAP;
    const homeDir = !reversed ? 1 : -1;

    return {
      ...orig,
      id:       line.id,
      label:    line.label,
      wagonIds: wagonIdsByLine[idx],
      railX1, railX2, homeX, homeDir, stationW,
      homeSide: reversed ? 'right' : 'left',
      stations: Array.from({ length: line.tanks }, (_, i) => ({
        id:       baseId + i,
        label:    String(baseId + i),
        x:        startX + dir * i * spacing,
        initFill: i < line.tanks * 0.33 ? 72 + (i % 5) * 3
                : i < line.tanks * 0.66 ? 42 + (i % 6) * 3
                :                          18 + (i % 4) * 4,
        baseTemp: 28 + (i % 8) * 6, // °C — fallback only; live Tank_<id>_Temp overrides
      })),
    };
  });
  return { ...C, tracks };
}

// Tank-number range for line at index idx (matches buildSimConfig's baseId formula)
export function tankIdRange(userCfg, idx) {
  const base = lineBaseId(userCfg, idx);
  return [base, base + userCfg.lines[idx].tanks - 1];
}

// { wagonId → 'barrel'|'basket'|'rack' }  — all wagons on a line share the line type
export function getWagonTypeMap(userCfg) {
  const wagonIdsByLine = getLineWagonIds(userCfg);
  const map = {};
  userCfg.lines.forEach((line, li) => {
    wagonIdsByLine[li].forEach(id => { map[id] = line.type || 'barrel'; });
  });
  return map;
}

// ── File-backed persistence (via Vite dev plugin / production API) ────────────
// Falls back silently if the API is not available (production static build).

export async function loadUserConfigFromFile() {
  try {
    const res = await fetch('/api/scada-config')
    if (!res.ok) return null
    const data = await res.json()
    if (data && Array.isArray(data.lines) && typeof data.lines[0]?.wagons === 'number' && data.lines[0]?.type) {
      return data
    }
  } catch {}
  return null
}

export function saveUserConfigToFile(cfg) {
  fetch('/api/scada-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }).catch(() => {}) // fire-and-forget; silently ignore if API unavailable
}

// True when counts changed (simulation must restart)
export function countsChanged(a, b) {
  if (a.lines.length !== b.lines.length) return true;
  return a.lines.some((la, i) => {
    const lb = b.lines[i];
    return la.tanks !== lb.tanks || la.wagons !== lb.wagons;
  });
}
