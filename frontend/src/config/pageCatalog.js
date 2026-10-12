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
      { id: 'nav:2d', label: '2D View' },
      { id: 'nav:settings', label: 'Settings (menu)' },
    ],
  },
  {
    group: 'MONITOR',
    pages: [
      { id: 'nav:station-info', label: 'StationWise Info' },
      { id: 'nav:tags', label: 'Tag Monitor' },
    ],
  },
  {
    group: 'CONFIGURE',
    pages: [
      { id: 'nav:config', label: 'Configuration' },
      { id: 'nav:tags-config', label: 'Tank Tags' },
      { id: 'nav:wagon-tags', label: 'Wagon Tags' },
      { id: 'nav:station-cols', label: 'Col. Config' },
      { id: 'nav:station-names', label: 'Stn. Names' },
      { id: 'nav:tank-partitions', label: 'Tank Partitions' },
      { id: 'nav:cross-trolley', label: 'Cross Trolley' },
      { id: 'nav:general-config', label: 'General Config' },
    ],
  },
  {
    group: 'DIAGNOSTICS',
    pages: [
      { id: 'nav:plc-test', label: 'PLC Connection Test' },
    ],
  },
  {
    group: 'SETTINGS — PLANT IO STATUS',
    pages: [
      { id: 'settings:io-status', label: 'Input Output Status' },
      { id: 'settings:prerequisite', label: 'Prerequisite' },
    ],
  },
  {
    group: 'SETTINGS — SET POINTS',
    pages: [
      { id: 'settings:temperature', label: 'Temperature' },
      { id: 'settings:alarm-time', label: 'Alarm Time' },
      { id: 'settings:spray-pump', label: 'Spray Pump' },
      { id: 'settings:drip-tray-bypass', label: 'Drip Tray Bypass and Settable Drip Time' },
      { id: 'settings:dunking', label: 'Dunking' },
      { id: 'settings:program-selection', label: 'Program Selection' },
    ],
  },
]

export const ALL_PAGE_IDS = PAGE_CATALOG.flatMap(g => g.pages.map(p => p.id))
