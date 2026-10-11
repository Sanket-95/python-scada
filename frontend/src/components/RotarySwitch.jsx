const ACCENT = '#1565C0';
const DIM = '#8090A8';

// Two-position rotary selector, drawn inline (no images/fonts). One click
// turns the knob to the other position. `label` is the accessible name (screen
// readers hear "<label>: <current position>").
export default function RotarySwitch({ label, leftLabel, rightLabel, isRight, onToggle }) {
  const caption = (text, active, anchor, x) => (
    <text x={x} y="11" textAnchor={anchor} fontSize="10" fontWeight={active ? 800 : 600}
      fill={active ? ACCENT : DIM} fontFamily="'Segoe UI', system-ui, sans-serif">{text}</text>
  );
  return (
    <button
      type="button" role="switch" aria-checked={isRight}
      aria-label={`${label}: ${isRight ? rightLabel : leftLabel}`}
      onClick={onToggle}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex' }}
    >
      <svg width="92" height="68" viewBox="0 0 92 68" aria-hidden="true">
        {caption(leftLabel, !isRight, 'start', 4)}
        {caption(rightLabel, isRight, 'end', 88)}
        <circle cx="46" cy="41" r="22" fill="#2B3445" stroke="#111827" strokeWidth="2" />
        <circle cx="46" cy="41" r="16.5" fill="#3B475C" />
        <g style={{
          transform: `rotate(${isRight ? 42 : -42}deg)`, transformOrigin: '46px 41px',
          transition: 'transform 0.18s ease-out',
        }}>
          <rect x="43.3" y="22" width="5.4" height="19" rx="2.7" fill="#F5F7FA" />
        </g>
        <circle cx="46" cy="41" r="3.2" fill="#111827" />
      </svg>
    </button>
  );
}
