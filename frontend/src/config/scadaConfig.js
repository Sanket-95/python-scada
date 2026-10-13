// All dimensions, timing, and colors parameterized here.
// Connect gRPC: only replace useWagonSimulation.js.

const T_SPACING = 47; // px between tank centres (both lines)

export const C = {
  svg: { w: 2000, h: 760 },

  palette: {
    bg:          '#EDF0F3',
    grid:        'rgba(40,60,100,0.06)',
    panel:       '#FFFFFF',
    panelBorder: '#D2D8DE',
    text:        '#45505C',
    textBright:  '#1C232B',
    textDim:     '#7A8591',
    accent:      '#0E7C86',
    ok:          '#2F855A',
    warn:        '#C2630A',
    danger:      '#C53030',
  },

  // Fixed chemical colour — never changes with fill level
  chemColor:   '#1278A8',
  chemSurface: '#4BB8E0',

  // Load block colour inside tanks (solid material sitting in tank)
  loadColor:   '#D84315',
  loadHighlight: '#FF7043',

  tracks: [
    {
      id: 1,
      label: 'LINE-A',
      wagonLabel: 'WAGONS  1 – 4',
      panelY: 8,  panelH: 192,
      railY: 50, railH: 10, railX1: 50, railX2: 1940, railColor: '#FFB300',
      homeX: 70,
      wagonIds: [1, 2, 3, 4],
      // Wagon hangs below rail: wagonTop=60, wagonH=26, wagonBottom=86
      stationsTop: 100,
      stationH:     80,   // shorter + wider tank — closer to a real open vat than a tall column
      stationW:     26,
      armMaxLen:    52,
      stLabelY:    190,   // stationsTop(100) + stationH(80) + 10
      stations: Array.from({ length: 39 }, (_, i) => ({
        id:       i + 1,
        label:    String(i + 1),
        x:        140 + i * T_SPACING,
        initFill: i < 13 ? 72 + (i % 5) * 3
                : i < 26 ? 42 + (i % 6) * 3
                :           18 + (i % 4) * 4,
        baseTemp: 360 + (i % 8) * 36,
      })),
    },
    {
      id: 2,
      label: 'LINE-B',
      wagonLabel: 'WAGONS  5 – 7',
      panelY: 210, panelH: 183,
      railY: 252, railH: 10, railX1: 50, railX2: 1380, railColor: '#FF8F00',
      homeX: 70,
      wagonIds: [5, 6, 7],
      // wagonTop=262, wagonH=26, wagonBottom=288
      stationsTop: 302,
      stationH:     71,   // shorter + wider tank — closer to a real open vat than a tall column
      stationW:     26,
      armMaxLen:    52,
      stLabelY:    383,   // stationsTop(302) + stationH(71) + 10
      stations: Array.from({ length: 27 }, (_, i) => ({
        id:       40 + i,
        label:    String(40 + i),
        x:        140 + i * T_SPACING,
        initFill: i < 9 ? 75 + (i % 4) * 4
                :          22 + (i % 5) * 5,
        baseTemp: 380 + (i % 7) * 38,
      })),
    },
  ],

  wagon: {
    w: 38, h: 26,
    speedBase: 5,
    speedVar:  1.5,
  },

  station: { w: 26 },

  tempRanges: [
    { max: 25, color: '#0097A7', label: 'COLD' },   // °C
    { max: 70, color: '#2F855A', label: 'NORM' },
    { max: 85, color: '#C2630A', label: 'WARN' },
    { max: Infinity, color: '#C53030', label: 'HOT!' },
  ],

  statusColors: {
    idle:                  '#90A0B0',
    moving_to_source:      '#0E7C86',
    arm_extending_load:    '#2F855A',
    arm_retracting_loaded: '#2F855A',
    moving_to_dest:        '#C2630A',
    arm_extending_unload:  '#C53030',
    arm_retracting_empty:  '#C53030',
    returning:             '#00838F',
  },

  sim: {
    idlePause:     [5000, 12000], // ms — wagons wait longer between trips
    armExtendDur:  12000,         // ms — arm extends slowly
    armRetractDur: 8000,          // ms — arm retracts slowly
    tempDrift:     0.08,          // °C/s — temperature changes gently
  },
};
