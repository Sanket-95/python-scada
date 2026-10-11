// Dunking panel: one row per station (the same station list as the Temperature
// page), each with two rotary switches and three status LEDs.
//
// Tag names are placeholders for the plant's real ones — change them here (and
// only here) once the PLC tag list is known. Lookup is case-insensitive.
export const dunkingTags = stationId => ({
  homeProxy: `Dunking_${stationId}_HomeProxy`,
  output:    `Dunking_${stationId}_Output`,
  healthy:   `Dunking_${stationId}_Healthy`,
});

// Switch positions, keyed by station id. Defaults are the safe ones — manual
// mode, manual output off — and only stations that differ from them are stored,
// so 66 untouched stations cost nothing.
//   mode: 'man' | 'auto'      manual: 'off' | 'on'
export const DEFAULT_DUNKING_SWITCH = { mode: 'man', manual: 'off' };

const KEY = 'scada_dunking_switches_v1';

export function loadDunkingSwitches() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [id, s] of Object.entries(parsed)) {
      const sw = {
        mode:   s?.mode === 'auto' ? 'auto' : DEFAULT_DUNKING_SWITCH.mode,
        manual: s?.manual === 'on' ? 'on' : DEFAULT_DUNKING_SWITCH.manual,
      };
      if (sw.mode !== DEFAULT_DUNKING_SWITCH.mode || sw.manual !== DEFAULT_DUNKING_SWITCH.manual) out[id] = sw;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDunkingSwitches(switches) {
  localStorage.setItem(KEY, JSON.stringify(switches));
}
