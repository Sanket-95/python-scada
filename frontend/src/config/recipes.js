// Recipe library shown on the Recipes page (Plant Controls). The PLC only
// knows a recipe by its number — `no` here is that number (what's stored as
// "selected"/"running" in programSelection.js); the rest is description for
// the operator. Demo data — replace with the plant's real recipe list.
export const RECIPES = [
  { no: 1, name: 'Zn-Ni 8 µm · Blue',        line: 'Barrel', coating: 'Zinc-Nickel', thickness: '8 µm',  minutes: 62, finish: 'Trivalent blue',  steps: ['Soak clean', 'Electro clean', 'Pickle', 'Zn-Ni plate', 'Blue passivate', 'Dry'] },
  { no: 2, name: 'Zn-Ni 12 µm · Black',      line: 'Barrel', coating: 'Zinc-Nickel', thickness: '12 µm', minutes: 78, finish: 'Trivalent black', steps: ['Soak clean', 'Electro clean', 'Pickle', 'Zn-Ni plate', 'Black passivate', 'Top coat', 'Dry'] },
  { no: 3, name: 'Zn-Ni 8 µm · Sealed',      line: 'Barrel', coating: 'Zinc-Nickel', thickness: '8 µm',  minutes: 70, finish: 'Blue + sealer',   steps: ['Soak clean', 'Electro clean', 'Pickle', 'Zn-Ni plate', 'Blue passivate', 'Top coat', 'Dry'] },
  { no: 4, name: 'Basket rework strip',      line: 'Basket', coating: 'Strip',       thickness: '—',     minutes: 35, finish: 'Bare',            steps: ['Acid strip', 'Rinse', 'Dry'] },
  { no: 5, name: 'Basket passivate · Blue',  line: 'Basket', coating: 'Post-treat',  thickness: '—',     minutes: 28, finish: 'Trivalent blue',  steps: ['Nitric activation', 'Blue passivate', 'Hot rinse', 'Dry'] },
  { no: 6, name: 'Basket passivate · Black', line: 'Basket', coating: 'Post-treat',  thickness: '—',     minutes: 34, finish: 'Trivalent black', steps: ['Nitric activation', 'Black passivate', 'Top coat', 'Dry'] },
  { no: 7, name: 'High-build fasteners',     line: 'Barrel', coating: 'Zinc-Nickel', thickness: '15 µm', minutes: 92, finish: 'Black + sealer',  steps: ['Soak clean', 'Electro clean', 'Pickle', 'Zn-Ni plate ×2', 'Black passivate', 'Top coat', 'Dry'] },
  { no: 8, name: 'Line flush / idle',        line: 'Both',   coating: 'Maintenance', thickness: '—',     minutes: 15, finish: '—',               steps: ['Empty run', 'Rinse cycle'] },
];

export const recipeByNo = n => RECIPES.find(r => String(r.no) === String(n));
