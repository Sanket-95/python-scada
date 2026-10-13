// Registry for the Settings hub. The hub, its sections, and every button on it
// are generated from this list — nothing about the pages is hard-coded in the
// component — so which pages exist (and, later, which of them a given
// customer receives) is decided here, in one place.
//
//   enabled   false hides the page's button (and the page becomes unreachable)
//             UNCONDITIONALLY — this is "does this page exist/work at all",
//             set once when a page is built. A section with no such pages
//             disappears entirely.
//   title     optional. The heading shown on the page itself when it should
//             differ from the button's label.
//   component optional. Leave it out and the page opens the generic
//             "not configured yet" screen; when a page gets built, point this
//             at its component — it's rendered with { page, section, onBack }
//             plus whatever the app shell passes as SettingsPage's pageContext
//             (stations, station names, live tags, ...).
//
// The App Builder screen's per-customer "which pages does this build ship
// with" choice (frontend/src/config/pageSelection.js) only affects a
// GENERATED exe — the app shell only ever passes a real `selection` here
// when running inside one (see runtimeInfo.js); the dev/plain app always
// calls this with no selection, so it keeps showing every enabled page.

import TemperatureSettingsPage from '../components/TemperatureSettingsPage'
import AlarmTimeSettingsPage from '../components/AlarmTimeSettingsPage'
import SprayPumpPage from '../components/SprayPumpPage'
import DripTrayBypassPage from '../components/DripTrayBypassPage'
import DunkingPage from '../components/DunkingPage'
import ProgramSelectionPage from '../components/ProgramSelectionPage'
import PrerequisitesPage from '../components/PrerequisitesPage'
import IoStatusPage from '../components/IoStatusPage'
import { isPageEnabled } from './pageSelection'

export const SETTINGS_SECTIONS = [
  {
    id: 'plant-io',
    title: 'Signals & Interlocks',
    pages: [
      { id: 'io-status',    label: 'I/O Signals', icon: '⇵', desc: 'Live wagon and tank inputs/outputs', enabled: true, title: 'I/O Signals', component: IoStatusPage },
      { id: 'prerequisite', label: 'Start Readiness', icon: '✓', desc: 'Interlocks that must be healthy before auto start', enabled: true, title: 'Start Readiness', component: PrerequisitesPage },
    ],
  },
  {
    id: 'set-points',
    title: 'Process Parameters',
    pages: [
      { id: 'temperature',       label: 'Bath Temperature', icon: '🌡', desc: 'Low/high band per tank vs. live reading', enabled: true, component: TemperatureSettingsPage },
      { id: 'alarm-time',        label: 'Motion Timeouts', icon: '⏱', desc: 'Per-wagon watchdog times for each motion', enabled: true, title: 'Motion Timeouts', component: AlarmTimeSettingsPage },
      { id: 'spray-pump',        label: 'Spray Pumps', icon: '☂', desc: 'Pump mode, manual run and health', enabled: true, title: 'Spray Pumps', component: SprayPumpPage },
      { id: 'drip-tray-bypass',  label: 'Drip Trays', icon: '💧', desc: 'Bypass and drip time per tray', enabled: true, title: 'Drip Trays', component: DripTrayBypassPage },
      { id: 'dunking',           label: 'Agitation (Dunking)', icon: '↕', desc: 'Dunking unit mode and status per tank', enabled: true, title: 'Agitation (Dunking)', component: DunkingPage },
      { id: 'program-selection', label: 'Recipes', icon: '☰', desc: 'Choose the plating recipe to run next', enabled: true, title: 'Recipes', component: ProgramSelectionPage },
    ],
  },
]

// Sections with only their enabled-and-selected pages; empty sections are
// dropped. `selection` is optional — omit it (or pass {}) for "everything
// enabled shows", which is what the dev/plain app always does.
export function getSettingsSections(selection = {}) {
  return SETTINGS_SECTIONS
    .map(s => ({ ...s, pages: s.pages.filter(p => p.enabled && isPageEnabled(selection, `settings:${p.id}`)) }))
    .filter(s => s.pages.length > 0)
}

// { page, section } for an enabled-and-selected page id, or null.
export function findSettingsPage(pageId, selection = {}) {
  for (const section of getSettingsSections(selection)) {
    const page = section.pages.find(p => p.id === pageId)
    if (page) return { page, section }
  }
  return null
}
