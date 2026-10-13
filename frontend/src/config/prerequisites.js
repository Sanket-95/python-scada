// Pre-Requisites screen: which sections and tables exist, and which live tag
// drives each indicator. The page is generated from this, so adding a row or
// a column later is a one-line change here.
//
// Tag names are placeholders for the plant's real ones — change them here (and
// only here) once the PLC tag list is known; `tagName(row, col)` builds the
// name for each cell. Lookup is case-insensitive. Indicators show live tag
// values only: green = on, red = off, grey = no data.
//
//   section.row                sections with the same `row` number share a line on the
//                              page (they wrap onto the next line if the window is too narrow)
//   section.tables[].columns   the column headings (the row-label column has none)
//   section.tables[].rows      one indicator per row per column

// A check is satisfied when its signal is ON — or OFF for an `invert` row
// (e.g. a wagon must NOT be in service mode to start). 'unknown' stays unknown.
export function checkState(row, signal) {
  if (!row.invert || signal === 'unknown') return signal;
  return signal === 'on' ? 'off' : 'on';
}

export const PREREQUISITE_SECTIONS = [
  {
    id: 'wagon',
    title: 'WAGON',
    row: 1,
    tables: [{
      id: 'wagon',
      columns: [1, 2, 3, 4].map(n => ({ id: String(n), label: `Wagon ${n}` })),
      rows: [
        { id: 'Auto',         label: 'Auto' },
        { id: 'Service',      label: 'Service mode', invert: true },  // healthy = OFF
        { id: 'EmgStop',      label: 'Emg Stop' },
        { id: 'TrayOutProxi', label: 'Tray Out Proxi' },
      ],
      tagName: (row, col) => `Wagon${col.id}_${row.id}`,
    }],
  },
  {
    id: 'cross-trolley',
    title: 'CROSS TROLLEY',
    row: 2,
    tables: [{
      id: 'cross-trolley',
      columns: [1, 2].map(n => ({ id: String(n), label: `CT-${n}` })),
      rows: [
        { id: 'EmergencyStop', label: 'Emergency Stop' },
        { id: 'ControlOn',     label: 'Control On' },
        { id: 'ManAutoSS',     label: 'Man/Auto SS' },
        { id: 'Healthy',       label: 'Healthy' },
      ],
      tagName: (row, col) => `CT${col.id}_${row.id}`,
    }],
  },
  {
    id: 'tank-lid',
    title: 'TANK LID',
    row: 2,
    tables: ['Drying Tank', 'Rack Scraping Tank'].map(name => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      columns: [{ id: name.replace(/\s+/g, ''), label: name }],
      rows: [
        { id: 'Auto',        label: 'Auto' },
        { id: 'LidClosePX',  label: 'Lid Close PX' },
      ],
      tagName: (row, col) => `${col.id}_${row.id}`,
    })),
  },
];
