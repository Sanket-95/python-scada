// The SQL Server connection info chosen on the Database Connection Test
// screen (used by the Part Number column's PartName lookup — see
// backend-fastapi/db_client.py). Persisted the same dual way as the PLC
// connection info (config/plcConfig.js): localStorage for instant reload,
// plus the FastAPI backend for durability — the backend copy is what
// exe_builder.py seeds into a generated exe so it starts already pointed at
// this database.

const KEY = 'scada_db_config_v1'

export function defaultDbConfig() {
  // port left blank, not 1433: a named instance (e.g. .\SQLEXPRESS) resolves
  // its own port via the SQL Server Browser service when none is given —
  // forcing 1433 by default would break that for the common named-instance
  // case. Only set a port explicitly for a default/standalone instance.
  return {
    server: '', port: '', database: '', username: '', password: '',
  }
}

function isValid(cfg) {
  return !!(cfg && typeof cfg === 'object' && !Array.isArray(cfg))
}

export function loadDbConfig() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (isValid(p)) return { ...defaultDbConfig(), ...p }
    }
  } catch {}
  return defaultDbConfig()
}

export function saveDbConfig(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)) } catch {}
}

export async function loadDbConfigFromServer() {
  try {
    const res = await fetch('/api/db-config')
    if (!res.ok) return null
    const data = await res.json()
    if (isValid(data)) return { ...defaultDbConfig(), ...data }
  } catch {}
  return null
}

export function saveDbConfigToServer(cfg) {
  fetch('/api/db-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }).catch(() => {}) // fire-and-forget; silently ignore if the backend isn't running
}
