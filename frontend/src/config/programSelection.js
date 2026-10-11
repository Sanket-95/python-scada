// Program Selection screen values, kept in localStorage like the app's other
// page-level settings. Strings as typed; an empty box means "no value".
//   { selected: "3", running: "2" }
//
// Local copy only; pushing these to the PLC is a separate step.

export const PROGRAM_FIELDS = [
  { id: 'selected', label: 'Program Selection' },
  { id: 'running',  label: 'Program Running' },
];

const KEY = 'scada_program_selection_v1';

export function loadProgramValues() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {};
}

export function saveProgramValues(values) {
  localStorage.setItem(KEY, JSON.stringify(values));
}
