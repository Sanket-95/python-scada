import { useEffect, useMemo, useRef, useState } from 'react';
import { THEME } from '../theme';
import { SERIES, SEVERITY } from './api';

// Small SVG chart kit for the reports. Rules (dataviz method): one y-axis
// only, thin marks (2 px lines, rounded 4 px bar ends), 2 px gaps between
// stacked segments, recessive grid, legend for ≥ 2 series, hover tooltip on
// every chart, text in text colours (never the series colour).

const INK = { primary: THEME.text, secondary: THEME.textMid, muted: THEME.textDim, grid: '#E6EAEE', axis: '#C9D0D6' };

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const fmt = v => (v == null ? '—' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : +v.toFixed(2));

export function Legend({ items }) {
  if (!items || items.length < 2) return null;
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: INK.secondary, marginBottom: 6 }}>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: it.line ? 3 : 10, borderRadius: 2, background: it.color }} />{it.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, w, children }) {
  const left = Math.min(Math.max(x + 12, 4), w - 190);
  return (
    <div style={{
      position: 'absolute', left, top: Math.max(y - 10, 0), pointerEvents: 'none', zIndex: 5,
      background: '#FFFFFF', border: '1px solid #DCE2E7', borderRadius: 8, boxShadow: '0 6px 18px rgba(16,24,40,0.12)',
      padding: '7px 10px', fontSize: 12.5, color: INK.primary, minWidth: 140, whiteSpace: 'nowrap',
    }}>{children}</div>
  );
}

// ── Line chart (time x-axis) ─────────────────────────────────────────────────
export function LineChart({ series, height = 240, unit = '', yMax, refLines = [], bands = [], step = false, xTick }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const M = { l: 52, r: 14, t: 24, b: 26 };
  const all = series.flatMap(s => s.points);
  const xs = all.map(p => +new Date(p.x));
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
  const ys = all.map(p => p.y).concat(refLines.map(r => r.y));
  const yLo = Math.min(0, ...ys.filter(v => v != null));
  const yHi = yMax ?? niceMax(Math.max(...ys.filter(v => v != null), 1));
  const yMin = yLo < 0 ? -niceMax(-yLo) : series.some(s => s.floor != null) ? series[0].floor : 0;
  const X = t => M.l + ((t - x0) / (x1 - x0)) * (W - M.l - M.r);
  const Y = v => M.t + (1 - (v - yMin) / (yHi - yMin || 1)) * (height - M.t - M.b);
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yHi - yMin) * i) / 4);
  const xticks = Array.from({ length: Math.min(6, Math.max(2, Math.floor(W / 130))) }, (_, i) => x0 + ((x1 - x0) * i) / (Math.min(6, Math.max(2, Math.floor(W / 130))) - 1));
  const path = s => s.points.map((p, i) => {
    const px = X(+new Date(p.x)), py = Y(p.y);
    if (!step || i === 0) return `${i ? 'L' : 'M'}${px},${py}`;
    return `H${px}V${py}`;
  }).join('');
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const t = x0 + ((mx - M.l) / (W - M.l - M.r)) * (x1 - x0);
    const vals = series.map(s => {
      let best = null;
      for (const p of s.points) { const d = Math.abs(+new Date(p.x) - t); if (!best || d < best.d) best = { d, p }; }
      return best && { name: s.name, color: s.color, p: best.p };
    }).filter(Boolean);
    setHover({ mx, t, vals });
  };
  const tickLabel = xTick || (t => new Date(t).toLocaleString('en-GB', (x1 - x0) > 2 * 864e5 ? { day: '2-digit', month: 'short' } : { hour: '2-digit', minute: '2-digit' }));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Legend items={series.map(s => ({ label: s.name, color: s.color, line: true }))} />
      <svg width={W} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: 'block' }}>
        {bands.map((b, i) => (
          <rect key={i} x={X(+new Date(b.x0))} y={M.t} width={Math.max(2, X(+new Date(b.x1)) - X(+new Date(b.x0)))} height={height - M.t - M.b} fill={b.color || '#FDF0DD'} />
        ))}
        {ticks.map(v => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} stroke={INK.grid} />
            <text x={M.l - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill={INK.muted}>{fmt(v)}</text>
          </g>
        ))}
        {xticks.map(t => <text key={t} x={X(t)} y={height - 8} textAnchor="middle" fontSize="11" fill={INK.muted}>{tickLabel(t)}</text>)}
        {unit && <text x={M.l - 6} y={12} textAnchor="end" fontSize="11" fontWeight="700" fill={INK.muted}>{unit}</text>}
        {refLines.map(r => (
          <g key={r.label}>
            <line x1={M.l} x2={W - M.r} y1={Y(r.y)} y2={Y(r.y)} stroke={r.color || INK.secondary} strokeDasharray="5 4" strokeWidth="1.5" />
            <text x={W - M.r - 4} y={Y(r.y) - 5} textAnchor="end" fontSize="11" fill={INK.secondary}>{r.label}</text>
          </g>
        ))}
        {series.map(s => <path key={s.name} d={path(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />)}
        {hover && (
          <g>
            <line x1={hover.mx} x2={hover.mx} y1={M.t} y2={height - M.b} stroke={INK.axis} />
            {hover.vals.map(v => <circle key={v.name} cx={X(+new Date(v.p.x))} cy={Y(v.p.y)} r="4.5" fill={v.color} stroke="#FFFFFF" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {hover && hover.vals.length > 0 && (
        <Tooltip x={hover.mx} y={20} w={W}>
          <div style={{ color: INK.muted, marginBottom: 3 }}>{new Date(hover.vals[0].p.x).toLocaleString('en-GB')}</div>
          {hover.vals.map(v => (
            <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color }} />
              <span style={{ color: INK.secondary }}>{v.name}</span>
              <b style={{ marginLeft: 'auto' }}>{fmt(v.p.y)}{unit ? ` ${unit}` : ''}</b>
              {v.p.extra && <span style={{ color: INK.muted }}>{v.p.extra}</span>}
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// ── Bar chart (category x-axis, grouped or stacked) ──────────────────────────
export function BarChart({ data, keys, stacked = false, height = 220, unit = '', xLabel = d => d.x }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const M = { l: 52, r: 10, t: 24, b: 30 };
  const max = niceMax(Math.max(1, ...data.map(d => (stacked ? keys.reduce((a, k) => a + (d[k.key] || 0), 0) : Math.max(...keys.map(k => d[k.key] || 0))))));
  const band = (W - M.l - M.r) / Math.max(data.length, 1);
  const inner = Math.min(band * 0.7, stacked ? 46 : 22 * keys.length + 8);
  const Y = v => M.t + (1 - v / max) * (height - M.t - M.b);
  const ticks = Array.from({ length: 5 }, (_, i) => (max * i) / 4);
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor((W - M.l) / 64)));
  const roundTop = (x, y, w, h) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Legend items={keys.map(k => ({ label: k.label, color: k.color }))} />
      <svg width={W} height={height} style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} stroke={INK.grid} />
            <text x={M.l - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill={INK.muted}>{fmt(v)}</text>
          </g>
        ))}
        {unit && <text x={M.l - 6} y={12} textAnchor="end" fontSize="11" fontWeight="700" fill={INK.muted}>{unit}</text>}
        {data.map((d, i) => {
          const cx = M.l + band * i + band / 2;
          let acc = 0;
          return (
            <g key={i} onMouseMove={e => { const r = e.currentTarget.ownerSVGElement.getBoundingClientRect(); setHover({ d, x: e.clientX - r.left, y: e.clientY - r.top }); }}>
              <rect x={M.l + band * i} y={M.t} width={band} height={height - M.t - M.b} fill={hover?.d === d ? '#F2F5F7' : 'transparent'} />
              {keys.map((k, j) => {
                const v = d[k.key] || 0;
                if (v <= 0) return null;
                if (stacked) {
                  const y = Y(acc + v), h = Y(acc) - Y(acc + v);
                  acc += v;
                  const top = keys.slice(j + 1).every(kk => !(d[kk.key] > 0));
                  return top
                    ? <path key={k.key} d={roundTop(cx - inner / 2, y, inner, Math.max(h - 2, 1))} fill={k.color} />
                    : <rect key={k.key} x={cx - inner / 2} y={y} width={inner} height={Math.max(h - 2, 1)} fill={k.color} />;
                }
                const bw = (inner - 2 * (keys.length - 1)) / keys.length;
                const x = cx - inner / 2 + j * (bw + 2);
                return <path key={k.key} d={roundTop(x, Y(v), bw, Y(0) - Y(v))} fill={k.color} />;
              })}
              {i % labelEvery === 0 && <text x={cx} y={height - 10} textAnchor="middle" fontSize="11" fill={INK.muted}>{xLabel(d)}</text>}
            </g>
          );
        })}
        <line x1={M.l} x2={W - M.r} y1={Y(0)} y2={Y(0)} stroke={INK.axis} />
      </svg>
      {hover && (
        <Tooltip x={hover.x} y={hover.y} w={W}>
          <div style={{ color: INK.muted, marginBottom: 3 }}>{xLabel(hover.d)}</div>
          {keys.map(k => (
            <div key={k.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: k.color }} />
              <span style={{ color: INK.secondary }}>{k.label}</span><b style={{ marginLeft: 'auto' }}>{fmt(hover.d[k.key] || 0)}{unit ? ` ${unit}` : ''}</b>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

const shortDate = s => (s.length > 10 ? s.slice(5, 16).replace('T', ' ') : new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));

// ── Named report charts ──────────────────────────────────────────────────────
export function MilkComparisonChart({ cow, buffalo, metrics }) {
  const data = metrics.map(m => ({ x: m.label, Cow: cow[m.key], Buffalo: buffalo[m.key] }));
  return <BarChart data={data} keys={[{ key: 'Cow', label: 'Cow', color: SERIES.Cow }, { key: 'Buffalo', label: 'Buffalo', color: SERIES.Buffalo }]} unit={metrics[0]?.unit} height={200} />;
}

export function DailyMilkChart({ daily }) {
  return <BarChart data={daily} stacked xLabel={d => shortDate(d.x)} unit="L"
    keys={[{ key: 'Cow', label: 'Cow', color: SERIES.Cow }, { key: 'Buffalo', label: 'Buffalo', color: SERIES.Buffalo }]} />;
}

export function ProductionTrendChart({ output, bucket }) {
  return <BarChart data={output} keys={[{ key: 'packs', label: 'Accepted packs', color: SERIES.Buffalo }]} unit="packs"
    xLabel={d => (bucket === 'hour' ? d.x.slice(5, 13).replace('T', ' ') + 'h' : shortDate(d.x))} />;
}

export function TankInventoryChart({ history }) {
  const series = Object.entries(history).map(([tid, h]) => ({
    name: tid, color: SERIES[tid], points: h.points.map(p => ({ x: p.t, y: +(p.l / h.capacity * 100).toFixed(1), extra: `${Math.round(p.l).toLocaleString()} L` })),
  }));
  return <LineChart series={series} unit="%" yMax={100} step refLines={[{ y: 90, label: 'High-level alarm 90 %', color: THEME.danger }]} />;
}

export function ProcessTemperatureChart({ profile, target }) {
  const bands = useMemo(() => {
    const out = [];
    profile.forEach((p, i) => {
      if (p.fdv === 'DIVERT') out.push({ x0: p.t, x1: profile[i + 1]?.t || p.t, color: '#FDF0DD' });
      else if (p.outlet_c < target) out.push({ x0: p.t, x1: profile[i + 1]?.t || p.t, color: '#FBE7E6' });
    });
    return out;
  }, [profile, target]);
  const lo = Math.min(...profile.map(p => p.outlet_c), target) - 1;
  return (
    <div>
      <LineChart series={[{ name: 'Holding-tube outlet', color: SERIES.Buffalo, floor: Math.floor(lo), points: profile.map(p => ({ x: p.t, y: p.outlet_c, extra: p.fdv === 'DIVERT' ? 'FDV diverting' : '' })) }]}
        unit="°C" yMax={Math.ceil(Math.max(...profile.map(p => p.outlet_c)) + 0.5)} bands={bands}
        refLines={[{ y: target, label: `Demo target ${target} °C`, color: THEME.danger }]} />
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: THEME.textMid, marginTop: 4 }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 10, background: '#FDF0DD', marginRight: 6 }} />Below target, flow diverted (FDV)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 10, background: '#FBE7E6', marginRight: 6 }} />Below target, NOT diverted</span>
      </div>
    </div>
  );
}

export function AlarmTimeline({ daily }) {
  const keys = ['FAULT', 'CRITICAL', 'WARNING', 'INFO'].map(s => ({ key: s, label: s, color: SEVERITY[s] }));
  return <BarChart data={daily} keys={keys} stacked unit="events" xLabel={d => shortDate(d.x)} height={200} />;
}
