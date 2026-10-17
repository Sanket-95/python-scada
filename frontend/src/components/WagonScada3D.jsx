import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture, Html } from '@react-three/drei';
import { CanvasTexture, RepeatWrapping, Color, FogExp2 } from 'three';
import { useWagonSimulation } from '../hooks/useWagonSimulation';
import { useTagSocket } from '../hooks/useTagSocket';
import { C } from '../config/scadaConfig';
import { useState, useEffect, useRef, Suspense, memo, useMemo, useCallback } from 'react';
import WagonScadaScreen from './WagonScadaScreen';
import ConfigPanel from './ConfigPanel';
import TankTagsPage from './TankTagsPage';
import WagonTagsPage from './WagonTagsPage';
import TagMonitorPage from './TagMonitorPage';
import StationInfoPage from './StationInfoPage';
import StationColumnConfigPage, { DEFAULT_STATION_COLS } from './StationColumnConfigPage';
import StationNamesConfigPage, { buildNamesArray } from './StationNamesConfigPage';
import GeneralConfigPage from './GeneralConfigPage';
import SettingsPage from './SettingsPage';
import TankPartitionConfigPage from './TankPartitionConfigPage';
import CrossTrolleyConfigPage from './CrossTrolleyConfigPage';
import AppBuilderPage from './AppBuilderPage';
import PlcConnectionTestPage from './PlcConnectionTestPage';
import DbConnectionTestPage from './DbConnectionTestPage';
import {
  loadPageSelection, savePageSelection,
  loadPageSelectionFromServer, pruneToCatalog, isPageEnabled,
} from '../config/pageSelection';
import { isRunningInsideExe } from '../config/runtimeInfo';
import { getTankTags, getWagonTags, getStationParams, getStationLoadNumbers, getStationExtraCols, getStationExtraValues, getStationColumnOrder, getWagonPartNumberTags, getStationParamKinds, paramKindColId } from '../config/tagConfig';
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
const _lblCache = new Map();
function getLabelTex(text, color) {
  const key = `${text}|${color}`;
  if (_lblCache.has(key)) return _lblCache.get(key);
  const W = 128, H = 44;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  // Solid black tag with a color-coded border — matches the reference SCADA
  // screen's black ID plates (white text), while the border keeps tank
  // labels (amber) visually distinct from wagon labels (cyan).
  ctx.fillStyle = 'rgba(2,2,2,0.96)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${text.length > 4 ? 17 : 20}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);
  const tex = new CanvasTexture(cv);
  _lblCache.set(key, tex);
  return tex;
}
function Label3D({ text, offsetY, color = '#FFB300', scaleX = 0.068 }) {
  const tex = getLabelTex(text, color);
  return (
    <sprite position={[0, offsetY, 0]} scale={[scaleX, 0.024, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} sizeAttenuation={false} />
    </sprite>
  );
}

// ── Coordinate mapping ────────────────────────────────────────────────────────
const SPACING = 1.05;
const Z1 = 0;
const Z2 = 3.4;
const TRACK_Z_LIST = [Z1, Z2, 6.8, 10.2];   // Z positions for up to 4 production lines
const mapX  = px  => (px - 140) / 47 * SPACING;
const trkZ  = idx => TRACK_Z_LIST[idx] ?? TRACK_Z_LIST[TRACK_Z_LIST.length - 1];
const SKY   = '#0A1628';                      // dark industrial sky — objects read clearly

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
const YELLOW = <meshStandardMaterial color="#FFB300" roughness={0.2} metalness={0.5} />;
const ORANGE = <meshStandardMaterial color="#E87820" roughness={0.4} metalness={0.2} />;
const NAVY   = <meshStandardMaterial color="#6A7E92" roughness={0.5} metalness={0.3} />;
const STEEL  = <meshStandardMaterial color="#8A9CAE" roughness={0.3} metalness={0.7} />;
const RED    = <meshStandardMaterial color="#B71C1C" roughness={0.35} metalness={0.45} />;
const GOLD   = <meshStandardMaterial color="#C9A227" roughness={0.35} metalness={0.5} />;
const GRAY_PANEL = <meshStandardMaterial color="#5A6472" roughness={0.45} metalness={0.4} />;

// Wagon mode LED (Wagon Tags page's Auto/Manual/Service tags) — color,
// label suffix, and legend text shown in the main screen's legend bar.
const MODE_COLOR  = { auto: '#2ECC40', manual: '#FF8C00', service: '#2196F3' };
const MODE_SUFFIX = { auto: 'A', manual: 'M', service: 'S' };
const MODE_LEGEND = [
  { mode: 'auto',    label: 'AUTO' },
  { mode: 'manual',  label: 'MANUAL' },
  { mode: 'service', label: 'SERVICE' },
];

// Station parameter display scaling — the PLC stores these as scaled raw
// integers, not engineering units (see stationParamValues below).
const PARAM_SCALE = { 'Actual PH': 1 / 100 }; // Temperature removed — PLC already sends the calculated value

// Reference plating-line screens (see 3dview.webp) run each tank in a different
// vivid process color rather than one uniform blue — purely a cosmetic swap,
// cycled by the tank's position along its line; fillLevel/hasLoad/isActive
// still drive the geometry exactly as before.
const TANK_PALETTE = [
  { fill: '#0E6A9A', emissive: '#0A4A70' }, // blue
  { fill: '#C2185B', emissive: '#7A0F3A' }, // magenta / pink
  { fill: '#7B1FA2', emissive: '#4A1064' }, // purple
  { fill: '#00897B', emissive: '#00564A' }, // teal
  { fill: '#558B2F', emissive: '#33540F' }, // green
  { fill: '#AFB42B', emissive: '#6B6E14' }, // olive / lime
];

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

// Shared per-station fill/load geometry — used by both a solo Tank3D and a
// chamber inside a merged TankGroup3D, so the two stay visually consistent.
function tankFillGeometry(st, loadType) {
  const innerH = D.tankH - 0.10;
  const chemH  = innerH * Math.max(0.08, st.fillLevel / 100 * 0.72);
  const chemY  = -D.tankH / 2 + 0.05 + chemH / 2;
  const loadItemY = loadType === 'basket'
    ? -D.tankH / 2 + 0.05 + BASKET_H / 2   // upright cylinder
    : -D.tankH / 2 + 0.05 + BARREL_R;       // barrel / rack (horizontal)
  return { chemH, chemY, loadItemY };
}

// Continuously spins its children — used for the load item inside a tank
// and the load a wagon carries, so they read as distinct, moving objects
// rather than a static prop sitting in the scene. axis='y' (default, used
// for the upright basket/rack) spins like a turntable; axis='z' (used for
// the barrel — see Barrel3D, whose cylinder is rotated so its length runs
// along local Z, the depth axis facing the camera) spins the barrel around
// its own horizontal centerline instead, front-loading-washing-machine
// style — fixes the barrel visibly orbiting end-over-end instead of truly
// spinning on request.
function RotatingGroup({ speed = 0.8, axis = 'y', children, ...props }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation[axis] += speed * dt;
  });
  return <group ref={ref} {...props}>{children}</group>;
}

// ── Tank ─ transparent open-top walls, chemical, barrel inside ────────────────
// memo: skips re-render unless hasLoad / isActive / fillLevel changes
const Tank3D = memo(function Tank3D({ st, z, loadType = 'barrel', idx = 0, tankW = D.tankW, tankTags = {}, stationParamValues = {}, onHover }) {
  const x    = mapX(st.x);
  const chem = TANK_PALETTE[idx % TANK_PALETTE.length];
  const { chemH, chemY, loadItemY } = tankFillGeometry(st, loadType);

  const hw = tankW / 2, hh = D.tankH / 2, hd = D.tankD / 2;
  const wallColor = st.isActive ? '#BDDAEA' : '#C8D4E0';
  const wallEmit  = st.isActive ? '#006EA0' : '#000';
  const wallEmitI = st.isActive ? 0.10 : 0;

  // The configured station name (Tank Tags page's own "label" field) —
  // falls back to the plain tank number if that tag hasn't been named yet
  // — plus any live station parameters (Station Info page's flexible
  // label/address/type/unit list), one line each, e.g. "Actual Temp: 42.3 °C".
  const tooltipName = tankTags[st.id]?.label || st.label;
  const tooltipLines = [tooltipName, ...(stationParamValues[st.id] || []).map(p => `${p.label}: ${p.value}${p.unit ? ' ' + p.unit : ''}`)];
  const tooltipY    = (2 * hh + TANK_LEG_H) + 0.6; // just above the always-visible number label
  const handlePointerOver = e => { e.stopPropagation(); onHover?.({ x, y: tooltipY, z, lines: tooltipLines }); };
  const handlePointerOut  = e => { e.stopPropagation(); onHover?.(null); };

  return (
    <group position={[x, hh + TANK_LEG_H, z]}>
      {/* Invisible full-footprint hitbox — a single solid volume for hover
          detection, so the tooltip doesn't flicker as the pointer crosses
          the gaps between the thin wall/post/leg meshes below */}
      <mesh onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
        <boxGeometry args={[tankW, D.tankH, D.tankD]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 4 support legs — hold the tank clear of the ground */}
      {[[-1,-1],[-1,1],[1,-1],[1,1]].map(([sx,sz], i) => (
        <mesh key={i} position={[sx * hw * 0.85, -hh - TANK_LEG_H / 2, sz * hd * 0.85]}>
          <boxGeometry args={[TANK_LEG_S, TANK_LEG_H, TANK_LEG_S]} />{STEEL}
        </mesh>
      ))}

      {/* Dark floor — solid base gives contrast for barrel/basket inside */}
      <mesh position={[0, -hh + 0.01, 0]}>
        <boxGeometry args={[tankW - 0.04, 0.04, D.tankD - 0.04]} />
        <meshStandardMaterial color="#060A10" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Dark inner back wall — deepens the interior shadow effect */}
      <mesh position={[0, 0, -hd + 0.012]} rotation={[0, 0, 0]}>
        <planeGeometry args={[tankW - 0.04, D.tankH - 0.04]} />
        <meshStandardMaterial color="#04080E" roughness={0.9} side={2} />
      </mesh>

      {/* Chemical fill — more saturated so it reads against dark floor */}
      <mesh position={[0, chemY, 0]}>
        <boxGeometry args={[tankW - 0.08, chemH, D.tankD - 0.08]} />
        <meshStandardMaterial color={chem.fill} transparent opacity={0.58}
          roughness={0.05} depthWrite={false}
          emissive={chem.emissive} emissiveIntensity={0.30} />
      </mesh>

      {/* Load item inside tank — type matches the line's load type, scaled
          up so it still reads clearly from a distance through the wall, and
          continuously rotating so it reads as a distinct moving object */}
      {st.hasLoad && (
        <RotatingGroup position={[0, loadItemY, 0]} scale={[1.4, 1.4, 1.4]} axis={loadType === 'barrel' ? 'z' : 'y'}>
          <Load3D type={loadType} shade />
        </RotatingGroup>
      )}

      {/* 4 transparent walls — no top face (open from top) */}
      {[
        { p: [0, 0,  hd], r: [0, 0,          0], w: tankW, h: D.tankH },
        { p: [0, 0, -hd], r: [0, Math.PI,     0], w: tankW, h: D.tankH },
        { p: [-hw, 0, 0], r: [0, -Math.PI / 2, 0], w: D.tankD, h: D.tankH },
        { p: [ hw, 0, 0], r: [0,  Math.PI / 2, 0], w: D.tankD, h: D.tankH },
      ].map(({ p, r, w, h }, i) => (
        <mesh key={i} position={p} rotation={r} renderOrder={1}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial
            color={wallColor} transparent opacity={0.18}
            roughness={0.04} side={2} depthWrite={false}
            emissive={wallEmit} emissiveIntensity={wallEmitI}
          />
        </mesh>
      ))}

      {/* 4 corner posts — yellow with stronger glow */}
      {[[-1,-1],[-1,1],[1,-1],[1,1]].map(([sx,sz], i) => (
        <mesh key={i} position={[sx * hw, 0, sz * hd]}>
          <boxGeometry args={[0.026, D.tankH, 0.026]} />
          <meshStandardMaterial color="#FFB300" roughness={0.20} metalness={0.55}
            emissive="#FF8800" emissiveIntensity={0.45} />
        </mesh>
      ))}

      {/* Yellow square top frame — 4 perimeter bars only (no cross through middle) */}
      {/* Front & back bars */}
      {[hd, -hd].map((z, i) => (
        <mesh key={i} position={[0, hh, z]}>
          <boxGeometry args={[tankW + 0.03, 0.030, 0.030]} />
          <meshStandardMaterial color="#FFB300" roughness={0.18} metalness={0.55}
            emissive="#FF8800" emissiveIntensity={0.50} />
        </mesh>
      ))}
      {/* Left & right bars */}
      {[-hw, hw].map((x, i) => (
        <mesh key={i} position={[x, hh, 0]}>
          <boxGeometry args={[0.030, 0.030, D.tankD - 0.026]} />
          <meshStandardMaterial color="#FFB300" roughness={0.18} metalness={0.55}
            emissive="#FF8800" emissiveIntensity={0.50} />
        </mesh>
      ))}

      <Label3D text={st.label} offsetY={hh + 0.24} />
    </group>
  );
}, (a, b) =>
  a.st.hasLoad   === b.st.hasLoad   &&
  a.st.isActive  === b.st.isActive  &&
  a.st.fillLevel === b.st.fillLevel &&
  a.z            === b.z            &&
  a.loadType     === b.loadType     &&
  a.idx          === b.idx          &&
  a.tankTags[a.st.id]?.label === b.tankTags[b.st.id]?.label &&
  a.stationParamValues?.[a.st.id] === b.stationParamValues?.[b.st.id]
);

// ── Tank group ─ several adjacent tanks merged into one partitioned shell ─────
// One continuous outer shell (floor, back wall, glass sides, top frame) spans
// the full run; each original station still gets its own chemical fill, load
// item, and number-plate label at its own position, separated by a thin
// opaque divider — station data / fillLevel / hasLoad / isActive are read
// exactly as before, only the outer housing is drawn differently.
function TankGroup3D({ stations, z, loadType = 'barrel', tankW = D.tankW, tankTags = {}, stationParamValues = {}, onHover }) {
  const hh = D.tankH / 2, hd = D.tankD / 2;
  const xs = stations.map(st => mapX(st.x));
  // Actual 3D gap between this group's own tanks — must track their real
  // tank-to-tank spacing (which now varies with overall tank count) rather
  // than the fixed SPACING constant, so the shell and its chamber dividers
  // line up with where the tanks actually render.
  const gap3D    = xs.length > 1 ? xs[1] - xs[0] : tankW + 0.1;
  const shellX1  = xs[0] - gap3D / 2;
  const shellX2  = xs[xs.length - 1] + gap3D / 2;
  const shellW   = shellX2 - shellX1;
  const cx       = (shellX1 + shellX2) / 2;
  const hw       = shellW / 2;
  const chamberW = gap3D - 0.06; // leaves room for the divider on each side

  return (
    <group position={[cx, hh + TANK_LEG_H, z]}>
      {/* Support legs — one pair per chamber (plus the two outer corners),
          so a long merged shell still reads as resting on a leg row rather
          than floating or sitting flush on the ground. */}
      {xs.map((lx, i) => (
        <group key={i}>
          {[-1, 1].map(sz => (
            <mesh key={sz} position={[lx - cx, -hh - TANK_LEG_H / 2, sz * hd * 0.85]}>
              <boxGeometry args={[TANK_LEG_S, TANK_LEG_H, TANK_LEG_S]} />{STEEL}
            </mesh>
          ))}
        </group>
      ))}

      {/* Dark floor spanning the whole shell */}
      <mesh position={[0, -hh + 0.01, 0]}>
        <boxGeometry args={[shellW - 0.04, 0.04, D.tankD - 0.04]} />
        <meshStandardMaterial color="#060A10" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Dark inner back wall */}
      <mesh position={[0, 0, -hd + 0.012]}>
        <planeGeometry args={[shellW - 0.04, D.tankH - 0.04]} />
        <meshStandardMaterial color="#04080E" roughness={0.9} side={2} />
      </mesh>

      {/* Per-chamber chemical fill + load item + number label */}
      {stations.map((st, i) => {
        const localX = xs[i] - cx;
        const { chemH, chemY, loadItemY } = tankFillGeometry(st, loadType);
        const chem = TANK_PALETTE[i % TANK_PALETTE.length];
        const tooltipName = tankTags[st.id]?.label || st.label;
        const tooltipLines = [tooltipName, ...(stationParamValues[st.id] || []).map(p => `${p.label}: ${p.value}${p.unit ? ' ' + p.unit : ''}`)];
        const worldX = cx + localX;
        const worldY = (hh + TANK_LEG_H) + hh + 0.6; // same offset as a solo Tank3D's tooltip
        const handlePointerOver = e => { e.stopPropagation(); onHover?.({ x: worldX, y: worldY, z, lines: tooltipLines }); };
        const handlePointerOut  = e => { e.stopPropagation(); onHover?.(null); };
        return (
          <group key={st.id} position={[localX, 0, 0]}>
            {/* Invisible per-chamber hitbox — same flicker-avoidance as a
                solo Tank3D, scoped to just this chamber's own width */}
            <mesh onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
              <boxGeometry args={[chamberW, D.tankH, D.tankD]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh position={[0, chemY, 0]}>
              <boxGeometry args={[chamberW - 0.06, chemH, D.tankD - 0.08]} />
              <meshStandardMaterial color={chem.fill} transparent opacity={0.58}
                roughness={0.05} depthWrite={false}
                emissive={chem.emissive} emissiveIntensity={st.isActive ? 0.55 : 0.30} />
            </mesh>
            {st.hasLoad && (
              <RotatingGroup position={[0, loadItemY, 0]} scale={[1.4, 1.4, 1.4]} axis={loadType === 'barrel' ? 'z' : 'y'}>
                <Load3D type={loadType} shade />
              </RotatingGroup>
            )}
            <Label3D text={st.label} offsetY={hh + 0.24} />
          </group>
        );
      })}

      {/* Internal partition dividers between chambers */}
      {stations.slice(1).map((st, i) => (
        <mesh key={st.id} position={[(xs[i] + xs[i + 1]) / 2 - cx, 0, 0]}>
          <boxGeometry args={[0.035, D.tankH - 0.05, D.tankD - 0.05]} />
          <meshStandardMaterial color="#3A4552" roughness={0.4} metalness={0.4} />
        </mesh>
      ))}

      {/* 4 transparent outer walls spanning the whole shell — no top face */}
      {[
        { p: [0, 0,  hd], r: [0, 0,          0], w: shellW,   h: D.tankH },
        { p: [0, 0, -hd], r: [0, Math.PI,     0], w: shellW,   h: D.tankH },
        { p: [-hw, 0, 0], r: [0, -Math.PI / 2, 0], w: D.tankD, h: D.tankH },
        { p: [ hw, 0, 0], r: [0,  Math.PI / 2, 0], w: D.tankD, h: D.tankH },
      ].map(({ p, r, w, h }, i) => (
        <mesh key={i} position={p} rotation={r} renderOrder={1}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial
            color="#C8D4E0" transparent opacity={0.18}
            roughness={0.04} side={2} depthWrite={false}
          />
        </mesh>
      ))}

      {/* Outer corner posts — 4 total for the whole shell, not per chamber */}
      {[[-1,-1],[-1,1],[1,-1],[1,1]].map(([sx,sz], i) => (
        <mesh key={i} position={[sx * hw, 0, sz * hd]}>
          <boxGeometry args={[0.026, D.tankH, 0.026]} />
          <meshStandardMaterial color="#FFB300" roughness={0.20} metalness={0.55}
            emissive="#FF8800" emissiveIntensity={0.45} />
        </mesh>
      ))}

      {/* Perimeter top frame */}
      {[hd, -hd].map((zp, i) => (
        <mesh key={i} position={[0, hh, zp]}>
          <boxGeometry args={[shellW + 0.03, 0.030, 0.030]} />
          <meshStandardMaterial color="#FFB300" roughness={0.18} metalness={0.55}
            emissive="#FF8800" emissiveIntensity={0.50} />
        </mesh>
      ))}
      {[-hw, hw].map((xp, i) => (
        <mesh key={i} position={[xp, hh, 0]}>
          <boxGeometry args={[0.030, 0.030, D.tankD - 0.026]} />
          <meshStandardMaterial color="#FFB300" roughness={0.18} metalness={0.55}
            emissive="#FF8800" emissiveIntensity={0.50} />
        </mesh>
      ))}
    </group>
  );
}

// ── Rail ──────────────────────────────────────────────────────────────────────
function Rail3D({ len: tankSpan, xStart = 0, z }) {
  const len = tankSpan + 4.4;
  const cx  = xStart - 2.2 + len / 2;
  return (
    <group>
      <mesh position={[cx, D.railY, z]}><boxGeometry args={[len, D.railH, D.railW]} />{STEEL}</mesh>
      <mesh position={[cx, D.railY + D.railH / 2 + 0.012, z]}>
        <boxGeometry args={[len, 0.024, D.railW * 0.65]} />
        <meshStandardMaterial color="#FFB300" roughness={0.2} metalness={0.5} emissive="#FF8C00" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

// ── Gantry portal — red truss frame with gold X-bracing (matches the plant's
// reference SCADA screen: red portal cranes with diagonal gold lattice near
// the top, on steel base plates) ─────────────────────────────────────────────
function GantryPortal3D({ x, z, h = 3.80 }) {
  const span   = 1.7;
  const legT   = 0.13;
  const braceH = 1.05;                                   // vertical span the X-brace covers
  const braceLen = Math.sqrt(span * span + braceH * braceH);
  const braceAngle = Math.atan2(span, braceH);
  const braceY = h - braceH / 2 - 0.10;
  return (
    <group position={[x, 0, z]}>
      {/* Main legs */}
      {[-1, 1].map(s => (
        <mesh key={s} position={[0, h / 2, s * span / 2]}>
          <boxGeometry args={[legT, h, legT]} />{RED}
        </mesh>
      ))}
      {/* Top beam */}
      <mesh position={[0, h, 0]}><boxGeometry args={[legT, legT, span + legT]} />{RED}</mesh>
      {/* Gold diagonal X-bracing between the legs, near the top */}
      <mesh position={[0, braceY, 0]} rotation={[braceAngle, 0, 0]}>
        <boxGeometry args={[0.05, braceLen, 0.05]} />{GOLD}
      </mesh>
      <mesh position={[0, braceY, 0]} rotation={[-braceAngle, 0, 0]}>
        <boxGeometry args={[0.05, braceLen, 0.05]} />{GOLD}
      </mesh>
      {/* Steel base plates */}
      {[-1, 1].map(s => (
        <mesh key={s} position={[0, 0.03, s * span / 2]}>
          <boxGeometry args={[0.30, 0.06, 0.30]} />{STEEL}
        </mesh>
      ))}
    </group>
  );
}

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

// ── Wagon — two Z-side arms, load at mid-wagon during transit ────────────────
function Wagon3D({ wagon, z, loadType = 'barrel' }) {
  const x     = mapX(wagon.x);
  const hasLd = wagon.loadPercent > 0;   // barrel visible for full dip/lift cycle
  const isArm = wagon.armExtension > 0.02;
  const led   = C.statusColors[wagon.status] || '#546E7A';
  const legCY = D.bodyY - D.bodyH / 2 - D.legH / 2;

  const modeColor  = wagon.mode && MODE_COLOR[wagon.mode];
  const blinkOn     = Math.floor(Date.now() / 450) % 2 === 0; // ~450ms blink period
  const labelText   = `W-${wagon.id}` + (wagon.mode ? `-${MODE_SUFFIX[wagon.mode]}` : '');

  // Arms: full extension when dipping; fixed length so barrel sits at mid-wagon during transit
  const armLen     = isArm ? wagon.armExtension * D.maxArm : (hasLd ? ARM_TOP_Y - BARREL_TRANSIT_Y : 0);
  const armBotY    = ARM_TOP_Y - armLen;
  const armMidY    = ARM_TOP_Y - armLen / 2;
  const showArm    = armLen > 0.01;
  const armZ       = BARREL_L / 2;

  return (
    <group position={[x, 0, z]}>
      {/* 4 suspension legs */}
      {[[-1,-1],[-1,1],[1,-1],[1,1]].map(([sx,sz], i) => (
        <mesh key={i} position={[sx * D.bodyW * 0.39, legCY, sz * D.bodyD * 0.34]}>
          <boxGeometry args={[D.legS, D.legH, D.legS]} />{YELLOW}
        </mesh>
      ))}
      {/* Rail clamp */}
      <mesh position={[0, D.railY, 0]}>
        <boxGeometry args={[D.bodyW * 0.84, D.railH + 0.07, D.railW + 0.10]} />{YELLOW}
      </mesh>
      {/* Body base (dark) */}
      <mesh position={[0, D.bodyY - D.bodyH * 0.10, 0]}>
        <boxGeometry args={[D.bodyW, D.bodyH * 0.75, D.bodyD]} />{NAVY}
      </mesh>
      {/* Hazard stripe band — yellow/black diagonal, standard construction style */}
      <mesh position={[0, D.bodyY + D.bodyH * 0.32, 0]}>
        <boxGeometry args={[D.bodyW + 0.004, D.bodyH * 0.32, D.bodyD + 0.004]} />
        <meshStandardMaterial map={hazardTex()} roughness={0.65} metalness={0.08} />
      </mesh>
      {/* Status LED */}
      <mesh position={[D.bodyW / 2 - 0.10, D.bodyY + 0.09, D.bodyD / 2 + 0.012]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.040, 0.040, 0.013, 8]} />
        <meshStandardMaterial color={led} emissive={led} emissiveIntensity={2.2} roughness={0.1} />
      </mesh>
      {/* Wagon work light — illuminates nearby tanks, follows wagon movement */}
      <pointLight position={[0, D.bodyY - D.bodyH, 0]} color={led} intensity={1.4} distance={5.5} decay={2} />

      {/* Mode indicator — gray mounting panel on the wagon's top side with a
          blinking LED colored by its active Auto/Manual/Service tag (Wagon
          Tags page's "WAGON MODE TAG CONFIGURATION" section). Dim/unlit
          when no mode tag has reported yet. */}
      <mesh position={[0, D.railY + 0.095, 0]}>
        <boxGeometry args={[0.10, 0.03, 0.10]} />{GRAY_PANEL}
      </mesh>
      <mesh position={[0, D.railY + 0.117, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.022, 10]} />
        <meshStandardMaterial
          color={modeColor || '#3A4248'}
          emissive={modeColor || '#000000'}
          emissiveIntensity={modeColor ? (blinkOn ? 2.6 : 0.25) : 0}
          roughness={0.2}
        />
      </mesh>

      <Label3D text={labelText} offsetY={D.bodyY + D.bodyH / 2 + 0.28} color="#00C8FF" scaleX={0.078} />

      {/* Arm + load — style depends on load type */}
      {showArm && loadType === 'basket' ? (
        // ── 3-finger claw gripper for cylindrical basket ─────────────────────
        (() => {
          // Fingers attach at a collar just below the arm; basket hangs inside
          const collarY    = armBotY + 0.08;
          const basketCY   = collarY - BASKET_H / 2 - 0.02; // basket centre
          const GRIP_R     = BASKET_R + 0.04;                // finger reach radius
          const PRONG_LEN  = BASKET_H * 0.60;                // finger height
          const prongMidY  = collarY - PRONG_LEN / 2;
          // Three.js Ry(θ): local +X → world [cos θ, 0, −sin θ]
          // To aim at world direction [sin rad, 0, cos rad] → ry = rad − π/2
          const ANGLES = [0, 2 * Math.PI / 3, 4 * Math.PI / 3];
          return (
            <>
              {/* Central rod */}
              <mesh position={[0, armMidY, 0]}>
                <cylinderGeometry args={[0.016, 0.016, armLen, 8]} />
                {STEEL}
              </mesh>
              {/* Collar ring */}
              <mesh position={[0, collarY, 0]}>
                <cylinderGeometry args={[0.036, 0.036, 0.020, 10]} />
                {STEEL}
              </mesh>
              {/* 3 fingers: horizontal reach + vertical prong */}
              {ANGLES.map((rad, i) => {
                const fx = Math.sin(rad) * GRIP_R;
                const fz = Math.cos(rad) * GRIP_R;
                const ry = rad - Math.PI / 2;
                return (
                  <group key={i}>
                    {/* Horizontal reach arm from collar centre */}
                    <mesh position={[fx / 2, collarY, fz / 2]} rotation={[0, ry, 0]}>
                      <boxGeometry args={[GRIP_R, 0.013, 0.013]} />
                      {STEEL}
                    </mesh>
                    {/* Vertical prong going down beside basket wall */}
                    <mesh position={[fx, prongMidY, fz]}>
                      <boxGeometry args={[0.013, PRONG_LEN, 0.013]} />
                      {STEEL}
                    </mesh>
                  </group>
                );
              })}
              {/* Basket hanging inside the claw — scaled up so a carried
                  load reads clearly against the wagon, without touching the
                  shared Load3D/Basket3D geometry used elsewhere (tanks), and
                  continuously rotating. */}
              <RotatingGroup position={[0, basketCY, 0]} scale={[1.5, 1.5, 1.5]}>
                <Load3D type="basket" shade={false} />
              </RotatingGroup>
            </>
          );
        })()
      ) : showArm ? (
        // ── Standard 2-arm spreader for barrel / rack ────────────────────────
        <>
          {/* Spreader beam at arm tops */}
          <mesh position={[0, ARM_TOP_Y, 0]}>
            <boxGeometry args={[0.034, 0.034, BARREL_L + 0.10]} />{STEEL}
          </mesh>
          {/* Left arm */}
          <mesh position={[0, armMidY,  armZ]}>
            <boxGeometry args={[0.020, armLen, 0.020]} />{STEEL}
          </mesh>
          {/* Right arm */}
          <mesh position={[0, armMidY, -armZ]}>
            <boxGeometry args={[0.020, armLen, 0.020]} />{STEEL}
          </mesh>
          {/* Load (barrel / rack) — scaled up so a carried load reads
              clearly against the wagon, without touching the shared
              Load3D/Barrel3D geometry used elsewhere (tanks), and
              continuously rotating. */}
          <RotatingGroup position={[0, armBotY, 0]} scale={[1.5, 1.5, 1.5]} axis={loadType === 'barrel' ? 'z' : 'y'}>
            <Load3D type={loadType} shade={false} />
          </RotatingGroup>
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
        background: active ? '#1565C0' : '#F0F2F6',
        border: `1px solid ${active ? '#1565C0' : '#C4C8D4'}`,
        borderRadius: 5, color: active ? '#FFFFFF' : '#3A4F6A',
        fontSize: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none', WebkitUserSelect: 'none',
        transition: 'background 0.08s, border-color 0.08s, color 0.08s',
        boxShadow: active ? '0 0 8px #1565C044' : 'none',
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
        <meshStandardMaterial color="#B71C1C" roughness={0.35} metalness={0.4}
          emissive="#600000" emissiveIntensity={0.25} />
      </mesh>
      <group position={[midX, 0, midZ]}>
        <Label3D text="X-TROLLEY" offsetY={y + 0.34} color="#FFD740" scaleX={0.11} />
      </group>
    </group>
  );
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
      {/* Ambient: free uniform fill — no shadow pass, zero lag */}
      <ambientLight intensity={2.2} color="#D0DCF0" />
      {/* Hemisphere: sky-to-ground gradient, also free */}
      <hemisphereLight args={['#4A7ACC', '#1A3050', 1.2]} />
      {/* Key light: no castShadow → single render pass, no shadow map cost */}
      <directionalLight position={[cx, 20, 14]} intensity={0.9} color="#FFFFFF" />
      {/* Soft fill from opposite side for depth */}
      <directionalLight position={[-6, 8, -8]} intensity={0.35} color="#7AAAD8" />

      {/* Concrete floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} >
        <planeGeometry args={[groundW + 60, groundZ + 30]} />
        <meshStandardMaterial color="#B0B4AE" roughness={0.92} metalness={0.0} />
      </mesh>
      {/* Slightly darker aisle strips under each rail line */}
      {tracks.map((_, idx) => (
        <mesh key={idx} rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.001, trkZ(idx)]} >
          <planeGeometry args={[groundW, 2.2]} />
          <meshStandardMaterial color="#989890" roughness={0.95} />
        </mesh>
      ))}

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
            <Rail3D len={tLen} xStart={xStart} z={z} />
            <GantryPortal3D x={xStart - 2.4} z={z} />
            <GantryPortal3D x={xStart + tLen + 2.0} z={z} />
            {sCount > 18 && <GantryPortal3D x={xStart + tLen / 2} z={z} />}
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
        minDistance={4} maxDistance={40}
        minPolarAngle={0.28}
        maxPolarAngle={Math.PI * 82 / 180}
        minAzimuthAngle={-Math.PI / 2}
        maxAzimuthAngle={ Math.PI / 2}
      />
      <CameraController controlsRef={controlsRef} extKeysRef={extKeysRef} />

      {/* Single shared hover tooltip — one Html mount at a time, not one
          per tank, however many tanks exist */}
      {hovered && (
        <Html position={[hovered.x, hovered.y, hovered.z]} center
          style={{ pointerEvents: 'none' }} distanceFactor={8} zIndexRange={[100, 0]}
        >
          <div style={{
            background: 'rgba(10,20,34,0.92)', color: '#FFD740',
            border: '2px solid #FFB300', borderRadius: 8,
            padding: '10px 18px', fontSize: 19, fontWeight: 700,
            fontFamily: "'Segoe UI', system-ui, monospace", whiteSpace: 'nowrap',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)', transform: 'translateY(-14px)',
          }}>
            {hovered.lines.map((line, i) => (
              <div key={i} style={i > 0 ? { fontSize: 16, fontWeight: 600, color: '#B9D6E8', marginTop: 4 } : undefined}>
                {line}
              </div>
            ))}
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
        camera={{ position: [camX, 20, 24], fov: 48, near: 0.1, far: 500 }}
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
        position: 'absolute', bottom: 88, right: 24, zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
          <DPadBtn label="＋" dir="zoomIn"  extKeysRef={extKeysRef} />
          <div style={{ padding: '0 8px', fontSize: 8, color: '#8090A8', letterSpacing: 1, fontFamily: 'monospace' }}>ZOOM</div>
          <DPadBtn label="－" dir="zoomOut" extKeysRef={extKeysRef} />
        </div>
        <div style={{ width: 126, height: 1, background: '#C4C8D4' }} />
        <DPadBtn label="▲" dir="up"    extKeysRef={extKeysRef} />
        <div style={{ display: 'flex', gap: 3 }}>
          <DPadBtn label="◀" dir="left"  extKeysRef={extKeysRef} />
          <div style={{
            width: 40, height: 40, borderRadius: 5,
            background: '#E8EBF4', border: '1px solid #C4C8D4',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8090A8', fontSize: 14,
          }}>⊕</div>
          <DPadBtn label="▶" dir="right" extKeysRef={extKeysRef} />
        </div>
        <DPadBtn label="▼" dir="down"  extKeysRef={extKeysRef} />
        <div style={{ marginTop: 2, fontSize: 8, color: '#8090A8', letterSpacing: 1, fontFamily: 'monospace' }}>ORBIT</div>
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
            fontSize: 20, fontWeight: 900, color: '#1A2035', letterSpacing: 0.5,
            whiteSpace: 'nowrap', fontFamily: 'Arial, Helvetica, sans-serif',
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
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 4, flexShrink: 0,
      background: '#F0F2F6', border: '1px solid #C4C8D4',
      cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
    }}>
      {dot && (
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: dot,
          boxShadow: `0 0 5px ${dot}`, flexShrink: 0,
        }} />
      )}
      <span style={{ fontSize: 8.5, color: '#8090A8', letterSpacing: 1, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color: valueColor || '#1A2035' }}>{value}</span>
    </div>
  );
}

// ── Sidebar navigation ────────────────────────────────────────────────────────
const NAV = [
  { type: 'sep', label: 'VIEWS' },
  { id: '3d',            icon: '⬡', label: '3D View'       },
  { id: '2d',            icon: '▦', label: '2D View'       },
  { id: 'settings',      icon: '☰', label: 'Settings'      },
  { type: 'sep', label: 'MONITOR' },
  { id: 'station-info',  icon: '⊡', label: 'StationWise Info' },
  { id: 'tags',          icon: '◉', label: 'Tag Monitor'   },
  // Sequence requested: System Config, Tank Partitions, Cross Trolley,
  // Wagon Location Tags, Mimic Page Config, Station Info — labels renamed
  // to match what each page actually configures (was e.g. "Tank Tags" for
  // the Mimic Page Config screen, "Stn. Names" for Station Info), since the
  // mismatch between sidebar label and page title was the main source of
  // "settings feel scattered". Col. Config / General Config aren't part of
  // that requested set — kept, just appended after it.
  // depth: 1 = child of the group heading above; depth: 2 = child of Mimic
  // Config specifically (the nearest depth-1 item above it).
  { type: 'sep', label: 'MIMIC SCREEN CONFIGURATION' },
  { id: 'general-config', icon: '⚑', label: 'General Config',             depth: 1 },
  { id: 'config',         icon: '⚙', label: 'Mimic Config',                depth: 1 },
  { id: 'tags-config',    icon: '⊞', label: 'Mimic Station Config',         depth: 2 },
  { id: 'tank-partitions',icon: '▥', label: 'Tank Partitions',             depth: 2 },
  { id: 'cross-trolley',  icon: '⇄', label: 'Cross Trolley',               depth: 2 },
  { id: 'wagon-tags',     icon: '⊟', label: 'Wagon Location Tags',         depth: 2 },
  { id: 'station-names',  icon: '✎', label: 'Station Info',               depth: 2 },
  { type: 'sep', label: 'STATION COLUMNS' },
  { id: 'station-cols',   icon: '≡', label: 'StationWise Info Config' },
  { type: 'sep', label: 'DIAGNOSTICS' },
  { id: 'plc-test',      icon: '⚡', label: 'PLC Connection Test' },
  { id: 'db-test',       icon: '🗄', label: 'Database Connection Test' },
  { type: 'sep', label: 'DEPLOY' },
  { id: 'app-builder',   icon: '⧉', label: 'App Builder', devOnly: true },
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
  let pendingSep = null;
  let sepHasItems = false;
  for (const item of nav) {
    if (item.type === 'sep') {
      if (pendingSep && sepHasItems) kept.push(pendingSep);
      pendingSep = item;
      sepHasItems = false;
      continue;
    }
    if (item.devOnly && isFrozen) continue;
    if (isPageEnabled(selection, `nav:${item.id}`)) {
      kept.push(item);
      sepHasItems = true;
    }
  }
  if (pendingSep && sepHasItems) kept.push(pendingSep);
  return kept;
}

const Sidebar = memo(function Sidebar({ view, navigate, expanded, onToggle, nav }) {
  const FULL = 220, ICON = 52, HIDE = FULL - ICON;
  return (
    <div style={{ width: ICON, minWidth: ICON, flexShrink: 0, position: 'relative', zIndex: 50 }}>
      {/* When collapsed: invisible overlay makes the whole 64px column clickable to reopen */}
      {!expanded && (
        <div onClick={onToggle} style={{
          position: 'absolute', inset: 0, zIndex: 51, cursor: 'pointer',
        }} />
      )}
      {/* 220 px panel — GPU clip-path animates, zero layout impact */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: FULL,
        background: '#FFFFFF', borderRight: '1px solid #C4C8D4',
        display: 'flex', flexDirection: 'column',
        clipPath: expanded ? `inset(0 0 0 0)` : `inset(0 ${HIDE}px 0 0)`,
        transition: 'clip-path 0.24s cubic-bezier(0.4,0,0.2,1)',
        willChange: 'clip-path',
        boxShadow: expanded ? '4px 0 20px rgba(21,101,192,0.13)' : 'none',
      }}>
        {/* ── Logo header ───────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px',
          background: 'linear-gradient(145deg,#1255A8,#1565C0,#1976D2)',
          borderBottom: '2px solid #0D47A1', minHeight: 64, flexShrink: 0,
        }}>
          <svg width="38" height="38" viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
            <polygon points="26,2 47,13.5 47,38.5 26,50 5,38.5 5,13.5"
              fill="rgba(255,255,255,0.08)" stroke="rgba(255,210,80,0.55)" strokeWidth="1.4"/>
            <rect x="10" y="14" width="3.5" height="16" rx="1.5" fill="#64B5F6"/>
            <rect x="38.5" y="14" width="3.5" height="16" rx="1.5" fill="#64B5F6"/>
            <rect x="9" y="12" width="34" height="4" rx="2" fill="#FF9800"/>
            <rect x="11" y="12.5" width="28" height="1.5" rx="0.75" fill="rgba(255,255,255,0.35)"/>
            <line x1="26" y1="16" x2="26" y2="25" stroke="#FFD740" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="1.5 2"/>
            <circle cx="26" cy="26.5" r="2.2" fill="#FFD740" stroke="#F9A825" strokeWidth="1"/>
            <rect x="13" y="28" width="26" height="11" rx="3" fill="#ECEFF1" stroke="#B0BEC5" strokeWidth="0.8"/>
            <rect x="16" y="30" width="20" height="5.5" rx="2" fill="#29B6F6"/>
            <rect x="17.5" y="30.8" width="15" height="1.5" rx="0.75" fill="rgba(255,255,255,0.45)"/>
            <rect x="4" y="40" width="44" height="3" rx="1.5" fill="#90A4AE"/>
            <rect x="4" y="40" width="44" height="1" rx="0.5" fill="rgba(255,255,255,0.35)"/>
            <circle cx="18" cy="40" r="4.5" fill="#37474F" stroke="#FF9800" strokeWidth="2"/>
            <circle cx="18" cy="40" r="1.6" fill="#FF9800"/>
            <circle cx="34" cy="40" r="4.5" fill="#37474F" stroke="#FF9800" strokeWidth="2"/>
            <circle cx="34" cy="40" r="1.6" fill="#FF9800"/>
          </svg>
          {/* Text always rendered — clip-path hides it when collapsed */}
          <div style={{ minWidth: 0, flex: 1, opacity: expanded ? 1 : 0, transition: 'opacity 0.15s' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#FFFFFF', letterSpacing: 2, whiteSpace: 'nowrap', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>PROTOVEC</div>
            <div style={{ fontSize: 11, color: '#FFF176', letterSpacing: 2.5, whiteSpace: 'nowrap', fontWeight: 800, marginTop: 3, textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}>SCADA  v2.0</div>
          </div>
          <button onClick={onToggle} title="Toggle sidebar" style={{
            flexShrink: 0, width: 28, height: 28,
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 6, color: '#FFFFFF', cursor: 'pointer', fontSize: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, fontFamily: 'monospace', lineHeight: 1,
          }}>☰</button>
        </div>

        {/* ── Nav list — always fully rendered, clip controls visibility ── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 0' }}>
          {nav.map((item, i) => {
            if (item.type === 'sep') return (
              <div key={i} style={{
                padding: '12px 14px 4px', fontSize: 8.5, fontWeight: 700, letterSpacing: 2,
                color: '#8090A8', whiteSpace: 'nowrap', userSelect: 'none',
                opacity: expanded ? 1 : 0, transition: 'opacity 0.15s',
              }}>{item.label}</div>
            );
            const isActive = view === item.id;
            const depth = item.depth || 0; // 0 = top-level, 1 = group child, 2 = child of a depth-1 parent
            const leftPad = depth === 0 ? 10 : depth === 1 ? 22 : 34;
            const iconSize = depth === 0 ? 20 : depth === 1 ? 15 : 13;
            const iconWidth = depth === 0 ? 22 : depth === 1 ? 17 : 15;
            const textSize = depth === 0 ? 12 : depth === 1 ? 11.5 : 11;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                title={item.label}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: `${depth === 0 ? 8 : 7}px 10px 7px ${leftPad}px`,
                  background: isActive ? '#EEF4FF' : 'transparent',
                  border: 'none', borderLeft: isActive ? '3px solid #1565C0' : '3px solid transparent',
                  cursor: 'pointer', fontFamily: "'Segoe UI', system-ui, monospace",
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F4F5FA'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: iconSize, fontWeight: 700, width: iconWidth, textAlign: 'center', color: isActive ? '#1565C0' : '#3A4652', flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
                <span style={{
                  fontSize: textSize, fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#1565C0' : '#2A3A4A',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  opacity: expanded ? 1 : 0, transition: 'opacity 0.15s',
                }}>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Bottom status ─────────────────────────────── */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid #E8EBF4', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2E7D32', flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: '#8090A8', letterSpacing: 1, whiteSpace: 'nowrap', opacity: expanded ? 1 : 0, transition: 'opacity 0.15s' }}>MOCK LIVE</span>
        </div>
      </div>
    </div>
  );
});

// ── Config loader — async reads from file, falls back to localStorage ─────────
function LoadingScreen() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 380);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      width: '100vw', height: '100vh', background: '#060C14',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', gap: 14,
    }}>
      <div style={{ fontSize: 11, color: '#00C8FF', letterSpacing: 4 }}>PROTOVEC SCADA</div>
      <div style={{ fontSize: 9, color: '#2A4A68', letterSpacing: 2 }}>LOADING CONFIGURATION{dots}</div>
      <div style={{ width: 120, height: 2, background: '#142540', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: 48, background: '#00C8FF', borderRadius: 1,
          animation: 'none', opacity: 0.85 }} />
      </div>
    </div>
  );
}

export default function WagonScada3D() {
  const [userCfg, setUserCfg]     = useState(null);
  const [headerCfg, setHeaderCfg] = useState(null);
  const [isFrozen, setIsFrozen]   = useState(null);
  const [pageSelection, setPageSelection] = useState(null);

  useEffect(() => {
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

  if (!userCfg || !headerCfg || isFrozen === null || !pageSelection) return <LoadingScreen />;
  return (
    <WagonScadaApp
      initialCfg={userCfg} initialHeaderCfg={headerCfg}
      pageSelection={pageSelection} isFrozen={isFrozen}
    />
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
function WagonScadaApp({ initialCfg, initialHeaderCfg, pageSelection, isFrozen }) {
  const [userCfg, setUserCfg]     = useState(initialCfg);
  const [headerCfg, setHeaderCfg] = useState(initialHeaderCfg);
  const [view, setView]       = useState(() => initialView(pageSelection));
  const [lastSceneView, setLastSceneView] = useState(() => initialView(pageSelection));
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [isSceneFullscreen, setIsSceneFullscreen] = useState(false);
  // TEST-ONLY — "Simulation" button on the 3D page (see toggleSimTest below).
  // Forces one station + one wagon's load flag on/off so a rotating barrel
  // is visible without needing a live PLC. Button only renders when
  // !isFrozen (see filterNav's devOnly convention), so this never appears
  // in a generated exe.
  const [simTestOn, setSimTestOn] = useState(false);
  const [plcMode, setPlcMode] = useState(true); // AUTO/MANUAL — manual toggle for now, no real mode source yet
  const sceneFullscreenRef = useRef(null);

  // Several config pages (Column Config, Station Names) call MULTIPLE
  // handleSave* handlers back-to-back from one Save button, all in the same
  // synchronous click — e.g. onSave(...); onSaveExtra(...);
  // onSavePartNumberTags(...); onSaveStationParams(...). Each handler used to
  // build its newCfg as {...userCfg, ownField: ...} off the plain `userCfg`
  // closure variable, which is NOT updated until the next render — so every
  // call in the chain read the SAME pre-click snapshot, and only the LAST
  // call's setUserCfg (and disk write) actually stuck; every earlier call's
  // field silently reverted on the next load (reported: editing a custom
  // column's data type on Station Info Column Config and saving showed the
  // PREVIOUS data type again, because a later handler in that same Save
  // click overwrote it). Every handleSave* below now reads/writes
  // userCfgRef.current instead, updating it synchronously the moment its own
  // newCfg is computed, so the next handler in the same click chain builds
  // on top of it rather than clobbering it.
  const userCfgRef = useRef(userCfg);
  userCfgRef.current = userCfg;

  const simCfg       = useMemo(() => buildSimConfig(userCfg), [userCfg]);
  const wagonTypeMap = useMemo(() => getWagonTypeMap(userCfg), [userCfg]);
  const tankTags     = useMemo(() => getTankTags(userCfg), [userCfg]);
  const wagonTags    = useMemo(() => getWagonTags(userCfg), [userCfg]);
  const stationParams = useMemo(() => getStationParams(userCfg), [userCfg]);
  const stationParamLabels = useMemo(() => userCfg.stationParamLabels || {}, [userCfg]);
  const stationLoadNumbers = useMemo(() => getStationLoadNumbers(userCfg), [userCfg]);
  const stationExtraCols  = useMemo(() => getStationExtraCols(userCfg), [userCfg]);
  const stationExtraAddrs = useMemo(() => getStationExtraValues(userCfg), [userCfg]);
  const stationColumnOrder = useMemo(() => getStationColumnOrder(userCfg), [userCfg]);
  const wagonPartNumberTags = useMemo(() => getWagonPartNumberTags(userCfg), [userCfg]);

  // Station Info Column Config's user-added custom columns, and the
  // left/right order of every column (fixed + custom) — all three are
  // saved together from that page's one Save button.
  const handleSaveStationExtra = (newCols, newAddrs, newOrder) => {
    const newCfg = { ...userCfgRef.current, stationExtraCols: newCols, stationExtraValues: newAddrs, stationColOrder: newOrder };
    userCfgRef.current = newCfg;
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
  };

  // Part Number column's per-wagon required tags (Column Config page's "⚙
  // Configure Part Number Tags" panel) — saved from the same Save button as
  // the rest of that page, just a separate field in userCfg.
  const handleSaveWagonPartNumberTags = newTags => {
    const newCfg = { ...userCfgRef.current, wagonPartNumberTags: newTags };
    userCfgRef.current = newCfg;
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
  };

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
    const newCfg = { ...userCfgRef.current, stationColCfg: newCols };
    userCfgRef.current = newCfg;
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

  const handleSaveStationNames = newNames => {
    const newCfg = { ...userCfgRef.current, stationNames: newNames };
    userCfgRef.current = newCfg;
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
    setView('config');
  };

  const tankPartitions = useMemo(() => {
    if (userCfg.tankPartitions !== undefined) return userCfg.tankPartitions;
    try {
      const stored = localStorage.getItem('tankPartitionConfig');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  }, [userCfg]);

  const handleSaveTankPartitions = newGroups => {
    const newCfg = { ...userCfgRef.current, tankPartitions: newGroups };
    userCfgRef.current = newCfg;
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
    const newCfg = { ...userCfgRef.current, crossTrolleys: newTrolleys };
    userCfgRef.current = newCfg;
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
    const newCfg = { ...userCfgRef.current, tankTags: newTankTags };
    userCfgRef.current = newCfg;
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
    setView('config');
  };

  const handleSaveWagonTags = newWagonTags => {
    const newCfg = { ...userCfgRef.current, wagonTags: newWagonTags };
    userCfgRef.current = newCfg;
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
    setView('config');
  };

  // Called alongside handleSaveStationNames (same Save button on the
  // Station Info page) — doesn't navigate on its own, that save does.
  const handleSaveStationParams = newStationParams => {
    const newCfg = { ...userCfgRef.current, stationParams: newStationParams };
    userCfgRef.current = newCfg;
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
  };

  // Also from the Station Info page's Save button — the per-station free-text
  // "Parameter Label" tag (e.g. "Zone A"), separate from each parameter
  // entry's own kind. Purely display metadata, no PLC tag involved.
  const handleSaveStationParamLabels = newLabels => {
    const newCfg = { ...userCfgRef.current, stationParamLabels: newLabels };
    userCfgRef.current = newCfg;
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
  };

  // Also from the Station Info page's Save button — the dedicated per-
  // station Load Number tag (always int16), separate from the flexible
  // parameter list.
  const handleSaveStationLoadNumbers = newAddresses => {
    const newCfg = { ...userCfgRef.current, stationLoadNumbers: newAddresses };
    userCfgRef.current = newCfg;
    saveUserConfig(newCfg);
    saveUserConfigToFile(newCfg);
    setUserCfg(newCfg);
  };

  const { wagons, stations, setWagonTarget, snapWagonToTank, setWagonLoadFlag, setWagonMode, setStationHasLoad } = useWagonSimulation(simCfg);
  const { tags: grpcTags, connected: grpcConnected } = useTagSocket();

  // TEST-ONLY — forces the first station + first wagon of EVERY line/track
  // (not just the very first one overall, which would only ever touch Line
  // 1) on/off, via the exact same setters the live PLC tag effects use
  // below, purely so the rotating barrel visual can be checked on every
  // line without a live PLC connected. Button that calls this only renders
  // when !isFrozen (see the "Simulation" button in the 3D view) — never
  // reachable in a generated exe.
  const toggleSimTest = useCallback(() => {
    const nextOn = !simTestOn;
    setSimTestOn(nextOn);
    simCfg.tracks.forEach(track => {
      const stationId = track.stations[0]?.id;
      const wagonId = track.wagonIds[0];
      if (stationId != null) setStationHasLoad(stationId, nextOn);
      if (wagonId != null) setWagonLoadFlag(wagonId, nextOn);
    });
  }, [simTestOn, simCfg, setStationHasLoad, setWagonLoadFlag]);

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
    Object.entries(stationLoadNumbers).forEach(([stationId, address]) => {
      if (!address) return;
      const live = grpcTags[`STATION_${stationId}_LOADNUM`];
      if (!live) return;
      const entry = { label: 'Load Number', unit: '', value: live.value };
      out[stationId] = out[stationId] ? [...out[stationId], entry] : [entry];
    });
    return out;
  }, [stationParams, stationLoadNumbers, grpcTags]);

  // Live Load Number value per station, keyed by station id — same tag
  // (STATION_<id>_LOADNUM) as stationParamValues above, but as a plain
  // {stationId: value} map for StationColumnConfigPage.jsx's own Load No
  // column (that page shows the live tag value, not the configured address —
  // the address itself is edited on StationNamesConfigPage.jsx).
  const loadNumberValues = useMemo(() => {
    const out = {};
    Object.entries(stationLoadNumbers).forEach(([stationId, address]) => {
      if (!address) return;
      const live = grpcTags[`STATION_${stationId}_LOADNUM`];
      if (live) out[stationId] = live.value;
    });
    return out;
  }, [stationLoadNumbers, grpcTags]);

  // Live value per station per user-added custom column (Station Info
  // Column Config page's "+ Add Column"), keyed the same way
  // plc_publisher.py publishes them (station_extra_col_tag_name:
  // "STATION_<id>_X_<colId>") — {stationId: {colId: value}}. A station with
  // no address configured for a given column simply isn't in this map, so
  // StationInfoPage.jsx's cell falls back to "—".
  const stationExtraLiveValues = useMemo(() => {
    const out = {};
    Object.entries(stationExtraAddrs).forEach(([stationId, addrs]) => {
      Object.entries(addrs || {}).forEach(([colId, address]) => {
        if (!address) return;
        const live = grpcTags[`STATION_${stationId}_X_${colId}`];
        if (!live) return;
        out[stationId] = out[stationId] || {};
        out[stationId][colId] = live.value;
      });
    });
    return out;
  }, [stationExtraAddrs, grpcTags]);

  // Live Part Number per station, keyed the same way plc_publisher.py
  // publishes it (station_part_number_tag_name: "STATION_<id>_PARTNUMBER")
  // — a DB-derived value, not a plain PLC read, so unlike the other live-
  // value maps above this one can't be built from a known set of addresses;
  // it scans whatever STATION_*_PARTNUMBER keys currently exist in grpcTags.
  const partNumberValues = useMemo(() => {
    const out = {};
    Object.entries(grpcTags).forEach(([name, tag]) => {
      const m = name.match(/^STATION_(\d+)_PARTNUMBER$/);
      if (m) out[m[1]] = tag.value;
    });
    return out;
  }, [grpcTags]);

  // Which parameter kinds (Actual Temperature/PH/Current/…) are configured
  // on at least one station right now — drives both StationColumnConfigPage.jsx's
  // and StationInfoPage.jsx's extra per-kind columns (see each page's own
  // comments on this feature).
  const stationParamKinds = useMemo(() => getStationParamKinds(stationParams), [stationParams]);

  // Live value per station per parameter-kind column, keyed by
  // paramKindColId(kind) — {stationId: {colId: value}}, same shape as
  // stationExtraLiveValues above so StationInfoPage.jsx's cell renderer
  // handles both the same way. Reuses the exact tag name and PARAM_SCALE
  // engineering-unit scaling stationParamValues (the hover tooltip) already
  // uses, so a value shown here always matches the tooltip.
  const stationParamColValues = useMemo(() => {
    const out = {};
    Object.entries(stationParams).forEach(([stationId, entries]) => {
      (entries || []).forEach((p, idx) => {
        if (!stationParamKinds.includes(p.label)) return;
        const live = grpcTags[`STATION_${stationId}_P${idx}`];
        if (!live) return;
        const num = Number(live.value);
        const scale = PARAM_SCALE[p.label] ?? 1;
        const value = Number.isFinite(num) ? (num * scale).toFixed(2) : live.value;
        out[stationId] = out[stationId] || {};
        // First entry of a kind wins if a station has duplicates — same
        // convention as tagConfig.js's findStationParamEntry/setStationParamAddress.
        const colId = paramKindColId(p.label);
        if (out[stationId][colId] === undefined) out[stationId][colId] = value;
      });
    });
    return out;
  }, [stationParams, stationParamKinds, grpcTags]);

  // Tank tag values mirror simulation station hasLoad — future: replaced by gRPC writes
  const tagValues = useMemo(() => {
    const v = {};
    stations.forEach(st => { v[String(st.id)] = st.hasLoad ? 1 : 0; });
    return v;
  }, [stations]);

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
        setWagonLoadFlag(Number(wagonId), flag);
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
  const activeAlarmCount = wagons.filter(w => w.status.startsWith('arm_')).length;

  // Same centering logic as Scene3D's cx — spans whatever ALL lines
  // actually occupy, not just line 0's own tank count.
  const camXs = simCfg.tracks.flatMap(t => t.stations.map(st => mapX(st.x)));
  const camX  = (Math.min(...camXs) + Math.max(...camXs)) / 2;
  const pal  = C.palette;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'row', background: pal.bg, fontFamily: 'monospace', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Sidebar view={view} navigate={navigate} expanded={sidebarOpen} onToggle={toggleSidebar} nav={filterNav(NAV, pageSelection, isFrozen)} />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header — left/center branding come from General Config; height and
            font size here never change, whatever is configured just fits into
            these fixed slots (logo capped to LOGO_MAX_H, name truncates). */}
        <div style={{
          background: 'linear-gradient(90deg,#DDE4F0,#E8EDF8,#DDE4F0)',
          borderBottom: `1px solid ${pal.panelBorder}`,
          padding: '4px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          flexShrink: 0, minHeight: 38,
        }}>
          <HeaderBrandLeft logo1={headerCfg.left.logo1} logo2={headerCfg.left.logo2} />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
            <HeaderBrandCenter name={headerCfg.center.name} logo={headerCfg.center.logo} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StatusChip
              dot={grpcConnected ? pal.ok : pal.danger}
              label="PLC COMM"
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
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 8.5, color: pal.textDim, letterSpacing: 2 }}>{dateStr}</div>
              <div style={{ fontSize: 16, color: pal.accent, fontWeight: 'bold', letterSpacing: 3 }}>{timeStr}</div>
            </div>
          </div>
        </div>

        {/* Main viewport */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          {view === '2d' && (
            <div ref={sceneFullscreenRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <WagonScadaScreen wagons={wagons} stations={stations} tracks={simCfg.tracks}
                tankPartitions={tankPartitions} crossTrolleys={crossTrolleys} />
              {/* Fullscreen toggle */}
              <button
                onClick={toggleSceneFullscreen}
                title={isSceneFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                style={{
                  position: 'absolute', top: 10, right: 10, zIndex: 20,
                  width: 34, height: 34, padding: 0,
                  background: 'rgba(10,22,40,0.72)', border: '1px solid rgba(100,160,220,0.35)',
                  borderRadius: 6, color: '#A8C8F0', cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(21,101,192,0.80)'; e.currentTarget.style.borderColor = '#4A90D9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(10,22,40,0.72)'; e.currentTarget.style.borderColor = 'rgba(100,160,220,0.35)'; }}
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
                  position: 'absolute', top: 10, right: 10, zIndex: 20,
                  width: 34, height: 34, padding: 0,
                  background: 'rgba(10,22,40,0.72)', border: '1px solid rgba(100,160,220,0.35)',
                  borderRadius: 6, color: '#A8C8F0', cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(21,101,192,0.80)'; e.currentTarget.style.borderColor = '#4A90D9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(10,22,40,0.72)'; e.currentTarget.style.borderColor = 'rgba(100,160,220,0.35)'; }}
              >
                {isSceneFullscreen ? '⊡' : '⛶'}
              </button>
              {/* TEST-ONLY — forces a demo load onto the first station/wagon
                  so the barrel rotation can be checked without a live PLC.
                  Never shown in a generated exe (same devOnly gating as the
                  App Builder sidebar item). */}
              {!isFrozen && (
                <button
                  onClick={toggleSimTest}
                  title="Testing only — force a demo load so the barrel rotation can be checked without a live PLC. Never appears in a generated exe."
                  style={{
                    position: 'absolute', top: 10, right: 52, zIndex: 20,
                    height: 34, padding: '0 12px',
                    background: simTestOn ? 'rgba(198,40,40,0.85)' : 'rgba(10,22,40,0.72)',
                    border: `1px solid ${simTestOn ? '#E57373' : 'rgba(100,160,220,0.35)'}`,
                    borderRadius: 6, color: simTestOn ? '#FFE0E0' : '#A8C8F0',
                    cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  {simTestOn ? '■ SIMULATION ON' : '▶ SIMULATION'}
                </button>
              )}
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
          {view === 'tags' && (
            <TagMonitorPage
              tankTags={tankTags}
              tagValues={tagValues}
              userCfg={userCfg}
              wagonTags={wagonTags}
              wagonLocationValues={wagonLocationTagValues}
              grpcTags={grpcTags}
              grpcConnected={grpcConnected}
              simWagons={wagons}
              simStations={stations}
              onTankTagChange={(tankId, value) => setStationHasLoad(tankId, value === 1)}
              onWagonLocationChange={(wagonId, tankId) => {
                setWagonTarget(Number(wagonId), Number(tankId));
                setWagonLocationTagValues(prev => ({ ...prev, [String(wagonId)]: Number(tankId) }));
              }}
              onBack={() => setView(lastSceneView)}
            />
          )}
          {view === 'station-info' && (
            <StationInfoPage
              wagons={wagons}
              stations={stations}
              colConfig={stationColCfg}
              stationNames={buildNamesArray(stationNames, stations.length)}
              tankTags={tankTags}
              loadNumberValues={loadNumberValues}
              extraCols={stationExtraCols}
              extraLiveValues={stationExtraLiveValues}
              columnOrder={stationColumnOrder}
              partNumberValues={partNumberValues}
              paramKinds={stationParamKinds}
              paramColValues={stationParamColValues}
              connected={grpcConnected}
              onBack={() => setView(lastSceneView)}
            />
          )}
          {view === 'station-cols' && (
            <StationColumnConfigPage
              colConfig={stationColCfg}
              tankTags={tankTags}
              stationLoadNumbers={stationLoadNumbers}
              extraCols={stationExtraCols}
              extraAddrs={stationExtraAddrs}
              columnOrder={stationColumnOrder}
              wagonTags={wagonTags}
              partNumberTags={wagonPartNumberTags}
              stationParams={stationParams}
              onSave={handleSaveStationCols}
              onSaveExtra={handleSaveStationExtra}
              onSavePartNumberTags={handleSaveWagonPartNumberTags}
              onSaveStationParams={handleSaveStationParams}
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
              onSave={handleSaveStationNames}
              onSaveParams={handleSaveStationParams}
              onSaveParamLabels={handleSaveStationParamLabels}
              onSaveLoadNumbers={handleSaveStationLoadNumbers}
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
                stationNames: buildNamesArray(stationNames, simCfg.tracks.reduce((n, t) => n + t.stations.length, 0)),
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
          {view === 'app-builder' && (
            <AppBuilderPage onNavigateToPlcTest={() => navigate('plc-test')} />
          )}
          {view === 'plc-test' && (
            <PlcConnectionTestPage onBack={() => setView(lastSceneView)} />
          )}
          {view === 'db-test' && (
            <DbConnectionTestPage onBack={() => setView(lastSceneView)} />
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
              height: 56, background: 'rgba(18, 26, 38, 0.58)', backdropFilter: 'blur(4px)',
              borderTop: '1px solid rgba(255,255,255,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36,
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 10, color: '#C8D2DC', letterSpacing: 2, fontWeight: 700 }}>WAGON MODE</span>
              {MODE_LEGEND.map(({ mode, label }) => (
                <div key={mode} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 13, height: 13, borderRadius: '50%',
                    background: MODE_COLOR[mode], boxShadow: `0 0 8px ${MODE_COLOR[mode]}`,
                  }} />
                  <span style={{ fontSize: 12.5, color: '#FFFFFF', fontWeight: 700, letterSpacing: 1 }}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
