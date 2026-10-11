// Which pages a generated exe ships with (chosen on the App Builder screen).
// This running app always shows every page regardless of this selection —
// it only takes effect in the exe produced by exe_builder.py on the backend.
// Persisted the same dual way as the rest of this app's config: localStorage
// for instant reload, plus the FastAPI backend for durability and so a
// generated exe's bundled copy matches what was selected when it was built.
//
// Missing from the saved object = enabled. That default means a page added
// to the catalog later (or a config saved before it existed) shows up
// switched on rather than silently disappearing.

import { ALL_PAGE_IDS } from './pageCatalog'

const KEY = 'scada_page_selection_v1'

export function isPageEnabled(selection, id) {
  return selection?.[id] !== false
}

function isValid(sel) {
  return !!(sel && typeof sel === 'object' && !Array.isArray(sel))
}

export function loadPageSelection() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (isValid(p)) return p
    }
  } catch {}
  return {}
}

export function savePageSelection(sel) {
  localStorage.setItem(KEY, JSON.stringify(sel))
}

export async function loadPageSelectionFromServer() {
  try {
    const res = await fetch('/api/page-selection')
    if (!res.ok) return null
    const data = await res.json()
    if (isValid(data)) return data
  } catch {}
  return null
}

export function savePageSelectionToServer(sel) {
  fetch('/api/page-selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sel),
  }).catch(() => {}) // fire-and-forget; silently ignore if the backend isn't running
}

// Only meaningful for a saved selection that predates a catalog change —
// drops ids that no longer exist, so a stale entry can't linger forever.
export function pruneToCatalog(sel) {
  return Object.fromEntries(Object.entries(sel || {}).filter(([id]) => ALL_PAGE_IDS.includes(id)))
}
