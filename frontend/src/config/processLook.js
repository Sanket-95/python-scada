// What a tank looks like inside, from its station name (Mimic Page Config
// label): bath colour/clarity, or a dry station (loading bay, dryer) with a
// grating floor instead of liquid. Purely cosmetic.
const DEFAULT_BATHS = ['#6F9FA9', '#8FA36F', '#B48A48', '#7D88B6'];
export function processLook(label = '', idx = 0) {
  const s = label.toLowerCase();
  if (/dryer|dehydrat|oven/.test(s))         return { dry: true, hot: true };
  if (/loading|unloading|load bay|transfer/.test(s)) return { dry: true };
  if (/hot water/.test(s))                   return { bath: '#6FB3D2', opacity: 0.72, hot: true };
  if (/plating|plate/.test(s)) {
    if (/nickel|ni\b/.test(s) && !/zn|zinc/.test(s)) return { bath: '#3E8C68', opacity: 0.72 };
    if (/chrom/.test(s))                     return { bath: '#9AA7C7', opacity: 0.7 };
    if (/copper|cu\b/.test(s))               return { bath: '#2E7FA8', opacity: 0.72 };
    return { bath: '#3F7F8C', opacity: 0.86 };                     // zinc / zinc alloy
  }
  if (/passivat/.test(s)) {
    if (/black/.test(s))                     return { bath: '#2C3036', opacity: 0.85 };
    if (/blue|silver|clear|trivalent/.test(s)) return { bath: '#6F8FD0', opacity: 0.8 };
    return { bath: '#C9B85A', opacity: 0.7 };
  }
  if (/top ?coat|sealer|lacquer/.test(s))    return { bath: '#5E69B0', opacity: 0.82 };
  if (/degreas|clean|soak|electro|anodic/.test(s)) return { bath: '#A8712E', opacity: 0.84 };
  if (/acid|pickl|hcl|nitric|activat|dip|strip|zincate/.test(s)) return { bath: '#B8BE4E', opacity: 0.78 };
  if (/rinse|dragout|drag-out|wash|water/.test(s)) return { bath: '#5FA8C7', opacity: 0.66 };
  return { bath: DEFAULT_BATHS[idx % DEFAULT_BATHS.length], opacity: 0.68 };
}
