// App-wide look: brand, fonts and colour tokens. Every screen takes its colours
// from here (directly, or via the per-page `T` objects that map onto these), so
// a re-brand is a change to this one file.

export const BRAND = {
  name:    'SSIT',          // sidebar wordmark
  product: 'LINE SCADA',    // sidebar sub-title
  title:   'SSIT Line SCADA',
};

export const FONT      = "'Barlow', 'Segoe UI', system-ui, sans-serif";
export const FONT_COND = "'Barlow Condensed', 'Barlow', 'Segoe UI', sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'Consolas', monospace";

export const THEME = {
  // Work area
  pageBg:   '#EDF0F3',
  panel:    '#FFFFFF',
  panelAlt: '#F5F7F8',
  cardHdr:  '#E5EAEE',
  border:   '#D2D8DE',
  // Text
  text:     '#1C232B',
  textMid:  '#45505C',
  textDim:  '#7A8591',
  // Accent (teal) + status
  accent:     '#0E7C86',
  accentDark: '#0A5F67',
  accentSoft: '#DDF1F0',
  ok:     '#2F855A',
  warn:   '#C2630A',
  danger: '#C53030',
  // Frame (sidebar / header)
  frame:       '#161B22',
  frameRaised: '#1F262E',
  frameLine:   '#2A323C',
  frameText:   '#C9D1D9',
  frameDim:    '#7D8793',
  amber:       '#F2A900',
};
