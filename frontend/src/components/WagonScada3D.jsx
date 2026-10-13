import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture, Html } from '@react-three/drei';
import { CanvasTexture, RepeatWrapping, Color, FogExp2 } from 'three';
import { useWagonSimulation } from '../hooks/useWagonSimulation';
import { useTagSocket } from '../hooks/useTagSocket';
import { useMockTags } from '../hooks/useMockTags';
import { C } from '../config/scadaConfig';
import { THEME, FONT, FONT_COND, BRAND } from '../theme';
import { processLook } from '../config/processLook';
import { useState, useEffect, useRef, Suspense, memo, useMemo, useCallback } from 'react';
import WagonScadaScreen from './WagonScadaScreen';
import ConfigPanel from './ConfigPanel';
import TankTagsPage from './TankTagsPage';
import WagonTagsPage from './WagonTagsPage';
import StationInfoPage from './StationInfoPage';
import StationColumnConfigPage, { DEFAULT_STATION_COLS } from './StationColumnConfigPage';
import StationNamesConfigPage, { buildNamesArray } from './StationNamesConfigPage';
import GeneralConfigPage from './GeneralConfigPage';
import SettingsPage from './SettingsPage';
import TankPartitionConfigPage from './TankPartitionConfigPage';
import CrossTrolleyConfigPage from './CrossTrolleyConfigPage';
import AppBuilderPage from './AppBuilderPage';
import Dairy3DPage from './Dairy3DPage';
import ReportsPage from './ReportsPage';
import PlcConnectionTestPage from './PlcConnectionTestPage';
import {
  loadPageSelection, savePageSelection,
  loadPageSelectionFromServer, pruneToCatalog, isPageEnabled,
} from '../config/pageSelection';
import { isRunningInsideExe } from '../config/runtimeInfo';
import { getTankTags, getWagonTags, getStationParams, getStationLoadNumbers } from '../config/tagConfig';
import barralImg from '../../barral.png';
import {
  loadUserConfig, saveUserConfig, buildSimConfig,
  getWagonTypeMap, countsChanged,
  loadUserConfigFromFile, saveUserConfigToFile,
} from '../config/userConfig';
import {
  loadHeaderConfig, saveHeaderConfig,
  loadHeaderConfigFromFile, saveHeaderConfigToFile,
} from '../config/headerConfig';
import { loadPlcConfig, savePlcConfig, loadPlcConfigFromServer, dataSourceOf } from '../config/plcConfig';

// ── Hazard stripe texture (yellow + black diagonal — construction standard) ───
function buildHazardTex() {
  const W = 256, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const sw = 34;                        // stripe width in pixels
  ctx.fillStyle = '#FFB300';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111100';
  for (let x = -H; x < W + H; x += sw * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x + sw, 0);
    ctx.lineTo(x + sw + H, H); ctx.lineTo(x + H, H);
    ctx.closePath(); ctx.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}
let _hz = null;
const hazardTex = () => { if (!_hz) _hz = buildHazardTex(); return _hz; };

// ── Sprite label system — canvas texture per unique string, cached globally ───
// Much faster than <Html>: no DOM element, just a textured quad per label.
// Graphite plate, white condensed lettering, coloured accent bar on the left.
const LABEL_FONT = "'Barlow Condensed', 'Barlow', sans-serif";
const _lblCache = new Map();
function getLabelTex(text, color) {
  const key = `${text}|${color}`;
  if (_lblCache.has(key)) return _lblCache.get(key);
  const W = 128, H = 44;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const r = 7;
  ctx.fillStyle = 'rgba(22,27,34,0.94)';
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(W - r, 0); ctx.quadraticCurveTo(W, 0, W, r);
  ctx.lineTo(W, H - r); ctx.quadraticCurveTo(W, H, W - r, H);
  ctx.lineTo(r, H); ctx.quadraticCurveTo(0, H, 0, H - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(0, 6, 6, H - 12);
  ctx.fillStyle = '#FFFFFF';
  const font = `700 ${text.length > 5 ? 22 : 27}px ${LABEL_FONT}`;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2 + 3, H / 2 + 1);
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 4;
  _lblCache.set(key, tex);
  return tex;
}
// Labels drawn before the web font arrived used the fallback font — once it
// has loaded, drop those so anything re-rendered after that redraws properly.
if (typeof document !== 'undefined' && document.fonts?.load) {
  Promise.all([22, 27].map(px => document.fonts.load(`700 ${px}px ${LABEL_FONT}`)))
    .then(() => _lblCache.clear())
    .catch(() => {});
}
function Label3D({ text, offsetY, color = '#F2A900', scaleX = 0.068, scaleY = 0.024 }) {
  const tex = getLabelTex(text, color);
  return (
    <sprite position={[0, offsetY, 0]} scale={[scaleX, scaleY, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} sizeAttenuation={false} />
    </sprite>
  );
}

// ── Procedural textures (canvas, generated once) ─────────────────────────────
function makeCanvasTex(w, h, draw, repeat = null) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new CanvasTexture(cv);
  if (repeat) { tex.wrapS = RepeatWrapping; tex.wrapT = RepeatWrapping; tex.repeat.set(...repeat); }
  tex.anisotropy = 8;
  return tex;
}
function speckle(ctx, w, h, n, colors) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
const lazyTex = make => { let t = null; return () => (t ??= make()); };

// Polished concrete slab — one texture tile = one 6 × 6 m slab, with saw-cut
// joints at the edges.
const floorTex = lazyTex(() => makeCanvasTex(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#8C918F'; ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 9000, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.07)', 'rgba(60,60,55,0.05)']);
  for (let i = 0; i < 14; i++) {           // faint trowel marks
    ctx.strokeStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.02})`;
    ctx.lineWidth = 20 + Math.random() * 40;
    ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 60 + Math.random() * 200, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(35,38,40,0.55)'; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
}));

// Green epoxy walkway coating.
const aisleTex = lazyTex(() => makeCanvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#4E6B5E'; ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 2500, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.06)']);
}));

// Corrugated cladding for the building's back wall.
const wallTex = lazyTex(() => makeCanvasTex(256, 64, (ctx, w, h) => {
  for (let x = 0; x < w; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, '#9AA3AC'); g.addColorStop(0.5, '#B9C1C8'); g.addColorStop(1, '#949DA6');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 16, h);
  }
}));

// Soft contact shadow under a tank — cheaper than real shadow mapping.
const shadowTex = lazyTex(() => makeCanvasTex(128, 128, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}));

// ── Coordinate mapping ────────────────────────────────────────────────────────
const SPACING = 1.05;
const Z1 = 0;
const Z2 = 3.4;
const TRACK_Z_LIST = [Z1, Z2, 6.8, 10.2];   // Z positions for up to 4 production lines
const mapX  = px  => (px - 140) / 47 * SPACING;
const trkZ  = idx => TRACK_Z_LIST[idx] ?? TRACK_Z_LIST[TRACK_Z_LIST.length - 1];
const SKY   = '#1C2229';                      // building interior beyond the lit area

// ── Dimensions ────────────────────────────────────────────────────────────────
// Real process tanks run wide/shallow (open vats), not tall and narrow —
// tankW/tankD widened and tankH cut down accordingly. maxArm is re-tuned so
// the wagon's dip still reaches proportionally the same depth below the
// (now lower) tank rim; nothing about the simulation's extension timing or
// values changes, only how far in 3D space a 0–1 extension visually travels.
// Calibrates D.tankW against the ACTUAL 3D gap mapX produces for this app's
// original 39-tank default spacing (~49.21px — see userConfig.js's
// buildSimConfig), not against the idealized SPACING constant directly.
// mapX's "47" divisor is only an approximation of that real spacing, so
// using SPACING itself here would make the default's 3D tanks ~4.7% bigger
// than the original fixed 0.96 — this keeps the default pixel-exact while
// still scaling tank width correctly for any other tank count (Scene3D's
// gap3D/tankW3D).
const TANK3D_RATIO = 0.96 / ((1870 / 38) / 47 * 1.05);

const D = {
  tankW: 0.96, tankH: 0.95, tankD: 1.00,
  railY: 3.10, railH: 0.14, railW: 0.18,
  bodyY: 3.37, bodyW: 0.88, bodyH: 0.40, bodyD: 0.68,
  legH:  1.55, legS: 0.055,
  // maxArm = ARM_TOP_Y - TANK_LEG_H - 0.5*tankH (reverse-derived from the
  // original 0.62/2.66 pair) — keeps the dip reaching exactly half of
  // tankH below the rim. Recompute this whenever tankH changes:
  // 3.13 - 0.16 - 0.5*0.95 = 2.495
  maxArm: 2.495,
};

// Tanks stand on 4 short support legs rather than sitting flush on the
// ground, matching the reference plating-line screen's raised platform look.
const TANK_LEG_H = 0.16;
const TANK_LEG_S = 0.045;

const BARREL_R = 0.20;
const BARREL_L = 0.62;
const BASKET_R = 0.20;  // basket cylinder radius
const BASKET_H = 0.18;  // basket cylinder height (short drum)

// Arms attach just below body bottom
const ARM_TOP_Y = D.bodyY - D.bodyH / 2 - 0.04;          // ≈ 3.13
// Barrel rests at mid-leg height during transit (visual "middle of wagon")
const BARREL_TRANSIT_Y = D.bodyY - D.bodyH / 2 - D.legH / 2;  // ≈ 2.40

// ── Shared stable materials ───────────────────────────────────────────────────
const YELLOW = <meshStandardMaterial color="#E8A80C" roughness={0.45} metalness={0.35} />;   // hoist paint
const ORANGE = <meshStandardMaterial color="#D9771A" roughness={0.45} metalness={0.25} />;
const NAVY   = <meshStandardMaterial color="#3B4651" roughness={0.5} metalness={0.45} />;    // structural steel paint
const STEEL  = <meshStandardMaterial color="#9AA4AD" roughness={0.32} metalness={0.75} />;
const RED    = <meshStandardMaterial color="#3B4651" roughness={0.5} metalness={0.45} />;
const GOLD   = <meshStandardMaterial color="#E8A80C" roughness={0.45} metalness={0.35} />;
const GRAY_PANEL = <meshStandardMaterial color="#5E6A75" roughness={0.4} metalness={0.5} />;
const DARK_STEEL = <meshStandardMaterial color="#2B3238" roughness={0.5} metalness={0.6} />;
const RUBBER     = <meshStandardMaterial color="#15181C" roughness={0.85} metalness={0.1} />;
const CABLE      = <meshStandardMaterial color="#1D2125" roughness={0.6} metalness={0.5} />;
// Clear acrylic walls — the tank is see-through so the load in the bath is
// visible from outside. depthWrite off + a later renderOrder so the bath and
// load behind each wall still draw.
const TANK_GLASS = <meshStandardMaterial color="#D6ECF3" transparent opacity={0.2} roughness={0.05} metalness={0.15}
  depthWrite={false} side={2} />;
const TANK_FLOOR = <meshStandardMaterial color="#2B3238" roughness={0.8} metalness={0.1} />;
const TANK_RIM   = <meshStandardMaterial color="#8E979F" roughness={0.45} metalness={0.25} />;
const TANK_BAND  = <meshStandardMaterial color="#59626B" roughness={0.4} metalness={0.65} />;
const RAIL_HEAD  = <meshStandardMaterial color="#A9B1B8" roughness={0.25} metalness={0.85} />;
const HAZARD     = () => <meshStandardMaterial map={hazardTex()} roughness={0.6} metalness={0.1} />;

// Wagon mode LED (Wagon Tags page's Auto/Manual/Service tags) — color,
// label suffix, and legend text shown in the main screen's legend bar.
const MODE_COLOR  = { auto: '#3FB97A', manual: '#F59E0B', service: '#3B9BEA' };
const MODE_SUFFIX = { auto: 'A', manual: 'M', service: 'S' };
const MODE_LEGEND = [
  { mode: 'auto',    label: 'AUTO' },
  { mode: 'manual',  label: 'MANUAL' },
  { mode: 'service', label: 'SERVICE' },
];

// Station parameter display scaling — the PLC stores these as scaled raw
// integers, not engineering units (see stationParamValues below).
const PARAM_SCALE = { 'Actual PH': 1 / 100 }; // Temperature removed — PLC already sends the calculated value

// ── Barrel (reusable) ─────────────────────────────────────────────────────────
// shade=false → photo texture (on wagon arm)
// shade=true  → dark emissive (inside tank — high contrast against liquid)
function Barrel3D({ shade = false }) {
  const tex = useTexture(barralImg);
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[BARREL_R, BARREL_R, BARREL_L, 10]} />
        {shade
          ? <meshStandardMaterial color="#7A4A18" roughness={0.5} metalness={0.4}
              emissive="#D06820" emissiveIntensity={1.4} />
          : <meshStandardMaterial map={tex} roughness={0.55} metalness={0.25} />
        }
      </mesh>
      {/* End caps */}
      {[-1, 1].map(s => (
        <mesh key={s} position={[0, 0, s * (BARREL_L / 2 + 0.005)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[BARREL_R + 0.028, BARREL_R + 0.028, 0.036, 10]} />
          <meshStandardMaterial color={shade ? '#A06028' : '#7A5E30'} roughness={0.4} metalness={0.6}
            emissive={shade ? '#C05010' : '#000'} emissiveIntensity={shade ? 1.0 : 0} />
        </mesh>
      ))}
      {/* 3 ring bands */}
      {[-0.18, 0, 0.18].map((z, i) => (
        <mesh key={i} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[BARREL_R + 0.007, 0.010, 4, 10]} />
          <meshStandardMaterial color={shade ? '#905030' : '#5A4020'} roughness={0.4} metalness={0.6}
            emissive={shade ? '#FF6010' : '#000'} emissiveIntensity={shade ? 0.8 : 0} />
        </mesh>
      ))}
    </group>
  );
}

function BarrelFallback({ shade = false }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[BARREL_R, BARREL_R, BARREL_L, 8]} />
      <meshStandardMaterial
        color={shade ? '#7A4A18' : '#A07840'} roughness={0.5}
        emissive={shade ? '#D06820' : '#000'} emissiveIntensity={shade ? 1.4 : 0}
      />
    </mesh>
  );
}

function BarrelSuspended({ shade = false }) {
  return (
    <Suspense fallback={<BarrelFallback shade={shade} />}>
      <Barrel3D shade={shade} />
    </Suspense>
  );
}

// ── Basket — short open drum with dot rivets on the cylinder wall ─────────────
// Thin top/bottom rings + vertical rods (open gaps = holes) + raised dot
// rivets on the wall surface.
function Basket3D({ shade = false }) {
  const ring = shade ? '#4A5A6A' : '#42484E';
  const rod  = shade ? '#505E6E' : '#4E5560';
  const dot  = shade ? '#7A8A9A' : '#6A7080';  // raised rivets — slightly lighter
  const hook = shade ? '#3A4250' : '#282E36';
  const emi  = shade ? '#4080C0' : '#000000';
  const emiI = shade ? 1.1 : 0;

  const mat = c => (
    <meshStandardMaterial
      color={c} roughness={0.65} metalness={0.80}
      emissive={emi} emissiveIntensity={emiI}
    />
  );

  const hh = BASKET_H / 2;

  // 5 rings: bottom, 25%, 50%, 75%, top (top ring thicker — the rim)
  const RING_YS    = [-hh, -hh + BASKET_H * 0.25, 0, hh - BASKET_H * 0.25, hh];
  const RING_THICK = [0.009, 0.008, 0.008, 0.008, 0.013];

  // 16 vertical rods — tighter spacing = smaller holes
  const ROD_ANGLES = Array.from({ length: 16 }, (_, i) => (i * 2 * Math.PI) / 16);

  // Dot rivets: 2 rows, 8 dots per row (one between every other rod pair)
  const DOT_ROWS   = [-hh + BASKET_H * 0.30, -hh + BASKET_H * 0.70];
  const DOT_ANGLES = Array.from({ length: 8 }, (_, i) =>
    (i * 2 * Math.PI) / 8 + Math.PI / 16  // sits between rod pairs
  );
  const DOT_R = BASKET_R + 0.013;          // sit proud of the cylinder surface

  // 4 cross spokes at bottom (open perforated floor)
  const SPOKE_ANGLES = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4];

  return (
    <group>
      {/* ── Horizontal rings ── */}
      {RING_YS.map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[BASKET_R, RING_THICK[i], 6, 18]} />
          {mat(ring)}
        </mesh>
      ))}

      {/* ── Vertical rods (gaps between them = holes) ── */}
      {ROD_ANGLES.map((angle, i) => (
        <mesh key={i} position={[
          Math.sin(angle) * BASKET_R,
          0,
          Math.cos(angle) * BASKET_R,
        ]}>
          <cylinderGeometry args={[0.008, 0.008, BASKET_H, 4]} />
          {mat(rod)}
        </mesh>
      ))}

      {/* ── Dot rivets on the wall ── */}
      {DOT_ROWS.map((y, ri) =>
        DOT_ANGLES.map((angle, i) => (
          <mesh key={`${ri}-${i}`} position={[
            Math.sin(angle) * DOT_R,
            y,
            Math.cos(angle) * DOT_R,
          ]}>
            <sphereGeometry args={[0.013, 7, 7]} />
            {mat(dot)}
          </mesh>
        ))
      )}

      {/* ── 4 cross spokes at the bottom ── */}
      {SPOKE_ANGLES.map((angle, i) => (
        <mesh key={i} position={[0, -hh, 0]} rotation={[0, angle, 0]}>
          <boxGeometry args={[BASKET_R * 1.85, 0.008, 0.008]} />
          {mat(rod)}
        </mesh>
      ))}

      {/* ── Grip hook: shank + crossbar ── */}
      <mesh position={[0, hh + 0.024, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.036, 8]} />
        {mat(hook)}
      </mesh>
      <mesh position={[0, hh + 0.043, 0]}>
        <boxGeometry args={[0.046, 0.012, 0.015]} />
        {mat(hook)}
      </mesh>
    </group>
  );
}

// ── Rack (multi-slot industrial tray) ────────────────────────────────────────
function Rack3D({ shade = false }) {
  // Multi Row Hanger / Fleet Bar: top rail, side posts, 4 crossbars, 6×4 grid of hanger clips
  const topRailCol = shade ? '#303030' : '#1A1A1A';
  const postCol    = shade ? '#B4BEC8' : '#98A4B0';
  const barCol     = shade ? '#303030' : '#202020';
  const clipCol    = shade ? '#A0AAB4' : '#8898A4';

  const RW = 0.54, RH = 0.44;
  const hw = RW / 2, hh = RH / 2;
  const POST_W = 0.022, BAR_T = 0.009;

  const rowYs = [-0.192, -0.128, -0.064, 0, 0.064, 0.128, 0.192];
  const colXs = [-0.186, -0.111, -0.037, 0.037, 0.111, 0.186];

  const mTop  = <meshStandardMaterial color={topRailCol} roughness={0.20} metalness={0.85} />;
  const mPost = <meshStandardMaterial color={postCol}    roughness={0.20} metalness={0.85} />;
  const mBar  = <meshStandardMaterial color={barCol}     roughness={0.30} metalness={0.75} />;
  const mClip = <meshStandardMaterial color={clipCol}    roughness={0.25} metalness={0.80} />;

  return (
    <group>
      {/* ── Thick top mounting rail ── */}
      <mesh position={[0, hh + 0.020, 0]}>
        <boxGeometry args={[RW + 0.062, 0.038, 0.036]} />{mTop}
      </mesh>

      {/* ── Side posts with base plates and top brackets ── */}
      {[-hw, hw].map((x, i) => (
        <group key={i}>
          <mesh position={[x, 0, 0]}>
            <boxGeometry args={[POST_W, RH, POST_W]} />{mPost}
          </mesh>
          <mesh position={[x, -hh - 0.010, 0]}>
            <boxGeometry args={[POST_W * 3.2, 0.014, POST_W * 3.2]} />{mPost}
          </mesh>
          <mesh position={[x, hh + 0.007, 0]}>
            <boxGeometry args={[POST_W * 2.5, 0.018, POST_W * 2.2]} />{mPost}
          </mesh>
        </group>
      ))}

      {/* ── Horizontal crossbars (4 rows) ── */}
      {rowYs.map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <boxGeometry args={[RW - POST_W, BAR_T, BAR_T]} />{mBar}
        </mesh>
      ))}

      {/* ── Individual hanger clips at each grid intersection ── */}
      {rowYs.map((y, ri) => colXs.map((x, ci) => (
        <group key={`${ri}-${ci}`} position={[x, y - BAR_T * 0.5, 0]}>
          {/* Saddle clip (mounts over the bar) */}
          <mesh position={[0, 0.007, 0]}>
            <boxGeometry args={[0.026, 0.015, 0.022]} />{mClip}
          </mesh>
          {/* Left prong of U-fork */}
          <mesh position={[-0.008, -0.019, 0]}>
            <boxGeometry args={[0.005, 0.028, 0.007]} />{mClip}
          </mesh>
          {/* Right prong of U-fork */}
          <mesh position={[0.008, -0.019, 0]}>
            <boxGeometry args={[0.005, 0.028, 0.007]} />{mClip}
          </mesh>
          {/* Bottom crosspiece */}
          <mesh position={[0, -0.033, 0]}>
            <boxGeometry args={[0.022, 0.005, 0.007]} />{mClip}
          </mesh>
        </group>
      )))}
    </group>
  );
}

// ── Generic load dispatcher ───────────────────────────────────────────────────
function Load3D({ type = 'barrel', shade = false }) {
  if (type === 'basket') return <Basket3D shade={shade} />;
  if (type === 'rack')   return <Rack3D   shade={shade} />;
  return <BarrelSuspended shade={shade} />;
}

// Shared per-station bath/load geometry — used by both a solo Tank3D and a
// chamber inside a merged TankGroup3D, so the two stay visually consistent.
// The bath sits high in the tank (fillLevel nudges it a little); a load
// hangs with its top just breaking the surface so it stays readable from a
// distance. Dry stations get a grating at mid-height and the load rests on it.
const WALL_T = 0.035;
function tankFillGeometry(st, loadType, look) {
  const innerH  = D.tankH - 0.06;
  const bathH   = innerH * (0.72 + Math.min(Math.max(st.fillLevel, 0), 100) / 100 * 0.12);
  const bathY   = -D.tankH / 2 + 0.04 + bathH / 2;
  const surfaceY = bathY + bathH / 2;
  const gratingY = -D.tankH / 2 + D.tankH * 0.38;
  const itemHalf = loadType === 'basket' ? BASKET_H / 2 * 1.4 : BARREL_R * 1.4;
  const loadItemY = look.dry ? gratingY + itemHalf + 0.02 : -D.tankH / 2 + 0.06 + itemHalf;
  return { bathH, bathY, surfaceY, gratingY, loadItemY };
}

// Continuously spins its children around Y — used for the load item inside
// a tank and the load a wagon carries, so they read as distinct, moving
// objects rather than a static prop sitting in the scene.
function RotatingGroup({ speed = 0.8, children, ...props }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += speed * dt;
  });
  return <group ref={ref} {...props}>{children}</group>;
}

// Tank interior for one chamber: bath (or dry grating) + load item.
function TankContents({ st, width, look, loadType }) {
  const { bathH, bathY, surfaceY, gratingY, loadItemY } = tankFillGeometry(st, loadType, look);
  const innerD = D.tankD - 2 * WALL_T - 0.006;
  return (
    <>
      {look.dry ? (
        <>
          {/* Grating deck */}
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={i} position={[0, gratingY, -innerD / 2 + (i + 0.5) * innerD / 7]}>
              <boxGeometry args={[width, 0.025, 0.035]} />{DARK_STEEL}
            </mesh>
          ))}
          {look.hot && (
            <mesh position={[0, gratingY - 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[width * 0.9, innerD * 0.9]} />
              <meshStandardMaterial color="#3A1A08" emissive="#FF6A1A" emissiveIntensity={0.9} />
            </mesh>
          )}
        </>
      ) : (
        <>
          <mesh position={[0, bathY, 0]} renderOrder={1}>
            <boxGeometry args={[width, bathH, innerD]} />
            <meshStandardMaterial color={look.bath} transparent opacity={Math.min(look.opacity, 0.4)}
              roughness={0.15} metalness={0.05} depthWrite={false} />
          </mesh>
          {/* Surface sheen */}
          <mesh position={[0, surfaceY + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[width, innerD]} />
            <meshStandardMaterial color={look.bath} transparent opacity={0.35}
              roughness={0.05} metalness={0.3} emissive={look.bath} emissiveIntensity={0.18}
              depthWrite={false} />
          </mesh>
        </>
      )}
      {st.hasLoad && (
        <RotatingGroup position={[0, loadItemY, 0]} scale={[1.4, 1.4, 1.4]}>
          <Load3D type={loadType} shade />
        </RotatingGroup>
      )}
    </>
  );
}

// Open-top tank shell: floor, 4 walls, rim flange, two reinforcing bands,
// base skids and a contact shadow. Shared by solo and partitioned tanks.
function TankShell({ width, active }) {
  const hw = width / 2, hh = D.tankH / 2, hd = D.tankD / 2;
  const rimMat = active
    ? <meshStandardMaterial color="#14A3AE" roughness={0.35} metalness={0.3} emissive="#0E7C86" emissiveIntensity={0.6} />
    : TANK_RIM;
  return (
    <>
      {/* Contact shadow on the floor */}
      <mesh position={[0, -hh - TANK_LEG_H + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 0.45, D.tankD + 0.45]} />
        <meshBasicMaterial map={shadowTex()} transparent depthWrite={false} />
      </mesh>
      {/* Base skids */}
      {[-1, 1].map(sz => (
        <mesh key={sz} position={[0, -hh - TANK_LEG_H / 2, sz * hd * 0.7]}>
          <boxGeometry args={[width + 0.02, TANK_LEG_H, 0.09]} />{DARK_STEEL}
        </mesh>
      ))}
      {/* Floor — dark, so the load inside stands out */}
      <mesh position={[0, -hh + 0.02, 0]}>
        <boxGeometry args={[width, 0.04, D.tankD]} />{TANK_FLOOR}
      </mesh>
      {/* Clear acrylic walls */}
      {[-1, 1].map(sz => (
        <mesh key={`fb${sz}`} position={[0, 0, sz * (hd - WALL_T / 2)]} renderOrder={2}>
          <boxGeometry args={[width, D.tankH, WALL_T]} />{TANK_GLASS}
        </mesh>
      ))}
      {[-1, 1].map(sx => (
        <mesh key={`lr${sx}`} position={[sx * (hw - WALL_T / 2), 0, 0]} renderOrder={2}>
          <boxGeometry args={[WALL_T, D.tankH, D.tankD - 2 * WALL_T]} />{TANK_GLASS}
        </mesh>
      ))}
      {/* Steel corner posts framing the glass */}
      {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`cp${sx}${sz}`} position={[sx * (hw - 0.012), 0, sz * (hd - 0.012)]}>
          <boxGeometry args={[0.03, D.tankH, 0.03]} />{TANK_BAND}
        </mesh>
      ))}
      {/* Rim flange */}
      {[-1, 1].map(sz => (
        <mesh key={`rf${sz}`} position={[0, hh + 0.012, sz * hd]}>
          <boxGeometry args={[width + 0.07, 0.035, 0.075]} />{rimMat}
        </mesh>
      ))}
      {[-1, 1].map(sx => (
        <mesh key={`rs${sx}`} position={[sx * hw, hh + 0.012, 0]}>
          <boxGeometry args={[0.075, 0.035, D.tankD]} />{rimMat}
        </mesh>
      ))}
      {/* Reinforcing steel bands */}
      {[-0.32, 0.22].map(fy => (
        <group key={fy} position={[0, fy * D.tankH, 0]}>
          {[-1, 1].map(sz => (
            <mesh key={sz} position={[0, 0, sz * (hd + 0.008)]}>
              <boxGeometry args={[width + 0.03, 0.035, 0.016]} />{TANK_BAND}
            </mesh>
          ))}
          {[-1, 1].map(sx => (
            <mesh key={`s${sx}`} position={[sx * (hw + 0.008), 0, 0]}>
              <boxGeometry args={[0.016, 0.035, D.tankD + 0.03]} />{TANK_BAND}
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function tooltipLinesFor(st, tankTags, stationParamValues) {
  const name = tankTags[st.id]?.label || st.label;
  return [name, ...(stationParamValues[st.id] || []).map(p => `${p.label}: ${p.value}${p.unit ? ' ' + p.unit : ''}`)];
}

// ── Tank ─ open-top process tank with its bath and (when loaded) the load ──────
// memo: skips re-render unless hasLoad / isActive / fillLevel / name changes
const Tank3D = memo(function Tank3D({ st, z, loadType = 'barrel', idx = 0, tankW = D.tankW, tankTags = {}, stationParamValues = {}, onHover }) {
  const x  = mapX(st.x);
  const hh = D.tankH / 2;
  const look = processLook(tankTags[st.id]?.label, idx);

  const tooltipY = (2 * hh + TANK_LEG_H) + 0.6;
  const handlePointerOver = e => { e.stopPropagation(); onHover?.({ x, y: tooltipY, z, lines: tooltipLinesFor(st, tankTags, stationParamValues) }); };
  const handlePointerOut  = e => { e.stopPropagation(); onHover?.(null); };

  return (
    <group position={[x, hh + TANK_LEG_H, z]}>
      {/* Invisible full-footprint hitbox — one solid volume for hover, so the
          tooltip doesn't flicker as the pointer crosses the thin meshes */}
      <mesh onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
        <boxGeometry args={[tankW, D.tankH, D.tankD]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <TankShell width={tankW} active={st.isActive} />
      <TankContents st={st} width={tankW - 2 * WALL_T - 0.006} look={look} loadType={loadType} />
      <group position={[0, 0, D.tankD / 2 + 0.42]}>
        <Label3D text={st.label} offsetY={-hh - TANK_LEG_H + 0.06} color={st.hasLoad ? '#F2A900' : '#7D8793'} scaleX={0.042} scaleY={0.0148} />
      </group>
    </group>
  );
}, (a, b) =>
  a.st.hasLoad   === b.st.hasLoad   &&
  a.st.isActive  === b.st.isActive  &&
  a.st.fillLevel === b.st.fillLevel &&
  a.z            === b.z            &&
  a.loadType     === b.loadType     &&
  a.idx          === b.idx          &&
  a.tankW        === b.tankW        &&
  a.tankTags[a.st.id]?.label === b.tankTags[b.st.id]?.label &&
  a.stationParamValues?.[a.st.id] === b.stationParamValues?.[b.st.id]
);

// ── Tank group ─ several adjacent tanks merged into one partitioned shell ─────
// One continuous outer shell spans the run; each original station still gets
// its own bath, load item and number plate at its own position, separated by
// a divider wall — station data is read exactly as for a solo tank.
function TankGroup3D({ stations, z, loadType = 'barrel', tankW = D.tankW, tankTags = {}, stationParamValues = {}, onHover }) {
  const hh = D.tankH / 2;
  const xs = stations.map(st => mapX(st.x));
  const gap3D    = xs.length > 1 ? xs[1] - xs[0] : tankW + 0.1;
  const shellX1  = xs[0] - gap3D / 2;
  const shellX2  = xs[xs.length - 1] + gap3D / 2;
  const shellW   = shellX2 - shellX1;
  const cx       = (shellX1 + shellX2) / 2;
  const chamberW = gap3D - WALL_T - 0.01;
  const anyActive = stations.some(st => st.isActive);

  return (
    <group position={[cx, hh + TANK_LEG_H, z]}>
      <TankShell width={shellW} active={anyActive} />

      {stations.map((st, i) => {
        const localX = xs[i] - cx;
        const look = processLook(tankTags[st.id]?.label, i);
        const worldY = (hh + TANK_LEG_H) + hh + 0.6;
        const handlePointerOver = e => { e.stopPropagation(); onHover?.({ x: cx + localX, y: worldY, z, lines: tooltipLinesFor(st, tankTags, stationParamValues) }); };
        const handlePointerOut  = e => { e.stopPropagation(); onHover?.(null); };
        return (
          <group key={st.id} position={[localX, 0, 0]}>
            <mesh onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
              <boxGeometry args={[chamberW, D.tankH, D.tankD]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <TankContents st={st} width={chamberW - 0.01} look={look} loadType={loadType} />
            <group position={[0, 0, D.tankD / 2 + 0.42]}>
              <Label3D text={st.label} offsetY={-hh - TANK_LEG_H + 0.06} color={st.hasLoad ? '#F2A900' : '#7D8793'} scaleX={0.042} scaleY={0.0148} />
            </group>
          </group>
        );
      })}

      {/* Chamber divider walls */}
      {stations.slice(1).map((st, i) => (
        <mesh key={st.id} position={[(xs[i] + xs[i + 1]) / 2 - cx, -0.01, 0]} renderOrder={2}>
          <boxGeometry args={[WALL_T, D.tankH - 0.02, D.tankD - 2 * WALL_T]} />{TANK_GLASS}
        </mesh>
      ))}
    </group>
  );
}

// ── Runway ─ twin I-beam crane runway on steel columns ───────────────────────
// The wagon is a bridge hoist running on two rails either side of the tank
// row (z = ±RAIL_Z), so the hoist and its load travel freely down the middle.
const RAIL_Z   = 0.80;
const RAIL_TOP = 0.1125;                    // rail-head top, above D.railY

function IBeam({ len, y, z }) {
  return (
    <group position={[0, y, z]}>
      <mesh position={[0, -0.07, 0]}><boxGeometry args={[len, 0.025, 0.16]} />{NAVY}</mesh>
      <mesh><boxGeometry args={[len, 0.115, 0.025]} />{NAVY}</mesh>
      <mesh position={[0, 0.07, 0]}><boxGeometry args={[len, 0.025, 0.16]} />{NAVY}</mesh>
      <mesh position={[0, 0.0975, 0]}><boxGeometry args={[len, 0.03, 0.045]} />{RAIL_HEAD}</mesh>
    </group>
  );
}

// Solid steel H-column from the floor up to the underside of a runway beam.
function RunwayColumn({ x, z, h }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]}><boxGeometry args={[0.32, 0.04, 0.32]} />{DARK_STEEL}</mesh>
      {/* Anchor bolts */}
      {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([bx, bz]) => (
        <mesh key={`${bx}${bz}`} position={[bx * 0.11, 0.055, bz * 0.11]}><cylinderGeometry args={[0.014, 0.014, 0.03, 6]} />{STEEL}</mesh>
      ))}
      {/* H-section: two flanges + web */}
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * 0.06, h / 2, 0]}><boxGeometry args={[0.022, h, 0.15]} />{NAVY}</mesh>
      ))}
      <mesh position={[0, h / 2, 0]}><boxGeometry args={[0.12, h, 0.02]} />{NAVY}</mesh>
      {/* Cap plate the runway beam sits on */}
      <mesh position={[0, h + 0.012, 0]}><boxGeometry args={[0.24, 0.024, 0.24]} />{DARK_STEEL}</mesh>
    </group>
  );
}

// End frame: a column under each rail, a cross-beam tying them together just
// under the rails, and X-bracing in the frame — the runway rests on one of
// these at each end of the line. Sits beyond the wagons' travel, so the
// hoist never reaches it.
function RunwayEndFrame({ x, z, h }) {
  const span = RAIL_Z * 2;
  const braceH = h * 0.62, braceY = 0.35 + braceH / 2;
  const braceLen = Math.hypot(span, braceH), braceAng = Math.atan2(span, braceH);
  return (
    <group>
      {[-1, 1].map(sz => <RunwayColumn key={sz} x={x} z={z + sz * RAIL_Z} h={h} />)}
      {/* Cross-beam under the rails */}
      <mesh position={[x, h - 0.08, z]}><boxGeometry args={[0.14, 0.16, span + 0.15]} />{NAVY}</mesh>
      {/* Lower tie */}
      <mesh position={[x, 0.35, z]}><boxGeometry args={[0.08, 0.08, span]} />{NAVY}</mesh>
      {/* X-bracing */}
      {[1, -1].map(d => (
        <mesh key={d} position={[x, braceY, z]} rotation={[d * braceAng, 0, 0]}>
          <boxGeometry args={[0.04, braceLen, 0.04]} />{NAVY}
        </mesh>
      ))}
    </group>
  );
}

const Runway3D = memo(function Runway3D({ len: tankSpan, xStart = 0, z, label }) {
  const len = tankSpan + 4.4;
  const cx  = xStart - 2.2 + len / 2;
  const colH = D.railY - 0.0825;            // up to the beam's bottom flange
  const ends = [cx - len / 2 + 0.25, cx + len / 2 - 0.25];
  return (
    <group>
      {[-1, 1].map(sz => (
        <group key={sz}>
          <group position={[cx, 0, 0]}><IBeam len={len} y={D.railY} z={z + sz * RAIL_Z} /></group>
          {/* End stops, inboard of the end frames */}
          {[-1, 1].map(e => (
            <mesh key={`e${e}`} position={[cx + e * (len / 2 - 0.55), D.railY + RAIL_TOP + 0.07, z + sz * RAIL_Z]}>
              <boxGeometry args={[0.1, 0.14, 0.18]} />{HAZARD()}
            </mesh>
          ))}
        </group>
      ))}
      {ends.map(x => <RunwayEndFrame key={x} x={x} z={z} h={colH} />)}
      {/* Line sign above the home end of the runway */}
      {label && (
        <group position={[ends[0], 0, z]}>
          <Label3D text={label} offsetY={D.railY + 1.15} color="#14A3AE" scaleX={0.1} />
        </group>
      )}
    </group>
  );
});

// ── Arm direction arrows — 3 chasing cones, UP or DOWN ──────────────────────
function ArmArrows3D({ direction }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.children.forEach((child, i) => {
      const phase = Math.sin(t * 10 + i * 2.2);
      const v = Math.max(0, phase);
      child.material.opacity = v;
      child.scale.setScalar(0.7 + v * 0.3);
    });
  });

  const isDown = direction === 'down';
  const color  = isDown ? '#FF4010' : '#10FF70';
  const rotX   = isDown ? Math.PI : 0;
  // Float above wagon roof + W-label; i=0 is the LEADING arrow in direction of travel
  const baseY  = D.bodyY + D.bodyH / 2 + 0.55;
  const STEP   = 0.22;
  const ys     = isDown
    ? [baseY + STEP, baseY, baseY - STEP]   // top→mid→bot
    : [baseY - STEP, baseY, baseY + STEP];  // bot→mid→top

  return (
    <group ref={ref}>
      {ys.map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[rotX, 0, 0]}>
          <coneGeometry args={[0.09, 0.20, 5]} />
          <meshStandardMaterial
            color={color} emissive={color} emissiveIntensity={4.5}
            transparent opacity={0} depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ── Wagon ─ bridge hoist on the twin runway ───────────────────────────────────
// End carriages ride the two rails; twin girders span between them and carry
// the hoist unit. A braced lifting frame hangs below, and the load hangs on
// wire ropes from a carrier bar. Arm extension / carried-load / mode logic is
// unchanged — only how it's drawn.
const WAGON_FRAME_X = 0.36;
const WAGON_FRAME_Z = 0.30;

function Wagon3D({ wagon, z, loadType = 'barrel' }) {
  const x     = mapX(wagon.x);
  const hasLd = wagon.loadPercent > 0;   // load visible for full dip/lift cycle
  const isArm = wagon.armExtension > 0.02;
  const led   = C.statusColors[wagon.status] || '#7D8793';

  const modeColor = wagon.mode && MODE_COLOR[wagon.mode];
  const blinkOn   = Math.floor(Date.now() / 450) % 2 === 0; // ~450ms blink period
  const labelText = `W-${wagon.id}` + (wagon.mode ? `-${MODE_SUFFIX[wagon.mode]}` : '');

  const carriageY  = D.railY + RAIL_TOP + 0.09;               // carriages sit on the rail heads
  const frameTopY  = carriageY - 0.06;
  const frameBotY  = D.bodyY - D.bodyH / 2 - D.legH;          // ≈ 1.62 — bottom tie of the lifting frame
  const frameH     = frameTopY - frameBotY;

  // Hook height: dipping → follows arm extension; carrying → transit height;
  // otherwise the empty carrier bar parks just under the hoist.
  const armLen  = isArm ? wagon.armExtension * D.maxArm : (hasLd ? ARM_TOP_Y - BARREL_TRANSIT_Y : 0);
  const armBotY = ARM_TOP_Y - armLen;
  const showArm = armLen > 0.01;
  const barY    = showArm ? armBotY + 0.36 : frameBotY + 0.25;   // carrier bar height
  const ropeTop = carriageY + 0.05;
  const ropeLen = ropeTop - barY;

  return (
    <group position={[x, 0, z]}>
      {/* End carriages with wheels, one on each rail */}
      {[-1, 1].map(sz => (
        <group key={sz} position={[0, carriageY, sz * RAIL_Z]}>
          <mesh><boxGeometry args={[0.92, 0.15, 0.17]} />{YELLOW}</mesh>
          {[-0.31, 0.31].map(wx => (
            <mesh key={wx} position={[wx, -0.075, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.07, 16]} />{RUBBER}
            </mesh>
          ))}
          {[-1, 1].map(e => (
            <mesh key={`b${e}`} position={[e * 0.49, 0, 0]}><boxGeometry args={[0.06, 0.09, 0.1]} />{RUBBER}</mesh>
          ))}
        </group>
      ))}

      {/* Twin bridge girders */}
      {[-0.25, 0.25].map(gx => (
        <mesh key={gx} position={[gx, carriageY + 0.02, 0]}>
          <boxGeometry args={[0.1, 0.18, RAIL_Z * 2 + 0.17]} />{YELLOW}
        </mesh>
      ))}

      {/* Hoist unit: drum housing, motor, brake */}
      <group position={[0, carriageY + 0.22, -0.05]}>
        <mesh><boxGeometry args={[0.46, 0.24, 0.5]} />{GRAY_PANEL}</mesh>
        <mesh position={[0, 0.13, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 0.42, 18]} />{DARK_STEEL}
        </mesh>
        <mesh position={[0, 0.01, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.26, 18]} />{GRAY_PANEL}
        </mesh>
        <mesh position={[0, 0.01, 0.52]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.03, 18]} />{DARK_STEEL}
        </mesh>
        {/* Mode beacon on top — Auto/Manual/Service colour, blinking */}
        <mesh position={[0.14, 0.17, -0.14]}><cylinderGeometry args={[0.045, 0.05, 0.05, 12]} />{DARK_STEEL}</mesh>
        <mesh position={[0.14, 0.225, -0.14]}>
          <cylinderGeometry args={[0.04, 0.04, 0.07, 14]} />
          <meshStandardMaterial
            color={modeColor || '#3A4248'} transparent opacity={0.92}
            emissive={modeColor || '#000000'}
            emissiveIntensity={modeColor ? (blinkOn ? 3 : 0.3) : 0}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* Control box on the front carriage — status + mode LEDs */}
      <group position={[0.24, carriageY + 0.02, RAIL_Z + 0.14]}>
        <mesh><boxGeometry args={[0.24, 0.22, 0.08]} /><meshStandardMaterial color="#D3D8DC" roughness={0.5} metalness={0.1} /></mesh>
        <mesh position={[-0.05, 0.04, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 0.012, 12]} />
          <meshStandardMaterial color={led} emissive={led} emissiveIntensity={2.2} roughness={0.1} />
        </mesh>
        <mesh position={[0.05, 0.04, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 0.012, 12]} />
          <meshStandardMaterial color={modeColor || '#3A4248'} emissive={modeColor || '#000'}
            emissiveIntensity={modeColor ? (blinkOn ? 2.6 : 0.25) : 0} roughness={0.1} />
        </mesh>
      </group>

      {/* Work light under the bridge — lights the tank being served */}
      <pointLight position={[0, frameBotY - 0.1, 0]} color="#FFE8C4" intensity={1.3} distance={4.5} decay={2} />

      {/* Lifting frame: 4 guide posts, top + bottom ties, side bracing */}
      {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * WAGON_FRAME_X, frameBotY + frameH / 2, sz * WAGON_FRAME_Z]}>
          <boxGeometry args={[0.06, frameH, 0.06]} />{YELLOW}
        </mesh>
      ))}
      {[-1, 1].map(sz => (
        <mesh key={`tb${sz}`} position={[0, frameBotY, sz * WAGON_FRAME_Z]}>
          <boxGeometry args={[WAGON_FRAME_X * 2 + 0.06, 0.07, 0.06]} />{HAZARD()}
        </mesh>
      ))}
      {[-1, 1].map(sx => (
        <mesh key={`ts${sx}`} position={[sx * WAGON_FRAME_X, frameBotY, 0]}>
          <boxGeometry args={[0.06, 0.07, WAGON_FRAME_Z * 2]} />{YELLOW}
        </mesh>
      ))}
      {[-1, 1].map(sx => (
        <mesh key={`br${sx}`} position={[sx * WAGON_FRAME_X, frameBotY + frameH / 2, 0]}
          rotation={[Math.atan2(WAGON_FRAME_Z * 2, frameH), 0, 0]}>
          <boxGeometry args={[0.03, Math.hypot(frameH, WAGON_FRAME_Z * 2), 0.03]} />{YELLOW}
        </mesh>
      ))}

      <Label3D text={labelText} offsetY={carriageY + 0.72} color={modeColor || '#14A3AE'} scaleX={0.078} />

      {/* Wire ropes + carrier bar */}
      {[-0.12, 0.12].map(rz => (
        <mesh key={rz} position={[0, barY + ropeLen / 2, rz]}>
          <cylinderGeometry args={[0.008, 0.008, ropeLen, 6]} />{CABLE}
        </mesh>
      ))}
      <mesh position={[0, barY, 0]}><boxGeometry args={[0.07, 0.07, 1.08]} />{YELLOW}</mesh>

      {showArm && loadType === 'basket' ? (
        // ── 3-finger claw gripper for cylindrical basket ─────────────────────
        (() => {
          const collarY    = armBotY + 0.08;
          const basketCY   = collarY - BASKET_H / 2 - 0.02;
          const GRIP_R     = BASKET_R + 0.04;
          const PRONG_LEN  = BASKET_H * 0.60;
          const prongMidY  = collarY - PRONG_LEN / 2;
          const ANGLES = [0, 2 * Math.PI / 3, 4 * Math.PI / 3];
          return (
            <>
              <mesh position={[0, (barY + collarY) / 2, 0]}>
                <cylinderGeometry args={[0.016, 0.016, barY - collarY, 8]} />{STEEL}
              </mesh>
              <mesh position={[0, collarY, 0]}>
                <cylinderGeometry args={[0.036, 0.036, 0.020, 10]} />{STEEL}
              </mesh>
              {ANGLES.map((rad, i) => {
                const fx = Math.sin(rad) * GRIP_R;
                const fz = Math.cos(rad) * GRIP_R;
                const ry = rad - Math.PI / 2;
                return (
                  <group key={i}>
                    <mesh position={[fx / 2, collarY, fz / 2]} rotation={[0, ry, 0]}>
                      <boxGeometry args={[GRIP_R, 0.013, 0.013]} />{STEEL}
                    </mesh>
                    <mesh position={[fx, prongMidY, fz]}>
                      <boxGeometry args={[0.013, PRONG_LEN, 0.013]} />{STEEL}
                    </mesh>
                  </group>
                );
              })}
              {hasLd && (
                <RotatingGroup position={[0, basketCY, 0]} scale={[1.5, 1.5, 1.5]}>
                  <Load3D type="basket" shade={false} />
                </RotatingGroup>
              )}
            </>
          );
        })()
      ) : showArm ? (
        // ── Hanger plates for barrel / rack ──────────────────────────────────
        <>
          {[-1, 1].map(sz => (
            <mesh key={sz} position={[0, (barY + armBotY) / 2, sz * 0.5]}>
              <boxGeometry args={[0.07, barY - armBotY, 0.025]} />{YELLOW}
            </mesh>
          ))}
          {hasLd && (
            <RotatingGroup position={[0, armBotY, 0]} scale={[1.5, 1.5, 1.5]}>
              <Load3D type={loadType} shade={false} />
            </RotatingGroup>
          )}
        </>
      ) : null}

      {/* ── Blinking arm-direction arrows ── */}
      {(wagon.status === 'arm_extending_load'    || wagon.status === 'arm_extending_unload') && (
        <ArmArrows3D direction="down" />
      )}
      {(wagon.status === 'arm_retracting_loaded' || wagon.status === 'arm_retracting_empty') && (
        <ArmArrows3D direction="up" />
      )}
    </group>
  );
}

// ── Sky colour + ground fog ───────────────────────────────────────────────────
function SceneEnv() {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new Color(SKY);
    scene.fog = new FogExp2(SKY, 0.012);
    return () => { scene.background = null; scene.fog = null; };
  }, [scene]);
  return null;
}

// ── Camera controller ─────────────────────────────────────────────────────────
function CameraController({ controlsRef, extKeysRef }) {
  const { camera } = useThree();
  const keys = useRef({});

  useEffect(() => {
    const onDown = e => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
      keys.current[e.code] = true;
    };
    const onUp = e => { delete keys.current[e.code]; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

  useFrame(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const k = keys.current, b = extKeysRef.current;
    if (!k.ArrowLeft && !b.left && !k.ArrowRight && !b.right &&
        !k.ArrowUp   && !b.up   && !k.ArrowDown  && !b.down &&
        !b.zoomIn    && !b.zoomOut) return;

    const ORBIT = 0.022;
    const PAN   = 0.13;
    const tgt   = ctrl.target;
    const pos   = camera.position.clone().sub(tgt);
    let r     = pos.length();
    let theta = Math.atan2(pos.x, pos.z);
    let phi   = Math.acos(Math.max(-1, Math.min(1, pos.y / r)));

    // ← → : slide camera + target along the horizontal right vector (pan)
    if (k.ArrowLeft  || b.left || k.ArrowRight || b.right) {
      const sign = (k.ArrowLeft || b.left) ? -1 : 1;
      const rx = Math.cos(theta);   // right vector X in world space
      const rz = -Math.sin(theta);  // right vector Z in world space
      tgt.x              += sign * PAN * rx;
      tgt.z              += sign * PAN * rz;
      camera.position.x  += sign * PAN * rx;
      camera.position.z  += sign * PAN * rz;
    }

    // ↑ ↓ : vertical orbit only
    if (k.ArrowUp   || b.up)   phi -= ORBIT;
    if (k.ArrowDown || b.down) phi += ORBIT;

    if (b.zoomIn)  r = Math.max(4,  r * 0.97);
    if (b.zoomOut) r = Math.min(44, r * 1.03);

    phi   = Math.max(0.28, Math.min(Math.PI * 82 / 180, phi));
    theta = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, theta));

    camera.position.set(
      tgt.x + r * Math.sin(phi) * Math.sin(theta),
      tgt.y + r * Math.cos(phi),
      tgt.z + r * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(tgt);
    ctrl.update();
  });
  return null;
}

// ── D-pad button ──────────────────────────────────────────────────────────────
function DPadBtn({ label, dir, extKeysRef }) {
  const [active, setActive] = useState(false);
  const press   = () => { extKeysRef.current[dir] = true;  setActive(true);  };
  const release = () => { extKeysRef.current[dir] = false; setActive(false); };
  return (
    <button
      onMouseDown={press} onMouseUp={release} onMouseLeave={release}
      onTouchStart={e => { e.preventDefault(); press(); }} onTouchEnd={release}
      style={{
        width: 40, height: 40,
        background: active ? THEME.accent : 'rgba(22,27,34,0.82)',
        border: `1px solid ${active ? THEME.accent : 'rgba(255,255,255,0.14)'}`,
        borderRadius: 8, color: '#FFFFFF',
        fontSize: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none', WebkitUserSelect: 'none',
        transition: 'background 0.08s, border-color 0.08s, color 0.08s',
        boxShadow: active ? `0 0 10px ${THEME.accent}88` : '0 2px 6px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(4px)',
      }}
    >{label}</button>
  );
}

// ── Cross trolley ─ a device that bridges a tank on one line to a tank on
// another, for transferring a load across lines. Purely a visual marker + a
// small idle back-and-forth animation — it doesn't touch wagon movement or
// load logic, which stay exactly as the simulation hook drives them.
function CrossTrolley3D({ x1, z1, x2, z2 }) {
  const carRef = useRef();
  const y   = D.tankH + TANK_LEG_H + 0.10; // ride just above the tank rims
  const dx  = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;
  const angle = Math.atan2(dx, dz);

  useFrame(({ clock }) => {
    if (!carRef.current) return;
    const t = (Math.sin(clock.getElapsedTime() * 0.6) + 1) / 2; // ping-pong 0..1
    carRef.current.position.x = x1 + dx * t;
    carRef.current.position.z = z1 + dz * t;
  });

  return (
    <group>
      {/* Connecting track — widened further, now a visibly heavier beam
          than the main rail itself, since this is the showcase element */}
      <group position={[midX, y, midZ]} rotation={[0, angle, 0]}>
        <mesh><boxGeometry args={[0.26, 0.13, len]} />{STEEL}</mesh>
        <mesh position={[0, 0.072, 0]}><boxGeometry args={[0.29, 0.032, len]} />{GOLD}</mesh>
      </group>
      {/* Trolley car sliding along it — widened to match */}
      <mesh ref={carRef} position={[x1, y + 0.21, z1]}>
        <boxGeometry args={[0.46, 0.29, 0.46]} />
        <meshStandardMaterial color="#E8A80C" roughness={0.45} metalness={0.35} />
      </mesh>
      <group position={[midX, 0, midZ]}>
        <Label3D text="X-TROLLEY" offsetY={y + 0.34} color="#F2A900" scaleX={0.11} />
      </group>
    </group>
  );
}

// ── Plant floor + building shell ────────────────────────────────────────────
// Polished concrete slab, a raised concrete plinth under each tank row, green
// epoxy walkways with yellow safety lines between/in front of the rows, and
// the building's clad back wall with steel columns and a high window band.
const PlantFloor = memo(function PlantFloor({ cx, cz, groundW, groundZ, lineCount }) {
  const W = groundW + 60, Dp = groundZ + 30;
  const floor = floorTex();
  floor.repeat.set(W / 6, Dp / 6);
  const firstZ = trkZ(0), lastZ = trkZ(lineCount - 1);
  const lines = Array.from({ length: lineCount }, (_, i) => i);
  const wallZ  = firstZ - 3.4;
  const plinthW = groundW - 2;
  const aisles = [];
  for (let i = 0; i < lineCount - 1; i++) aisles.push([trkZ(i) + 1.2, trkZ(i + 1) - 1.2]);
  aisles.push([lastZ + 1.2, lastZ + 3.4]);                              // front walkway
  const cladding = wallTex();
  cladding.repeat.set((groundW + 30) / 1.2, 1);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]}>
        <planeGeometry args={[W, Dp]} />
        <meshStandardMaterial map={floor} roughness={0.55} metalness={0.05} />
      </mesh>

      {/* Tank-row plinths */}
      {lines.map(idx => (
        <mesh key={`pl${idx}`} position={[cx, 0.02, trkZ(idx)]}>
          <boxGeometry args={[plinthW, 0.04, 1.9]} />
          <meshStandardMaterial color="#6E7477" roughness={0.85} />
        </mesh>
      ))}

      {/* Walkways with safety lines */}
      {aisles.map(([z1, z2], i) => (
        <group key={`a${i}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.004, (z1 + z2) / 2]}>
            <planeGeometry args={[plinthW, z2 - z1]} />
            <meshStandardMaterial map={aisleTex()} roughness={0.35} metalness={0.05} />
          </mesh>
          {[z1, z2].map(zl => (
            <mesh key={zl} rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.006, zl]}>
              <planeGeometry args={[plinthW, 0.08]} />
              <meshStandardMaterial color="#F2B705" roughness={0.4} emissive="#F2B705" emissiveIntensity={0.08} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Back wall: dado, cladding, window band */}
      <mesh position={[cx, 0.7, wallZ]}>
        <boxGeometry args={[groundW + 30, 1.4, 0.2]} />
        <meshStandardMaterial color="#5F686F" roughness={0.8} />
      </mesh>
      <mesh position={[cx, 3.0, wallZ]}>
        <planeGeometry args={[groundW + 30, 3.2]} />
        <meshStandardMaterial map={cladding} roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh position={[cx, 4.85, wallZ + 0.02]}>
        <planeGeometry args={[groundW + 30, 0.5]} />
        <meshStandardMaterial color="#CFE3EE" emissive="#BFD9E8" emissiveIntensity={0.55} roughness={0.2} />
      </mesh>

    </group>
  );
});

// Places the camera once on load so the whole plant width — every line from
// end frame to end frame — fits the window, whatever its size/shape.
function FitCamera({ target, span }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const vHalf = (camera.fov * Math.PI) / 360;
    const hTan  = Math.tan(vHalf) * (size.width / Math.max(size.height, 1));
    const dist  = (span / 2) / hTan * 1.08;
    const dir   = [0, 0.6, 0.8];                          // look down at ~37°
    camera.position.set(target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — initial framing only
  return null;
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene3D({ wagons, stations, tracks, wagonTypeMap, tankPartitions = [], crossTrolleys = [], tankTags = {}, stationParamValues = {}, controlsRef, extKeysRef }) {
  // Which tank (if any) the pointer is currently over — drives the single
  // shared tooltip below. One piece of state for the whole scene rather
  // than per-tank, so hovering never costs more than one Html mount at a
  // time regardless of how many tanks there are.
  const [hovered, setHovered] = useState(null); // { x, y, z, text } | null

  // Scene centering/sizing must span whatever ALL lines actually occupy —
  // with the serpentine layout, a later line can reach further left or
  // right than line 0 does, so going off just line 0's own tank count (as
  // before) could under-size the ground or mis-center the camera.
  const allX3D     = tracks.flatMap(t => t.stations.map(st => mapX(st.x)));
  const sceneMinX  = Math.min(...allX3D);
  const sceneMaxX  = Math.max(...allX3D);
  const cx         = (sceneMinX + sceneMaxX) / 2;
  const cz         = (trkZ(0) + trkZ(tracks.length - 1)) / 2;
  const groundZ    = (tracks.length - 1) * (TRACK_Z_LIST[1] - TRACK_Z_LIST[0]) + 6;
  const groundW    = (sceneMaxX - sceneMinX) + 8 * SPACING;

  return (
    <>
      <SceneEnv />
      {/* Lighting — no shadow maps (contact shadows are baked textures), so
          this stays a single cheap render pass */}
      <ambientLight intensity={1.15} color="#EEF2F5" />
      <hemisphereLight args={['#DCE5EC', '#4D5357', 1.1]} />
      <directionalLight position={[cx - 10, 18, cz + 16]} intensity={2.1} color="#FFF3E2" />
      <directionalLight position={[cx + 14, 9, cz - 10]} intensity={0.55} color="#BFD5E8" />

      <PlantFloor cx={cx} cz={cz} groundW={groundW} groundZ={groundZ} lineCount={tracks.length} />

      {tracks.map((tr, idx) => {
        const z         = trkZ(idx);
        const stList    = stations.filter(s => s.trackId === tr.id);
        const wList     = wagons.filter(w => w.trackId === tr.id);
        const sCount    = tr.stations.length;
        // Rail span is derived directly from the tanks' actual mapped
        // positions, NOT from a fixed (sCount-1)*SPACING assumption — tank
        // spacing is no longer a fixed per-line constant (it adapts to how many tanks
        // the whole plant has), so a formula that ignored the real spacing
        // would leave the rail/gantries not lining up with where the tanks
        // actually render.
        const firstX3D  = mapX(tr.stations[0].x);
        const lastX3D   = mapX(tr.stations.at(-1).x);
        const tLen      = Math.abs(lastX3D - firstX3D);
        const xStart    = Math.min(firstX3D, lastX3D);
        // The 3D tank's own gap-to-width ratio (how tightly tanks sit
        // together) is intentionally different from the 2D view's — 3D
        // tanks are modeled almost flush (D.tankW/SPACING ≈ 0.91), while 2D
        // leaves visible breathing room between icons (≈0.53). So the 3D
        // width is derived from the ACTUAL 3D gap between this line's own
        // tanks, scaled by 3D's own ratio — not by reusing the 2D stationW.
        const gap3D     = sCount > 1 ? Math.abs(mapX(tr.stations[1].x) - firstX3D) : SPACING;
        const tankW3D   = gap3D * TANK3D_RATIO;
        // All wagons on a line share the same type — pick from first wagon
        const trackType = wagonTypeMap[tr.wagonIds[0]] || 'barrel';

        // Partition groups for this line — merge their tanks into one shell.
        // A group only applies if every one of its tank IDs still exists on
        // this line (a saved group can go stale if tank counts changed since).
        const lineGroups = tankPartitions.filter(g => g.lineId === tr.id);
        const groupedIds = new Set();
        const validGroups = lineGroups.map(g => {
          const groupStations = stList
            .filter(st => st.id >= g.fromId && st.id <= g.toId)
            .sort((a, b) => a.x - b.x);
          if (groupStations.length !== (g.toId - g.fromId + 1)) return null;
          groupStations.forEach(st => groupedIds.add(st.id));
          return { ...g, groupStations };
        }).filter(Boolean);
        const soloStations = stList
          .map((st, i) => ({ st, i }))
          .filter(({ st }) => !groupedIds.has(st.id));

        return (
          <group key={tr.id}>
            <Runway3D len={tLen} xStart={xStart} z={z} label={tr.label} />
            {validGroups.map(g => (
              <TankGroup3D key={g.id} stations={g.groupStations} z={z} loadType={trackType}
                tankW={tankW3D} tankTags={tankTags} stationParamValues={stationParamValues} onHover={setHovered} />
            ))}
            {soloStations.map(({ st, i }) => (
              <Tank3D key={st.id} st={st} z={z} loadType={trackType} idx={i}
                tankW={tankW3D} tankTags={tankTags} stationParamValues={stationParamValues} onHover={setHovered} />
            ))}
            {wList.map(w  => (
              <Wagon3D key={w.id} wagon={w} z={z}
                loadType={wagonTypeMap[w.id] || 'barrel'} />
            ))}
          </group>
        );
      })}

      {/* Cross trolleys — bridge a tank on one line to a tank on another */}
      {crossTrolleys.map(ct => {
        const idx1 = tracks.findIndex(t => t.id === ct.line1Id);
        const idx2 = tracks.findIndex(t => t.id === ct.line2Id);
        if (idx1 < 0 || idx2 < 0) return null;
        const st1 = stations.find(s => s.trackId === ct.line1Id && s.id === ct.tank1Id);
        const st2 = stations.find(s => s.trackId === ct.line2Id && s.id === ct.tank2Id);
        if (!st1 || !st2) return null;
        return (
          <CrossTrolley3D key={ct.id}
            x1={mapX(st1.x)} z1={trkZ(idx1)}
            x2={mapX(st2.x)} z2={trkZ(idx2)} />
        );
      })}

      <OrbitControls
        ref={controlsRef}
        target={[cx, 1.3, cz]}
        enableDamping dampingFactor={0.05}
        minDistance={4} maxDistance={60}
        minPolarAngle={0.28}
        maxPolarAngle={Math.PI * 82 / 180}
        minAzimuthAngle={-Math.PI / 2}
        maxAzimuthAngle={ Math.PI / 2}
      />
      <CameraController controlsRef={controlsRef} extKeysRef={extKeysRef} />
      <FitCamera target={[cx, 1.3, cz]} span={sceneMaxX - sceneMinX + 6} />

      {/* Single shared hover tooltip — one Html mount at a time, not one
          per tank, however many tanks exist */}
      {hovered && (
        <Html position={[hovered.x, hovered.y, hovered.z]} center
          style={{ pointerEvents: 'none' }} distanceFactor={8} zIndexRange={[100, 0]}
        >
          <div style={{
            background: 'rgba(22,27,34,0.95)', color: '#FFFFFF',
            borderRadius: 10, overflow: 'hidden', whiteSpace: 'nowrap',
            fontFamily: FONT, boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.12)', transform: 'translateY(-14px)',
          }}>
            <div style={{
              padding: '9px 18px', fontSize: 20, fontWeight: 700, fontFamily: FONT_COND,
              letterSpacing: 0.5, borderLeft: `5px solid ${THEME.accent}`, background: 'rgba(255,255,255,0.04)',
            }}>{hovered.lines[0]}</div>
            {hovered.lines.length > 1 && (
              <div style={{ padding: '6px 18px 10px' }}>
                {hovered.lines.slice(1).map((line, i) => {
                  const [k, ...v] = line.split(': ');
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 26, fontSize: 16, marginTop: 4 }}>
                      <span style={{ color: '#9AA6B2', fontWeight: 500 }}>{k}</span>
                      <span style={{ color: '#F2A900', fontWeight: 700 }}>{v.join(': ')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Html>
      )}
    </>
  );
}

// ── 3D pane ───────────────────────────────────────────────────────────────────
function ThreeDPane({ wagons, stations, tracks, wagonTypeMap, tankPartitions, crossTrolleys, tankTags, stationParamValues, controlsRef, extKeysRef, camX }) {
  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [camX, 15.5, 20.5], fov: 48, near: 0.1, far: 500 }}
        style={{ background: SKY, width: '100%', height: '100%' }}
        dpr={[1, 1.5]}
      >
        <Scene3D wagons={wagons} stations={stations} tracks={tracks}
          wagonTypeMap={wagonTypeMap} tankPartitions={tankPartitions} crossTrolleys={crossTrolleys}
          tankTags={tankTags} stationParamValues={stationParamValues}
          controlsRef={controlsRef} extKeysRef={extKeysRef} />
      </Canvas>

      {/* Controls overlay — bottom lifted to clear the mode-legend bar
          added across the bottom of the main viewport */}
      <div style={{
        position: 'absolute', bottom: 70, right: 24, zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
          <DPadBtn label="＋" dir="zoomIn"  extKeysRef={extKeysRef} />
          <div style={{ padding: '0 8px', fontSize: 10, color: '#C9D1D9', letterSpacing: 1.5, fontWeight: 700, textShadow: '0 1px 3px #000' }}>ZOOM</div>
          <DPadBtn label="－" dir="zoomOut" extKeysRef={extKeysRef} />
        </div>
        <div style={{ width: 126, height: 1, background: 'rgba(255,255,255,0.18)' }} />
        <DPadBtn label="▲" dir="up"    extKeysRef={extKeysRef} />
        <div style={{ display: 'flex', gap: 3 }}>
          <DPadBtn label="◀" dir="left"  extKeysRef={extKeysRef} />
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'rgba(22,27,34,0.6)', border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7D8793', fontSize: 14,
          }}>⊕</div>
          <DPadBtn label="▶" dir="right" extKeysRef={extKeysRef} />
        </div>
        <DPadBtn label="▼" dir="down"  extKeysRef={extKeysRef} />
        <div style={{ marginTop: 2, fontSize: 10, color: '#C9D1D9', letterSpacing: 1.5, fontWeight: 700, textShadow: '0 1px 3px #000' }}>ORBIT</div>
      </div>
    </div>
  );
}

// ── Header branding slots — configured via General Config ─────────────────────
// Fixed-height box: logos are capped to this height regardless of their
// original size — so the header bar's own height never changes no matter
// what gets uploaded.
const LOGO_MAX_H = 26;

// Left slot: two logos side by side, no name (name option removed for left).
function HeaderBrandLeft({ logo1, logo2 }) {
  if (!logo1 && !logo2) return <div />; // keep the 3-slot flex layout stable even when unset
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: 0 }}>
      {logo1 && (
        <img src={logo1} alt="" style={{ height: LOGO_MAX_H, maxWidth: 100, objectFit: 'contain', flexShrink: 0 }} />
      )}
      {logo2 && (
        <img src={logo2} alt="" style={{ height: LOGO_MAX_H, maxWidth: 100, objectFit: 'contain', flexShrink: 0 }} />
      )}
    </div>
  );
}

// Center slot: name shown in full (no truncation) plus an optional logo,
// always centered in the header regardless of its length.
// `name` is rich-text HTML from the General Config page's RichTextInput
// (bold/italic/color) — strip tags just to test whether there's any text.
function hasText(html) {
  return !!html && html.replace(/<[^>]*>/g, '').trim().length > 0;
}

function HeaderBrandCenter({ name, logo }) {
  const nameHasText = hasText(name);
  if (!nameHasText && !logo) return <div />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {logo && (
        <img src={logo} alt="" style={{ height: LOGO_MAX_H, maxWidth: 100, objectFit: 'contain', flexShrink: 0 }} />
      )}
      {nameHasText && (
        <span
          style={{
            fontSize: 25, fontWeight: 700, color: THEME.text, letterSpacing: 0.8,
            whiteSpace: 'nowrap', fontFamily: FONT_COND,
          }}
          dangerouslySetInnerHTML={{ __html: name }}
        />
      )}
    </div>
  );
}

// ── Header status chips — PLC Comm / Mode / Active Alarm ───────────────────────
function StatusChip({ dot, label, value, valueColor, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, height: 32,
      padding: '0 12px', borderRadius: 16, flexShrink: 0,
      background: THEME.panelAlt, border: `1px solid ${THEME.border}`,
      cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
    }}>
      {dot && (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, boxShadow: `0 0 6px ${dot}`, flexShrink: 0 }} />
      )}
      <span style={{ fontSize: 10.5, color: THEME.textDim, letterSpacing: 1, fontWeight: 700 }}>{label}</span>
      {value !== undefined && <span style={{ fontSize: 13, fontWeight: 800, color: valueColor || THEME.text }}>{value}</span>}
    </div>
  );
}

// ── Sidebar navigation ────────────────────────────────────────────────────────
const NAV = [
  { type: 'sep', label: 'VIEWS' },
  { id: '3d',            icon: '⬡', label: '3D View'       },
  { id: 'dairy-3d',      icon: '◈', label: 'Dairy 3D'      },
  { id: 'dairy-reports', icon: '☷', label: 'Dairy Reports' },
  { id: '2d',            icon: '▦', label: '2D View'       },
  { id: 'settings',      icon: '☰', label: 'Plant Controls' },
  { type: 'sep', label: 'MONITOR' },
  { id: 'station-info',  icon: '⊡', label: 'Tank Overview' },
  // Sequence requested: System Config, Tank Partitions, Cross Trolley,
  // Wagon Location Tags, Mimic Page Config, Station Info — labels renamed
  // to match what each page actually configures (was e.g. "Tank Tags" for
  // the Mimic Page Config screen, "Stn. Names" for Station Info), since the
  // mismatch between sidebar label and page title was the main source of
  // "settings feel scattered". Col. Config / General Config aren't part of
  // that requested set — kept, just appended after it.
  { type: 'sep', label: 'CONFIGURATION' },
  { id: 'config',         icon: '⚙', label: 'Plant Layout',         sub: true },
  { id: 'tank-partitions',icon: '▥', label: 'Tank Partitions',      sub: true },
  { id: 'cross-trolley',  icon: '⇄', label: 'Transfer Links',       sub: true },
  { id: 'wagon-tags',     icon: '⊟', label: 'Wagon Signals',        sub: true },
  { id: 'tags-config',    icon: '⊞', label: 'Tank Register',        sub: true },
  { id: 'station-names',  icon: '✎', label: 'Station Parameters',  sub: true },
  { id: 'station-cols',   icon: '≡', label: 'Table Columns',       sub: true },
  { id: 'general-config', icon: '⚑', label: 'Branding',            sub: true },
  { type: 'sep', label: 'DIAGNOSTICS' },
  { id: 'plc-test',      icon: '⚡', label: 'Connectivity' },
  { type: 'sep', label: 'DEPLOY' },
  { id: 'app-builder',   icon: '⧉', label: 'Package Builder', devOnly: true },
];

// Drops nav items the current page selection turns off, PLUS any `devOnly`
// item (App Builder) whenever this is a generated exe — that screen is for
// building exes, not for a deployed client to use, and its own toolchain
// (npm, PyInstaller) isn't even present inside a frozen exe to make it work.
// `selection` is only ever non-empty inside a generated exe (see
// WagonScadaApp below) — the dev app always passes {}, under which every
// selectable item stays (see isPageEnabled's default-enabled-if-missing
// rule). A separator with nothing left under it is dropped too, rather than
// left dangling.
// Which scene view to show on first load — '2d' when it's enabled (keeps
// today's default everywhere that hasn't changed it), otherwise whichever
// view actually IS enabled. Previously this was hardcoded to '2d' no matter
// what, so a build with only "3D View" selected on the App Builder page
// still opened on 2D even though it wasn't in the sidebar at all.
const VIEW_IDS = ['2d', '3d'];
function initialView(selection) {
  return VIEW_IDS.find(id => isPageEnabled(selection, `nav:${id}`)) ?? '2d';
}

function filterNav(nav, selection, isFrozen) {
  const kept = [];
  let pendingSep = null;          // heading waiting for its first visible item
  for (const item of nav) {
    if (item.type === 'sep') { pendingSep = item; continue; }
    if (item.devOnly && isFrozen) continue;
    if (isPageEnabled(selection, `nav:${item.id}`)) {
      if (pendingSep) { kept.push(pendingSep); pendingSep = null; }
      kept.push(item);
    }
  }
  return kept;
}

// Brand mark: an overhead hoist over a process tank, in a rounded teal tile.
function BrandMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id="bmTile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14A3AE" />
          <stop offset="1" stopColor="#0A5F67" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="url(#bmTile)" />
      <rect x="7" y="9" width="26" height="3.2" rx="1.6" fill="#FFFFFF" />
      <rect x="16" y="12" width="8" height="5" rx="1.2" fill="#F2A900" />
      <line x1="20" y1="17" x2="20" y2="23" stroke="#FFFFFF" strokeWidth="1.6" />
      <rect x="15.5" y="22.5" width="9" height="4" rx="1" fill="#F2A900" />
      <path d="M9 21 V31 H31 V21" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M11.5 27.5 H28.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const Sidebar = memo(function Sidebar({ view, navigate, expanded, onToggle, nav, sourceLabel, sourceColor }) {
  const FULL = 232, ICON = 60, HIDE = FULL - ICON;
  return (
    <div style={{
      width: expanded ? FULL : ICON, minWidth: expanded ? FULL : ICON, flexShrink: 0,
      position: 'relative', zIndex: 50, transition: 'width 0.24s cubic-bezier(0.4,0,0.2,1), min-width 0.24s cubic-bezier(0.4,0,0.2,1)',
    }}>
      {/* When collapsed: invisible overlay makes the whole column clickable to reopen */}
      {!expanded && (
        <div onClick={onToggle} style={{ position: 'absolute', inset: 0, zIndex: 51, cursor: 'pointer' }} />
      )}
      {/* Full-width panel — GPU clip-path animates, zero layout impact */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: FULL,
        background: THEME.frame, borderRight: `1px solid ${THEME.frameLine}`,
        display: 'flex', flexDirection: 'column', fontFamily: FONT,
        clipPath: expanded ? `inset(0 0 0 0)` : `inset(0 ${HIDE}px 0 0)`,
        transition: 'clip-path 0.24s cubic-bezier(0.4,0,0.2,1)',
        willChange: 'clip-path',
        boxShadow: expanded ? '6px 0 24px rgba(0,0,0,0.28)' : 'none',
      }}>
        {/* ── Brand ─────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11, padding: '0 12px',
          height: 60, flexShrink: 0, borderBottom: `1px solid ${THEME.frameLine}`,
        }}>
          <BrandMark />
          <div style={{ minWidth: 0, flex: 1, opacity: expanded ? 1 : 0, transition: 'opacity 0.15s', lineHeight: 1 }}>
            <div style={{ fontFamily: FONT_COND, fontSize: 23, fontWeight: 700, color: '#FFFFFF', letterSpacing: 1.5 }}>{BRAND.name}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: THEME.amber, letterSpacing: 2.4, marginTop: 3, whiteSpace: 'nowrap' }}>{BRAND.product}</div>
          </div>
          <button onClick={onToggle} title="Collapse sidebar" style={{
            flexShrink: 0, width: 30, height: 30, padding: 0,
            background: THEME.frameRaised, border: `1px solid ${THEME.frameLine}`,
            borderRadius: 8, color: THEME.frameText, cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>{expanded ? '‹' : '›'}</button>
        </div>

        {/* ── Nav list — always fully rendered, clip controls visibility ── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px' }}>
          {nav.map((item, i) => {
            if (item.type === 'sep') return (
              <div key={i} style={{
                padding: '14px 10px 6px', fontSize: 10, fontWeight: 700, letterSpacing: 1.6,
                color: THEME.frameDim, whiteSpace: 'nowrap', userSelect: 'none',
                opacity: expanded ? 1 : 0, transition: 'opacity 0.15s',
              }}>{item.label}</div>
            );
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                title={item.label}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                  padding: item.sub ? '7px 10px 7px 12px' : '9px 10px',
                  margin: '1px 0', borderRadius: 8, position: 'relative',
                  background: isActive ? THEME.frameRaised : 'transparent',
                  border: 'none', cursor: 'pointer', transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                {isActive && (
                  <span style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 2, background: THEME.amber }} />
                )}
                <span style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: item.sub ? 13 : 15, lineHeight: 1,
                  background: isActive ? THEME.accent : 'rgba(255,255,255,0.05)',
                  color: isActive ? '#FFFFFF' : THEME.frameText,
                }}>{item.icon}</span>
                <span style={{
                  fontSize: item.sub ? 13 : 14, fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#FFFFFF' : THEME.frameText,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  opacity: expanded ? 1 : 0, transition: 'opacity 0.15s',
                }}>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Data source status ─────────────────────────── */}
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${THEME.frameLine}`, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 9,
        }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: sourceColor, boxShadow: `0 0 8px ${sourceColor}`, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: THEME.frameText, letterSpacing: 1.2, whiteSpace: 'nowrap', opacity: expanded ? 1 : 0, transition: 'opacity 0.15s' }}>{sourceLabel}</span>
        </div>
      </div>
    </div>
  );
});

// ── Config loader — async reads from file, falls back to localStorage ─────────
function LoadingScreen() {
  return (
    <div style={{
      width: '100vw', height: '100vh', background: THEME.frame,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, gap: 16,
    }}>
      <style>{`@keyframes ldSlide { 0% { transform: translateX(-60px); } 100% { transform: translateX(160px); } }`}</style>
      <BrandMark size={56} />
      <div style={{ fontFamily: FONT_COND, fontSize: 26, fontWeight: 700, color: '#FFFFFF', letterSpacing: 2 }}>{BRAND.title}</div>
      <div style={{ fontSize: 11, color: THEME.frameDim, letterSpacing: 2.5, fontWeight: 600 }}>LOADING CONFIGURATION</div>
      <div style={{ width: 160, height: 3, background: THEME.frameLine, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: 60, height: '100%', background: THEME.accent, borderRadius: 2, animation: 'ldSlide 1.1s ease-in-out infinite alternate' }} />
      </div>
    </div>
  );
}

export default function WagonScada3D() {
  const [userCfg, setUserCfg]     = useState(null);
  const [headerCfg, setHeaderCfg] = useState(null);
  const [isFrozen, setIsFrozen]   = useState(null);
  const [pageSelection, setPageSelection] = useState(null);
  const [dataSource, setDataSource] = useState(null);

  useEffect(() => {
    loadPlcConfigFromServer().then(serverCfg => {
      if (serverCfg) savePlcConfig(serverCfg);
      setDataSource(dataSourceOf(serverCfg ?? loadPlcConfig()));
    });
    loadUserConfigFromFile().then(fileCfg => {
      const cfg = fileCfg ?? loadUserConfig();
      saveUserConfig(cfg); // keep localStorage in sync with the file
      setUserCfg(cfg);
    });
    loadHeaderConfigFromFile().then(fileCfg => {
      const cfg = fileCfg ?? loadHeaderConfig();
      saveHeaderConfig(cfg);
      setHeaderCfg(cfg);
    });
    isRunningInsideExe().then(frozen => {
      setIsFrozen(frozen);
      if (!frozen) {
        setPageSelection({}); // dev/plain app — never filters, see filterNav
        return;
      }
      loadPageSelectionFromServer().then(serverSel => {
        const sel = pruneToCatalog(serverSel ?? loadPageSelection());
        savePageSelection(sel);
        setPageSelection(sel);
      });
    });
  }, []);

  if (!userCfg || !headerCfg || isFrozen === null || !pageSelection || !dataSource) return <LoadingScreen />;
  return (
    <WagonScadaApp
      initialCfg={userCfg} initialHeaderCfg={headerCfg}
      pageSelection={pageSelection} isFrozen={isFrozen}
      initialDataSource={dataSource}
    />
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
function WagonScadaApp({ initialCfg, initialHeaderCfg, pageSelection, isFrozen, initialDataSource }) {
  const [userCfg, setUserCfg]     = useState(initialCfg);
  const [headerCfg, setHeaderCfg] = useState(initialHeaderCfg);
  const [view, setView]       = useState(() => initialView(pageSelection));
  const [lastSceneView, setLastSceneView] = useState(() => initialView(pageSelection));
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [isSceneFullscreen, setIsSceneFullscreen] = useState(false);
  const [dataSource, setDataSource] = useState(initialDataSource); // 'mock' | 'plc'
  const [plcMode, setPlcMode] = useState(true); // AUTO/MANUAL — manual toggle for now, no real mode source yet
  const sceneFullscreenRef = useRef(null);

  const simCfg       = useMemo(() => buildSimConfig(userCfg), [userCfg]);
  const wagonTypeMap = useMemo(() => getWagonTypeMap(userCfg), [userCfg]);
  const tankTags     = useMemo(() => getTankTags(userCfg), [userCfg]);
  const wagonTags    = useMemo(() => getWagonTags(userCfg), [userCfg]);
  const stationParams = useMemo(() => getStationParams(userCfg), [userCfg]);
  const stationParamLabels = useMemo(() => userCfg.stationParamLabels || {}, [userCfg]);
  const stationLoadNumbers = useMemo(() => getStationLoadNumbers(userCfg), [userCfg]);

  // Tank Partitions / Cross Trolleys / Station Columns / Station Names were
  // previously localStorage-only, with no backend file at all — so none of
  // them were ever seeded into a generated exe (see exe_builder.py, which
  // only seeds savedPageSelection/PlcConfig/UserConfig/HeaderConfig.json),
  // and a deployed exe always started back at defaults no matter what was
  // configured in the dev browser (reported: Tank Partitions not showing in
  // a deployed exe). Now part of userCfg, the same already-exe-portable
  // object tankTags/wagonTags/stationParams already live in — the
  // localStorage read below is only a one-time fallback for whatever was
  // already saved there before this change; the very next Save on each of
  // these pages writes it into userCfg/savedUserConfig.json for good.
  const stationColCfg = useMemo(() => {
    if (userCfg.stationColCfg !== undefined) return userCfg.stationColCfg;
    try {
      const stored = localStorage.getItem('stationColConfig');
      if (stored) return JSON.parse(stored);
    } catch {}
    return DEFAULT_STATION_COLS;
  }, [userCfg]);

  const handleSaveStationCols = newCols => {
    const newCfg = { ...userCfg, stationColCfg: newCols };
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
    setView('config');
  };

  const stationNames = useMemo(() => {
    if (userCfg.stationNames !== undefined) return userCfg.stationNames;
    try {
      const stored = localStorage.getItem('stationNamesConfig');
      if (stored) return JSON.parse(stored);
    } catch {}
    return null; // null → StationInfoPage uses defaults
  }, [userCfg]);

  // Display name per station (index = id - 1): Mimic Page Configuration's
  // label is the station's name; the old stored/default name list is only
  // a fallback for a tank with no label set.
  const totalStations = simCfg.tracks.reduce((n, t) => n + t.stations.length, 0);
  const displayStationNames = useMemo(
    () => buildNamesArray(stationNames, totalStations)
      .map((fallback, i) => tankTags[String(i + 1)]?.label || fallback),
    [stationNames, totalStations, tankTags]);

  const stationLabelMap = useMemo(
    () => Object.fromEntries(Object.entries(tankTags).map(([id, t]) => [id, t?.label || ''])),
    [tankTags]);


  const tankPartitions = useMemo(() => {
    if (userCfg.tankPartitions !== undefined) return userCfg.tankPartitions;
    try {
      const stored = localStorage.getItem('tankPartitionConfig');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  }, [userCfg]);

  const handleSaveTankPartitions = newGroups => {
    const newCfg = { ...userCfg, tankPartitions: newGroups };
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
    setView('config');
  };

  const crossTrolleys = useMemo(() => {
    if (userCfg.crossTrolleys !== undefined) return userCfg.crossTrolleys;
    try {
      const stored = localStorage.getItem('crossTrolleyConfig');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  }, [userCfg]);

  const handleSaveCrossTrolleys = newTrolleys => {
    const newCfg = { ...userCfg, crossTrolleys: newTrolleys };
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
    setView('config');
  };

  const handleSaveHeaderConfig = newCfg => {
    saveHeaderConfig(newCfg);
    saveHeaderConfigToFile(newCfg);
    setHeaderCfg(newCfg);
    setView(lastSceneView);
  };

  // Which Settings sub-page is open (null = the hub). Lives here, not inside
  // SettingsPage, so clicking "Settings" in the sidebar always lands on the hub.
  const [settingsPage, setSettingsPage] = useState(null);

  const navigate = useCallback(id => {
    setLastSceneView(prev => (view === '2d' || view === '3d') ? view : prev);
    if (id === 'settings') setSettingsPage(null);
    setView(id);
  }, [view]);

  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), []);

  const toggleSceneFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      sceneFullscreenRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsSceneFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleApply = newCfg => {
    saveUserConfig(newCfg);          // localStorage (sync — survives reload)
    saveUserConfigToFile(newCfg);    // JSON file (fire-and-forget)
    if (countsChanged(userCfg, newCfg)) {
      window.location.reload();
    } else {
      setUserCfg(newCfg);
      setView(lastSceneView);
    }
  };

  const handleBack = () => setView(lastSceneView);

  const handleSaveTags = newTankTags => {
    const newCfg = { ...userCfg, tankTags: newTankTags };
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
    setView('config');
  };

  const handleSaveWagonTags = newWagonTags => {
    const newCfg = { ...userCfg, wagonTags: newWagonTags };
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
    setView('config');
  };

  // Station Parameters page — params, group labels and load-number registers
  // saved together in ONE config write. (Saving them through three separate
  // handlers, as before, each started from the same stale userCfg, so only
  // the last write's change actually survived.)
  const handleSaveStationInfo = ({ stationParams: sp, stationParamLabels: sl, stationLoadNumbers: ln }) => {
    const newCfg = { ...userCfg, stationParams: sp, stationParamLabels: sl, stationLoadNumbers: ln };
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
    setView('config');
  };




  const { wagons, stations, setWagonTarget, snapWagonToTank, setWagonLoadFlag, setWagonMode, setStationHasLoad, setStationTemperature } = useWagonSimulation(simCfg);
  // Live tags come from exactly one source: the built-in plant simulation
  // (data source "mock" — see sim/mockPlant.js) or the backend's real PLC
  // poller over WebSocket ("plc"). Both produce the same tag names and
  // shape, so everything below is identical either way.
  const isMock = dataSource === 'mock';
  const mockFeed = useMockTags(isMock, userCfg);
  const plcFeed  = useTagSocket(!isMock);
  const { tags: grpcTags, connected: grpcConnected } = isMock ? mockFeed : plcFeed;

  // Live PLC read: whenever a tank's configured tag name has a live value
  // (published continuously by the backend's PLC poller — see
  // backend-fastapi/plc_publisher.py — once a PLC address is set for that
  // tag on the Tank Tags page), that value sets hasLoad, every time a new
  // reading arrives. A tank with no configured address/live tag simply
  // never shows as loaded — there's no mock fallback. Any NON-ZERO value
  // counts as loaded — the tag's data type is selectable (bool/int16/.../
  // float32 — see tagConfig.js's TAG_DATA_TYPES), so this isn't just a
  // bare boolean 1 check.
  useEffect(() => {
    Object.entries(tankTags).forEach(([tankId, tag]) => {
      const live = tag?.name && grpcTags[tag.name];
      if (!live) return;
      setStationHasLoad(Number(tankId), Number(live.value) !== 0);
    });
  }, [grpcTags, tankTags, setStationHasLoad]);

  // Live tank temperature (Tank_<id>_Temp) — feeds the 2D thermometers /
  // tooltips and anything else reading station.temperature.
  useEffect(() => {
    stations.forEach(st => {
      const v = parseFloat(grpcTags[`Tank_${st.id}_Temp`]?.value);
      if (Number.isFinite(v) && v !== st.temperature) setStationTemperature(st.id, v);
    });
  }, [grpcTags, setStationTemperature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Station parameter tags (Station Info page's flexible label/address/
  // type/unit list) — live values, keyed the same way plc_publisher.py
  // publishes them (station_param_tag_name: "STATION_<id>_P<index>"). A
  // station with none configured simply isn't in this map, so its hover
  // tooltip just shows the name as before (see Tank3D/TankGroup3D below).
  //
  // PLC registers for these store scaled integers, not engineering units —
  // Actual Temperature is raw/10 (°C), Actual PH is raw/100 (pH). Keyed by
  // kind (the same closed dropdown set as StationNamesConfigPage.jsx's
  // PARAM_KINDS) so it applies uniformly regardless of which station; a
  // kind with no entry here (Actual/Calculated/Set Current) is shown raw.
  const stationParamValues = useMemo(() => {
    const out = {};
    Object.entries(stationParams).forEach(([stationId, params]) => {
      const withValues = (params || [])
        .map((p, idx) => {
          const live = grpcTags[`STATION_${stationId}_P${idx}`];
          if (!live) return null;
          const num = Number(live.value);
          const scale = PARAM_SCALE[p.label] ?? 1;
          const value = Number.isFinite(num) ? (num * scale).toFixed(2) : live.value; // 2 decimal places, e.g. "4.00" not "4.000000238..."
          return { label: p.label || `Param ${idx + 1}`, unit: p.unit || '', value };
        })
        .filter(Boolean);
      if (withValues.length) out[stationId] = withValues;
    });
    // Load Number — a separate dedicated per-station tag (Station Info
    // page's own "LOAD NUMBER" column, always int16), merged into the same
    // tooltip lines built above rather than threaded as its own prop.
    simCfg.tracks.forEach(t => t.stations.forEach(({ id }) => {
      const stationId = String(id);
      const live = grpcTags[`STATION_${stationId}_LOADNUM`];
      if (!live) return;
      const entry = { label: 'Load Number', unit: '', value: live.value };
      out[stationId] = out[stationId] ? [...out[stationId], entry] : [entry];
    }));
    return out;
  }, [stationParams, simCfg, grpcTags]);

  // Wagon location tag values — live only now, no mock. Mirrors the
  // tank-load override above: whenever a wagon's configured tag name has a
  // live value (published continuously by the backend's PLC poller — see
  // backend-fastapi/plc_publisher.py — once a PLC address is set for that
  // tag on the Wagon Tags page), the tag's value is the tank number the
  // wagon should be at. The very FIRST value ever seen for a wagon places
  // it there directly (no drive-there animation) — e.g. on page load, so it
  // starts where the PLC says it is, not at its demo home position; 0/no
  // value resolves to that wagon's track's lowest tank number (see
  // useWagonSimulation's resolveTankId). Every value AFTER that animates a
  // smooth move, and the wagon simply stops and stays there until the tag's
  // value changes again — it never runs the autonomous demo movement once
  // it has a live tag. A wagon with no configured address/live tag is
  // unaffected and keeps the demo behavior.
  const [wagonLocationTagValues, setWagonLocationTagValues] = useState({});
  useEffect(() => {
    Object.entries(wagonTags).forEach(([wagonId, tag]) => {
      const live = tag?.name && grpcTags[tag.name];
      if (!live) return;
      const tankId = Number(live.value);
      if (!Number.isFinite(tankId)) return;
      if (!(wagonId in wagonLocationTagValues)) {
        snapWagonToTank(Number(wagonId), tankId);
      } else if (wagonLocationTagValues[wagonId] !== tankId) {
        setWagonTarget(Number(wagonId), tankId);
      }
      setWagonLocationTagValues(prev => (prev[wagonId] === tankId ? prev : { ...prev, [wagonId]: tankId }));
    });
  }, [grpcTags, wagonTags, wagonLocationTagValues, setWagonTarget, snapWagonToTank]);

  // Wagon load lift tags — SET/RESET latch (Wagon Tags page's "WAGON LOAD
  // LIFT TAG CONFIGURATION" section). UP-LIFT reading 1/TRUE turns the
  // wagon's "carrying load" flag ON; DOWN-LIFT reading 1/TRUE turns it OFF;
  // neither bit being 0 ever changes it — it's a latch, not a live
  // snapshot of either bit. SET wins if both fire in the same reading. A
  // wagon with neither tag configured is unaffected (keeps the demo
  // pick-up/drop-off animation driving its load display).
  const [wagonLoadFlags, setWagonLoadFlags] = useState({});
  useEffect(() => {
    Object.entries(wagonTags).forEach(([wagonId, tag]) => {
      const upName = tag?.upLiftTag?.name;
      const downName = tag?.downLiftTag?.name;
      const upLive = upName && grpcTags[upName];
      const downLive = downName && grpcTags[downName];
      if (!upLive && !downLive) return;

      let flag = wagonLoadFlags[wagonId]; // undefined until the first SET/RESET fires
      if (downLive && Number(downLive.value) !== 0) flag = false;
      if (upLive && Number(upLive.value) !== 0) flag = true; // SET wins on a tie

      if (flag !== undefined && flag !== wagonLoadFlags[wagonId]) {
        // Animate the hoist dip for a genuine change; the very first value
        // seen (page load) just sets the state.
        setWagonLoadFlag(Number(wagonId), flag, wagonLoadFlags[wagonId] !== undefined);
        setWagonLoadFlags(prev => ({ ...prev, [wagonId]: flag }));
      }
    });
  }, [grpcTags, wagonTags, wagonLoadFlags, setWagonLoadFlag]);

  // Wagon mode tags — Auto/Manual/Service (Wagon Tags page's "WAGON MODE
  // TAG CONFIGURATION" section). These are mutually exclusive on the PLC —
  // only one should read 1 at a time. Whichever currently reads 1 becomes
  // the wagon's active mode (priority auto > manual > service if somehow
  // more than one reads 1 at once); if none currently read 1, the last
  // known mode is kept rather than cleared, so it doesn't flicker off
  // during a brief transition between modes. Shown as a blinking LED
  // (green/orange/blue) and a -A/-M/-S label suffix on the wagon (Wagon3D).
  const [wagonModes, setWagonModes] = useState({});
  useEffect(() => {
    Object.entries(wagonTags).forEach(([wagonId, tag]) => {
      const autoLive = tag?.autoTag?.name && grpcTags[tag.autoTag.name];
      const manualLive = tag?.manualTag?.name && grpcTags[tag.manualTag.name];
      const serviceLive = tag?.serviceTag?.name && grpcTags[tag.serviceTag.name];
      if (!autoLive && !manualLive && !serviceLive) return;

      let mode = wagonModes[wagonId]; // undefined/last mode until one of the three reads 1
      if (serviceLive && Number(serviceLive.value) === 1) mode = 'service';
      if (manualLive && Number(manualLive.value) === 1) mode = 'manual';
      if (autoLive && Number(autoLive.value) === 1) mode = 'auto'; // highest priority on a tie

      if (mode !== undefined && mode !== wagonModes[wagonId]) {
        setWagonMode(Number(wagonId), mode);
        setWagonModes(prev => ({ ...prev, [wagonId]: mode }));
      }
    });
  }, [grpcTags, wagonTags, wagonModes, setWagonMode]);

  const [clock, setClock]   = useState(() => new Date());
  const controlsRef = useRef(null);
  const extKeysRef  = useRef({});

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr  = clock.toLocaleTimeString('en-GB', { hour12: false });
  const dateStr  = clock.toLocaleDateString('en-GB',
    { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const liveAlarmCount = Number(grpcTags.PLANT_ALARM_COUNT?.value);
  const activeAlarmCount = Number.isFinite(liveAlarmCount)
    ? liveAlarmCount
    : wagons.filter(w => w.status.startsWith('arm_')).length;

  // Same centering logic as Scene3D's cx — spans whatever ALL lines
  // actually occupy, not just line 0's own tank count.
  const camXs = simCfg.tracks.flatMap(t => t.stations.map(st => mapX(st.x)));
  const camX  = (Math.min(...camXs) + Math.max(...camXs)) / 2;
  const pal  = C.palette;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'row', background: THEME.pageBg, fontFamily: FONT, overflow: 'hidden' }}>
      {/* Sidebar */}
      <Sidebar view={view} navigate={navigate} expanded={sidebarOpen} onToggle={toggleSidebar} nav={filterNav(NAV, pageSelection, isFrozen)}
        sourceLabel={isMock ? 'SIMULATION' : grpcConnected ? 'PLC ONLINE' : 'PLC OFFLINE'}
        sourceColor={isMock ? '#B07CE8' : grpcConnected ? '#3FB97A' : '#E5534B'} />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header — left/center branding come from General Config; height and
            font size here never change, whatever is configured just fits into
            these fixed slots (logo capped to LOGO_MAX_H, name truncates). */}
        <div style={{
          background: THEME.panel,
          borderBottom: `1px solid ${THEME.border}`,
          boxShadow: '0 1px 0 rgba(0,0,0,0.02), 0 4px 14px rgba(22,27,34,0.05)',
          padding: '0 18px', position: 'relative', zIndex: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          flexShrink: 0, height: 60,
        }}>
          <HeaderBrandLeft logo1={headerCfg.left.logo1} logo2={headerCfg.left.logo2} />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
            <HeaderBrandCenter name={headerCfg.center.name} logo={headerCfg.center.logo} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StatusChip
              dot={grpcConnected ? (isMock ? '#8E24AA' : pal.ok) : pal.danger}
              label={isMock ? 'DATA' : 'PLC COMM'}
              value={isMock ? 'SIMULATION' : undefined}
              valueColor="#8E24AA"
            />
            <StatusChip
              label="MODE"
              value={plcMode ? 'AUTO' : 'MANUAL'}
              valueColor={plcMode ? pal.ok : pal.warn}
              onClick={() => setPlcMode(m => !m)}
            />
            <StatusChip
              label="ALARM"
              value={activeAlarmCount}
              valueColor={activeAlarmCount > 0 ? pal.danger : pal.textDim}
            />
            <div style={{ textAlign: 'right', paddingLeft: 12, marginLeft: 4, borderLeft: `1px solid ${THEME.border}` }}>
              <div style={{ fontFamily: FONT_COND, fontSize: 22, color: THEME.text, fontWeight: 700, letterSpacing: 1.5, lineHeight: 1 }}>{timeStr}</div>
              <div style={{ fontSize: 10, color: THEME.textDim, letterSpacing: 1.6, fontWeight: 600, marginTop: 3 }}>{dateStr}</div>
            </div>
          </div>
        </div>

        {/* Main viewport */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          {view === '2d' && (
            <div ref={sceneFullscreenRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <WagonScadaScreen wagons={wagons} stations={stations} tracks={simCfg.tracks}
                liveTags={grpcTags} wagonLocations={wagonLocationTagValues}
                stationLabels={stationLabelMap} wagonTypeMap={wagonTypeMap}
                tankPartitions={tankPartitions} crossTrolleys={crossTrolleys} />
              {/* Fullscreen toggle */}
              <button
                onClick={toggleSceneFullscreen}
                title={isSceneFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                style={{
                  position: 'absolute', top: 12, right: 12, zIndex: 20,
                  width: 36, height: 36, padding: 0,
                  background: 'rgba(22,27,34,0.82)', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 9, color: '#FFFFFF', cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,124,134,0.92)'; e.currentTarget.style.borderColor = '#14A3AE'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(22,27,34,0.82)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
              >
                {isSceneFullscreen ? '⊡' : '⛶'}
              </button>
            </div>
          )}
          {view === '3d' && (
            <div ref={sceneFullscreenRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
              <ThreeDPane wagons={wagons} stations={stations}
                tracks={simCfg.tracks} wagonTypeMap={wagonTypeMap}
                tankPartitions={tankPartitions} crossTrolleys={crossTrolleys}
                tankTags={tankTags} stationParamValues={stationParamValues}
                controlsRef={controlsRef} extKeysRef={extKeysRef} camX={camX} />
              {/* Fullscreen toggle */}
              <button
                onClick={toggleSceneFullscreen}
                title={isSceneFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                style={{
                  position: 'absolute', top: 12, right: 12, zIndex: 20,
                  width: 36, height: 36, padding: 0,
                  background: 'rgba(22,27,34,0.82)', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 9, color: '#FFFFFF', cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,124,134,0.92)'; e.currentTarget.style.borderColor = '#14A3AE'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(22,27,34,0.82)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
              >
                {isSceneFullscreen ? '⊡' : '⛶'}
              </button>
            </div>
          )}
          {view === 'config' && (
            <ConfigPanel
              config={userCfg}
              onApply={handleApply}
              onBack={handleBack}
              onConfigureTags={() => setView('tags-config')}
              onConfigureWagonTags={() => setView('wagon-tags')}
              onConfigureStationCols={() => setView('station-cols')}
              onConfigureStationNames={() => setView('station-names')}
              onConfigureTankPartitions={() => setView('tank-partitions')}
              onConfigureCrossTrolley={() => setView('cross-trolley')}
            />
          )}
          {view === 'tags-config' && (
            <TankTagsPage
              userCfg={userCfg}
              tankTags={tankTags}
              onSave={handleSaveTags}
              onBack={() => setView('config')}
            />
          )}
          {view === 'wagon-tags' && (
            <WagonTagsPage
              userCfg={userCfg}
              wagonTags={wagonTags}
              onSave={handleSaveWagonTags}
              onBack={() => setView('config')}
            />
          )}
          {view === 'station-info' && (
            <StationInfoPage
              wagons={wagons}
              stations={stations}
              tracks={simCfg.tracks}
              liveTags={grpcTags}
              connected={grpcConnected}
              stationParams={stationParams}
              wagonLocations={wagonLocationTagValues}
              colConfig={stationColCfg}
              stationNames={displayStationNames}
              onBack={() => setView(lastSceneView)}
            />
          )}
          {view === 'station-cols' && (
            <StationColumnConfigPage
              colConfig={stationColCfg}
              onSave={handleSaveStationCols}
              onBack={() => setView('config')}
            />
          )}
          {view === 'station-names' && (
            <StationNamesConfigPage
              stationNames={stationNames}
              stationCount={stations.length}
              stationParams={stationParams}
              stationParamLabels={stationParamLabels}
              stationLoadNumbers={stationLoadNumbers}
              tankTags={tankTags}
              onSaveAll={handleSaveStationInfo}
              onBack={() => setView('config')}
            />
          )}
          {view === 'settings' && (
            <SettingsPage
              activePageId={settingsPage}
              onOpenPage={setSettingsPage}
              onClosePage={() => setSettingsPage(null)}
              onBack={() => setView(lastSceneView)}
              pageSelection={pageSelection}
              pageContext={{
                // Configured stations (same ids/order the simulation is built from),
                // not the simulation's own state — settings pages stay off mock data.
                stations: simCfg.tracks.flatMap(t => t.stations),
                stationNames: displayStationNames,
                wagonTags,
                grpcTags,
                grpcConnected,
              }}
            />
          )}
          {view === 'general-config' && (
            <GeneralConfigPage
              headerConfig={headerCfg}
              onSave={handleSaveHeaderConfig}
              onBack={() => setView(lastSceneView)}
            />
          )}
          {view === 'dairy-3d' && <Dairy3DPage />}
          {view === 'dairy-reports' && <ReportsPage />}
          {view === 'app-builder' && (
            <AppBuilderPage onNavigateToPlcTest={() => navigate('plc-test')} />
          )}
          {view === 'plc-test' && (
            <PlcConnectionTestPage onBack={() => setView(lastSceneView)} onDataSourceChange={setDataSource} />
          )}
          {view === 'tank-partitions' && (
            <TankPartitionConfigPage
              userCfg={userCfg}
              groups={tankPartitions}
              onSave={handleSaveTankPartitions}
              onBack={() => setView('config')}
            />
          )}
          {view === 'cross-trolley' && (
            <CrossTrolleyConfigPage
              userCfg={userCfg}
              trolleys={crossTrolleys}
              onSave={handleSaveCrossTrolleys}
              onBack={() => setView('config')}
            />
          )}

          {/* Wagon mode legend — only over the live scene, bigger than a
              normal footer so it reads clearly at a glance (matches the
              LED colors shown on each wagon's top-side mode indicator). */}
          {(view === '2d' || view === '3d') && (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 9,
              height: 48, background: 'rgba(22,27,34,0.86)', backdropFilter: 'blur(6px)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 34,
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 11, color: THEME.frameDim, letterSpacing: 2, fontWeight: 700 }}>WAGON MODE</span>
              {MODE_LEGEND.map(({ mode, label }) => (
                <div key={mode} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 13, height: 13, borderRadius: '50%',
                    background: MODE_COLOR[mode], boxShadow: `0 0 8px ${MODE_COLOR[mode]}`,
                  }} />
                  <span style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 700, letterSpacing: 1.2 }}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
