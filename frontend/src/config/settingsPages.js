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
import { isPageEnabled } from './pageSelection'

export const SETTINGS_SECTIONS = [
  {
    id: 'plant-io',
    title: 'PLANT IO STATUS',
    pages: [
      { id: 'io-status',    label: 'Input Output Status', enabled: true },
      { id: 'prerequisite', label: 'Prerequisite',        enabled: true, title: 'Pre-Requisites', component: PrerequisitesPage },
    ],
  },
  {
    id: 'set-points',
    title: 'SET POINTS',
    pages: [
      { id: 'temperature',       label: 'Temperature',                             enabled: true, component: TemperatureSettingsPage },
      { id: 'alarm-time',        label: 'Alarm Time',                              enabled: true, title: 'Alarm Time Setting', component: AlarmTimeSettingsPage },
      { id: 'spray-pump',        label: 'Spray Pump',                              enabled: true, component: SprayPumpPage },
      { id: 'drip-tray-bypass',  label: 'Drip Tray Bypass and Settable Drip Time', enabled: true, component: DripTrayBypassPage },
      { id: 'dunking',           label: 'Dunking',                                 enabled: true, component: DunkingPage },
      { id: 'program-selection', label: 'Program Selection',                       enabled: true, component: ProgramSelectionPage },
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
