// Alarm time settings: one value per (row, wagon). Rows and wagon columns are
// defined here so the page is just a grid over these lists.
//
// Stored in localStorage like the app's other page-level settings, as the
// strings typed (an empty box stays empty rather than becoming 0):
//   { lift: { W1: "12", W3: "15" }, topDrip: { W2: "4" } }
//
// This is the local copy only; pushing these to the PLC is a separate step.

export const ALARM_TIME_ROWS = [
  { id: 'lift',         label: 'Lift' },
  { id: 'lower',        label: 'Lower' },
  { id: 'slowForward',  label: 'Slow Forward' },
  { id: 'slowBackward', label: 'Slow Backward' },
  { id: 'topDrip',      label: 'Top Drip Time' },
];

export const ALARM_TIME_COLUMNS = ['W1', 'W2', 'W3', 'W4'];

const KEY = 'scada_alarm_times_v1';

export function loadAlarmTimes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {};
}

export function saveAlarmTimes(times) {
  localStorage.setItem(KEY, JSON.stringify(times));
}
