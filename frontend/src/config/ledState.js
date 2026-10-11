// Turns a live tag value into an indicator state. Shared by every screen with
// status LEDs.

const ON  = new Set(['1', 'true', 'on', 'yes']);
const OFF = new Set(['0', 'false', 'off', 'no']);

// Case-insensitive lookup table for a tag set. Build it once per tag update
// (useMemo) and reuse it for every LED, rather than rescanning all tags per LED.
export function indexTags(tags) {
  const index = new Map();
  for (const [name, tag] of Object.entries(tags || {})) index.set(name.toLowerCase(), tag);
  return index;
}

// 'on' | 'off' | 'unknown'. Unknown — not off — when there is no connection,
// no value for that tag, or a value that isn't recognisably on/off: an
// indicator that says "off" while nothing is actually known would be a lie.
export function ledStateOf(index, connected, tagName) {
  if (!connected) return 'unknown';
  const v = String(index.get(tagName.toLowerCase())?.value ?? '').trim().toLowerCase();
  if (ON.has(v)) return 'on';
  if (OFF.has(v)) return 'off';
  return 'unknown';
}

export const ledState = (tags, connected, tagName) => ledStateOf(indexTags(tags), connected, tagName);
