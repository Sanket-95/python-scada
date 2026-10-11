// Tank tag configuration utilities.
// Each tank gets one tag that drives its hasLoad display.
// Source of truth: userCfg.tankTags  (saved in savedUserConfig.json)
// Runtime values: a tag with a PLC `address` set is read live and continuously
// by backend-fastapi/plc_publisher.py, which overrides the mock simulation
// (see WagonScada3D.jsx); a tag with no address just keeps using the mock.
// A tank is "loaded" whenever the read value is non-zero, whatever the
// tag's own data type — not just a bare boolean 1.

// Same ids/labels as the PLC client layer actually accepts (see
// backend-fastapi/plc_clients/*.py's read_tag data_type parameter) — labeled
// with the IEC 61131-3 names most PLC software itself uses, so the dropdown
// reads the way TIA Portal / GX Works does.
export const TAG_DATA_TYPES = [
  { id: 'bool',    label: 'BOOL' },
  { id: 'int16',   label: 'INT (16-bit signed)' },
  { id: 'uint16',  label: 'UINT / WORD (16-bit unsigned)' },
  { id: 'int32',   label: 'DINT (32-bit signed)' },
  { id: 'uint32',  label: 'UDINT (32-bit unsigned)' },
  { id: 'float32', label: 'REAL (32-bit float)' },
]

// Tank-ID formula must match buildSimConfig's baseId exactly: 1 + every
// earlier line's ACTUAL configured tank count, not a fixed assumption about
// line 1's original default size.
function lineBaseId(userCfg, idx) {
  let base = 1;
  for (let i = 0; i < idx; i++) base += userCfg.lines[i].tanks;
  return base;
}

export function getTankIdsByLine(userCfg) {
  return userCfg.lines.map((line, idx) => {
    const base = lineBaseId(userCfg, idx);
    return Array.from({ length: line.tanks }, (_, i) => base + i);
  });
}

export function getAllTankIds(userCfg) {
  return getTankIdsByLine(userCfg).flat();
}

function defaultTag(id) {
  return {
    name:    `TANK_${String(id).padStart(3, '0')}_LOAD`,
    label:   `Tank ${id}`,
    type:    'bool',
    address: '', // PLC address — left blank until the site is surveyed;
                 // a tag with no address just keeps following the mock
                 // simulation (see plc_publisher.py / WagonScada3D.jsx)
  };
}

// Returns existing tag config merged with defaults for any missing tanks.
export function getTankTags(userCfg) {
  const existing = userCfg.tankTags || {};
  const result   = {};
  getAllTankIds(userCfg).forEach(id => {
    result[String(id)] = existing[String(id)] || defaultTag(id);
  });
  return result;
}

// ── Wagon location tags ────────────────────────────────────────────────────────
// Wagon IDs are sequential across all lines (matches buildSimConfig wagonIds).
// Tag value = a tank number; the wagon moves there live (see plc_publisher.py
// / WagonScada3D.jsx) whenever this tag has both a name and an address.
function defaultWagonTag(wId) {
  return {
    name:    `W${wId}_LOCATION`,
    address: '', // left blank until the site is surveyed — a guessed address
                 // here would otherwise get polled for real once a PLC is
                 // configured, same reasoning as the tank tags' blank default
    type:    'int16',
    // Load lift bits — SET the wagon's "carrying load" flag when up-lift
    // reads 1/true, RESET it when down-lift reads 1/true (see
    // WagonScada3D.jsx's lift-flag latch effect). Always bool, no type
    // selector — these are bit tags on the PLC, not user-selectable.
    upLiftTag:   { name: `W${wId}_UP_LIFT`,   address: '' },
    downLiftTag: { name: `W${wId}_DOWN_LIFT`, address: '' },
    // Mode bits — mutually exclusive on the PLC (only one should read 1 at
    // a time): whichever currently reads 1 is the wagon's active mode,
    // shown as a blinking LED (green/orange/blue) and a label suffix
    // (-A/-M/-S) on the wagon (see WagonScada3D.jsx's mode effect). Also
    // bool, not user-selectable.
    autoTag:    { name: `W${wId}_AUTO`,    address: '' },
    manualTag:  { name: `W${wId}_MANUAL`,  address: '' },
    serviceTag: { name: `W${wId}_SERVICE`, address: '' },
  };
}

export function getWagonTags(userCfg) {
  const existing = userCfg.wagonTags || {};
  const result   = {};
  let wId = 1;
  userCfg.lines.forEach(line => {
    for (let i = 0; i < line.wagons; i++) {
      const id = String(wId);
      result[id] = existing[id] || defaultWagonTag(wId);
      wId++;
    }
  });
  return result;
}

// ── Station parameter tags ────────────────────────────────────────────────────
// Extra live values a station can optionally show on hover, beyond its name —
// e.g. Actual Temperature, Actual PH, Actual Current, Set Current. Entirely
// flexible: zero or more per station, each just {label, address, type, unit},
// no fixed set. Source of truth: userCfg.stationParams, keyed by station id
// (number as a string) -> array of entries. A station with no entries here
// is unaffected — its hover tooltip just shows the name as before.
export function getStationParams(userCfg) {
  return userCfg.stationParams || {};
}

// ── Station Load Number tag ───────────────────────────────────────────────────
// One dedicated PLC address per station (always int16, not user-selectable),
// separate from the flexible stationParams list. Source of truth:
// userCfg.stationLoadNumbers, keyed by station id (string) -> address string.
export function getStationLoadNumbers(userCfg) {
  return userCfg.stationLoadNumbers || {};
}

// Returns { lineLabel, wagons: [{id, wagonIdx}] } groups for display
export function getWagonsByLine(userCfg) {
  let wId = 1;
  return userCfg.lines.map(line => {
    const wagons = Array.from({ length: line.wagons }, (_, i) => {
      const id = String(wId++);
      return { id, wagonIdx: i + 1 };
    });
    return { line, wagons };
  });
}
