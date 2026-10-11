// Drip tray settings: one row per station 1..DRIP_TRAY_STATIONS, each with a
// Bypass rotary switch and a Top Drip Time value.
//
// Two separate stores, matching how the two controls behave on the page:
//   bypass  a switch — applied and persisted the moment it is turned
//           { "3": "on" }      only stations switched ON are stored (off = default)
//   times   typed values — persisted when Save is pressed
//           { "3": "5.5" }     strings as typed; empty means "no value"
//
// Local copy only; pushing these to the PLC is a separate step.

export const DRIP_TRAY_STATIONS = 30;

const BYPASS_KEY = 'scada_drip_tray_bypass_v1';
const TIMES_KEY  = 'scada_drip_tray_times_v1';

function loadObject(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {};
}

export const loadDripBypass = () => loadObject(BYPASS_KEY);
export const saveDripBypass = bypass => localStorage.setItem(BYPASS_KEY, JSON.stringify(bypass));
export const loadDripTimes  = () => loadObject(TIMES_KEY);
export const saveDripTimes  = times => localStorage.setItem(TIMES_KEY, JSON.stringify(times));
