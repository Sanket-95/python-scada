// Dairy reporting — plant configuration for the in-browser mock-data engine.
// Mirrors backend-fastapi/reports/config.py (same fictional plant, IDs and
// illustrative demo rules). Everything here is FICTIONAL demonstration data;
// thresholds must be verified against current applicable standards before any
// real use.

export const DEMO_NOTICE = 'DEMO DATA — NOT FOR ACTUAL PRODUCTION OR QUALITY CERTIFICATION';
export const ILLUSTRATIVE = 'Illustrative demo rule — verify against current applicable standards';
export const PLANT_NAME = 'Sahyadri Valley Dairy (fictional demo plant)';

export const SHIFTS = { Morning: [6, 14], Afternoon: [14, 22], Night: [22, 30] };

export const COLLECTION_CENTERS = [
  { id: 'CC-01', name: 'Ambegaon Collection Centre' },
  { id: 'CC-02', name: 'Ghodnadi Chilling Point' },
  { id: 'CC-03', name: 'Pimpalwadi Milk Society' },
  { id: 'CC-04', name: 'Sonori Village Centre' },
  { id: 'CC-05', name: 'Tamhini Hills Cooperative' },
];
export const SUPPLIERS = [
  { id: 'SUP-1001', name: 'Kavya Farms (fictional)', center: 'CC-01', milk: 'Cow' },
  { id: 'SUP-1002', name: 'Shivneri Agro (fictional)', center: 'CC-01', milk: 'Buffalo' },
  { id: 'SUP-1003', name: 'Ganga Dairy Group (fictional)', center: 'CC-02', milk: 'Cow' },
  { id: 'SUP-1004', name: 'Malhar Livestock (fictional)', center: 'CC-02', milk: 'Buffalo' },
  { id: 'SUP-1005', name: 'Riverbend Herds (fictional)', center: 'CC-03', milk: 'Cow' },
  { id: 'SUP-1006', name: 'Sahyadri Buffalo Co. (fictional)', center: 'CC-04', milk: 'Buffalo' },
  { id: 'SUP-1007', name: 'Greenpasture Farms (fictional)', center: 'CC-04', milk: 'Cow' },
  { id: 'SUP-1008', name: 'Hilltop Cattle (fictional)', center: 'CC-05', milk: 'Cow' },
];
export const TANKERS = Array.from({ length: 8 }, (_, i) => `TKR-0${11 + i}`);
export const OPERATORS = ['OP-21', 'OP-22', 'OP-23', 'OP-24', 'OP-25', 'OP-26'];
export const REVIEWERS = ['QA-07', 'QA-09', 'QA-12'];

export const TANKS = {
  'RT-01': { name: 'Raw Milk Reception Tank', milk: 'Mixed (one type at a time)', capacity: 15000, pump: 'P-101', valves: ['V-101', 'V-301'] },
  'ST-COW-01': { name: 'Cow Milk Silo', milk: 'Cow', capacity: 50000, pump: 'P-201', valves: ['V-301', 'V-201'] },
  'ST-BUF-01': { name: 'Buffalo Milk Silo', milk: 'Buffalo', capacity: 50000, pump: 'P-202', valves: ['V-301', 'V-202'] },
  'ST-PM-01': { name: 'Pasteurized Milk Storage / Cooling Tank', milk: 'Processed', capacity: 30000, pump: 'P-401', valves: ['V-302', 'V-401'] },
};
export const TANK_HIGH_LEVEL_PCT = 90;
export const TANK_LOW_LEVEL_PCT = 8;

export const EQUIPMENT = {
  'P-101': { name: 'Reception Transfer Pump', kind: 'Pump' },
  'P-201': { name: 'Cow Silo Feed Pump', kind: 'Pump' },
  'P-202': { name: 'Buffalo Silo Feed Pump', kind: 'Pump' },
  'P-401': { name: 'Packing Feed Pump', kind: 'Pump' },
  'V-301': { name: 'Milk Diverter Valve', kind: 'Valve' },
  'V-302': { name: 'Flow Diversion Valve (FDV)', kind: 'Valve' },
  'PAST-01': { name: 'HTST Pasteurizer', kind: 'Pasteurizer' },
  'HOMO-01': { name: 'Homogenizer', kind: 'Homogenizer' },
  'COOL-01': { name: 'Chilled-Water Cooling Section', kind: 'Cooling' },
  'PACK-01': { name: 'Pouch Packing Machine 1', kind: 'Packing' },
  'PACK-02': { name: 'Pouch Packing Machine 2', kind: 'Packing' },
  'CIP-01': { name: 'CIP Skid', kind: 'CIP' },
};

// Generator ranges (what simulated samples look like) — NOT acceptance limits.
export const SAMPLE_RANGES = {
  Cow: { fat: [3.1, 4.9], snf: [7.9, 9.1], protein: [2.9, 3.7], lactose: [4.3, 5.0] },
  Buffalo: { fat: [5.2, 8.6], snf: [8.4, 9.9], protein: [3.6, 4.6], lactose: [4.4, 5.1] },
};
export const QUALITY_RULES = {
  Cow: { fat_min: 3.2, snf_min: 8.0, acidity_max: 0.155, temp_max: 8.0, density_min: 1.026, density_max: 1.034, reject_acidity: 0.18, reject_temp: 11.0, note: ILLUSTRATIVE },
  Buffalo: { fat_min: 5.5, snf_min: 8.8, acidity_max: 0.16, temp_max: 8.0, density_min: 1.026, density_max: 1.036, reject_acidity: 0.18, reject_temp: 11.0, note: ILLUSTRATIVE },
};
export const QUALITY_METHODS = {
  composition: 'Ultrasonic milk analyser (demo method)',
  density: 'Digital density meter at 20 °C (demo)',
  clr: 'Lactometer, corrected to 27 °C reference: CLR = (ρ₂₇ − 1.000) × 1000 (illustrative convention)',
  acidity: 'Titration with 0.1 N NaOH, phenolphthalein end-point (demo method)',
};
export const INSTRUMENTS = ['LAB-UA-01', 'LAB-UA-02', 'LAB-DM-01'];

export const HTST_DEMO = {
  target_temp_c: 72.0,
  min_hold_s: 15.0,
  note: 'Demonstration setpoint only — not an instruction for operating real equipment. Applies only where the product and validated process configuration call for it.',
};
export const PRODUCTS = {
  TM: { name: 'Toned Milk', homogenize: true },
  FCM: { name: 'Full Cream Milk', homogenize: true },
  CM: { name: 'Cow Milk', homogenize: true },
};
export const PROCESS_RATE_LPH = 10000;
export const PACK_SPEED_PPH = { 500: 7200, 1000: 4200 };
export const PROCESS_LOSS_FRACTION = [0.002, 0.005];

// CIP — demonstration completion criteria (not dosing instructions).
export const CIP_PHASES = [
  ['Pre-rinse', 6, null],
  ['Cleaning solution circulation', 15, 70.0],
  ['Intermediate rinse', 6, null],
  ['Final rinse', 6, null],
  ['Sanitization', 8, null],
];
export const CIP_FINAL_RINSE_MAX_CONDUCTIVITY = 0.5;
export const CIP_MIN_FLOW_M3H = 15.0;
export const CIP_SOLUTIONS = ['CIP-SOL-A (demo alkaline)', 'CIP-SOL-B (demo acid)'];
export const CIP_CIRCUITS = {
  'CIRC-PAST': 'Pasteurizer / homogenizer circuit',
  'CIRC-SILO-COW': 'Cow silo circuit',
  'CIRC-SILO-BUF': 'Buffalo silo circuit',
  'CIRC-RT': 'Reception tank circuit',
};

export const DENSITY_ASSUMPTION_KG_PER_L = 1.032;
export const VOLUME_BALANCE_TERMS = [
  'Opening inventory (all tanks)',
  '+ Milk received (gross)',
  '− Milk rejected at intake',
  '− Documented intake samples',
  '− Finished-product volume (accepted packs × declared size)',
  '− Rejected packs volume',
  '− Documented process losses',
  '− Closing inventory (all tanks)',
  '= Unexplained difference (not adjusted)',
];
