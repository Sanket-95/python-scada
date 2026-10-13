// Every selectable page in the app, in one place. Two things read this:
//   1. The App Builder screen — lists every page here with a checkbox.
//   2. The sidebar NAV and the Settings hub — hide whatever's unchecked.
// This is also exactly what "which pages does this customer's build ship
// with" is decided from: the same selection that filters the live sidebar is
// what gets bundled into a generated exe (see AppBuilderPage.jsx).
//
// Ids are namespaced by which system they belong to:
//   'nav:<id>'      an entry in the sidebar's NAV array (WagonScada3D.jsx)
//   'settings:<id>' a page in the Settings hub (settingsPages.js)
// A page's own id (after the prefix) matches the id used in that system, so
// filtering is a straight lookup — no separate mapping table to keep in sync.

export const PAGE_CATALOG = [
  {
    group: 'VIEWS',
    pages: [
      { id: 'nav:3d', label: '3D View' },
      { id: 'nav:dairy-3d', label: 'Dairy 3D' },
      { id: 'nav:dairy-reports', label: 'Dairy Reports' },
      { id: 'nav:2d', label: '2D View' },
      { id: 'nav:settings', label: 'Plant Controls' },
    ],
  },
  {
    group: 'MONITOR',
    pages: [
      { id: 'nav:station-info', label: 'Tank Overview' },
    ],
  },
  {
    group: 'CONFIGURE',
    pages: [
      { id: 'nav:config', label: 'Plant Layout' },
      { id: 'nav:tags-config', label: 'Tank Register' },
      { id: 'nav:wagon-tags', label: 'Wagon Signals' },
      { id: 'nav:station-cols', label: 'Table Columns' },
      { id: 'nav:station-names', label: 'Station Parameters' },
      { id: 'nav:tank-partitions', label: 'Tank Partitions' },
      { id: 'nav:cross-trolley', label: 'Transfer Links' },
      { id: 'nav:general-config', label: 'Branding' },
    ],
  },
  {
    group: 'DIAGNOSTICS',
    pages: [
      { id: 'nav:plc-test', label: 'Connectivity' },
    ],
  },
  {
    group: 'PLANT CONTROLS — SIGNALS & INTERLOCKS',
    pages: [
      { id: 'settings:io-status', label: 'I/O Signals' },
      { id: 'settings:prerequisite', label: 'Start Readiness' },
    ],
  },
  {
    group: 'PLANT CONTROLS — PROCESS PARAMETERS',
    pages: [
      { id: 'settings:temperature', label: 'Bath Temperature' },
      { id: 'settings:alarm-time', label: 'Motion Timeouts' },
      { id: 'settings:spray-pump', label: 'Spray Pumps' },
      { id: 'settings:drip-tray-bypass', label: 'Drip Trays' },
      { id: 'settings:dunking', label: 'Agitation (Dunking)' },
      { id: 'settings:program-selection', label: 'Recipes' },
    ],
  },
]

export const ALL_PAGE_IDS = PAGE_CATALOG.flatMap(g => g.pages.map(p => p.id))
