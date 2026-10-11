// Spray pump panel: which pumps exist, which live tags drive their status
// LEDs, and where the two rotary-switch positions are kept.
//
// Tag names below are placeholders for the plant's real ones — change them
// here (and only here) once the PLC tag list is known. Lookup is
// case-insensitive.

export const SPRAY_PUMPS = [
  {
    id: 'pump1', label: 'Spray Pump 1', station: 37,
    tags: { healthy: 'SprayPump1_Healthy', scrubberHealthy: 'SprayPump1_ScrubberHealthy', outputStatus: 'SprayPump1_OutputStatus' },
  },
  {
    id: 'pump2', label: 'Spray Pump 2', station: 60,
    tags: { healthy: 'SprayPump2_Healthy', scrubberHealthy: 'SprayPump2_ScrubberHealthy', outputStatus: 'SprayPump2_OutputStatus' },
  },
];

// Shared with every other screen that has status LEDs; re-exported so this
// module's public surface is unchanged.
export { ledState } from './ledState';

// Switch positions. Defaults are the safe ones: manual mode, manual output off.
//   mode:   'man' | 'auto'     manual: 'off' | 'on'
export const DEFAULT_SWITCHES = { mode: 'man', manual: 'off' };

const KEY = 'scada_spray_pump_switches_v1';

export function loadSprayPumpSwitches() {
  let stored = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed;
  } catch {}
  return Object.fromEntries(SPRAY_PUMPS.map(p => {
    const s = stored[p.id] || {};
    return [p.id, {
      mode:   s.mode === 'auto' ? 'auto' : DEFAULT_SWITCHES.mode,
      manual: s.manual === 'on' ? 'on' : DEFAULT_SWITCHES.manual,
    }];
  }));
}

export function saveSprayPumpSwitches(switches) {
  localStorage.setItem(KEY, JSON.stringify(switches));
}
