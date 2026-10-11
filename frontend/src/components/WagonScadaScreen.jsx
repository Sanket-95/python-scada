import { useMemo, useState, useEffect } from 'react';
import { C } from '../config/scadaConfig';
import { useWagonSimulation } from '../hooks/useWagonSimulation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTempMeta(t) {
  return C.tempRanges.find(r => t < r.max) ?? C.tempRanges[C.tempRanges.length - 1];
}

// ── SVG Defs ──────────────────────────────────────────────────────────────────

function SvgDefs() {
  return (
    <defs>
      <pattern id="bgGrid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0L0 0 0 40" fill="none" stroke={C.palette.grid} strokeWidth="0.5" />
      </pattern>

      <filter id="railGlow" x="-5%" y="-200%" width="110%" height="500%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="stGlow" x="-25%" y="-10%" width="150%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="ledGlow" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="wGlow" x="-15%" y="-15%" width="130%" height="130%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="arrowGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>

      {/* Chasing-wave animation for arm-direction arrows */}
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

      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="0%"   stopColor="transparent" />
        <stop offset="100%" stopColor="rgba(100,120,160,0.08)" />
      </radialGradient>
      <linearGradient id="hdrGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stopColor="#DDE4F0" />
        <stop offset="50%"  stopColor="#E8EDF8" />
        <stop offset="100%" stopColor="#DDE4F0" />
      </linearGradient>

      {/* Amber load gradient — arm bucket AND transit crate */}
      <linearGradient id="loadGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stopColor="#FFD54F" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#E65100" stopOpacity="0.85" />
      </linearGradient>

      {/* Tank chemical fill — fixed blue */}
      <linearGradient id="chemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stopColor={C.chemSurface} stopOpacity="0.9" />
        <stop offset="8%"   stopColor={C.chemColor}   stopOpacity="0.95" />
        <stop offset="100%" stopColor={C.chemColor}   stopOpacity="0.9" />
      </linearGradient>

      {/* Tank solid-load block */}
      <linearGradient id="tankLoadGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stopColor={C.loadHighlight} stopOpacity="0.9" />
        <stop offset="100%" stopColor={C.loadColor}     stopOpacity="0.95" />
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
      <rect width={C.svg.w} height={C.svg.h} fill="url(#vignette)" />
    </>
  );
}

// ── Station (Tank) ────────────────────────────────────────────────────────────

function Station({ st, trackCfg }) {
  const { stationsTop, stationH, stationW } = trackCfg;
  const hw    = stationW / 2;
  const sx    = st.x - hw;
  const isAct = st.isActive;

  // Static blue fill — height never changes
  const fillPx = Math.max(0, (st.fillLevel / 100) * (stationH - 6));
  const fillY  = stationsTop + stationH - 3 - fillPx;

  // Solid load block: occupies bottom 38% of tank
  const loadH = Math.floor(stationH * 0.38);
  const loadY = stationsTop + stationH - 3 - loadH;

  return (
    <g>
      {/* Active glow */}
      {isAct && (
        <rect x={sx - 5} y={stationsTop - 5} width={stationW + 10} height={stationH + 10}
          fill="none" stroke={C.palette.accent} strokeWidth="2" rx="3"
          opacity="0.35" filter="url(#stGlow)" />
      )}

      {/* Outer border — clearly visible, gives tank its boxy look */}
      <rect x={sx - 1} y={stationsTop - 1} width={stationW + 2} height={stationH + 2}
        fill="none"
        stroke={isAct ? C.palette.accent : '#4872A8'}
        strokeWidth={isAct ? 2 : 1.5} rx="2.5" />

      {/* Tank body */}
      <rect x={sx} y={stationsTop} width={stationW} height={stationH}
        fill="#7A8E9E" rx="1.5" />

      {/* Static chemical fill (blue, never animates) */}
      {fillPx > 0 && (
        <rect x={sx + 1} y={fillY} width={stationW - 2} height={fillPx}
          fill="url(#chemGrad)" rx="0.5" />
      )}

      {/* Load block — bright orange square box at tank bottom */}
      {st.hasLoad && (
        <g>
          {/* Outer glow */}
          <rect x={sx + 1} y={loadY - 1} width={stationW - 2} height={loadH + 2}
            fill="#FF6D00" rx="1" opacity="0.25" />
          {/* Main box — solid bright orange, yellow border */}
          <rect x={sx + 2} y={loadY} width={stationW - 4} height={loadH}
            fill="#FF5722" stroke="#FFD740" strokeWidth="1.5" rx="1" />
          {/* Top shine */}
          <rect x={sx + 3} y={loadY + 1} width={stationW - 6} height={4}
            fill="#FF8A65" rx="0.5" opacity="0.8" />
        </g>
      )}

      {/* Mid-level tick */}
      <line x1={sx + 2} y1={stationsTop + stationH / 2}
            x2={sx + stationW - 2} y2={stationsTop + stationH / 2}
        stroke="#5A6A78" strokeWidth="0.5" strokeDasharray="1.5,2.5" />

      {/* Inner lip */}
      <rect x={sx + 1} y={stationsTop + 1} width={stationW - 2} height={stationH - 2}
        fill="none" stroke="#8A9EAE" strokeWidth="0.5" rx="1" />

      {/* Inlet nozzle */}
      <rect x={st.x - 4} y={stationsTop - 7}  width="8" height="8"
        fill={isAct ? C.palette.accent : '#3A6090'} rx="1" />
      <rect x={st.x - 2} y={stationsTop - 11} width="4" height="5"
        fill={isAct ? C.palette.accent : '#2E5080'} rx="1" />

      {/* Support legs — tank doesn't sit flush on the ground */}
      <rect x={sx + 2}            y={stationsTop + stationH} width="3" height="6" fill="#4A5A6A" />
      <rect x={sx + stationW - 5} y={stationsTop + stationH} width="3" height="6" fill="#4A5A6A" />
    </g>
  );
}

// ── Wagon Arm ─────────────────────────────────────────────────────────────────
// Two visual modes:
//   (A) arm extended  → full arm shaft + bucket at tip
//   (B) arm retracted + wagon carrying load → compact amber crate hanging below wagon

function WagonArm({ wagon, trackCfg }) {
  const { railY, railH, stationsTop, armMaxLen } = trackCfg;
  const wagonBottom = railY + railH + C.wagon.h;
  const cx          = wagon.x;
  const hasLoad     = wagon.loadPercent > 50;
  const isExtended  = wagon.armExtension > 0.02;

  if (!isExtended && !hasLoad) return null;

  // ── Mode B: compact transit crate ────────────────────────────────────────
  if (!isExtended && hasLoad) {
    const chainLen = 11;
    const crateW   = 24;
    const crateH   = 16;
    const crateTop = wagonBottom + chainLen;

    return (
      <g>
        {/* Chain */}
        <line x1={cx} y1={wagonBottom} x2={cx} y2={crateTop}
          stroke="#6090C0" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={wagonBottom + 4} r="2.5"
          fill="none" stroke="#70A0D0" strokeWidth="1.2" />

        {/* Crate body */}
        <rect x={cx - crateW / 2} y={crateTop} width={crateW} height={crateH}
          fill="url(#loadGrad)" stroke={C.loadHighlight} strokeWidth="1.5" rx="2.5" />

        {/* Crate lid highlight */}
        <rect x={cx - crateW / 2 + 2} y={crateTop + 1} width={crateW - 4} height={3}
          fill="#FFD54F" rx="0.5" opacity="0.55" />

        {/* Crate braces */}
        <line x1={cx - crateW / 2 + 2} y1={crateTop + 7}
              x2={cx + crateW / 2 - 2} y2={crateTop + 7}
          stroke={C.loadHighlight} strokeWidth="0.8" opacity="0.5" />
        <line x1={cx} y1={crateTop + 2} x2={cx} y2={crateTop + crateH - 2}
          stroke={C.loadHighlight} strokeWidth="0.8" opacity="0.35" />
      </g>
    );
  }

  // ── Mode A: full arm extended/retracting ──────────────────────────────────
  const armLen        = armMaxLen * wagon.armExtension;
  const tipY          = wagonBottom + armLen;
  const bucketHasLoad = wagon.loadPercent > 5;
  const showDrip      = wagon.status === 'arm_extending_unload' && wagon.armExtension > 0.55;

  return (
    <g>
      {/* Arm shaft */}
      <line x1={cx} y1={wagonBottom} x2={cx} y2={tipY - 9}
        stroke="#4472B0" strokeWidth="2.2" strokeLinecap="round" />

      {/* Pivot ball */}
      <circle cx={cx} cy={wagonBottom} r="3.5"
        fill="#5A80B0" stroke="#70A0CC" strokeWidth="0.8" />

      {/* Bucket */}
      <path d={`M${cx - 8},${tipY - 9} L${cx - 10},${tipY + 7}
                L${cx + 10},${tipY + 7} L${cx + 8},${tipY - 9} Z`}
        fill={bucketHasLoad ? '#6880A0' : '#8AA0B8'}
        stroke={bucketHasLoad ? '#FFA000' : '#6090B8'} strokeWidth="1.2" />

      {/* Load material in bucket */}
      {bucketHasLoad && (
        <>
          <rect x={cx - 8} y={tipY - 3} width="16" height={9}
            fill="url(#loadGrad)" rx="1" opacity="0.9" />
          <line x1={cx - 7} y1={tipY - 1} x2={cx + 7} y2={tipY - 1}
            stroke="#FFD54F" strokeWidth="1" opacity="0.6" />
        </>
      )}

      {/* Pour drip during unloading */}
      {showDrip && (
        <>
          <line x1={cx} y1={tipY + 7} x2={cx} y2={stationsTop + 12}
            stroke="#FFA000" strokeWidth="2" opacity="0.5"
            strokeDasharray="2,3" />
          <ellipse cx={cx} cy={stationsTop + 15} rx="4" ry="2.5"
            fill="#FFA000" opacity="0.65" />
        </>
      )}
    </g>
  );
}

// ── Hanging Wagon ─────────────────────────────────────────────────────────────

function Wagon({ wagon, trackCfg }) {
  const { railY, railH } = trackCfg;
  const ww    = C.wagon.w;
  const wh    = C.wagon.h;
  const wx    = wagon.x - ww / 2;
  const wyTop = railY + railH;   // wagon hangs: top = rail bottom

  const led     = C.statusColors[wagon.status] || '#546E7A';
  const bStroke =
    wagon.status.startsWith('arm_')       ? '#FF6D00'
    : wagon.status === 'moving_to_dest'   ? '#FFA000'
    : wagon.status === 'idle'             ? C.palette.panelBorder
    : C.palette.accent;

  const isEmpty = wagon.loadPercent < 10;

  return (
    <g filter={wagon.status !== 'idle' ? 'url(#wGlow)' : undefined}>

      {/* Wagon number floating above rail — no box, plain text only.
          Sits a touch further above the rail (railY - 10) to keep a small
          top margin above the wagon now that the text is bigger/bolder. */}
      <text x={wagon.x} y={railY - 10} textAnchor="middle"
        fill={led} fontSize="14" fontFamily="monospace" fontWeight="900">
        W{wagon.id}
      </text>

      {/* Rail roller clamps */}
      <rect x={wx + 4}      y={railY - 1} width={ww - 8}  height={railH + 2} fill="#6A7E92" rx="1" />
      <rect x={wx + 7}      y={railY + 1} width={ww - 14} height={railH - 2} fill="#A8C0D4" rx="0.5" />
      <rect x={wx + 4}      y={railY - 1} width="5" height={railH + 2} fill="#7A90A4" rx="1" />
      <rect x={wx + ww - 9} y={railY - 1} width="5" height={railH + 2} fill="#7A90A4" rx="1" />

      {/* Hanger stub */}
      <rect x={wagon.x - 2} y={railY + railH} width="4" height="4" fill="#8090A8" />

      {/* Wagon body — empty wagon is slightly dimmer, loaded is brighter */}
      <rect x={wx} y={wyTop} width={ww} height={wh}
        fill={isEmpty ? '#5A6E82' : '#4A6090'}
        stroke={bStroke} strokeWidth="1.4" rx="2" />

      {/* Open-top edge */}
      <line x1={wx + 2} y1={wyTop} x2={wx + ww - 2} y2={wyTop}
        stroke={bStroke} strokeWidth="2" />

      {/* Interior ribbing */}
      <line x1={wx + 9}      y1={wyTop + 4} x2={wx + 9}      y2={wyTop + wh - 4}
        stroke="#8090A8" strokeWidth="0.8" />
      <line x1={wx + ww - 9} y1={wyTop + 4} x2={wx + ww - 9} y2={wyTop + wh - 4}
        stroke="#8090A8" strokeWidth="0.8" />

      {/* Wagon number inside body */}
      <text x={wagon.x} y={wyTop + 16} textAnchor="middle"
        fill="#FFFFFF" fontSize="10"
        fontFamily="monospace" fontWeight="900">
        W{wagon.id}
      </text>

      {/* Status LED */}
      <circle cx={wx + ww - 6} cy={wyTop + 7} r="3"
        fill={led} filter="url(#ledGlow)" />
    </g>
  );
}

// ── Arm-direction blinking arrows (2-D SVG) ───────────────────────────────────

function WagonDirectionArrows({ wagon, trackCfg }) {
  const { railY, railH } = trackCfg;
  const ww    = C.wagon.w;
  const wyTop = railY + railH;
  const wyMid = wyTop + C.wagon.h / 2;

  const isDown = wagon.status === 'arm_extending_load'    || wagon.status === 'arm_extending_unload';
  const isUp   = wagon.status === 'arm_retracting_loaded' || wagon.status === 'arm_retracting_empty';

  if (!isDown && !isUp) return null;

  const color = isDown ? '#FF4010' : '#10FF70';
  const cx    = wagon.x;   // centred on wagon body
  const STEP  = 10;

  const ys = isDown
    ? [wyMid - STEP, wyMid, wyMid + STEP]
    : [wyMid + STEP, wyMid, wyMid - STEP];

  const arrow = cy => isDown
    ? `M${cx - 7},${cy - 5} L${cx + 7},${cy - 5} L${cx},${cy + 5} Z`
    : `M${cx - 7},${cy + 5} L${cx + 7},${cy + 5} L${cx},${cy - 5} Z`;

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
  const { st, trackCfg } = info;
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
    ['Fill',   `${st.fillLevel.toFixed(0)} %`],
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
  const notchFill  = above ? '#12203A' : meta.color;
  const notchFillPath = above
    ? `M${notchX - NOTCH_W / 2},${boxEdgeY - 2} L${notchX},${notchTipY} L${notchX + NOTCH_W / 2},${boxEdgeY - 2} Z`
    : `M${notchX - NOTCH_W / 2},${boxEdgeY + 2} L${notchX},${notchTipY} L${notchX + NOTCH_W / 2},${boxEdgeY + 2} Z`;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={tx} y={ty} width={w} height={h} rx="8"
        fill="#12203A" stroke={meta.color} strokeWidth="1.8" opacity="0.98" />
      <rect x={tx} y={ty} width={w} height={headerH} rx="8" fill={meta.color} opacity="0.92" />
      <rect x={tx} y={ty + headerH - 8} width={w} height="8" fill={meta.color} opacity="0.92" />
      <path d={notchFillPath} fill={notchFill} opacity="0.98" />
      <path d={`M${notchX - NOTCH_W / 2},${boxEdgeY} L${notchX},${notchTipY}`} fill="none" stroke={meta.color} strokeWidth="1.8" strokeLinecap="round" />
      <path d={`M${notchX + NOTCH_W / 2},${boxEdgeY} L${notchX},${notchTipY}`} fill="none" stroke={meta.color} strokeWidth="1.8" strokeLinecap="round" />
      <text x={tx + w / 2} y={ty + 26} textAnchor="middle" fill="#FFFFFF" fontSize="16"
        fontFamily="monospace" fontWeight="bold" letterSpacing="1">
        {trackCfg.label} · TANK {st.label}
      </text>
      {rows.map(([label, value], i) => (
        <g key={label}>
          <text x={tx + 18} y={ty + headerH + 28 + i * rowStep} fill="#AFC4E0" fontSize="14.5" fontFamily="monospace">{label}</text>
          <text x={tx + w - 18} y={ty + headerH + 28 + i * rowStep} textAnchor="end" fill="#FFFFFF" fontSize="15"
            fontFamily="monospace" fontWeight="bold">{value}</text>
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
function StationGroup({ groupStations, trackCfg }) {
  const { stationsTop, stationH, stationW } = trackCfg;
  const xs = groupStations.map(st => st.x);
  const pitch = xs.length > 1 ? xs[1] - xs[0] : stationW * 1.3;
  const shellX1 = xs[0] - stationW / 2;
  const shellX2 = xs[xs.length - 1] + stationW / 2;
  const shellW = shellX2 - shellX1;
  const anyActive = groupStations.some(st => st.isActive);

  return (
    <g>
      {anyActive && (
        <rect x={shellX1 - 5} y={stationsTop - 5} width={shellW + 10} height={stationH + 10}
          fill="none" stroke={C.palette.accent} strokeWidth="2" rx="3"
          opacity="0.35" filter="url(#stGlow)" />
      )}

      {/* Outer border */}
      <rect x={shellX1 - 1} y={stationsTop - 1} width={shellW + 2} height={stationH + 2}
        fill="none" stroke={anyActive ? C.palette.accent : '#4872A8'}
        strokeWidth={anyActive ? 2 : 1.5} rx="2.5" />

      {/* Shell body */}
      <rect x={shellX1} y={stationsTop} width={shellW} height={stationH} fill="#7A8E9E" rx="1.5" />

      {/* Per-chamber fill / load / nozzle */}
      {groupStations.map(st => {
        const chamberW = pitch - 6;
        const cxL      = st.x - chamberW / 2;
        const fillPx   = Math.max(0, (st.fillLevel / 100) * (stationH - 6));
        const fillY    = stationsTop + stationH - 3 - fillPx;
        const loadH    = Math.floor(stationH * 0.38);
        const loadY    = stationsTop + stationH - 3 - loadH;
        return (
          <g key={st.id}>
            {fillPx > 0 && (
              <rect x={cxL + 1} y={fillY} width={chamberW - 2} height={fillPx} fill="url(#chemGrad)" rx="0.5" />
            )}
            {st.hasLoad && (
              <g>
                <rect x={cxL + 1} y={loadY - 1} width={chamberW - 2} height={loadH + 2} fill="#FF6D00" rx="1" opacity="0.25" />
                <rect x={cxL + 2} y={loadY} width={chamberW - 4} height={loadH} fill="#FF5722" stroke="#FFD740" strokeWidth="1.5" rx="1" />
                <rect x={cxL + 3} y={loadY + 1} width={chamberW - 6} height="4" fill="#FF8A65" rx="0.5" opacity="0.8" />
              </g>
            )}
            <line x1={cxL + 2} y1={stationsTop + stationH / 2} x2={cxL + chamberW - 2} y2={stationsTop + stationH / 2}
              stroke="#5A6A78" strokeWidth="0.5" strokeDasharray="1.5,2.5" />
            <rect x={st.x - 4} y={stationsTop - 7}  width="8" height="8"
              fill={st.isActive ? C.palette.accent : '#3A6090'} rx="1" />
            <rect x={st.x - 2} y={stationsTop - 11} width="4" height="5"
              fill={st.isActive ? C.palette.accent : '#2E5080'} rx="1" />
            {/* Support leg for this chamber */}
            <rect x={st.x - 1.5} y={stationsTop + stationH} width="3" height="6" fill="#4A5A6A" />
          </g>
        );
      })}

      {/* Internal partition dividers between chambers */}
      {groupStations.slice(1).map((st, i) => (
        <rect key={st.id} x={(xs[i] + xs[i + 1]) / 2 - 1.5} y={stationsTop + 1}
          width="3" height={stationH - 2} fill="#3A4552" />
      ))}

      {/* Inner lip */}
      <rect x={shellX1 + 1} y={stationsTop + 1} width={shellW - 2} height={stationH - 2}
        fill="none" stroke="#8A9EAE" strokeWidth="0.5" rx="1" />
    </g>
  );
}

// ── Track Section ─────────────────────────────────────────────────────────────

function TrackSection({ trackCfg, wagons, stations, onHoverStation, tankPartitions = [] }) {
  const {
    railY, railH, railX1, railX2, railColor,
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

  const ticks = useMemo(() => {
    const arr = [];
    for (let x = railX1 + 20; x < railX2 - 15; x += 28) arr.push(x);
    return arr;
  }, [railX1, railX2]);

  return (
    <g>
      <rect x="6" y={panelY} width={C.svg.w - 12} height={panelH}
        fill={C.palette.panel} stroke={C.palette.panelBorder} strokeWidth="1" rx="3" />

      {/* Panel header */}
      <rect x="6"  y={panelY}      width={C.svg.w - 12} height="28" fill={C.palette.panelBorder} rx="3" />
      <rect x="6"  y={panelY + 24} width={C.svg.w - 12} height="4"  fill={C.palette.panelBorder} />
      <rect x="16" y={panelY + 6}  width="5" height="16" rx="1" fill={railColor} />
      <text x="30" y={panelY + 19} fill={C.palette.textBright} fontSize="17"
        fontFamily="monospace" fontWeight="bold" letterSpacing="2">{trackCfg.label}</text>
      <text x="140" y={panelY + 19} fill={C.palette.textBright} fontSize="15"
        fontFamily="monospace" fontWeight="bold" letterSpacing="1">{trackCfg.wagonLabel}</text>
      <text x={C.svg.w - 18} y={panelY + 19} fill={C.palette.textBright} fontSize="15"
        fontFamily="monospace" fontWeight="bold" textAnchor="end">{trackCfg.stations.length} TANKS</text>

      {/* Rail sleepers */}
      {ticks.map((tx, i) => (
        <rect key={i} x={tx - 1.5} y={railY - 2} width="3" height={railH + 4}
          fill="#8090A8" rx="0.5" />
      ))}

      {/* Rail glow */}
      <line x1={railX1} y1={railY + railH / 2} x2={railX2} y2={railY + railH / 2}
        stroke={railColor} strokeWidth={railH + 10} strokeOpacity="0.1" />
      <rect x={railX1} y={railY} width={railX2 - railX1} height={railH}
        fill={railColor} rx="2" filter="url(#railGlow)" />
      <rect x={railX1 - 4} y={railY - 4} width="8" height={railH + 8} fill={railColor} rx="2" />
      <rect x={railX2 - 4} y={railY - 4} width="8" height={railH + 8} fill={railColor} rx="2" />

      {/* Tanks */}
      {validGroups.map(g => (
        <StationGroup key={g.id} groupStations={g.groupStations} trackCfg={trackCfg} />
      ))}
      {soloStations.map(st => (
        <Station key={st.id} st={st} trackCfg={trackCfg} />
      ))}

      {/* Tank number labels */}
      {stations.map(st => (
        <text key={`n-${st.id}`} x={st.x} y={stLabelY}
          textAnchor="middle" fill={C.palette.textBright} fontSize="11" fontFamily="monospace" fontWeight="bold">
          {st.label}
        </text>
      ))}

      {/* Arms before wagon bodies */}
      {wagons.map(w => (
        <WagonArm key={`arm-${w.id}`} wagon={w} trackCfg={trackCfg} />
      ))}

      {/* Wagon bodies */}
      {wagons.map(w => (
        <Wagon key={w.id} wagon={w} trackCfg={trackCfg} />
      ))}

      {/* Arm-direction arrows (on top of everything) */}
      {wagons.map(w => (
        <WagonDirectionArrows key={`arr-${w.id}`} wagon={w} trackCfg={trackCfg} />
      ))}

      {/* Hover hit-zones — invisible, sit on top of everything so hovering a tank
          (its body, thermometer, or number label) always shows its tooltip. */}
      {onHoverStation && stations.map(st => (
        <rect key={`hover-${st.id}`}
          x={st.x - trackCfg.stationW / 2 - 4} y={stationsTop - 16}
          width={trackCfg.stationW + 8} height={(stLabelY - stationsTop) + 20}
          fill="transparent" pointerEvents="all" style={{ cursor: 'pointer' }}
          onMouseEnter={() => onHoverStation({ st, trackCfg })}
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
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#C62828" strokeWidth="4"
        strokeDasharray="7,5" strokeLinecap="round" opacity="0.9" />
      <rect x={midX - 10} y={midY - 10} width="20" height="20" rx="4"
        fill="#C62828" stroke="#FFD740" strokeWidth="1.8" />
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
      <rect x={x} y={y} width={width} height={height} rx="4"
        fill={C.palette.panel} stroke={C.palette.panelBorder} strokeWidth="1" />
      <rect x={x} y={y} width={width} height={TABLE_HDR_H} rx="4" fill={C.palette.panelBorder} />
      <rect x={x} y={y + TABLE_HDR_H - 4} width={width} height="4" fill={C.palette.panelBorder} />
      <rect x={x + 8} y={y + 7} width="4" height="16" rx="1" fill={C.palette.accent} />
      {iconNode
        ? iconNode(iconCx, iconCy)
        : <text x={iconCx - 7} y={y + 21} fill={C.palette.accent} fontSize="16" fontFamily="monospace">{icon}</text>}
      <text x={x + 44} y={y + 21} fill={C.palette.textBright} fontSize="16"
        fontFamily="monospace" fontWeight="bold" letterSpacing="0.6">{title}</text>
      {children}
    </g>
  );
}

function TableRow({ x, y, width, label, value, rowIdx }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={TABLE_ROW_H}
        fill={rowIdx % 2 === 0 ? '#FFFFFF' : '#F4F5FA'} />
      <text x={x + 12} y={y + 18} fill={C.palette.textBright} fontSize="15"
        fontFamily="monospace" fontWeight="bold">{label}</text>
      <text x={x + width - 12} y={y + 18} textAnchor="end" fill={C.palette.accent}
        fontSize="15.5" fontFamily="monospace" fontWeight="bold">{value}</text>
    </g>
  );
}

function fmtClock(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function CycleTimeTable({ x, y, width }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = [
    ['Actual Time', fmtClock(elapsed)],
    ['Last Cycle',  '04:32'],
    ['SET Time',    '05:00'],
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
            fill={C.palette.textBright} fontSize="9" fontFamily="monospace">
            {expanded ? '▲' : '▼'}
          </text>
        </g>
      )}
    </g>
  );
}

// Nearest-station lookup for a wagon's current location label.
function wagonLocationLabel(wagon, stations) {
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
        fill={C.palette.textDim} fontSize="9.5" fontFamily="monospace" fontWeight="bold">{colLabels[0]}</text>
      <text x={x + labelW + valW + valW / 2} y={y + TABLE_HDR_H + 13} textAnchor="middle"
        fill={C.palette.textDim} fontSize="9.5" fontFamily="monospace" fontWeight="bold">{colLabels[1]}</text>

      {rows.map((row, i) => {
        const ry = bodyTop + i * GROUP_ROW_H;
        return (
          <g key={row.label}>
            <rect x={x} y={ry} width={width} height={GROUP_ROW_H}
              fill={i % 2 === 0 ? '#FFFFFF' : '#F4F5FA'} />
            <text x={x + 12} y={ry + 15} fill={C.palette.textBright} fontSize="12.5"
              fontFamily="monospace" fontWeight="bold">{row.label}</text>
            <text x={x + labelW + valW / 2} y={ry + 15} textAnchor="middle" fill={C.palette.accent}
              fontSize="12.5" fontFamily="monospace" fontWeight="bold">{row.values[0]}</text>
            <text x={x + labelW + valW + valW / 2} y={ry + 15} textAnchor="middle" fill={C.palette.accent}
              fontSize="12.5" fontFamily="monospace" fontWeight="bold">{row.values[1]}</text>
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

function RectifierTable({ x, y }) {
  const rows = [1, 2, 3, 4].map(n => ({ label: `SET ${n}`, values: ['1500', '12.5'] }));
  return (
    <GroupedStatTable x={x} y={y} width={TABLE_WIDTH} title="RECTIFIER"
      iconNode={(cx, cy) => <BoltIcon x={cx} y={cy} color={C.palette.accent} />}
      colLabels={['DC CURR (A)', 'DC VOLT (V)']} rows={rows} />
  );
}

function TemperatureTable({ x, y, stations }) {
  const rows = groupAllStations(stations).map(chunk => {
    const avg = chunk.reduce((s, st) => s + st.temperature, 0) / chunk.length;
    return { label: groupLabel(chunk), values: [avg.toFixed(1), (avg + 7).toFixed(1)] };
  });
  return (
    <GroupedStatTable x={x} y={y} width={TABLE_WIDTH} title="TEMPERATURE (°C)"
      iconNode={(cx, cy) => <ThermoIcon x={cx} y={cy} color={C.palette.accent} />}
      colLabels={['ACID TEMP', 'STEAM TEMP']} rows={rows} />
  );
}

// No live pH field in the sim data yet — stable, group-derived placeholder
// values (same shape/spirit as the Wagon Instruction placeholders above)
// until a real pH source is wired up.
function PhTable({ x, y, stations }) {
  const rows = groupAllStations(stations).map((chunk, i) => ({
    label:  groupLabel(chunk),
    values: [(5.4 + (i % 4) * 0.15).toFixed(1), (6.0 + (i % 4) * 0.1).toFixed(1)],
  }));
  return (
    <GroupedStatTable x={x} y={y} width={TABLE_WIDTH} title="pH"
      iconNode={(cx, cy) => <FlaskIcon x={cx} y={cy} color={C.palette.accent} />}
      colLabels={['ACID pH', 'ANODE pH']} rows={rows} />
  );
}

function BottomTables({ y, wagons, stations }) {
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
  const collapsedRow1Height = wagonMiniTableHeight(wagons.length, false);
  const row2Y = y + collapsedRow1Height + TABLE_GAP;

  return (
    <g>
      <RectifierTable x={x1} y={row2Y} />
      <TemperatureTable x={x2} y={row2Y} stations={stations} />
      <PhTable x={x3} y={row2Y} stations={stations} />

      <CycleTimeTable x={x1} y={y} width={TABLE_WIDTH} />
      <WagonMiniTable x={x2} y={y} width={TABLE_WIDTH} title="WAGON LOCATION"
        iconNode={(cx, cy) => <MapPinIcon x={cx} y={cy} color={C.palette.accent} />}
        wagons={wagons} getValue={w => wagonLocationLabel(w, stations)}
        expanded={locExpanded} onToggle={() => setLocExpanded(e => !e)} />
      <WagonMiniTable x={x3} y={y} width={TABLE_WIDTH} icon="▤" title="WAGON INSTRUCTION"
        wagons={wagons} getValue={() => '—'}
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

export default function WagonScadaScreen({ wagons: wagonsIn, stations: stationsIn, tracks, tankPartitions = [], crossTrolleys = [] } = {}) {
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
          />
        ))}
        {crossTrolleys.map(ct => (
          <CrossTrolley2D key={ct.id} ct={ct} tracks={trackList} stations={stations} />
        ))}
        <BottomTables y={tablesY} wagons={wagons} stations={stations} />
        <StatusBar />
        <StationTooltip info={hoverInfo} />
      </svg>
    </div>
  );
}
