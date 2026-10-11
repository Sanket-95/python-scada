// Indicator light. red = off, green = on, grey = no data — deliberately neither
// on nor off. The state is always spelled out in text as well, so it never
// depends on colour alone.
//   shape "round" (default): a lamp with the caption underneath
//   shape "rect":            a compact rectangular lamp with the caption inside
const LED = {
  on:      { color: '#2E7D32', text: 'ON' },
  off:     { color: '#C62828', text: 'OFF' },
  unknown: { color: '#B4BDCB', text: 'NO DATA' },
};

export default function StatusLed({ label, state, shape = 'round' }) {
  const { color, text } = LED[state] || LED.unknown;
  const lit = state === 'on' || state === 'off';
  const glow = lit ? `0 0 10px ${color}AA, inset 0 2px 3px rgba(255,255,255,0.35)` : 'none';

  if (shape === 'rect') {
    return (
      <span
        role="img" aria-label={`${label}: ${text}`} data-state={state} data-shape="rect"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 62, height: 24, boxSizing: 'border-box', borderRadius: 4,
          background: color, border: '2px solid rgba(0,0,0,0.28)', boxShadow: glow,
          fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
          color: lit ? '#FFFFFF' : '#5B6678',
        }}
      >{text}</span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <span
        role="img" aria-label={`${label}: ${text}`} data-state={state}
        style={{
          width: 26, height: 26, borderRadius: '50%', background: color,
          border: '2px solid rgba(0,0,0,0.28)', boxShadow: glow,
        }}
      />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: lit ? color : '#8090A8' }}>{text}</span>
    </div>
  );
}
