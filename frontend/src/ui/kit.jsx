// Shared UI kit for every non-scene screen (everything except the 2D/3D views).
// One visual language: left-aligned page header with breadcrumb + actions,
// white rounded cards, KPI tiles, pill buttons, toggles, segmented controls,
// status pills and data tables. Colours/fonts come from theme.js.
import { useState } from 'react';
import { THEME, FONT, FONT_COND, FONT_MONO } from '../theme';

export const UI = {
  radius: 14,
  cardBorder: '#E1E6EA',
  shadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 18px rgba(16,24,40,0.05)',
  ring: `0 0 0 3px ${THEME.accent}33`,
};

const TONES = {
  neutral: { fg: THEME.textMid, bg: '#EEF1F4', bd: '#DCE2E7' },
  info:    { fg: THEME.accentDark, bg: THEME.accentSoft, bd: '#B7E1E0' },
  ok:      { fg: '#226B47', bg: '#E3F4EA', bd: '#BFE3CD' },
  warn:    { fg: '#94500A', bg: '#FDF0DD', bd: '#F4D3A6' },
  danger:  { fg: '#A62B2B', bg: '#FBE7E6', bd: '#F2C2BF' },
  violet:  { fg: '#6B3FA8', bg: '#F1EAFB', bd: '#DCCBF3' },
  amber:   { fg: '#7A5600', bg: '#FFF4D6', bd: '#F5DE9C' },
};
export const tone = t => TONES[t] || TONES.neutral;

// ── Page shell ───────────────────────────────────────────────────────────────
export function Page({ crumbs = [], title, subtitle, actions, tabs, children, width = 1240, onBack }) {
  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: THEME.pageBg, fontFamily: FONT }}>
      <div style={{ maxWidth: width, margin: '0 auto', padding: '22px 32px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: tabs ? 14 : 22 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: THEME.textDim, marginBottom: 6 }}>
              {onBack && (
                <button onClick={onBack} title="Back" style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 6px 0 0',
                  color: THEME.accent, fontSize: 13, fontWeight: 700,
                }}>← Back</button>
              )}
              {crumbs.map((c, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(i > 0 || onBack) && <span style={{ opacity: 0.5 }}>/</span>}
                  <span style={{ color: i === crumbs.length - 1 ? THEME.textMid : THEME.textDim }}>{c}</span>
                </span>
              ))}
            </div>
            <h1 style={{ margin: 0, fontFamily: FONT_COND, fontSize: 32, fontWeight: 700, color: THEME.text, letterSpacing: 0.3, lineHeight: 1.05 }}>{title}</h1>
            {subtitle && <div style={{ marginTop: 6, fontSize: 14, color: THEME.textMid, maxWidth: 720, lineHeight: 1.45 }}>{subtitle}</div>}
          </div>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
        {tabs}
        {children}
      </div>
    </div>
  );
}

// ── Layout helpers ───────────────────────────────────────────────────────────
export function Grid({ min = 260, gap = 16, children, style }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap, ...style }}>{children}</div>;
}
export function Row({ gap = 12, children, style, wrap = true, align = 'center' }) {
  return <div style={{ display: 'flex', alignItems: align, gap, flexWrap: wrap ? 'wrap' : 'nowrap', ...style }}>{children}</div>;
}
export function Spacer() { return <div style={{ flex: 1 }} />; }

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ title, subtitle, icon, actions, children, pad = 20, style, bodyStyle, accent }) {
  return (
    <section style={{
      background: THEME.panel, borderRadius: UI.radius, border: `1px solid ${UI.cardBorder}`,
      boxShadow: UI.shadow, overflow: 'hidden', ...style,
    }}>
      {(title || actions) && (
        <header style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
          borderBottom: `1px solid ${UI.cardBorder}`, ...(accent ? { borderTop: `3px solid ${accent}` } : {}),
        }}>
          {icon && (
            <span style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: THEME.accentSoft, color: THEME.accentDark, fontSize: 16, fontWeight: 700,
            }}>{icon}</span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: THEME.textDim, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding: pad, ...bodyStyle }}>{children}</div>
    </section>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────────
export function Stat({ label, value, sub, toneName = 'neutral', icon }) {
  const t = tone(toneName);
  return (
    <div style={{
      background: THEME.panel, borderRadius: UI.radius, border: `1px solid ${UI.cardBorder}`, boxShadow: UI.shadow,
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 0,
    }}>
      {icon && (
        <span style={{ width: 42, height: 42, borderRadius: 12, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{icon}</span>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, color: THEME.textDim, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontFamily: FONT_COND, fontSize: 30, fontWeight: 700, color: toneName === 'neutral' ? THEME.text : t.fg, lineHeight: 1.05 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: THEME.textDim, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────
export function Button({ variant = 'secondary', size = 'md', icon, children, style, disabled, ...rest }) {
  const h = size === 'sm' ? 30 : size === 'lg' ? 44 : 38;
  const v = {
    primary:   { bg: THEME.accent, fg: '#FFFFFF', bd: THEME.accent },
    secondary: { bg: '#FFFFFF', fg: THEME.text, bd: '#D2D8DE' },
    ghost:     { bg: 'transparent', fg: THEME.accentDark, bd: 'transparent' },
    danger:    { bg: '#FFFFFF', fg: THEME.danger, bd: '#F2C2BF' },
    dark:      { bg: THEME.frame, fg: '#FFFFFF', bd: THEME.frame },
  }[variant];
  return (
    <button disabled={disabled} {...rest} style={{
      height: h, padding: `0 ${size === 'sm' ? 12 : 16}px`, borderRadius: 999,
      background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
      fontSize: size === 'sm' ? 12.5 : 13.5, fontWeight: 700, letterSpacing: 0.2,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
      boxShadow: variant === 'primary' && !disabled ? `0 4px 12px ${THEME.accent}40` : 'none',
      whiteSpace: 'nowrap', transition: 'filter 0.12s, background 0.12s', ...style,
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = 'brightness(0.95)'; }}
      onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
    >
      {icon && <span style={{ fontSize: size === 'sm' ? 13 : 15, lineHeight: 1 }}>{icon}</span>}
      {children}
    </button>
  );
}

// ── Form controls ────────────────────────────────────────────────────────────
const inputBase = (invalid, extra) => ({
  width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px',
  borderRadius: 10, border: `1px solid ${invalid ? THEME.danger : '#D2D8DE'}`,
  background: '#FFFFFF', color: THEME.text, fontSize: 14, fontFamily: FONT, outline: 'none',
  transition: 'border-color 0.12s, box-shadow 0.12s', ...extra,
});
const focusOn  = e => { e.target.style.borderColor = THEME.accent; e.target.style.boxShadow = UI.ring; };
const focusOff = invalid => e => { e.target.style.borderColor = invalid ? THEME.danger : '#D2D8DE'; e.target.style.boxShadow = 'none'; };

export function Input({ invalid, mono, style, onFocus, onBlur, ...rest }) {
  return (
    <input {...rest}
      style={inputBase(invalid, { fontFamily: mono ? FONT_MONO : FONT, fontSize: mono ? 13 : 14, ...style })}
      onFocus={e => { focusOn(e); onFocus?.(e); }}
      onBlur={e => { focusOff(invalid)(e); onBlur?.(e); }}
    />
  );
}

export function Select({ options = [], style, invalid, ...rest }) {
  return (
    <select {...rest} style={inputBase(invalid, { cursor: 'pointer', paddingRight: 30, appearance: 'auto', ...style })}
      onFocus={focusOn} onBlur={focusOff(invalid)}>
      {options.map(o => typeof o === 'object'
        ? <option key={o.value} value={o.value}>{o.label}</option>
        : <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function Field({ label, hint, error, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...style }}>
      {label && <span style={{ fontSize: 12.5, fontWeight: 700, color: THEME.textMid }}>{label}</span>}
      {children}
      {(error || hint) && <span style={{ fontSize: 12, color: error ? THEME.danger : THEME.textDim }}>{error || hint}</span>}
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', width = 260 }) {
  return (
    <div style={{ position: 'relative', width }}>
      <span style={{ position: 'absolute', left: 12, top: 9, fontSize: 14, color: THEME.textDim, pointerEvents: 'none' }}>⌕</span>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ paddingLeft: 32, borderRadius: 999 }} />
    </div>
  );
}

// ── Toggle switch ────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label, disabled, size = 'md' }) {
  const w = size === 'sm' ? 34 : 42, h = size === 'sm' ? 20 : 24;
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, userSelect: 'none' }}>
      <span
        role="switch" aria-checked={!!checked}
        onClick={() => !disabled && onChange?.(!checked)}
        style={{
          width: w, height: h, borderRadius: h, position: 'relative', flexShrink: 0,
          background: checked ? THEME.accent : '#C9D0D6', transition: 'background 0.15s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? w - h + 3 : 3, width: h - 6, height: h - 6,
          borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.15s',
        }} />
      </span>
      {label && <span style={{ fontSize: 13.5, fontWeight: 600, color: THEME.text }}>{label}</span>}
    </label>
  );
}

// ── Segmented control ────────────────────────────────────────────────────────
export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, gap: 2, borderRadius: 999, background: '#E6EAEE', border: '1px solid #DCE2E7' }}>
      {options.map(o => {
        const opt = typeof o === 'object' ? o : { value: o, label: o };
        const active = opt.value === value;
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)} style={{
            border: 'none', cursor: 'pointer', borderRadius: 999,
            padding: size === 'sm' ? '4px 10px' : '7px 14px',
            fontSize: size === 'sm' ? 12 : 13, fontWeight: 700,
            background: active ? (opt.color || THEME.panel) : 'transparent',
            color: active ? (opt.color ? '#FFFFFF' : THEME.text) : THEME.textMid,
            boxShadow: active ? '0 1px 3px rgba(16,24,40,0.15)' : 'none',
            transition: 'background 0.12s',
          }}>{opt.label}</button>
        );
      })}
    </div>
  );
}

// ── Tabs (underline) ─────────────────────────────────────────────────────────
export function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid #D9DFE4`, marginBottom: 20, overflowX: 'auto' }}>
      {tabs.map(t => {
        const active = t.value === value;
        return (
          <button key={t.value} onClick={() => onChange(t.value)} style={{
            border: 'none', background: 'transparent', cursor: 'pointer', padding: '10px 14px',
            fontSize: 14, fontWeight: 700, color: active ? THEME.accentDark : THEME.textMid,
            borderBottom: `3px solid ${active ? THEME.accent : 'transparent'}`, marginBottom: -1, whiteSpace: 'nowrap',
          }}>
            {t.label}
            {t.count != null && (
              <span style={{ marginLeft: 8, fontSize: 11.5, padding: '1px 7px', borderRadius: 999, background: active ? THEME.accentSoft : '#E6EAEE', color: active ? THEME.accentDark : THEME.textMid }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Badges / status pills ────────────────────────────────────────────────────
export function Badge({ toneName = 'neutral', children, dot, style }) {
  const t = tone(toneName);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px',
      borderRadius: 999, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', ...style,
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.fg }} />}
      {children}
    </span>
  );
}

// 'on' | 'off' | 'unknown' signal → pill.
export function SignalPill({ state, onText = 'ON', offText = 'OFF' }) {
  if (state === 'on')  return <Badge toneName="ok" dot>{onText}</Badge>;
  if (state === 'off') return <Badge toneName="danger" dot>{offText}</Badge>;
  return <Badge toneName="neutral">NO SIGNAL</Badge>;
}

// ── Table ────────────────────────────────────────────────────────────────────
// columns: [{ key, label, width, align, render(row, i) }]
export function DataTable({ columns, rows, rowKey = (r, i) => i, empty = 'Nothing to show', maxHeight, dense, rowStyle, onRowClick }) {
  const [hover, setHover] = useState(null);
  return (
    <div style={{ overflow: 'auto', maxHeight, borderRadius: 10, border: `1px solid ${UI.cardBorder}` }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13.5 }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{
                position: 'sticky', top: 0, zIndex: 1, background: '#F4F6F8', textAlign: c.align || 'left',
                padding: dense ? '8px 12px' : '11px 14px', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', color: THEME.textDim, borderBottom: `1px solid ${UI.cardBorder}`,
                width: c.width, whiteSpace: 'nowrap',
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: THEME.textDim }}>{empty}</td></tr>
          )}
          {rows.map((r, i) => {
            const k = rowKey(r, i);
            return (
              <tr key={k}
                onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{ background: hover === k ? '#F7FAFB' : '#FFFFFF', cursor: onRowClick ? 'pointer' : 'default', ...(rowStyle?.(r) || {}) }}>
                {columns.map(c => (
                  <td key={c.key} style={{
                    padding: dense ? '7px 12px' : '11px 14px', textAlign: c.align || 'left',
                    borderBottom: `1px solid #EEF1F3`, color: THEME.text, verticalAlign: 'middle',
                  }}>{c.render ? c.render(r, i) : r[c.key]}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Misc ─────────────────────────────────────────────────────────────────────
export function EmptyState({ icon = '◌', title, text, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 20px', color: THEME.textMid }}>
      <div style={{ fontSize: 34, color: THEME.textDim, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>{title}</div>
      {text && <div style={{ fontSize: 13.5, marginTop: 6, maxWidth: 460, marginInline: 'auto' }}>{text}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Callout({ toneName = 'info', title, children, icon = 'ℹ' }) {
  const t = tone(toneName);
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 12, background: t.bg, border: `1px solid ${t.bd}`, color: t.fg, fontSize: 13.5, lineHeight: 1.5 }}>
      <span style={{ fontSize: 16, lineHeight: 1.3 }}>{icon}</span>
      <div>{title && <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>}<div style={{ color: THEME.textMid }}>{children}</div></div>
    </div>
  );
}

export function SavedNote({ show, text = 'Saved' }) {
  return (
    <span style={{
      fontSize: 13, fontWeight: 700, color: THEME.ok, opacity: show ? 1 : 0,
      transition: 'opacity 0.25s', display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>✓ {text}</span>
  );
}

export function Mono({ children, style }) {
  return <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, ...style }}>{children}</span>;
}

// Thin horizontal progress/level bar.
export function Meter({ value, max = 100, color = THEME.accent, height = 6 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ height, borderRadius: height, background: '#E6EAEE', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: height, transition: 'width 0.4s' }} />
    </div>
  );
}

// ── Modal dialog with an optional step indicator ─────────────────────────────
export function Modal({ title, subtitle, steps, step, onClose, children, footer, width = 680 }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(22,27,34,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ width, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: THEME.panel, borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${UI.cardBorder}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT_COND, fontSize: 24, fontWeight: 700, color: THEME.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: THEME.textDim, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} title="Close" style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: '#EEF1F4', cursor: 'pointer', fontSize: 15, color: THEME.textMid }}>✕</button>
        </div>
        {steps && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 22px', background: '#F8FAFB', borderBottom: `1px solid ${UI.cardBorder}` }}>
            {steps.map((s, i) => {
              const idx = steps.indexOf(step), state = i < idx ? 'done' : i === idx ? 'now' : 'next';
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', color: state === 'next' ? THEME.textDim : '#FFFFFF', background: state === 'done' ? THEME.ok : state === 'now' ? THEME.accent : '#DCE2E7' }}>{state === 'done' ? '✓' : i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: state === 'next' ? THEME.textDim : THEME.text }}>{s}</span>
                  {i < steps.length - 1 && <span style={{ flex: 1, height: 2, background: '#DCE2E7', borderRadius: 1 }} />}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
        {footer && <div style={{ padding: '14px 22px', borderTop: `1px solid ${UI.cardBorder}`, display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>{footer}</div>}
      </div>
    </div>
  );
}

// Big dashed file-drop button.
export function FilePick({ onClick, label = 'Choose a file…', hint }) {
  return (
    <button onClick={onClick} style={{ padding: '26px 16px', borderRadius: 14, border: `2px dashed ${THEME.accent}66`, background: THEME.accentSoft, cursor: 'pointer', textAlign: 'center' }}>
      <div style={{ fontSize: 26, color: THEME.accentDark }}>⇪</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: THEME.accentDark, marginTop: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: 12.5, color: THEME.textMid, marginTop: 4 }}>{hint}</div>}
    </button>
  );
}
