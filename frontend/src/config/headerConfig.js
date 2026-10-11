// Header branding config — left-side and center-side name/logo shown in the
// app's top bar. No database: persisted the same way as the rest of this
// app's config (localStorage for instant reload, plus a JSON file via the
// Vite dev API for durability across browsers/machines).

const KEY = 'scada_header_config_v1';

export function defaultHeaderConfig() {
  return {
    left:   { logo1: null, logo2: null }, // logo1/logo2: data-URL string, or null — no name on the left slot
    center: { name: '',    logo: null },
  };
}

function isValid(cfg) {
  return !!(cfg && cfg.left && cfg.center && typeof cfg.center.name === 'string');
}

export function loadHeaderConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (isValid(p)) return p;
    }
  } catch {}
  return defaultHeaderConfig();
}

export function saveHeaderConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export async function loadHeaderConfigFromFile() {
  try {
    const res = await fetch('/api/header-config');
    if (!res.ok) return null;
    const data = await res.json();
    if (isValid(data)) return data;
  } catch {}
  return null;
}

export function saveHeaderConfigToFile(cfg) {
  fetch('/api/header-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }).catch(() => {}); // fire-and-forget; silently ignore if API unavailable
}
