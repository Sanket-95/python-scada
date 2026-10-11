// Low / High temperature set points per station, kept in localStorage like the
// app's other page-level settings (station names, columns). Keyed by station
// id, so renaming or reordering station names never detaches a value.
//
//   { "12": { low: "40", high: "60" }, ... }   values are kept as the strings
//   typed, so an empty box stays empty rather than becoming 0.
//
// This is the local copy only; pushing these to the PLC is a separate step.

const KEY = 'scada_temp_setpoints_v1';

export function loadTempSetpoints() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {};
}

export function saveTempSetpoints(setpoints) {
  localStorage.setItem(KEY, JSON.stringify(setpoints));
}
