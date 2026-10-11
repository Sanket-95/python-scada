// The PLC brand + connection info chosen on the PLC Connection Test screen.
// Persisted the same dual way as the rest of this app's config: localStorage
// for instant reload, plus the FastAPI backend for durability — the backend
// copy is what the App Builder checks before allowing "Generate EXE" (no PLC
// info saved yet = blocked), and what exe_builder.py seeds into a generated
// exe so it starts already pointed at this PLC.

const KEY = 'scada_plc_config_v1'

export function defaultPlcConfig() {
  return {
    brand: 'siemens', ip: '', port: 102,
    rack: 0, slot: 0,
    destNode: '0.0.0', srcNode: '0.127.0', timeout: 2,
    plcType: 'Q', commType: 'binary',
  }
}

function isValid(cfg) {
  return !!(cfg && typeof cfg === 'object' && !Array.isArray(cfg))
}

// Does this config have enough filled in to actually attempt a connection
// (and therefore to gate "Generate EXE" on)? Brand always has a default, so
// IP is the real signal that this form has been filled in at all.
export function hasPlcConfig(cfg) {
  return !!(cfg && (cfg.ip || '').trim())
}

export function loadPlcConfig() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (isValid(p)) return { ...defaultPlcConfig(), ...p }
    }
  } catch {}
  return defaultPlcConfig()
}

export function savePlcConfig(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)) } catch {}
}

export async function loadPlcConfigFromServer() {
  try {
    const res = await fetch('/api/plc-config')
    if (!res.ok) return null
    const data = await res.json()
    if (isValid(data)) return { ...defaultPlcConfig(), ...data }
  } catch {}
  return null
}

export function savePlcConfigToServer(cfg) {
  fetch('/api/plc-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }).catch(() => {}) // fire-and-forget; silently ignore if the backend isn't running
}
