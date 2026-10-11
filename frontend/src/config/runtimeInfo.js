// Is this page running inside a generated exe, or the plain dev/prod app?
// Both serve the exact same built frontend bundle, so the only way to tell
// them apart is asking the backend (see /api/health's "frozen" field, set
// from Python's sys.frozen). Used to decide whether the App Builder's page
// selection should filter the sidebar/Settings hub at all — it always
// should inside a generated exe, and never otherwise.
export async function isRunningInsideExe() {
  try {
    const res = await fetch('/api/health')
    if (!res.ok) return false
    const data = await res.json()
    return data?.frozen === true
  } catch {
    return false
  }
}
