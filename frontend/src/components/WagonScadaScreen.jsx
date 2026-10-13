import { useMemo, useState } from 'react';
import { C } from '../config/scadaConfig';
import { useWagonSimulation } from '../hooks/useWagonSimulation';
import { processLook } from '../config/processLook';
import { THEME, FONT_COND } from '../theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTempMeta(t) {
  return C.tempRanges.find(r => t < r.max) ?? C.tempRanges[C.tempRanges.length - 1];
}

// ── SVG Defs ──────────────────────────────────────────────────────────────────

function SvgDefs() {
  return (
    <defs>
      <pattern id="bgGrid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0L0 0 0 40" fill="none" stroke="rgba(30,40,50,0.05)" strokeWidth="1" />
      </pattern>
      <pattern id="hazard2d" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill="#F2B705" />
        <rect width="5" height="10" fill="#1F262E" />
      </pattern>
      <pattern id="grating2d" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="#2B3238" />
        <rect width="3" height="6" fill="#4A535B" />
      </pattern>

      <filter id="stGlow" x="-25%" y="-10%" width="150%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="ledGlow" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="arrowGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="softShadow" x="-10%" y="-10%" width="120%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#161B22" floodOpacity="0.18" />
      </filter>

      {/* Chasing-wave animation for hoist-direction arrows */}
      <style>{`
        @keyframes arrowChase {
          0%,  35% { opacity: 0; }
          50%, 85% { opacity: 1; }
          100%      { opacity: 0; }
        }
        .ab-0 { animation: arrowChase 0.72s 0.00s infinite; }
        .ab-1 { animation: arrowChase 0.72s 0.24s infinite; }
        .ab-2 { animation: arrowChase 0.72s 0.48s infinite; }
      `}</style>

      {/* Polypropylene tank wall — lit from the left */}
      <linearGradient id="tankWall" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0"    stopColor="#DCE1E5" />
        <stop offset="0.45" stopColor="#C4CACF" />
        <stop offset="1"    stopColor="#A9B1B8" />
      </linearGradient>
      {/* Hoist paint */}
      <linearGradient id="hoistBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F7C431" />
        <stop offset="1" stopColor="#D9940A" />
      </linearGradient>
      {/* Load (barrel/basket) — warm metal */}
      <linearGradient id="loadMetal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stopColor="#F7B84A" />
        <stop offset="0.5" stopColor="#E08A1E" />
        <stop offset="1"   stopColor="#B4650E" />
      </linearGradient>
      {/* Bath depth shading (overlaid on the bath colour) */}
      <linearGradient id="bathShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.18" />
        <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
      </linearGradient>
      <linearGradient id="beam2d" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5A6672" />
        <stop offset="1" stopColor="#36414B" />
      </linearGradient>
    </defs>
  );
}

// ── Background ────────────────────────────────────────────────────────────────

function Background() {
  return (
    <>
      <rect width={C.svg.w} height={C.svg.h} fill={C.palette.bg} />
      <rect width={C.svg.w} height={C.svg.h} fill="url(#bgGrid)" />
    </>
  );
}

// ── Load drawn in side elevation (barrel / basket / rack) ─────────────────────
function Load2D({ cx, cy, w, h, type = 'barrel' }) {
  const x = cx - w / 2, y = cy - h / 2;
  if (type === 'rack') {
    return (
      <g>
        <rect x={x} y={y} width={w} height={2.5} fill="#2B3238" />
        {[0.2, 0.4, 0.6, 0.8].map(f => (
          <line key={f} x1={x + 2} y1={y + h * f} x2={x + w - 2} y2={y + h * f} stroke="#E08A1E" strokeWidth="1.6" />
        ))}
        <line x1={x + 1} y1={y} x2={x + 1} y2={y + h} stroke="#9AA4AD" strokeWidth="1.6" />
        <line x1={x + w - 1} y1={y} x2={x + w - 1} y2={y + h} stroke="#9AA4AD" strokeWidth="1.6" />
      </g>
    );
  }
  if (type === 'basket') {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx="2" fill="url(#loadMetal)" stroke="#7A4A0A" strokeWidth="1" />
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={x + w * f} y1={y + 1} x2={x + w * f} y2={y + h - 1} stroke="#7A4A0A" strokeWidth="0.8" opacity="0.6" />
        ))}
        <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke="#7A4A0A" strokeWidth="0.8" opacity="0.6" />
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h * 0.32} fill="url(#loadMetal)" stroke="#7A4A0A" strokeWidth="1" />
      {[0.22, 0.5, 0.78].map(f => (
        <line key={f} x1={x + w * f} y1={y + 1} x2={x + w * f} y2={y + h - 1} stroke="#7A4A0A" strokeWidth="1.2" opacity="0.55" />
      ))}
      <rect x={x + 3} y={y + 2} width={w - 6} height={2} rx="1" fill="#FFFFFF" opacity="0.35" />
    </g>
  );
}

// ── Station (Tank) ────────────────────────────────────────────────────────────
// Side elevation with the near wall cut away: wall, rim flange, bath (colour by
// process), the load when one is in, skid base and a floor plinth.

function TankChamber({ st, cx, innerW, top, h, label, idx, loadType }) {
  const look = processLook(label, idx);
  const bathTop = top + h * 0.18 - Math.min(Math.max(st.fillLevel, 0), 100) / 100 * h * 0.06;
  const ix = cx - innerW / 2;
  const loadW = Math.min(innerW * 0.78, 34), loadH = Math.max(h * 0.3, 14);
  const gratingY = top + h * 0.58;
  const loadCy = look.dry ? gratingY - loadH / 2 - 1 : bathTop + loadH * 0.25;
  return (
    <g>
      <rect x={ix} y={top} width={innerW} height={h} fill="#262D34" />
      {look.dry ? (
        <>
          {look.hot && <rect x={ix} y={gratingY} width={innerW} height={top + h - gratingY} fill="#FF6A1A" opacity="0.35" />}
          <rect x={ix} y={gratingY} width={innerW} height="4" fill="url(#grating2d)" />
        </>
      ) : (
        <>
          <rect x={ix} y={bathTop} width={innerW} height={top + h - bathTop} fill={look.bath} opacity={Math.max(look.opacity, 0.75)} />
          <rect x={ix} y={bathTop} width={innerW} height={top + h - bathTop} fill="url(#bathShade)" />
          <line x1={ix} y1={bathTop + 0.5} x2={ix + innerW} y2={bathTop + 0.5} stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.2" />
        </>
      )}
      {st.hasLoad && <Load2D cx={cx} cy={loadCy} w={loadW} h={loadH} type={loadType} />}
    </g>
  );
}

function TankShell2D({ x1, x2, top, h, active }) {
  const w = x2 - x1;
  return (
    <g filter="url(#softShadow)">
      {active && (
        <rect x={x1 - 5} y={top - 5} width={w + 10} height={h + 10} rx="5"
          fill="none" stroke={THEME.accent} strokeWidth="2.5" opacity="0.5" filter="url(#stGlow)" />
      )}
      {/* Skid + plinth */}
      <rect x={x1 + 2} y={top + h} width={w - 4} height="5" fill="#2B3238" />
      <rect x={x1 - 3} y={top + h + 5} width={w + 6} height="3" rx="1" fill="#8A9196" />
      {/* Walls */}
      <rect x={x1} y={top} width={w} height={h} rx="2" fill="url(#tankWall)" stroke="#7D8791" strokeWidth="1" />
      {/* Rim flange */}
      <rect x={x1 - 2.5} y={top - 3} width={w + 5} height="5" rx="1.5"
        fill={active ? THEME.accent : '#8E979F'} stroke={active ? THEME.accentDark : '#6B747C'} strokeWidth="0.8" />
      {/* Reinforcing bands */}
      <rect x={x1 - 1} y={top + h * 0.3} width={w + 2} height="2.5" fill="#59626B" />
      <rect x={x1 - 1} y={top + h * 0.72} width={w + 2} height="2.5" fill="#59626B" />
    </g>
  );
}

function Station({ st, trackCfg, label, idx, loadType }) {
  const { stationsTop, stationH, stationW } = trackCfg;
  const hw = stationW / 2;
  const WALL = 3;
  return (
    <g>
      <TankShell2D x1={st.x - hw} x2={st.x + hw} top={stationsTop} h={stationH} active={st.isActive} />
      <TankChamber st={st} cx={st.x} innerW={stationW - 2 * WALL} top={stationsTop + 2} h={stationH - WALL - 2}
        label={label} idx={idx} loadType={loadType} />
    </g>
  );
}

// ── Hoist (wire ropes + carrier bar + load) ───────────────────────────────────
// Hook height follows the hoist's extension (dipping into a tank) or sits at
// transit height when carrying; the load is drawn only while the wagon holds it.

function WagonArm({ wagon, trackCfg, loadType }) {
  const { railY, railH, armMaxLen } = trackCfg;
  const wagonBottom = railY + railH + C.wagon.h;
  const cx          = wagon.x;
  const hasLoad     = wagon.loadPercent > 50;
  const isExtended  = wagon.armExtension > 0.02;

  const hookDrop = isExtended ? armMaxLen * wagon.armExtension : (hasLoad ? 12 : 3);
  const barY  = wagonBottom + hookDrop;
  const loadW = 30, loadH = 18;

  return (
    <g>
      {/* Wire ropes */}
      <line x1={cx - 6} y1={wagonBottom} x2={cx - 6} y2={barY} stroke="#1D2125" strokeWidth="1.4" />
      <line x1={cx + 6} y1={wagonBottom} x2={cx + 6} y2={barY} stroke="#1D2125" strokeWidth="1.4" />
      {/* Carrier bar */}
      <rect x={cx - 17} y={barY} width="34" height="4" rx="1.5" fill="url(#hoistBody)" stroke="#8A6200" strokeWidth="0.6" />
      {hasLoad && (
        <>
          <line x1={cx - 13} y1={barY + 4} x2={cx - 13} y2={barY + 7} stroke="#8A6200" strokeWidth="2" />
          <line x1={cx + 13} y1={barY + 4} x2={cx + 13} y2={barY + 7} stroke="#8A6200" strokeWidth="2" />
          <Load2D cx={cx} cy={barY + 7 + loadH / 2} w={loadW} h={loadH} type={loadType} />
        </>
      )}
    </g>
  );
}

// ── Hoist trolley on the runway ───────────────────────────────────────────────

const MODE_COLOR_2D = { auto: '#3FB97A', manual: '#F59E0B', service: '#3B9BEA' };

function Wagon({ wagon, trackCfg }) {
  const { railY, railH } = trackCfg;
  const ww    = C.wagon.w;
  const wh    = C.wagon.h;
  const wx    = wagon.x - ww / 2;
  const wyTop = railY + railH;   // body hangs from the rail
  const led   = C.statusColors[wagon.status] || '#7D8793';
  const mode  = wagon.mode && MODE_COLOR_2D[wagon.mode];
  const blinkOn = Math.floor(Date.now() / 450) % 2 === 0;
  const tag = `W${wagon.id}${wagon.mode ? '-' + wagon.mode[0].toUpperCase() : ''}`;
  const plateW = 16 + tag.length * 7.2;

  return (
    <g>
      {/* ID plate above the runway */}
      <rect x={wagon.x - plateW / 2} y={railY - 27} width={plateW} height="17" rx="4" fill="#1F262E" />
      <rect x={wagon.x - plateW / 2} y={railY - 27} width="4" height="17" rx="2" fill={mode || THEME.accent} />
      <text x={wagon.x + 2} y={railY - 14.5} textAnchor="middle" fill="#FFFFFF" fontSize="13"
        fontFamily={FONT_COND} fontWeight="700" letterSpacing="0.5">{tag}</text>

      {/* Wheels on the rail head */}
      {[-11, 11].map(dx => (
        <g key={dx}>
          <circle cx={wagon.x + dx} cy={railY - 3} r="5" fill="#15181C" />
          <circle cx={wagon.x + dx} cy={railY - 3} r="1.8" fill="#9AA4AD" />
        </g>
      ))}
      {/* Side plates wrapping the beam */}
      <rect x={wx + 3} y={railY - 4} width={ww - 6} height={railH + 6} rx="2" fill="url(#hoistBody)" stroke="#8A6200" strokeWidth="0.8" opacity="0.92" />

      {/* Hoist body */}
      <rect x={wx} y={wyTop} width={ww} height={wh} rx="3" fill="url(#hoistBody)" stroke="#8A6200" strokeWidth="1" />
      <rect x={wx + 1} y={wyTop + wh - 6} width={ww - 2} height="5" fill="url(#hazard2d)" />
      {/* Motor */}
      <rect x={wx + 4} y={wyTop + 4} width="14" height="10" rx="2" fill="#5E6A75" />
      <rect x={wx + 17} y={wyTop + 6} width="2.5" height="6" fill="#2B3238" />
      {/* Status + mode LEDs */}
      <circle cx={wx + ww - 7} cy={wyTop + 7} r="2.8" fill={led} filter="url(#ledGlow)" />
      <circle cx={wx + ww - 7} cy={wyTop + 15} r="2.8"
        fill={mode ? (blinkOn ? mode : '#3A4248') : '#3A4248'} filter={mode && blinkOn ? 'url(#ledGlow)' : undefined} />
    </g>
  );
}

// ── Hoist-direction blinking arrows (2-D SVG) ─────────────────────────────────

function WagonDirectionArrows({ wagon, trackCfg }) {
  const { railY, railH } = trackCfg;
  const wyTop = railY + railH;
  const wyMid = wyTop + C.wagon.h / 2;

  const isDown = wagon.status === 'arm_extending_load'    || wagon.status === 'arm_extending_unload';
  const isUp   = wagon.status === 'arm_retracting_loaded' || wagon.status === 'arm_retracting_empty';

  if (!isDown && !isUp) return null;

  const color = isDown ? '#E5534B' : '#3FB97A';
  const cx    = wagon.x + C.wagon.w / 2 + 12;   // beside the body, not over it
  const STEP  = 9;

  const ys = isDown
    ? [wyMid - STEP, wyMid, wyMid + STEP]
    : [wyMid + STEP, wyMid, wyMid - STEP];

  const arrow = cy => isDown
    ? `M${cx - 6},${cy - 4} L${cx + 6},${cy - 4} L${cx},${cy + 4} Z`
    : `M${cx - 6},${cy + 4} L${cx + 6},${cy + 4} L${cx},${cy - 4} Z`;

  return (
    <g filter="url(#arrowGlow)">
      {ys.map((y, i) => (
        <path key={i} d={arrow(y)} fill={color} className={`ab-${i}`} />
      ))}
    </g>
  );
}

// ── Tank hover tooltip ────────────────────────────────────────────────────────
// Purely additive — the existing thermometer/WARN-NORM indicators are untouched;
// this just surfaces the same (plus a bit more) info on hover.

function StationTooltip({ info }) {
  if (!info) return null;
  const { st, trackCfg, label } = info;
  const meta = getTempMeta(st.temperature);
  const w = 270, h = 190, headerH = 40, rowStep = 32;
  const NOTCH_H = 10, NOTCH_W = 18, EDGE_PAD = 8, NOTCH_MARGIN = 20; // keeps notch off the rounded corners

  // Prefer showing above the tank; drop below if that would clip the panel top.
  // The gap reserved here (NOTCH_H) is exactly where the pointer notch is drawn,
  // so the box always sits flush against the notch with no visible seam.
  const above = trackCfg.stationsTop - h - NOTCH_H - 4 > trackCfg.panelY;
  const ty = above
    ? trackCfg.stationsTop - h - NOTCH_H
    : trackCfg.stationsTop + trackCfg.stationH + NOTCH_H;
  // Box is clamped to stay fully on-screen even for corner/edge tanks — it never
  // gets cropped. The notch below is what keeps it visually anchored to the tank:
  // it slides along the box edge to point at the tank's true x, independent of
  // where the box itself had to shift to remain fully on-screen.
  const tx = Math.min(Math.max(st.x - w / 2, EDGE_PAD), C.svg.w - w - EDGE_PAD);
  const notchX = Math.min(Math.max(st.x, tx + NOTCH_MARGIN), tx + w - NOTCH_MARGIN);

  const rows = [
    ['Tank',   `${trackCfg.label} · No. ${st.label}`],
    ['Temp',   `${st.temperature.toFixed(1)} °C  ·  ${meta.label}`],
    ['Load',   st.hasLoad ? 'YES' : 'NO'],
    ['Status', st.isActive ? 'ACTIVE' : 'IDLE'],
  ];

  // Fill covers the box's own border line where the notch attaches (overlaps
  // 2px into the box) so it reads as one continuous shape, not two overlapping
  // ones; the two stroke-only lines then draw just the pointer's visible outline.
  // "above" attaches to the plain footer area (box bg); "below" attaches to the
  // colored header strip, so the fill there matches the header instead.
  const boxEdgeY   = above ? ty + h : ty;
  const notchTipY  = above ? boxEdgeY + NOTCH_H : boxEdgeY - NOTCH_H;
  const notchFill  = above ? '#1F262E' : '#161B22';
  const notchFillPath = above
    ? `M${notchX - NOTCH_W / 2},${boxEdgeY - 2} L${notchX},${notchTipY} L${notchX + NOTCH_W / 2},${boxEdgeY - 2} Z`
    : `M${notchX - NOTCH_W / 2},${boxEdgeY + 2} L${notchX},${notchTipY} L${notchX + NOTCH_W / 2},${boxEdgeY + 2} Z`;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={tx} y={ty} width={w} height={h} rx="8"
        fill="#1F262E" stroke="#3A444F" strokeWidth="1.2" opacity="0.98" />
      <rect x={tx} y={ty} width={w} height={headerH} rx="8" fill="#161B22" />
      <rect x={tx} y={ty + headerH - 8} width={w} height="8" fill="#161B22" />
      <rect x={tx} y={ty + 8} width="5" height={headerH - 16} fill={meta.color} />
      <path d={notchFillPath} fill={notchFill} opacity="0.98" />
      <path d={`M${notchX - NOTCH_W / 2},${boxEdgeY} L${notchX},${notchTipY}`} fill="none" stroke="#3A444F" strokeWidth="1.2" strokeLinecap="round" />
      <path d={`M${notchX + NOTCH_W / 2},${boxEdgeY} L${notchX},${notchTipY}`} fill="none" stroke="#3A444F" strokeWidth="1.2" strokeLinecap="round" />
      <text x={tx + w / 2} y={ty + 26} textAnchor="middle" fill="#FFFFFF" fontSize="16"
        fontFamily="inherit" fontWeight="bold" letterSpacing="1">
        {label || `${trackCfg.label} · TANK ${st.label}`}
      </text>
      {rows.map(([label, value], i) => (
        <g key={label}>
          <text x={tx + 18} y={ty + headerH + 28 + i * rowStep} fill="#AFC4E0" fontSize="14.5" fontFamily="inherit">{label}</text>
          <text x={tx + w - 18} y={ty + headerH + 28 + i * rowStep} textAnchor="end" fill="#FFFFFF" fontSize="15"
            fontFamily="inherit" fontWeight="bold">{value}</text>
        </g>
      ))}
    </g>
  );
}

// ── Station group ─ several adjacent tanks merged into one partitioned shell ──
// One continuous outer shell spans the run; each original station still gets
// its own fill bar, load block, and inlet nozzle at its own position,
// separated by a thin divider — same station data as a solo Station, only the
// outer housing (and the gap between chambers) is drawn differently.
function StationGroup({ groupStations, trackCfg, labels = {}, loadType }) {
  const { stationsTop, stationH, stationW } = trackCfg;
  const xs = groupStations.map(st => st.x);
  const pitch = xs.length > 1 ? xs[1] - xs[0] : stationW * 1.3;
  const shellX1 = xs[0] - stationW / 2;
  const shellX2 = xs[xs.length - 1] + stationW / 2;
  const anyActive = groupStations.some(st => st.isActive);
  const WALL = 3;

  return (
    <g>
      <TankShell2D x1={shellX1} x2={shellX2} top={stationsTop} h={stationH} active={anyActive} />
      {groupStations.map((st, i) => {
        const left  = i === 0 ? shellX1 + WALL : (xs[i - 1] + st.x) / 2 + 1.5;
        const right = i === groupStations.length - 1 ? shellX2 - WALL : (st.x + xs[i + 1]) / 2 - 1.5;
        return (
          <TankChamber key={st.id} st={st} cx={(left + right) / 2} innerW={right - left}
            top={stationsTop + 2} h={stationH - WALL - 2} label={labels[st.id]} idx={i} loadType={loadType} />
        );
      })}
      {/* Chamber divider walls */}
      {groupStations.slice(1).map((st, i) => (
        <rect key={st.id} x={(xs[i] + xs[i + 1]) / 2 - 1.5} y={stationsTop + 2}
          width="3" height={stationH - 4} fill="#B4BBC1" />
      ))}
    </g>
  );
}

// ── Track Section ─────────────────────────────────────────────────────────────

function TrackSection({ trackCfg, wagons, stations, onHoverStation, tankPartitions = [], labels = {}, loadType = 'barrel' }) {
  const {
    railY, railH, railX1, railX2,
    panelY, panelH, stationsTop, stLabelY,
  } = trackCfg;

  // Partition groups for this line — merge their tanks into one shell. A
  // group only applies if every one of its tank IDs still exists on this
  // line (it can go stale if tank counts changed since it was saved).
  const lineGroups = tankPartitions.filter(g => g.lineId === trackCfg.id);
  const groupedIds = new Set();
  const validGroups = lineGroups.map(g => {
    const groupStations = stations
      .filter(st => st.id >= g.fromId && st.id <= g.toId)
      .sort((a, b) => a.x - b.x);
    if (groupStations.length !== (g.toId - g.fromId + 1)) return null;
    groupStations.forEach(st => groupedIds.add(st.id));
    return { ...g, groupStations };
  }).filter(Boolean);
  const soloStations = stations.filter(st => !groupedIds.has(st.id));

  // Runway hangers from the panel header down to the beam
  const hangers = useMemo(() => {
    const arr = [];
    const n = Math.max(2, Math.round((railX2 - railX1) / 160));
    for (let i = 0; i <= n; i++) arr.push(railX1 + 10 + i * (railX2 - railX1 - 20) / n);
    return arr;
  }, [railX1, railX2]);

  const ids = trackCfg.wagonIds || [];
  const wagonLabel = ids.length === 0 ? 'NO WAGONS'
    : ids.length === 1 ? `WAGON ${ids[0]}` : `WAGONS ${ids[0]} – ${ids[ids.length - 1]}`;
  const loadedCount = stations.filter(st => st.hasLoad).length;

  return (
    <g>
      <rect x="6" y={panelY} width={C.svg.w - 12} height={panelH}
        fill={C.palette.panel} stroke={C.palette.panelBorder} strokeWidth="1" rx="8" filter="url(#softShadow)" />

      {/* Panel header */}
      <path d={`M6 ${panelY + 28} V${panelY + 8} Q6 ${panelY} 14 ${panelY} H${C.svg.w - 14} Q${C.svg.w - 6} ${panelY} ${C.svg.w - 6} ${panelY + 8} V${panelY + 28} Z`}
        fill="#1F262E" />
      <rect x="16" y={panelY + 7} width="4" height="14" rx="2" fill={THEME.amber} />
      <text x="28" y={panelY + 20} fill="#FFFFFF" fontSize="17" fontFamily={FONT_COND}
        fontWeight="700" letterSpacing="1.5">{trackCfg.label}</text>
      <text x="150" y={panelY + 20} fill="#9AA6B2" fontSize="14" fontWeight="600" letterSpacing="1">{wagonLabel}</text>
      <text x={C.svg.w - 64} y={panelY + 20} fill="#9AA6B2" fontSize="14" fontWeight="600" textAnchor="end">
        <tspan fill={THEME.amber} fontWeight="700">{loadedCount}</tspan> LOADED · {trackCfg.stations.length} TANKS
      </text>

      {/* Runway: hangers + I-beam + rail head + end stops */}
      {hangers.map((hx, i) => (
        <rect key={i} x={hx - 2} y={panelY + 28} width="4" height={railY - panelY - 28} fill="#46525E" />
      ))}
      <rect x={railX1} y={railY} width={railX2 - railX1} height={railH} rx="1.5" fill="url(#beam2d)" />
      <rect x={railX1} y={railY - 2} width={railX2 - railX1} height="3" rx="1" fill="#A9B1B8" />
      {[railX1 - 3, railX2 - 5].map(ex => (
        <rect key={ex} x={ex} y={railY - 5} width="8" height={railH + 9} rx="1.5" fill="url(#hazard2d)" stroke="#1F262E" strokeWidth="0.8" />
      ))}

      {/* Tanks */}
      {validGroups.map(g => (
        <StationGroup key={g.id} groupStations={g.groupStations} trackCfg={trackCfg} labels={labels} loadType={loadType} />
      ))}
      {soloStations.map((st, i) => (
        <Station key={st.id} st={st} trackCfg={trackCfg} label={labels[st.id]} idx={i} loadType={loadType} />
      ))}

      {/* Tank number plates */}
      {stations.map(st => {
        const w = Math.max(20, String(st.label).length * 7 + 10);
        return (
          <g key={`n-${st.id}`}>
            <rect x={st.x - w / 2} y={stLabelY - 10} width={w} height="15" rx="3"
              fill={st.hasLoad ? '#1F262E' : '#E5EAEE'} stroke={st.hasLoad ? THEME.amber : '#C3CAD1'} strokeWidth="1" />
            <text x={st.x} y={stLabelY + 1} textAnchor="middle" fontSize="11" fontWeight="700"
              fill={st.hasLoad ? '#FFFFFF' : THEME.textMid}>{st.label}</text>
          </g>
        );
      })}

      {/* Hoists before wagon bodies */}
      {wagons.map(w => (
        <WagonArm key={`arm-${w.id}`} wagon={w} trackCfg={trackCfg} loadType={loadType} />
      ))}

      {/* Wagon bodies */}
      {wagons.map(w => (
        <Wagon key={w.id} wagon={w} trackCfg={trackCfg} />
      ))}

      {/* Hoist-direction arrows (on top of everything) */}
      {wagons.map(w => (
        <WagonDirectionArrows key={`arr-${w.id}`} wagon={w} trackCfg={trackCfg} />
      ))}

      {/* Hover hit-zones — invisible, sit on top of everything so hovering a tank
          (its body or number plate) always shows its tooltip. */}
      {onHoverStation && stations.map(st => (
        <rect key={`hover-${st.id}`}
          x={st.x - trackCfg.stationW / 2 - 4} y={stationsTop - 16}
          width={trackCfg.stationW + 8} height={(stLabelY - stationsTop) + 20}
          fill="transparent" pointerEvents="all" style={{ cursor: 'pointer' }}
          onMouseEnter={() => onHoverStation({ st, trackCfg, label: labels[st.id] })}
          onMouseLeave={() => onHoverStation(null)}
        />
      ))}
    </g>
  );
}

// ── Cross trolley ─ a device that bridges a tank on one line to a tank on
// another, for transferring a load across lines. Purely a visual marker
// connecting the two tank positions — wagon movement and load logic are
// unaffected. Rendered once per saved trolley, above all track sections since
// it spans two of them.
function CrossTrolley2D({ ct, tracks, stations }) {
  const t1 = tracks.find(t => t.id === ct.line1Id);
  const t2 = tracks.find(t => t.id === ct.line2Id);
  if (!t1 || !t2) return null;
  const st1 = stations.find(s => s.trackId === ct.line1Id && s.id === ct.tank1Id);
  const st2 = stations.find(s => s.trackId === ct.line2Id && s.id === ct.tank2Id);
  if (!st1 || !st2) return null;

  // Connect from the bottom edge of whichever tank sits higher on screen to
  // the top edge of the one below it, so the line reads as bridging down
  // between the two panels regardless of which line is passed first.
  const [top, bot] = t1.stationsTop < t2.stationsTop
    ? [{ st: st1, t: t1 }, { st: st2, t: t2 }]
    : [{ st: st2, t: t2 }, { st: st1, t: t1 }];
  const x1 = top.st.x, y1 = top.t.stationsTop + top.t.stationH;
  const x2 = bot.st.x, y2 = bot.t.stationsTop - 13; // clear the inlet nozzle
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#C53030" strokeWidth="4"
        strokeDasharray="7,5" strokeLinecap="round" opacity="0.9" />
      <rect x={midX - 10} y={midY - 10} width="20" height="20" rx="4"
        fill="#C53030" stroke="#FFD740" strokeWidth="1.8" />
      <text x={midX} y={midY + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#FFD740">⇄</text>
    </g>
  );
}

// ── Bottom info tables ───────────────────────────────────────────────────────
// Sit in the space freed up below the tank diagrams. Three so far (more can be
// added later as further columns in the same row):
//   1. Cycle Time        — fixed 3-row stat table
//   2. Wagon Location    — one row per wagon, collapsed to 3 with an expand notch
//   3. Wagon Instruction — same shape as Location; data source still TBD, so
//                          values are placeholders until that's wired up.

// Row/header sized to keep the largest (fully-expanded) wagon table clear of
// the status bar below it — see the headroom check in BottomTables.
const TABLE_ROW_H  = 25;
const TABLE_HDR_H  = 31;
const TABLE_WIDTH  = 340; // fixed, content-driven — not stretched to fill the row
const TABLE_GAP    = 14;

// Generic map-pin glyph (teardrop + hole) drawn as a plain inline SVG path —
// not a font/icon-library asset, so it needs no network access to render.
function MapPinIcon({ x, y, size = 15, color }) {
  const s = size / 24;
  return (
    <g transform={`translate(${x - size / 2},${y - size / 2}) scale(${s})`}>
      <path fill={color} d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </g>
  );
}

function TablePanel({ x, y, width, height, icon, iconNode, title, children }) {
  const iconCx = x + 24;
  const iconCy = y + TABLE_HDR_H / 2;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="8"
        fill={C.palette.panel} stroke={C.palette.panelBorder} strokeWidth="1" filter="url(#softShadow)" />
      <path d={`M${x} ${y + TABLE_HDR_H} V${y + 8} Q${x} ${y} ${x + 8} ${y} H${x + width - 8} Q${x + width} ${y} ${x + width} ${y + 8} V${y + TABLE_HDR_H} Z`}
        fill="#1F262E" />
      <rect x={x + 8} y={y + 8} width="4" height="15" rx="2" fill={THEME.amber} />
      {iconNode
        ? iconNode(iconCx, iconCy)
        : <text x={iconCx - 7} y={y + 21} fill="#5FD3DB" fontSize="16" fontFamily="inherit">{icon}</text>}
      <text x={x + 44} y={y + 21} fill="#FFFFFF" fontSize="17"
        fontFamily={FONT_COND} fontWeight="700" letterSpacing="1">{title}</text>
      {children}
    </g>
  );
}

function TableRow({ x, y, width, label, value, rowIdx }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={TABLE_ROW_H}
        fill={rowIdx % 2 === 0 ? '#FFFFFF' : '#F5F7F8'} />
      <text x={x + 12} y={y + 18} fill={C.palette.textBright} fontSize="15"
        fontFamily="inherit" fontWeight="bold">{label}</text>
      <text x={x + width - 12} y={y + 18} textAnchor="end" fill={C.palette.accent}
        fontSize="15.5" fontFamily="inherit" fontWeight="bold">{value}</text>
    </g>
  );
}

function fmtClock(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Live numeric tag value, or null when the tag isn't there.
function tagNum(liveTags, name) {
  const v = Number(liveTags[name]?.value);
  return liveTags[name] && Number.isFinite(v) ? v : null;
}

function CycleTimeTable({ x, y, width, liveTags }) {
  const clock = name => {
    const v = tagNum(liveTags, name);
    return v != null ? fmtClock(Math.round(v)) : '--:--';
  };
  const rows = [
    ['Actual Time', clock('PLANT_CYCLE_ACTUAL')],
    ['Last Cycle',  clock('PLANT_CYCLE_LAST')],
    ['SET Time',    clock('PLANT_CYCLE_SET')],
  ];
  const height = TABLE_HDR_H + rows.length * TABLE_ROW_H + 6;

  return (
    <TablePanel x={x} y={y} width={width} height={height} icon="◴" title="CYCLE TIME">
      {rows.map(([label, value], i) => (
        <TableRow key={label} x={x} y={y + TABLE_HDR_H + i * TABLE_ROW_H}
          width={width} label={label} value={value} rowIdx={i} />
      ))}
    </TablePanel>
  );
}

// Shared shape for the per-wagon tables (Location / Instruction) — shows the
// first 3 wagons; a notch at the bottom expands/collapses the rest. Height is
// derived the same way here and in wagonMiniTableHeight() below, which the
// parent uses to keep whatever sits underneath from being overlapped when
// this expands — so `expanded`/`onToggle` are controlled from up there
// instead of each table owning its own state.
function wagonMiniTableHeight(wagonCount, expanded) {
  const canExpand = wagonCount > 3;
  const visibleCount = expanded ? wagonCount : Math.min(3, wagonCount);
  return TABLE_HDR_H + visibleCount * TABLE_ROW_H + (canExpand ? 14 : 6);
}

function WagonMiniTable({ x, y, width, icon, iconNode, title, wagons, getValue, expanded, onToggle }) {
  const canExpand = wagons.length > 3;
  const visible   = expanded ? wagons : wagons.slice(0, 3);
  const height    = wagonMiniTableHeight(wagons.length, expanded);

  return (
    <g>
      <TablePanel x={x} y={y} width={width} height={height} icon={icon} iconNode={iconNode} title={title}>
        {visible.map((w, i) => (
          <TableRow key={w.id} x={x} y={y + TABLE_HDR_H + i * TABLE_ROW_H}
            width={width} label={`W${w.id}`} value={getValue(w)} rowIdx={i} />
        ))}
      </TablePanel>
      {canExpand && (
        <g onClick={onToggle} style={{ cursor: 'pointer' }}>
          <rect x={x + width / 2 - 14} y={y + height - 12} width="28" height="14" rx="3"
            fill={C.palette.panelBorder} />
          <text x={x + width / 2} y={y + height - 2} textAnchor="middle"
            fill={C.palette.textBright} fontSize="9" fontFamily="inherit">
            {expanded ? '▲' : '▼'}
          </text>
        </g>
      )}
    </g>
  );
}

// Wagon's live location tag (tank number) when there is one, else the
// nearest station to its drawn position.
function wagonLocationLabel(wagon, stations, wagonLocations = {}) {
  const live = wagonLocations[String(wagon.id)];
  if (live) return `TANK ${live}`;
  const trackSts = stations.filter(s => s.trackId === wagon.trackId);
  let best = null, bestDist = Infinity;
  trackSts.forEach(st => {
    const d = Math.abs(st.x - wagon.x);
    if (d < bestDist) { bestDist = d; best = st; }
  });
  if (best && bestDist < 18) return `TANK ${best.label}`;
  return wagon.status === 'idle' ? 'HOME' : 'TRANSIT';
}

// ── Grouped station-range tables (Rectifier / Temperature / pH) ────────────────
// Same generic vector-icon approach as MapPinIcon — plain inline SVG paths
// (the common "bolt", "thermometer", "flask" glyph shapes), no icon font/CDN.

function BoltIcon({ x, y, size = 15, color }) {
  const s = size / 24;
  return (
    <g transform={`translate(${x - size / 2},${y - size / 2}) scale(${s})`}>
      <path fill={color} d="M7 2v11h3v9l7-12h-4l4-8z" />
    </g>
  );
}

function ThermoIcon({ x, y, size = 15, color }) {
  const s = size / 24;
  return (
    <g transform={`translate(${x - size / 2},${y - size / 2}) scale(${s})`}>
      <rect x="10" y="2" width="4" height="12" rx="2" fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx="12" cy="18" r="4" fill={color} />
      <rect x="10.5" y="9" width="3" height="7" fill={color} />
    </g>
  );
}

function FlaskIcon({ x, y, size = 15, color }) {
  const s = size / 24;
  return (
    <g transform={`translate(${x - size / 2},${y - size / 2}) scale(${s})`}>
      <path fill={color} d="M9 3v2h1v3.34L5.79 16.5A2 2 0 0 0 7.6 19h8.8a2 2 0 0 0 1.81-2.5L14 8.34V5h1V3H9zm3 5.68L14.76 15H9.24L12 8.68z" />
    </g>
  );
}

const GROUP_ROW_H    = 21;
const GROUP_COLHDR_H = 17;

function GroupedStatTable({ x, y, width, icon, iconNode, title, colLabels, rows }) {
  const labelW  = width * 0.34;
  const valW    = (width - labelW) / 2;
  const bodyTop = y + TABLE_HDR_H + GROUP_COLHDR_H;
  const height  = TABLE_HDR_H + GROUP_COLHDR_H + rows.length * GROUP_ROW_H + 3;

  return (
    <TablePanel x={x} y={y} width={width} height={height} icon={icon} iconNode={iconNode} title={title}>
      <text x={x + labelW + valW / 2} y={y + TABLE_HDR_H + 13} textAnchor="middle"
        fill={C.palette.textDim} fontSize="9.5" fontFamily="inherit" fontWeight="bold">{colLabels[0]}</text>
      <text x={x + labelW + valW + valW / 2} y={y + TABLE_HDR_H + 13} textAnchor="middle"
        fill={C.palette.textDim} fontSize="9.5" fontFamily="inherit" fontWeight="bold">{colLabels[1]}</text>

      {rows.map((row, i) => {
        const ry = bodyTop + i * GROUP_ROW_H;
        return (
          <g key={row.label}>
            <rect x={x} y={ry} width={width} height={GROUP_ROW_H}
              fill={i % 2 === 0 ? '#FFFFFF' : '#F5F7F8'} />
            <text x={x + 12} y={ry + 15} fill={C.palette.textBright} fontSize="12.5"
              fontFamily="inherit" fontWeight="bold">{row.label}</text>
            <text x={x + labelW + valW / 2} y={ry + 15} textAnchor="middle" fill={C.palette.accent}
              fontSize="12.5" fontFamily="inherit" fontWeight="bold">{row.values[0]}</text>
            <text x={x + labelW + valW + valW / 2} y={ry + 15} textAnchor="middle" fill={C.palette.accent}
              fontSize="12.5" fontFamily="inherit" fontWeight="bold">{row.values[1]}</text>
          </g>
        );
      })}
    </TablePanel>
  );
}

// Splits all stations (both lines combined) into 4 contiguous id-ordered
// groups — group count/boundaries adapt automatically to however many tanks
// currently exist, rather than a hardcoded range like "STN 1-7".
function groupAllStations(stations) {
  const sorted = [...stations].sort((a, b) => a.id - b.id);
  if (!sorted.length) return [];
  const groupSize = Math.ceil(sorted.length / 4);
  const groups = [];
  for (let i = 0; i < sorted.length; i += groupSize) groups.push(sorted.slice(i, i + groupSize));
  return groups;
}

function groupLabel(chunk) {
  const first = chunk[0].label, last = chunk[chunk.length - 1].label;
  return first === last ? `STN ${first}` : `STN ${first}-${last}`;
}

// Up to 4 rectifier stations — those with a live current set point.
function RectifierTable({ x, y, stations, liveTags }) {
  const rect = [...stations].sort((a, b) => a.id - b.id)
    .filter(st => tagNum(liveTags, `Tank_${st.id}_CurrentSV`) != null).slice(0, 4);
  const rows = rect.length
    ? rect.map(st => {
        const a = tagNum(liveTags, `Tank_${st.id}_Current`);
        const v = tagNum(liveTags, `Tank_${st.id}_Voltage`);
        return { label: `STN ${st.label}`, values: [a != null ? String(Math.round(a)) : '—', v != null ? v.toFixed(1) : '—'] };
      })
    : [1, 2, 3, 4].map(n => ({ label: `SET ${n}`, values: ['—', '—'] }));
  return (
    <GroupedStatTable x={x} y={y} width={TABLE_WIDTH} title="RECTIFIER"
      iconNode={(cx, cy) => <BoltIcon x={cx} y={cy} color="#5FD3DB" />}
      colLabels={['DC CURR (A)', 'DC VOLT (V)']} rows={rows} />
  );
}

// Per station group: hottest live tank temperature and its set point.
function TemperatureTable({ x, y, stations, liveTags }) {
  const rows = groupAllStations(stations).map(chunk => {
    let best = null;
    chunk.forEach(st => {
      const t = tagNum(liveTags, `Tank_${st.id}_Temp`);
      if (t != null && (!best || t > best.t)) best = { t, sv: tagNum(liveTags, `Tank_${st.id}_TempSV`) };
    });
    return {
      label: groupLabel(chunk),
      values: [best ? best.t.toFixed(1) : '—', best?.sv != null ? best.sv.toFixed(0) : '—'],
    };
  });
  return (
    <GroupedStatTable x={x} y={y} width={TABLE_WIDTH} title="TEMPERATURE (°C)"
      iconNode={(cx, cy) => <ThermoIcon x={cx} y={cy} color="#5FD3DB" />}
      colLabels={['MAX ACTUAL', 'SET']} rows={rows} />
  );
}

// Per station group: lowest / highest live pH among its monitored tanks.
function PhTable({ x, y, stations, liveTags }) {
  const rows = groupAllStations(stations).map(chunk => {
    const phs = chunk.map(st => tagNum(liveTags, `Tank_${st.id}_PH`)).filter(v => v != null);
    return {
      label:  groupLabel(chunk),
      values: phs.length ? [Math.min(...phs).toFixed(2), Math.max(...phs).toFixed(2)] : ['—', '—'],
    };
  });
  return (
    <GroupedStatTable x={x} y={y} width={TABLE_WIDTH} title="pH"
      iconNode={(cx, cy) => <FlaskIcon x={cx} y={cy} color="#5FD3DB" />}
      colLabels={['MIN pH', 'MAX pH']} rows={rows} />
  );
}

function BottomTables({ y, wagons, stations, liveTags = {}, wagonLocations = {} }) {
  // Horizontally centered on the canvas, not pinned to the left margin.
  const groupWidth = 3 * TABLE_WIDTH + 2 * TABLE_GAP;
  const x1 = (C.svg.w - groupWidth) / 2;
  const x2 = x1 + TABLE_WIDTH + TABLE_GAP;
  const x3 = x2 + TABLE_WIDTH + TABLE_GAP;

  const [locExpanded, setLocExpanded]     = useState(false);
  const [instrExpanded, setInstrExpanded] = useState(false);

  // Row 2's position is fixed to the COLLAPSED row-1 height, not the current
  // (possibly expanded) one — there isn't enough vertical room to reflow row 2
  // every time a wagon list expands. Row 1 is painted after row 2 below, so
  // an expanded wagon table simply draws on top of row 2 rather than the two
  // overlapping unpredictably; collapsing it again reveals row 2 untouched.
  const cycleTableHeight = TABLE_HDR_H + 3 * TABLE_ROW_H + 6;
  const collapsedRow1Height = Math.max(wagonMiniTableHeight(wagons.length, false), cycleTableHeight);
  const row2Y = y + collapsedRow1Height + TABLE_GAP;

  return (
    <g>
      <RectifierTable x={x1} y={row2Y} stations={stations} liveTags={liveTags} />
      <TemperatureTable x={x2} y={row2Y} stations={stations} liveTags={liveTags} />
      <PhTable x={x3} y={row2Y} stations={stations} liveTags={liveTags} />

      <CycleTimeTable x={x1} y={y} width={TABLE_WIDTH} liveTags={liveTags} />
      <WagonMiniTable x={x2} y={y} width={TABLE_WIDTH} title="WAGON LOCATION"
        iconNode={(cx, cy) => <MapPinIcon x={cx} y={cy} color="#5FD3DB" />}
        wagons={wagons} getValue={w => wagonLocationLabel(w, stations, wagonLocations)}
        expanded={locExpanded} onToggle={() => setLocExpanded(e => !e)} />
      <WagonMiniTable x={x3} y={y} width={TABLE_WIDTH} icon="▤" title="WAGON INSTRUCTION"
        wagons={wagons} getValue={w => liveTags[`W${w.id}_OPERATION`]?.value || '—'}
        expanded={instrExpanded} onToggle={() => setInstrExpanded(e => !e)} />
    </g>
  );
}

// ── Status Bar ────────────────────────────────────────────────────────────────

// Per-wagon status rectangles are already shown in the outer app footer
// (WagonScada3D.jsx status bar) — not repeated here.
function StatusBar() {
  return (
    <g>
      <rect x="0" y={C.svg.h - 6} width={C.svg.w} height="6" fill="#EAECF4" />
      <line x1="0" y1={C.svg.h - 6} x2={C.svg.w} y2={C.svg.h - 6}
        stroke={C.palette.panelBorder} strokeWidth="1.5" />
      <line x1="0" y1={C.svg.h - 4.5} x2={C.svg.w} y2={C.svg.h - 4.5}
        stroke={C.palette.accent} strokeWidth="0.4" opacity="0.3" />
    </g>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function WagonScadaScreen({ wagons: wagonsIn, stations: stationsIn, tracks, tankPartitions = [], crossTrolleys = [], liveTags = {}, wagonLocations = {}, stationLabels = {}, wagonTypeMap = {} } = {}) {
  const sim = useWagonSimulation();
  const wagons   = wagonsIn   ?? sim.wagons;
  const stations = stationsIn ?? sim.stations;
  // Use the caller's dynamic track config (railX1/railX2/homeX/homeSide etc.,
  // computed per the actual tank counts) when provided; static C.tracks is only
  // a fallback for standalone/preview usage with no live config.
  const trackList = tracks ?? C.tracks;
  const [hoverInfo, setHoverInfo] = useState(null);
  // Sit right below whichever panel extends furthest down, so this keeps
  // working if panel heights ever change (more tanks/lines etc.).
  const tablesY = Math.max(...trackList.map(t => t.panelY + t.panelH)) + 14;

  return (
    <div style={{ width: '100%', height: '100%', background: C.palette.bg, overflow: 'hidden' }}>
      <svg
        viewBox={`0 0 ${C.svg.w} ${C.svg.h}`}
        width="100%" height="100%"
        style={{ display: 'block' }}
        preserveAspectRatio="xMidYMin meet"
      >
        <SvgDefs />
        <Background />
        {trackList.map(trackCfg => (
          <TrackSection
            key={trackCfg.id}
            trackCfg={trackCfg}
            wagons={wagons.filter(w => w.trackId === trackCfg.id)}
            stations={stations.filter(s => s.trackId === trackCfg.id)}
            onHoverStation={setHoverInfo}
            tankPartitions={tankPartitions}
            labels={stationLabels}
            loadType={wagonTypeMap[trackCfg.wagonIds?.[0]] || 'barrel'}
          />
        ))}
        {crossTrolleys.map(ct => (
          <CrossTrolley2D key={ct.id} ct={ct} tracks={trackList} stations={stations} />
        ))}
        <BottomTables y={tablesY} wagons={wagons} stations={stations} liveTags={liveTags} wagonLocations={wagonLocations} />
        <StatusBar />
        <StationTooltip info={hoverInfo} />
      </svg>
    </div>
  );
}
