import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { CanvasTexture, RepeatWrapping, Color, Fog } from 'three';
import { DairyPlant, DAIRY_TANKS } from '../sim/dairyPlant';
import { THEME, FONT, FONT_COND } from '../theme';

// Dairy 3D — interactive milk-plant scene driven by the dairy simulation
// (sim/dairyPlant.js). Everything is modelled procedurally (no external
// assets), so it works offline inside a generated exe. Click any asset for its
// details; pipes animate in the colour of what's flowing through them.

// ── Data hook ────────────────────────────────────────────────────────────────
function useDairySim() {
  const [snap, setSnap] = useState(null);
  useEffect(() => {
    const plant = new DairyPlant();
    let last = performance.now();
    setSnap(plant.snapshot());
    const id = setInterval(() => {
      const now = performance.now();
      plant.advance((now - last) / 1000);
      last = now;
      setSnap(plant.snapshot());
    }, 500);
    return () => clearInterval(id);
  }, []);
  return snap;
}

// ── Palette ──────────────────────────────────────────────────────────────────
const FLOW = {
  cow:     { color: '#3FB97A', label: 'Cow milk' },
  buffalo: { color: '#3B9BEA', label: 'Buffalo milk' },
  process: { color: '#F59E0B', label: 'Processed milk' },
  cip:     { color: '#9B6BE0', label: 'CIP (cleaning)' },
  water:   { color: '#5FD3DB', label: 'Cold water' },
};
const STAINLESS = '#C8CFD5';
const PANEL = { bg: 'rgba(17,24,33,0.92)', border: 'rgba(255,255,255,0.09)', text: '#E6EDF3', dim: '#8B97A5' };

// ── Textures ─────────────────────────────────────────────────────────────────
function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new CanvasTexture(cv);
  if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 8;
  return t;
}
const grassTex = () => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#5D7F48'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { c.fillStyle = ['#6B8F52', '#4F6E3D', '#77985B'][i % 3]; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}, [30, 20]);
const slabTex = () => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#BFC4C6'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  c.strokeStyle = 'rgba(60,64,66,0.35)'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
}, [14, 8]);

// ── Basic shapes ─────────────────────────────────────────────────────────────
const Metal = ({ color = STAINLESS, rough = 0.28, metal = 0.8, ...p }) => <meshStandardMaterial color={color} roughness={rough} metalness={metal} {...p} />;
const Paint = ({ color, ...p }) => <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} {...p} />;

function Box({ size, position, color, metal, rotation }) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={size} />
      {metal ? <Metal color={color} /> : <Paint color={color} />}
    </mesh>
  );
}

// Clickable wrapper — highlights on hover, calls onSelect(id).
function Asset({ id, onSelect, selected, children, position }) {
  const [hover, setHover] = useState(false);
  useEffect(() => { document.body.style.cursor = hover ? 'pointer' : 'auto'; return () => { document.body.style.cursor = 'auto'; }; }, [hover]);
  return (
    <group position={position}
      onClick={e => { e.stopPropagation(); onSelect(id); }}
      onPointerOver={e => { e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}>
      {children}
      {(hover || selected) && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.3, 2.55, 48]} />
          <meshBasicMaterial color={selected ? '#F2A900' : '#5FD3DB'} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}

// Vertical stainless silo on legs with a sight-glass level gauge on its front.
function Silo({ r = 1.6, h = 4.5, level = 0.5, fluid = '#F4F1E8', badge, badgeColor }) {
  const legH = 0.9, bodyY = legH + 0.6 + h / 2;
  const glassH = h * 0.86;
  return (
    <group>
      {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[sx * r * 0.62, (legH + 0.6) / 2, sz * r * 0.62]}>
          <cylinderGeometry args={[0.09, 0.09, legH + 0.6, 10]} /><Metal />
        </mesh>
      ))}
      <mesh position={[0, legH + 0.3, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[r, 0.6, 40]} /><Metal /></mesh>
      <mesh position={[0, bodyY, 0]} castShadow><cylinderGeometry args={[r, r, h, 40]} /><Metal /></mesh>
      <mesh position={[0, bodyY + h / 2, 0]} scale={[1, 0.32, 1]}><sphereGeometry args={[r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><Metal /></mesh>
      {[0.48, -0.48].map(f => (
        <mesh key={f} position={[0, bodyY + f * h, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r + 0.01, 0.04, 8, 48]} /><Metal color="#9EA7AF" /></mesh>
      ))}
      {/* Manway + agitator motor on top */}
      <mesh position={[0, bodyY + h / 2 + r * 0.32, 0]}><cylinderGeometry args={[0.25, 0.25, 0.35, 16]} /><Metal color="#8C959D" /></mesh>
      {/* Sight-glass level gauge facing the camera */}
      <group position={[0, bodyY, r + 0.06]}>
        <mesh><boxGeometry args={[0.32, glassH, 0.06]} /><meshStandardMaterial color="#1D262F" roughness={0.4} /></mesh>
        <mesh position={[0, -glassH / 2 + (glassH * level) / 2, 0.035]}>
          <boxGeometry args={[0.24, Math.max(glassH * level, 0.02), 0.02]} />
          <meshStandardMaterial color={fluid} emissive={fluid} emissiveIntensity={0.35} />
        </mesh>
      </group>
      {badge && (
        <mesh position={[0, bodyY + h * 0.18, r + 0.02]}>
          <circleGeometry args={[0.55, 32]} />
          <meshStandardMaterial color={badgeColor} roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}

// Milk tanker truck along +x (cab at +x).
function Tanker({ stripe, unloading }) {
  return (
    <group>
      <Box size={[6.2, 0.35, 1.9]} position={[0, 0.75, 0]} color="#2B3238" />
      <mesh position={[-0.6, 1.95, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[1.05, 1.05, 4.6, 32]} /><Metal color="#E4E8EB" /></mesh>
      <mesh position={[-0.6, 1.95, 1.06]}><boxGeometry args={[4.2, 0.45, 0.02]} /><Paint color={stripe} /></mesh>
      <Box size={[1.4, 1.9, 2]} position={[2.6, 1.75, 0]} color="#E9EDF0" />
      <Box size={[0.05, 0.8, 1.6]} position={[3.31, 2.1, 0]} color="#2D3E4E" />
      <Box size={[1.4, 0.3, 2.02]} position={[2.6, 1.0, 0]} color={stripe} />
      {[-2.4, -1.2, 2.5].map(x => [-1, 1].map(s => (
        <mesh key={`${x}${s}`} position={[x, 0.5, s * 0.95]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.48, 0.48, 0.32, 20]} /><Paint color="#16191D" /></mesh>
      )))}
      {unloading && <mesh position={[-2.9, 1.95, 0]}><sphereGeometry args={[0.18, 12, 12]} /><meshStandardMaterial color="#3FB97A" emissive="#3FB97A" emissiveIntensity={2} /></mesh>}
    </group>
  );
}

// Plate heat exchanger (pasteurizer): frame + many plates.
function Pasteurizer({ running }) {
  return (
    <group>
      <Box size={[3, 0.25, 1.6]} position={[0, 0.12, 0]} color="#5E6A75" />
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i} position={[-1.2 + i * 0.16, 1.25, 0]}><boxGeometry args={[0.08, 1.9, 1.2]} /><Metal color={i % 2 ? '#B9C1C8' : '#D8DEE3'} /></mesh>
      ))}
      <Box size={[0.25, 2.3, 1.5]} position={[-1.45, 1.3, 0]} color="#3B4651" />
      <Box size={[0.25, 2.3, 1.5]} position={[1.45, 1.3, 0]} color="#3B4651" />
      <Box size={[3.2, 0.14, 0.14]} position={[0, 2.5, 0]} color="#3B4651" />
      <Box size={[0.6, 0.8, 0.5]} position={[1.9, 0.6, 0.4]} color="#DDE3E8" />
      <mesh position={[1.9, 1.1, 0.66]}><circleGeometry args={[0.13, 20]} /><meshStandardMaterial color={running ? '#3FB97A' : '#7D8793'} emissive={running ? '#3FB97A' : '#000'} emissiveIntensity={1.5} /></mesh>
    </group>
  );
}

function Homogenizer({ running }) {
  return (
    <group>
      <Box size={[2.4, 1.3, 1.5]} position={[0, 0.65, 0]} color="#D9DEE2" metal />
      <Box size={[1.2, 0.7, 1.2]} position={[-0.4, 1.65, 0]} color="#B7BFC6" metal />
      <mesh position={[0.75, 1.55, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.32, 0.32, 0.9, 20]} /><Paint color="#2F5E8C" /></mesh>
      {[-0.7, -0.4, -0.1].map(x => <mesh key={x} position={[x, 2.15, 0]}><cylinderGeometry args={[0.08, 0.08, 0.35, 10]} /><Metal /></mesh>)}
      <mesh position={[0.6, 0.85, 0.76]}><circleGeometry args={[0.18, 24]} /><meshStandardMaterial color="#F2F4F6" /></mesh>
      <mesh position={[-0.9, 0.95, 0.76]}><circleGeometry args={[0.1, 16]} /><meshStandardMaterial color={running ? '#3FB97A' : '#7D8793'} emissive={running ? '#3FB97A' : '#000'} emissiveIntensity={1.5} /></mesh>
    </group>
  );
}

// Packaging machine + conveyor with moving packets.
function PackingLine({ rate }) {
  const packets = useRef([]);
  const t = useRef(0);
  const N = 9, L = 7.2;
  useFrame((_, dt) => {
    t.current += dt * (rate > 0 ? 1.1 : 0);
    packets.current.forEach((m, i) => {
      if (!m) return;
      const s = ((i / N) * L + t.current) % L;
      m.position.x = 1.6 + s;
    });
  });
  return (
    <group>
      <Box size={[3.2, 2.4, 2.2]} position={[0, 1.2, 0]} color="#E3E7EA" metal />
      <Box size={[3.25, 0.5, 2.25]} position={[0, 2.6, 0]} color="#0E7C86" />
      <Box size={[1.1, 0.7, 0.05]} position={[-0.6, 1.6, 1.13]} color="#1E2A36" />
      <mesh position={[-0.6, 1.6, 1.16]}><planeGeometry args={[0.95, 0.55]} /><meshStandardMaterial color="#163A4A" emissive="#2BB3C0" emissiveIntensity={0.5} /></mesh>
      <mesh position={[1.2, 3.1, 0]}><cylinderGeometry args={[0.07, 0.07, 0.7, 8]} /><Metal /></mesh>
      {['#3FB97A', '#F2A900', '#E5534B'].map((c, i) => (
        <mesh key={c} position={[1.2, 3.5 + i * 0.16, 0]}><cylinderGeometry args={[0.1, 0.1, 0.14, 12]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={i === 0 && rate > 0 ? 2 : 0.15} /></mesh>
      ))}
      {/* Conveyor */}
      <Box size={[L + 0.4, 0.12, 1]} position={[1.6 + L / 2, 0.95, 0]} color="#2F3C4A" />
      <Box size={[L + 0.4, 0.06, 0.86]} position={[1.6 + L / 2, 1.03, 0]} color="#244E7A" />
      {Array.from({ length: 6 }, (_, i) => [-1, 1].map(s => (
        <mesh key={`${i}${s}`} position={[1.8 + i * 1.4, 0.45, s * 0.42]}><boxGeometry args={[0.07, 0.9, 0.07]} /><Metal /></mesh>
      )))}
      {Array.from({ length: N }, (_, i) => (
        <mesh key={i} ref={el => { packets.current[i] = el; }} position={[1.6, 1.28, 0]}>
          <boxGeometry args={[0.32, 0.42, 0.24]} />
          <meshStandardMaterial color={i % 2 ? '#2F7FD1' : '#F4F6F8'} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// Pallets of finished cartons.
function Pallets() {
  return (
    <group>
      {[0, 1.6].map((z, k) => (
        <group key={z} position={[0, 0, z - 0.8]}>
          <Box size={[1.4, 0.16, 1.3]} position={[0, 0.08, 0]} color="#C99A5B" />
          {Array.from({ length: 12 }, (_, i) => (
            <Box key={i} size={[0.42, 0.42, 0.4]} position={[-0.45 + (i % 3) * 0.45, 0.38 + Math.floor(i / 6) * 0.44, -0.22 + (Math.floor(i / 3) % 2) * 0.44]}
              color={k ? '#F1F3F5' : '#2F7FD1'} />
          ))}
        </group>
      ))}
    </group>
  );
}

function Building({ size, color = '#D8DCDF', roof = '#9AA4AD', windows = [], children }) {
  const [w, h, d] = size;
  return (
    <group>
      <Box size={[w, h, d]} position={[0, h / 2, 0]} color={color} />
      <Box size={[w + 0.2, 0.18, d + 0.2]} position={[0, h + 0.09, 0]} color={roof} />
      {windows.map(([x, y, ww, wh], i) => (
        <mesh key={i} position={[x, y, d / 2 + 0.01]}><planeGeometry args={[ww, wh]} /><meshStandardMaterial color="#2E4458" emissive="#5B8DB8" emissiveIntensity={0.35} roughness={0.2} /></mesh>
      ))}
      {children}
    </group>
  );
}

function CipSkid({ running }) {
  return (
    <group>
      <Box size={[5, 0.2, 2.6]} position={[0, 0.1, 0]} color="#5E6A75" />
      {[-1.5, 0, 1.5].map(x => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.3, 0]} castShadow><cylinderGeometry args={[0.6, 0.6, 1.9, 28]} /><Metal /></mesh>
          <mesh position={[0, 2.25, 0]} scale={[1, 0.35, 1]}><sphereGeometry args={[0.6, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><Metal /></mesh>
        </group>
      ))}
      <Box size={[0.8, 1.4, 0.5]} position={[2.2, 0.9, 0.9]} color="#E1E5E8" />
      <mesh position={[2.2, 1.3, 1.16]}><circleGeometry args={[0.1, 16]} /><meshStandardMaterial color={running ? '#9B6BE0' : '#7D8793'} emissive={running ? '#9B6BE0' : '#000'} emissiveIntensity={2} /></mesh>
    </group>
  );
}

function Utilities({ compressorOn }) {
  return (
    <group>
      <group position={[-1.6, 0, 0]}>
        <Box size={[2.6, 1.6, 1.4]} position={[0, 0.8, 0]} color="#E2B227" />
        <Box size={[0.9, 0.5, 1.2]} position={[0.6, 1.85, 0]} color="#2B3238" />
        <mesh position={[-0.8, 1.95, 0]}><cylinderGeometry args={[0.1, 0.1, 0.6, 10]} /><Paint color="#2B3238" /></mesh>
      </group>
      <group position={[1.6, 0, 0]}>
        <Box size={[1.9, 1.4, 1.3]} position={[0, 0.7, 0]} color="#2F6FB2" />
        <mesh position={[0, 1.6, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.4, 0.4, 1.6, 20]} /><Paint color="#3A84CF" /></mesh>
        <mesh position={[0.6, 1.0, 0.66]}><circleGeometry args={[0.09, 16]} /><meshStandardMaterial color={compressorOn ? '#3FB97A' : '#F2A900'} emissive={compressorOn ? '#3FB97A' : '#F2A900'} emissiveIntensity={1.5} /></mesh>
      </group>
    </group>
  );
}

function Forklift() {
  return (
    <group rotation={[0, -0.6, 0]}>
      <Box size={[1.3, 0.7, 0.9]} position={[0, 0.55, 0]} color="#F2B705" />
      <Box size={[0.08, 1.8, 0.08]} position={[0.7, 1.1, 0.3]} color="#2B3238" />
      <Box size={[0.08, 1.8, 0.08]} position={[0.7, 1.1, -0.3]} color="#2B3238" />
      <Box size={[0.7, 0.05, 0.6]} position={[1.05, 0.2, 0]} color="#2B3238" />
      <Box size={[0.9, 0.06, 0.8]} position={[-0.1, 1.6, 0]} color="#2B3238" />
      {[-0.4, 0.4].map(x => [-1, 1].map(s => (
        <mesh key={`${x}${s}`} position={[x, 0.22, s * 0.45]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.22, 0.22, 0.16, 14]} /><Paint color="#16191D" /></mesh>
      )))}
    </group>
  );
}

// ── Pipes with animated flow ─────────────────────────────────────────────────
function Pipe({ points, color, active, radius = 0.11 }) {
  const segs = useMemo(() => points.slice(1).map((b, i) => {
    const a = points[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    // cylinder axis is Y — rotate to the segment direction (axis-aligned runs only)
    const rot = Math.abs(dy) > 0.001 ? [0, 0, 0] : Math.abs(dx) > Math.abs(dz) ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
    return { a, b, len, mid, rot };
  }), [points]);
  const total = segs.reduce((s, g) => s + g.len, 0);
  const dots = useRef([]);
  const t = useRef(0);
  const N = Math.max(2, Math.floor(total / 0.9));
  useFrame((_, dt) => {
    t.current += dt * 1.6;
    dots.current.forEach((m, i) => {
      if (!m) return;
      m.visible = active;
      if (!active) return;
      let d = ((i / N) * total + t.current) % total;
      for (const g of segs) {
        if (d <= g.len) { const k = d / g.len; m.position.set(g.a[0] + (g.b[0] - g.a[0]) * k, g.a[1] + (g.b[1] - g.a[1]) * k, g.a[2] + (g.b[2] - g.a[2]) * k); break; }
        d -= g.len;
      }
    });
  });
  return (
    <group>
      {segs.map((g, i) => (
        <mesh key={i} position={g.mid} rotation={g.rot}>
          <cylinderGeometry args={[radius, radius, g.len + radius * 1.2, 12]} />
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.45} transparent opacity={active ? 0.95 : 0.55} />
        </mesh>
      ))}
      {points.slice(1, -1).map((p, i) => (
        <mesh key={`j${i}`} position={p}><sphereGeometry args={[radius * 1.25, 12, 12]} /><Metal color="#B8C0C7" /></mesh>
      ))}
      {Array.from({ length: N }, (_, i) => (
        <mesh key={`d${i}`} ref={el => { dots.current[i] = el; }}>
          <sphereGeometry args={[radius * 0.85, 10, 10]} />
          <meshStandardMaterial color="#FFFFFF" emissive={color} emissiveIntensity={2.2} />
        </mesh>
      ))}
    </group>
  );
}

// ── Labels ───────────────────────────────────────────────────────────────────
function Tag({ position, title, lines = [], accent = '#5FD3DB', onClick }) {
  return (
    <Html position={position} center distanceFactor={22} zIndexRange={[20, 0]} style={{ pointerEvents: onClick ? 'auto' : 'none' }}>
      <div onClick={onClick} style={{
        fontFamily: FONT, background: 'rgba(17,24,33,0.9)', color: '#FFFFFF', borderRadius: 8,
        borderLeft: `4px solid ${accent}`, padding: '6px 10px', whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)', fontSize: 13,
      }}>
        <div style={{ fontFamily: FONT_COND, fontWeight: 700, fontSize: 16, letterSpacing: 0.3 }}>{title}</div>
        {lines.map((l, i) => <div key={i} style={{ color: '#B9C4CF', fontSize: 12.5 }}>{l}</div>)}
      </div>
    </Html>
  );
}

// ── Layout (x along the process, z depth; camera looks from +z) ──────────────
const P = {
  cowTruck: [-23, 0, -9.5], bufTruck: [-23, 0, -4],
  reception: [-14.5, 0, -7], meter: [-11.2, 0, -7], diverter: [-8.2, 0, -7],
  cowTank: [-3.4, 0, -10], bufTank: [1.6, 0, -10],
  pasteurizer: [7.2, 0, -10], homogenizer: [11.8, 0, -10], cooling: [16.8, 0, -10],
  packing: [11, 0, 2.5], pallets: [21.6, 0, 2.5],
  cold: [2.6, 0, 3.5], cip: [-8, 0, 4], control: [-19.5, 0, 6.5], utilities: [19.5, 0, 10], forklift: [6.8, 0, 7.2],
};
const PIPES = {
  cowIn:   [[-20, 0.9, -9.5], [-17.2, 0.9, -9.5], [-17.2, 0.9, -7.5], [-16.1, 0.9, -7.5]],
  bufIn:   [[-20, 0.9, -4], [-17.8, 0.9, -4], [-17.8, 0.9, -6.5], [-16.1, 0.9, -6.5]],
  raw:     [[-12.9, 0.9, -7], [-8.2, 0.9, -7]],
  toCow:   [[-8.2, 0.9, -7], [-8.2, 0.9, -10], [-5.0, 0.9, -10]],
  toBuf:   [[-8.2, 0.9, -7], [-8.2, 2.2, -7], [-8.2, 2.2, -12.4], [1.6, 2.2, -12.4], [1.6, 2.2, -11.6]],
  process: [[-3.4, 0.5, -8.4], [-3.4, 0.5, -7.2], [1.6, 0.5, -7.2], [5.4, 0.5, -7.2], [5.4, 0.5, -9.6]],
  bufOut:  [[1.6, 0.5, -8.4], [1.6, 0.5, -7.2]],
  p2h:     [[8.9, 1.2, -10], [10.6, 1.2, -10]],
  h2c:     [[13, 1.2, -10], [15.2, 1.2, -10]],
  toPack:  [[16.8, 0.5, -8.4], [16.8, 0.5, -1.2], [11, 0.5, -1.2], [11, 0.5, 1.3]],
  water:   [[18.3, 0.4, 9.2], [18.3, 0.4, -8.6], [17.9, 0.4, -8.6]],
  cip:     [[-8, 0.35, 2.6], [-8, 0.35, -0.4], [7.2, 0.35, -0.4], [7.2, 0.35, -9]],
};

const PlantGround = memo(function PlantGround() {
  const grass = useMemo(grassTex, []);
  const slab = useMemo(slabTex, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[140, 90]} /><meshStandardMaterial map={grass} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -1]} receiveShadow>
        <planeGeometry args={[56, 32]} /><meshStandardMaterial map={slab} roughness={0.8} />
      </mesh>
      {/* Process hall floor + walkway lines */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3, 0.01, -9.8]}><planeGeometry args={[32, 6.6]} /><meshStandardMaterial color="#AEB9C1" roughness={0.6} /></mesh>
      {[-13.1, -6.5].map(z => <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[3, 0.02, z]}><planeGeometry args={[32, 0.1]} /><meshStandardMaterial color="#F2B705" /></mesh>)}
      {/* Truck bay markings */}
      {[-9.5, -4].map(z => <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[-23, 0.015, z]}><planeGeometry args={[7, 2.6]} /><meshStandardMaterial color="#8E979E" /></mesh>)}
      {/* Perimeter wall */}
      {[[0, -17, 56, 0.25], [0, 15, 56, 0.25], [-28, -1, 0.25, 32], [28, -1, 0.25, 32]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.45, z]}><boxGeometry args={[w, 0.9, d]} /><meshStandardMaterial color="#C9CED2" roughness={0.8} /></mesh>
      ))}
      {/* A few trees outside */}
      {[[-32, -12], [-33, 4], [32, -8], [33, 9], [-12, 19], [14, 19], [0, -21], [22, -21]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.8, 0]}><cylinderGeometry args={[0.18, 0.24, 1.6, 8]} /><Paint color="#6B4A2F" /></mesh>
          <mesh position={[0, 2.4, 0]}><sphereGeometry args={[1.3, 14, 12]} /><Paint color="#3F7A3A" /></mesh>
        </group>
      ))}
    </group>
  );
});

function SceneEnv() {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new Color('#B8C7D3');
    scene.fog = new Fog('#B8C7D3', 70, 150);
    return () => { scene.background = null; scene.fog = null; };
  }, [scene]);
  return null;
}

function DairyScene({ s, selected, onSelect }) {
  const lv = s.levels;
  const a = (id, el, pos) => <Asset id={id} onSelect={onSelect} selected={selected === id} position={pos}>{el}</Asset>;
  const srcColor = s.source === 'cow' ? FLOW.cow.color : FLOW.buffalo.color;
  return (
    <>
      <SceneEnv />
      <hemisphereLight args={['#EAF2F8', '#5F7350', 1.1]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[-18, 30, 20]} intensity={2.2} color="#FFF6E8" />
      <directionalLight position={[20, 14, -10]} intensity={0.5} color="#CFE0EE" />
      <PlantGround />

      {a('cowTruck', <Tanker stripe="#2F855A" unloading={s.tankers.cow.state === 'unloading'} />, s.tankers.cow.state === 'away' ? [-36, 0, -9.5] : P.cowTruck)}
      {a('bufTruck', <Tanker stripe="#2F6FB2" unloading={s.tankers.buffalo.state === 'unloading'} />, s.tankers.buffalo.state === 'away' ? [-36, 0, -4] : P.bufTruck)}
      {a('reception', <Silo r={1.5} h={3.4} level={lv.reception.pct / 100} />, P.reception)}
      {a('meter', <group><Box size={[0.7, 0.9, 0.6]} position={[0, 0.9, 0]} color="#DDE3E8" /><mesh position={[0, 1.1, 0.31]}><circleGeometry args={[0.2, 20]} /><meshStandardMaterial color="#163A4A" emissive="#2BB3C0" emissiveIntensity={0.6} /></mesh></group>, P.meter)}
      {a('diverter', <group><Box size={[0.9, 0.5, 0.9]} position={[0, 0.9, 0]} color="#C53030" /><mesh position={[0, 1.35, 0]}><cylinderGeometry args={[0.3, 0.3, 0.12, 20]} /><Paint color="#E5534B" /></mesh></group>, P.diverter)}
      {a('cowTank', <Silo r={1.8} h={5} level={lv.cow.pct / 100} badge badgeColor="#2F855A" />, P.cowTank)}
      {a('bufTank', <Silo r={1.8} h={5} level={lv.buffalo.pct / 100} badge badgeColor="#2F6FB2" />, P.bufTank)}
      {a('pasteurizer', <Pasteurizer running={s.pasteurizer.status === 'Running'} />, P.pasteurizer)}
      {a('homogenizer', <Homogenizer running={s.homogenizer.status === 'Running'} />, P.homogenizer)}
      {a('cooling', <Silo r={1.5} h={4} level={lv.cooling.pct / 100} badge badgeColor="#5FD3DB" />, P.cooling)}
      {a('packing', <PackingLine rate={s.packaging.rate} />, P.packing)}
      {a('pallets', <Pallets />, P.pallets)}
      {a('cold', <Building size={[6.5, 3.2, 4.6]} color="#E4E8EB" roof="#5FD3DB" windows={[[1.8, 1.4, 1.6, 1.8]]}><Box size={[1.6, 2.2, 0.05]} position={[-1.5, 1.1, 2.33]} color="#9AA4AD" /></Building>, P.cold)}
      {a('cip', <CipSkid running={s.cip.status === 'Running'} />, P.cip)}
      {a('control', <Building size={[6.5, 3.2, 5]} color="#D6DADE" roof="#3B4651" windows={[[-1.6, 1.8, 2.2, 1.2], [1.6, 1.8, 2.2, 1.2]]} />, P.control)}
      {a('utilities', <Utilities compressorOn={s.utilities.compressor === 'Running'} />, P.utilities)}
      <group position={P.forklift}><Forklift /></group>

      <Pipe points={PIPES.cowIn} color={FLOW.cow.color} active={s.flow.cowIn > 0} />
      <Pipe points={PIPES.bufIn} color={FLOW.buffalo.color} active={s.flow.bufIn > 0} />
      <Pipe points={PIPES.raw} color={srcColor} active={s.flow.toCow > 0 || s.flow.toBuf > 0} />
      <Pipe points={PIPES.toCow} color={FLOW.cow.color} active={s.flow.toCow > 0} />
      <Pipe points={PIPES.toBuf} color={FLOW.buffalo.color} active={s.flow.toBuf > 0} />
      <Pipe points={PIPES.process} color={FLOW.process.color} active={s.flow.process > 1} />
      <Pipe points={PIPES.bufOut} color={FLOW.process.color} active={s.flow.process > 1} />
      <Pipe points={PIPES.p2h} color={FLOW.process.color} active={s.flow.process > 1} />
      <Pipe points={PIPES.h2c} color={FLOW.process.color} active={s.flow.process > 1} />
      <Pipe points={PIPES.toPack} color={FLOW.process.color} active={s.flow.pack > 1} />
      <Pipe points={PIPES.water} color={FLOW.water.color} active={s.flow.coldWater > 0} radius={0.08} />
      <Pipe points={PIPES.cip} color={FLOW.cip.color} active={s.flow.cip > 0} radius={0.09} />

      <Tag position={[P.cowTruck[0] - 1.5, 4.6, P.cowTruck[2]]} title="Cow Milk Tanker" accent={FLOW.cow.color}
        lines={[s.tankers.cow.state === 'unloading' ? `Unloading · ${s.tankers.cow.left.toLocaleString()} L left` : 'En route']} />
      <Tag position={[P.bufTruck[0] - 1.5, 3.6, P.bufTruck[2] + 1.2]} title="Buffalo Milk Tanker" accent={FLOW.buffalo.color}
        lines={[s.tankers.buffalo.state === 'unloading' ? `Unloading · ${s.tankers.buffalo.left.toLocaleString()} L left` : 'En route']} />
      <Tag position={[P.reception[0] + 0.8, 8.4, P.reception[2]]} title="Receiving" lines={[`${lv.reception.litres.toLocaleString()} L · ${lv.reception.temp} °C`, `Source: ${s.source}`]} />
      <Tag position={[P.diverter[0], 3.2, P.diverter[2] + 1.4]} title="Diverter Valve" accent={srcColor} lines={[`→ ${s.source === 'cow' ? 'Cow' : 'Buffalo'} tank`]} />
      <Tag position={[P.cowTank[0] - 1.6, 8.6, P.cowTank[2]]} title="Cow Milk Tank" accent={FLOW.cow.color} lines={[`${lv.cow.litres.toLocaleString()} / 50,000 L`, `${lv.cow.temp} °C`]} />
      <Tag position={[P.bufTank[0] + 1.4, 11.2, P.bufTank[2]]} title="Buffalo Milk Tank" accent={FLOW.buffalo.color} lines={[`${lv.buffalo.litres.toLocaleString()} / 50,000 L`, `${lv.buffalo.temp} °C`]} />
      <Tag position={[P.pasteurizer[0] - 0.8, 6.2, P.pasteurizer[2]]} title="Pasteurization" accent={FLOW.process.color} lines={[`${s.pasteurizer.temp} °C · ${s.pasteurizer.hold} s hold`]} />
      <Tag position={[P.homogenizer[0] + 0.6, 3.4, P.homogenizer[2] + 1.2]} title="Homogenization" accent={FLOW.process.color} lines={[`${s.homogenizer.pressure} bar`]} />
      <Tag position={[P.cooling[0], 8, P.cooling[2]]} title="Cooling / Storage" accent={FLOW.water.color} lines={[`${lv.cooling.litres.toLocaleString()} L · ${lv.cooling.temp} °C`]} />
      <Tag position={[P.packing[0], 5, P.packing[2]]} title="Packaging" lines={[`${s.packaging.rate.toLocaleString()} pkt/hr`]} />
      <Tag position={[P.pallets[0], 3, P.pallets[2]]} title="Finished Products" lines={['Milk · Curd · Paneer']} />
      <Tag position={[P.cold[0], 4.8, P.cold[2]]} title="Cold Storage" accent={FLOW.water.color} lines={[`${lv.cold.temp} °C · ${lv.cold.pct}% full`]} />
      <Tag position={[P.cip[0], 3.8, P.cip[2]]} title="CIP System" accent={FLOW.cip.color} lines={[s.cip.status === 'Running' ? `Cleaning ${s.cip.target} · ${s.cip.remaining}s` : 'Idle']} />
      <Tag position={[P.control[0], 4.6, P.control[2]]} title="Control Room" lines={['SCADA / PLC']} />
      <Tag position={[P.utilities[0], 3.4, P.utilities[2]]} title="Power & Utilities" lines={[`Compressor ${s.utilities.compressor.toLowerCase()}`]} />

      <OrbitControls makeDefault target={[0, 0, -2]} enableDamping dampingFactor={0.06}
        minDistance={12} maxDistance={90} maxPolarAngle={Math.PI * 0.46} />
    </>
  );
}

// ── Asset details (side panel) ───────────────────────────────────────────────
function details(id, s) {
  const lv = s.levels;
  const tank = (name, k, extra = []) => ({
    name, type: 'Storage tank', status: lv[k].status,
    rows: [['Level', `${lv[k].pct}%`], ['Volume', `${lv[k].litres.toLocaleString()} / ${lv[k].cap.toLocaleString()} L`], ['Temperature', `${lv[k].temp} °C`], ...extra],
    level: lv[k].pct,
  });
  switch (id) {
    case 'cowTruck': return { name: 'Cow Milk Tanker', type: 'Milk collection', status: s.tankers.cow.state === 'unloading' ? 'Unloading' : 'En route', rows: [['Remaining', `${s.tankers.cow.left.toLocaleString()} L`], ['Received today', `${s.kpi.cow.toLocaleString()} L`]] };
    case 'bufTruck': return { name: 'Buffalo Milk Tanker', type: 'Milk collection', status: s.tankers.buffalo.state === 'unloading' ? 'Unloading' : 'En route', rows: [['Remaining', `${s.tankers.buffalo.left.toLocaleString()} L`], ['Received today', `${s.kpi.buffalo.toLocaleString()} L`]] };
    case 'reception': return tank('Raw Milk Reception Tank', 'reception', [['Holding', s.source === 'cow' ? 'Cow milk' : 'Buffalo milk']]);
    case 'meter': return { name: 'Flow Meter', type: 'Receiving & measuring', status: s.flow.toCow || s.flow.toBuf ? 'Running' : 'Idle', rows: [['Flow', `${Math.round((s.flow.toCow + s.flow.toBuf) * 60)} L/min`], ['Total today', `${s.kpi.totalReceived.toLocaleString()} L`]] };
    case 'diverter': return { name: 'Milk Diverter Valve', type: 'Flow control', status: 'Running', rows: [['Routing to', s.source === 'cow' ? 'Cow milk tank' : 'Buffalo milk tank']] };
    case 'cowTank': return tank('Cow Milk Tank', 'cow');
    case 'bufTank': return tank('Buffalo Milk Tank', 'buffalo');
    case 'cooling': return tank('Storage / Cooling Tank', 'cooling', [['Chilled water', s.flow.coldWater > 20 ? 'Full flow' : 'Trickle']]);
    case 'pasteurizer': return { name: 'HTST Pasteurizer', type: 'Plate heat exchanger', status: s.pasteurizer.status, rows: [['Temperature', `${s.pasteurizer.temp} °C`], ['Hold time', `${s.pasteurizer.hold} s`], ['Throughput', `${Math.round(s.flow.process * 60)} L/min`]] };
    case 'homogenizer': return { name: 'Homogenizer', type: 'High-pressure pump', status: s.homogenizer.status, rows: [['Pressure', `${s.homogenizer.pressure} bar`], ['Throughput', `${Math.round(s.flow.process * 60)} L/min`]] };
    case 'packing': return { name: 'Packing Machine', type: 'Form-fill-seal', status: s.packaging.status, rows: [['Speed', `${s.packaging.rate.toLocaleString()} pkt/hr`], ['Packed today', `${s.kpi.packed.toLocaleString()} units`]] };
    case 'pallets': return { name: 'Finished Products', type: 'Dispatch area', status: 'Normal', rows: [['Products', 'Milk · Curd · Paneer · Butter']] };
    case 'cold': return tank('Cold Storage', 'cold', [['Set point', '2–4 °C']]);
    case 'cip': return { name: 'CIP System', type: 'Clean-in-place', status: s.cip.status, rows: [['Target', s.cip.status === 'Running' ? s.cip.target : '—'], [s.cip.status === 'Running' ? 'Remaining' : 'Next cycle in', `${s.cip.remaining} s`]] };
    case 'control': return { name: 'Control Room', type: 'SCADA / PLC', status: 'Running', rows: [['Active alarms', s.alarms.length]] };
    case 'utilities': return { name: 'Power & Utilities', type: 'Generator · Air compressor', status: 'Running', rows: [['Generator', s.utilities.generator], ['Compressor', s.utilities.compressor]] };
    default: return null;
  }
}

const STATUS_TONE = { Running: '#3FB97A', Normal: '#3FB97A', Unloading: '#3FB97A', Idle: '#F2A900', Standby: '#F2A900', 'En route': '#8B97A5', CIP: '#9B6BE0', High: '#E5534B', Low: '#F2A900' };

function Pill({ text }) {
  const c = STATUS_TONE[text] || '#8B97A5';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: c, background: `${c}1F`, border: `1px solid ${c}55`, borderRadius: 999, padding: '2px 9px' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{text}</span>;
}

function DarkPanel({ title, children, style }) {
  return (
    <div style={{ background: PANEL.bg, border: `1px solid ${PANEL.border}`, borderRadius: 12, padding: '10px 14px', color: PANEL.text, minWidth: 0, ...style }}>
      <div style={{ fontFamily: FONT_COND, fontSize: 17, fontWeight: 700, marginBottom: 8, letterSpacing: 0.3 }}>{title}</div>
      {children}
    </div>
  );
}

const STEPS = [
  { n: 1, label: 'Collection', icon: '⛟', sub: 'Cow / Buffalo' },
  { n: 2, label: 'Receiving', icon: '⛁', sub: 'Measure' },
  { n: 3, label: 'Flow control', icon: '⇋', sub: 'Divert' },
  { n: 4, label: 'Pasteurize', icon: '♨', sub: '72 °C · 15 s' },
  { n: 5, label: 'Homogenize', icon: '◎', sub: '200 bar' },
  { n: 6, label: 'Cooling', icon: '❄', sub: '4 °C' },
  { n: 7, label: 'Packaging', icon: '▣', sub: 'Pouches' },
  { n: 8, label: 'Cold store', icon: '▤', sub: '2–4 °C' },
];

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Dairy3DPage() {
  const s = useDairySim();
  const [selected, setSelected] = useState(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  if (!s) return <div style={{ flex: 1, background: '#0F1720' }} />;
  const det = selected ? details(selected, s) : null;
  const k = s.kpi;
  const cowPct = Math.round((k.cow / Math.max(k.totalReceived, 1)) * 100);

  const kpis = [
    ['Total milk received', `${k.totalReceived.toLocaleString()} L`, '#5FD3DB'],
    ['Cow milk', `${k.cow.toLocaleString()} L · ${cowPct}%`, FLOW.cow.color],
    ['Buffalo milk', `${k.buffalo.toLocaleString()} L · ${100 - cowPct}%`, FLOW.buffalo.color],
    ['Packed today', `${k.packed.toLocaleString()} units`, '#F2A900'],
    ['Average temp', `${k.avgTemp} °C`, '#B9C4CF'],
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0F1720', fontFamily: FONT }}>
      {/* KPI bar */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, padding: '10px 14px', background: '#131C26', borderBottom: '1px solid rgba(255,255,255,0.07)', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 8 }}>
          <span style={{ fontSize: 26 }}>🥛</span>
          <div>
            <div style={{ fontFamily: FONT_COND, fontSize: 22, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>Milk Dairy Plant</div>
            <div style={{ fontSize: 12, color: PANEL.dim }}>From farm to freshness</div>
          </div>
        </div>
        {kpis.map(([l, v, c]) => (
          <div key={l} style={{ padding: '6px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${PANEL.border}`, minWidth: 150 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: PANEL.dim, textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: FONT_COND, fontSize: 21, fontWeight: 700, color: c, whiteSpace: 'nowrap' }}>{v}</div>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ padding: '6px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${PANEL.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: PANEL.dim }}>PRODUCTION</div>
            <Pill text={k.production === 'Running' ? 'Running' : k.production === 'CIP cleaning' ? 'CIP' : 'Idle'} />
          </div>
          <div style={{ textAlign: 'right', color: '#FFFFFF' }}>
            <div style={{ fontFamily: FONT_COND, fontSize: 22, fontWeight: 700 }}>{now.toLocaleTimeString('en-GB', { hour12: false })}</div>
            <div style={{ fontSize: 11.5, color: PANEL.dim }}>{now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>
      </div>

      {/* 3D scene */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <Canvas camera={{ position: [4, 30, 34], fov: 42, near: 0.5, far: 400 }} dpr={[1, 1.5]} onPointerMissed={() => setSelected(null)}>
          <DairyScene s={s} selected={selected} onSelect={setSelected} />
        </Canvas>

        {/* Alarms */}
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360 }}>
          {s.alarms.length === 0
            ? <div style={{ background: PANEL.bg, color: '#3FB97A', borderRadius: 10, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>● All systems operational</div>
            : s.alarms.map(a => <div key={a} style={{ background: 'rgba(120,24,24,0.9)', color: '#FFFFFF', borderRadius: 10, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>⚠ {a}</div>)}
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 12, color: '#24313D', background: 'rgba(255,255,255,0.65)', borderRadius: 8, padding: '4px 10px', fontWeight: 600 }}>
          Drag to rotate · right-drag to pan · scroll to zoom · click an asset for details
        </div>

        {/* Selected asset */}
        {det && (
          <div style={{ position: 'absolute', top: 12, right: 12, width: 300, background: PANEL.bg, border: `1px solid ${PANEL.border}`, borderRadius: 14, padding: 16, color: PANEL.text, boxShadow: '0 12px 30px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT_COND, fontSize: 22, fontWeight: 700 }}>{det.name}</div>
                <div style={{ fontSize: 12.5, color: PANEL.dim }}>{det.type}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ margin: '10px 0' }}><Pill text={det.status} /></div>
            {det.level != null && (
              <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: `${det.level}%`, height: '100%', background: det.level > 92 ? '#E5534B' : '#5FD3DB' }} />
              </div>
            )}
            {det.rows.map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${PANEL.border}`, fontSize: 13.5 }}>
                <span style={{ color: PANEL.dim }}>{l}</span><span style={{ fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(420px, 2.2fr) minmax(220px, 1fr) minmax(170px, 0.7fr)', gap: 10, padding: 10, background: '#0F1720', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <DarkPanel title="Tank levels">
          {DAIRY_TANKS.map(t => {
            const v = s.levels[t.id];
            const c = t.id === 'cow' ? FLOW.cow.color : t.id === 'buffalo' ? FLOW.buffalo.color : t.id === 'cold' ? '#9B6BE0' : '#5FD3DB';
            return (
              <div key={t.id} style={{ marginBottom: 6, cursor: 'pointer' }} onClick={() => setSelected({ reception: 'reception', cow: 'cowTank', buffalo: 'bufTank', cooling: 'cooling', cold: 'cold' }[t.id])}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span style={{ color: PANEL.dim }}>{v.litres.toLocaleString()} L · <b style={{ color: '#FFFFFF' }}>{v.pct}%</b></span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.09)', marginTop: 3 }}>
                  <div style={{ width: `${v.pct}%`, height: '100%', borderRadius: 3, background: c, transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
        </DarkPanel>

        <DarkPanel title="Process flow">
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            {STEPS.map((st, i) => {
              const on = s.activeSteps.includes(st.n);
              return (
                <div key={st.n} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <div style={{
                    flex: 1, minWidth: 0, textAlign: 'center', padding: '8px 4px', borderRadius: 10,
                    background: on ? 'rgba(95,211,219,0.14)' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? '#5FD3DB88' : PANEL.border}`,
                  }}>
                    <div style={{ fontSize: 20, color: on ? '#5FD3DB' : PANEL.dim }}>{st.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.n}. {st.label}</div>
                    <div style={{ fontSize: 11, color: PANEL.dim, whiteSpace: 'nowrap' }}>{st.sub}</div>
                  </div>
                  {i < STEPS.length - 1 && <span style={{ color: on ? '#5FD3DB' : PANEL.dim, fontSize: 12 }}>›</span>}
                </div>
              );
            })}
          </div>
        </DarkPanel>

        <DarkPanel title="Equipment">
          {[['Pasteurizer', s.pasteurizer.status, 'pasteurizer'], ['Homogenizer', s.homogenizer.status, 'homogenizer'], ['Packing machine', s.packaging.status, 'packing'],
            ['CIP system', s.cip.status, 'cip'], ['Compressor', s.utilities.compressor, 'utilities'], ['Generator', s.utilities.generator, 'utilities']].map(([l, st, id]) => (
            <div key={l} onClick={() => setSelected(id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '3px 0', cursor: 'pointer' }}>
              <span>{l}</span><Pill text={st} />
            </div>
          ))}
        </DarkPanel>

        <DarkPanel title="Pipe legend">
          {Object.values(FLOW).map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
              <span style={{ width: 26, height: 4, borderRadius: 2, background: f.color }} />{f.label}
            </div>
          ))}
        </DarkPanel>
      </div>
    </div>
  );
}
