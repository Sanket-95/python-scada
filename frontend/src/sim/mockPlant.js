// Mock PLC — a self-contained plating-line simulation that produces the exact
// same live tags the real PLC poller (backend-fastapi/plc_publisher.py)
// publishes, under the exact same names, so every screen runs unchanged on
// simulated data when the data source is set to "mock" (PLC Connection Test
// page → Data Source). Nothing here is read when the data source is "plc".
//
// What it simulates, per line (tanks in ascending id order = process order):
//   - Loads enter at the line's first tank (loading station) with a new load
//     number / client / part, dwell in each tank for a kind-specific process
//     time, and leave from the line's last tank (unloading station).
//   - Each wagon serves one contiguous zone of its line's tanks and moves a
//     load i → i+1 when its process time is done and i+1 is free (downstream
//     jobs first, so the line never deadlocks). Travel is reported one tank at
//     a time on the wagon location tag, the lift on the up/down PX bits, and
//     the mode on the auto/manual/service bits — exactly the signals the
//     frontend already turns into wagon motion / carried load / mode LED.
//   - Per-station process values (temperature, current, pH) whose kind is
//     inferred from the station's name (Mimic Page Config label) plus any
//     Station Info parameters configured for it.
//   - Settings-page LEDs (pre-requisites, dunking, spray pumps) and a small
//     alarm list.
//
// Tag names come from the live userCfg on every tick (getTankTags /
// getWagonTags), so renaming a tag on a config page takes effect immediately.

import { getTankTags, getWagonTags, getStationParams } from '../config/tagConfig';
import { PREREQUISITE_SECTIONS } from '../config/prerequisites';
import { SPRAY_PUMPS } from '../config/sprayPumps';
import { dunkingTags } from '../config/dunking';

const rnd    = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const pick   = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Timing (seconds). TRAVEL_PER_TANK roughly matches how long the frontend's
// tag-commanded wagon move takes to cover one tank pitch, so the drawn wagon
// keeps pace with the location tag instead of stopping at every tank.
const TRAVEL_PER_TANK = 1.2;
// Hoist cycle: the lift bit fires as the hoist starts its dip, the load
// changes hands when the hook is at the bottom (HOIST_BOTTOM_AT), then it
// rises. Matches the 3D/2D dip animation (useWagonSimulation's DIP_DOWN_S /
// DIP_UP_S), so the tank empties/fills exactly when the hook is down there.
const HOIST_BOTTOM_AT = 2.0;
const LIFT_TIME       = 4.4;
const DRIP_TIME       = 2.0;
const LOWER_TIME      = 4.4;
const SUB_STEP        = 0.25;  // internal fixed step
const MAX_CATCHUP     = 600;   // cap for a long-hidden tab

const CLIENTS = ['Bosch', 'Mahindra', 'Tata AutoComp', 'Bajaj', 'Endurance', 'Minda', 'Sundram', 'Varroc'];
const PARTS   = ['Bracket', 'Fastener M8', 'Hinge Pin', 'Brake Clip', 'Spring Seat', 'Housing', 'Washer', 'Bolt M10', 'Clamp'];

// ── Station kinds (inferred from the station's display name) ─────────────────
// tempSV = null → unheated (ambient). currSV = null → no rectifier. ph = null → not monitored.
function stationKind(label = '') {
  const s = label.toLowerCase();
  if (s.includes('unloading'))                         return { kind: 'unload',  dwell: [10, 16] };
  if (s.includes('loading'))                           return { kind: 'load',    dwell: [10, 18] };
  if (s.includes('plating'))                           return { kind: 'plating', dwell: [35, 60], tempSV: 28, currSV: rndInt(8, 12) * 100 };
  if (s.includes('anodic') || s.includes('electro'))   return { kind: 'anodic',  dwell: [18, 28], tempSV: 55, currSV: rndInt(3, 5) * 100, ph: 12.5 };
  if (s.includes('degreas') || s.includes('clean'))   return { kind: 'heated',  dwell: [18, 28], tempSV: 60, ph: 12.8 };
  if (s.includes('hot water'))                         return { kind: 'heated',  dwell: [10, 16], tempSV: 68 };
  if (s.includes('passivation'))                       return { kind: 'chem',    dwell: [20, 30], tempSV: 28, ph: rnd(1.8, 2.4) };
  if (s.includes('pickling') || s.includes('acid') || s.includes('hcl') || s.includes('nitric'))
                                                       return { kind: 'acid',    dwell: [14, 22], ph: rnd(0.8, 1.6) };
  if (s.includes('activat') || s.includes('dip'))     return { kind: 'chem',    dwell: [10, 16], ph: 3.2 };
  if (s.includes('top coat'))                          return { kind: 'chem',    dwell: [16, 24], tempSV: 26, ph: rnd(9.2, 9.8) };
  if (s.includes('dryer'))                             return { kind: 'heated',  dwell: [20, 30], tempSV: 85 };
  if (s.includes('dehydrator'))                        return { kind: 'heated',  dwell: [14, 20], tempSV: 70 };
  if (s.includes('basket wash'))                       return { kind: 'heated',  dwell: [12, 18], tempSV: 50 };
  if (s.includes('rinse') || s.includes('dragout'))    return { kind: 'rinse',   dwell: [6, 12],  ph: rnd(6.6, 7.4) };
  return { kind: 'generic', dwell: [10, 18] };
}

const PARAM_KIND_NEEDS = {
  'Actual Temperature': 'temp',
  'Actual Current':     'curr',
  'Calculated Current': 'curr',
  'Set Current':        'curr',
  'Actual PH':          'ph',
};

function fmtValue(raw, type) {
  if (type === 'bool') return raw ? '1' : '0';
  if (type === 'float32') return Number(raw).toFixed(2);
  return String(Math.round(Number(raw)));
}

export class MockPlant {
  constructor(userCfg) {
    this.time = 0;
    this.nextLoadNo = rndInt(1001, 1200);
    this.loadsDone = 0;
    this.lastDoneAt = 0;       // sim time of the last completed load
    this.lastCycle = null;     // seconds between the last two completions
    this.labelCache = {};
    this.faults = {};          // { key: secondsRemaining } — transient LED faults
    this.tempUpsets = {};      // { stationId: secondsRemaining } — transient temp excursions
    this._build(userCfg);
  }

  // ── Topology ───────────────────────────────────────────────────────────────
  _build(userCfg) {
    const tankTags = getTankTags(userCfg);
    this.stations = {};
    this.lines = [];
    this.wagons = [];
    let tankBase = 1;
    let wagonBase = 1;
    userCfg.lines.forEach((line, li) => {
      const ids = Array.from({ length: line.tanks }, (_, i) => tankBase + i);
      tankBase += line.tanks;
      ids.forEach((id, idx) => {
        this.stations[id] = this._newStation(id, li, idx, tankTags[String(id)]?.label);
      });

      // Contiguous zones, one per wagon. Wagon k moves loads within
      // [start_k-1 .. end_k] (it picks up from the previous zone's last tank).
      const wagonCount = Math.max(0, line.wagons);
      const lineWagons = [];
      for (let k = 0; k < wagonCount; k++) {
        const start = Math.floor((k * ids.length) / wagonCount);
        const end   = Math.floor(((k + 1) * ids.length) / wagonCount) - 1;
        const w = {
          id: wagonBase + k, line: li, k,
          zoneStart: start, zoneEnd: end,
          pos: k === 0 ? start : Math.min(start + 1, end),
          state: 'idle', timer: 0, job: null, path: [],
          carrying: null, up: false, down: true,
          mode: 'auto', modeTimer: 0,
          reserve: null,
        };
        w.reserve = [w.pos, w.pos];
        lineWagons.push(w);
      }
      wagonBase += wagonCount;
      this.wagons.push(...lineWagons);
      this.lines.push({ ids, wagons: lineWagons });

      // Seed the line part-way through production so screens look alive at once.
      ids.forEach((id, idx) => {
        if (idx === 0) return;
        if (Math.random() < 0.38) {
          const st = this.stations[id];
          st.load = this._newLoad();
          st.elapsed = rnd(0, st.dwell);
        }
      });
    });
  }

  _newStation(id, line, idx, label) {
    const k = stationKind(label);
    const ambient = rnd(29, 32);
    return {
      id, line, idx, label: label || '',
      kind: k.kind, kindDef: k,
      dwell: rnd(...k.dwell),
      load: null, elapsed: 0,
      ambient,
      tempSV: k.tempSV ?? null,
      temp: (k.tempSV ?? ambient) + rnd(-1.5, 1.5),
      currSV: k.currSV ?? null,
      curr: 0,
      calcFactor: rnd(0.9, 1.05),
      phBase: k.ph ?? null,
      ph: k.ph ?? null,
      spawnTimer: rnd(2, 6),
    };
  }

  _newLoad() {
    return {
      no: this.nextLoadNo++,
      client: pick(CLIENTS),
      part: pick(PARTS),
    };
  }

  // Station label changed on Mimic Page Config → re-infer its kind.
  _syncLabels(tankTags) {
    Object.values(this.stations).forEach(st => {
      const label = tankTags[String(st.id)]?.label || '';
      if (label === st.label) return;
      const fresh = this._newStation(st.id, st.line, st.idx, label);
      Object.assign(st, {
        label, kind: fresh.kind, kindDef: fresh.kindDef, dwell: fresh.dwell,
        tempSV: fresh.tempSV, currSV: fresh.currSV, phBase: fresh.phBase, ph: fresh.ph,
      });
    });
  }

  // A station that has a Station Info parameter of some kind configured gets
  // that measurement even if its name alone wouldn't imply it.
  _syncParams(stationParams) {
    Object.entries(stationParams).forEach(([sid, params]) => {
      const st = this.stations[sid];
      if (!st) return;
      (params || []).forEach(p => {
        const need = PARAM_KIND_NEEDS[p.label];
        if (need === 'temp' && st.tempSV == null) { st.tempSV = rndInt(40, 60); }
        if (need === 'curr' && st.currSV == null) { st.currSV = rndInt(3, 9) * 100; }
        if (need === 'ph'   && st.phBase == null) { st.phBase = rnd(2, 9); st.ph = st.phBase; }
      });
    });
  }

  // ── Simulation step ────────────────────────────────────────────────────────
  advance(seconds) {
    let left = Math.min(seconds, MAX_CATCHUP);
    while (left > 0) {
      const dt = Math.min(left, SUB_STEP);
      this._step(dt);
      left -= dt;
    }
  }

  _step(dt) {
    this.time += dt;
    this._stepStations(dt);
    this.lines.forEach(line => line.wagons.forEach(w => this._stepWagon(w, line, dt)));
    this._stepModes(dt);
    this._stepFaults(dt);
  }

  _stepStations(dt) {
    this.lines.forEach(line => {
      const first = this.stations[line.ids[0]];
      const last  = this.stations[line.ids[line.ids.length - 1]];

      // Loading station: a fresh load appears once it's been empty a while.
      if (first && !first.load && !first.reserved) {
        first.spawnTimer -= dt;
        if (first.spawnTimer <= 0) {
          first.load = this._newLoad();
          first.elapsed = 0;
          first.dwell = rnd(...first.kindDef.dwell);
          first.spawnTimer = rnd(4, 12);
        }
      }
      // Unloading station: finished loads leave the line.
      if (last && last !== first && last.load && !last.reserved && last.elapsed >= last.dwell) {
        last.load = null;
        last.elapsed = 0;
        this.loadsDone++;
        this.lastCycle = this.time - this.lastDoneAt;
        this.lastDoneAt = this.time;
      }
    });

    Object.values(this.stations).forEach(st => {
      if (st.load) st.elapsed += dt;

      // Temperature: first-order toward set point (or ambient) + small noise;
      // an occasional upset pushes it off set point for a while (alarm demo).
      const upset = this.tempUpsets[st.id];
      const target = (st.tempSV ?? st.ambient) + (upset ? upset.delta : 0);
      st.temp += (target - st.temp) * clamp(dt * 0.15, 0, 1) + rnd(-0.08, 0.08);

      // Rectifier current: ramps to set point while a load is in the tank.
      if (st.currSV != null) {
        const want = st.load ? st.currSV * (1 + rnd(-0.015, 0.015)) : 0;
        st.curr += (want - st.curr) * clamp(dt * 0.6, 0, 1);
        if (!st.load && st.curr < 1) st.curr = 0;
      }

      // pH: slow random walk around its base.
      if (st.phBase != null) {
        st.ph += (st.phBase - st.ph) * clamp(dt * 0.05, 0, 1) + rnd(-0.004, 0.004);
      }
    });

    Object.keys(this.tempUpsets).forEach(id => {
      this.tempUpsets[id].left -= dt;
      if (this.tempUpsets[id].left <= 0) delete this.tempUpsets[id];
    });
    // Roughly one temperature excursion every couple of minutes.
    if (Math.random() < dt / 150) {
      const heated = Object.values(this.stations).filter(s => s.tempSV != null && !this.tempUpsets[s.id]);
      if (heated.length) {
        const st = pick(heated);
        this.tempUpsets[st.id] = { delta: pick([-1, 1]) * rnd(5, 8), left: rnd(40, 70) };
      }
    }
  }

  // Can wagon `w` claim the index interval [lo, hi] without crossing / meeting
  // a neighbour on the same line? (Adjacent tanks are fine — the drawn wagons
  // are narrower than one tank pitch.)
  _canReserve(w, line, lo, hi) {
    const left  = line.wagons[w.k - 1];
    const right = line.wagons[w.k + 1];
    if (left  && left.reserve[1]  >= lo) return false;
    if (right && right.reserve[0] <= hi) return false;
    return true;
  }

  _findJob(w, line) {
    const ids = line.ids;
    const minSrc = w.k === 0 ? 0 : w.zoneStart - 1;
    const maxSrc = w.zoneEnd - 1;
    for (let i = maxSrc; i >= minSrc; i--) {           // downstream first
      const src = this.stations[ids[i]];
      const dst = this.stations[ids[i + 1]];
      if (!src || !dst) continue;
      if (!src.load || src.reserved || src.elapsed < src.dwell) continue;
      if (dst.load || dst.reserved) continue;
      const lo = Math.min(w.pos, i);
      const hi = Math.max(w.pos, i + 1);
      if (!this._canReserve(w, line, lo, hi)) continue;
      return { src: i, dst: i + 1, lo, hi };
    }
    return null;
  }

  _pathTo(from, to) {
    const out = [];
    const dir = Math.sign(to - from);
    for (let p = from + dir; dir !== 0 && p !== to + dir; p += dir) out.push(p);
    return out;
  }

  _stepWagon(w, line, dt) {
    const ids = line.ids;
    w.timer += dt;

    if (w.mode !== 'auto' && w.state === 'idle') return; // operator has it — no auto moves

    switch (w.state) {
      case 'idle': {
        if (w.timer < 0.5) return;
        const job = this._findJob(w, line);
        if (job) {
          w.job = job;
          w.reserve = [job.lo, job.hi];
          this.stations[ids[job.src]].reserved = true;
          this.stations[ids[job.dst]].reserved = true;
          w.path = this._pathTo(w.pos, job.src);
          w.state = 'to_src'; w.timer = 0;
          return;
        }
        // Nothing to do: back off a shared hand-off tank so a neighbour can use it.
        const right = line.wagons[w.k + 1];
        const left  = line.wagons[w.k - 1];
        let park = null;
        if (right && w.pos >= w.zoneEnd && w.pos - 1 >= 0) park = w.pos - 1;
        if (left && w.pos <= w.zoneStart - 1) park = w.zoneStart;
        if (park != null && park !== w.pos && this._canReserve(w, line, Math.min(park, w.pos), Math.max(park, w.pos))) {
          w.reserve = [Math.min(park, w.pos), Math.max(park, w.pos)];
          w.job = { park: true };
          w.path = this._pathTo(w.pos, park);
          w.state = 'parking'; w.timer = 0;
        }
        w.timer = 0;
        return;
      }

      case 'parking':
      case 'to_src':
      case 'to_dst': {
        if (w.path.length === 0) {
          w.timer = 0;
          if (w.state === 'to_src') { w.state = 'lift'; w.down = false; w.up = true; }
          else if (w.state === 'to_dst') { w.state = 'lower'; w.up = false; w.down = true; }
          else { w.state = 'idle'; w.job = null; w.reserve = [w.pos, w.pos]; }
          return;
        }
        if (w.timer >= TRAVEL_PER_TANK) {
          w.timer -= TRAVEL_PER_TANK;
          w.pos = w.path.shift();
        }
        return;
      }

      case 'lift': {
        if (!w.carrying && w.timer >= HOIST_BOTTOM_AT) {     // hook at the bottom: take the load
          const src = this.stations[ids[w.job.src]];
          w.carrying = src.load;
          src.load = null; src.elapsed = 0; src.reserved = false;
          if (src.idx === 0) src.spawnTimer = rnd(6, 14);
        }
        if (w.timer >= LIFT_TIME) { w.state = 'drip'; w.timer = 0; }
        return;
      }

      case 'drip': {
        if (w.timer >= DRIP_TIME) {
          w.path = this._pathTo(w.pos, w.job.dst);
          w.state = 'to_dst'; w.timer = 0;
        }
        return;
      }

      case 'lower': {
        if (w.carrying && w.timer >= HOIST_BOTTOM_AT) {      // hook at the bottom: release the load
          const dst = this.stations[ids[w.job.dst]];
          dst.load = w.carrying; dst.elapsed = 0; dst.reserved = false;
          dst.dwell = rnd(...dst.kindDef.dwell);
          if (dst.tempSV != null) dst.temp -= rnd(0.5, 1.5); // cold load dips the bath
          w.carrying = null;
        }
        if (w.timer >= LOWER_TIME) {
          w.state = 'idle'; w.timer = 0; w.job = null;
          w.reserve = [w.pos, w.pos];
        }
        return;
      }
    }
  }

  _stepModes(dt) {
    this.wagons.forEach(w => {
      if (w.mode === 'auto') return;
      w.modeTimer -= dt;
      if (w.modeTimer <= 0) { w.mode = 'auto'; w.timer = 0; }
    });
    // Now and then an operator takes one idle wagon out of auto for a bit.
    const allAuto = this.wagons.every(w => w.mode === 'auto');
    if (allAuto && Math.random() < dt / 150) {
      const idle = this.wagons.filter(w => w.state === 'idle');
      if (idle.length) {
        const w = pick(idle);
        w.mode = Math.random() < 0.25 ? 'service' : 'manual';
        w.modeTimer = w.mode === 'service' ? rnd(25, 40) : rnd(15, 30);
      }
    }
  }

  _stepFaults(dt) {
    Object.keys(this.faults).forEach(k => {
      this.faults[k] -= dt;
      if (this.faults[k] <= 0) delete this.faults[k];
    });
    if (Math.random() < dt / 200) {
      const ids = Object.keys(this.stations);
      const candidates = [
        `dunk_${pick(ids)}`,
        `pump_${pick(SPRAY_PUMPS).id}`,
        `ct_${rndInt(1, 2)}`,
      ];
      this.faults[pick(candidates)] = rnd(15, 35);
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  _wagonOperation(w, line) {
    const tank = i => line.ids[i];
    if (w.mode === 'manual')  return 'Manual';
    if (w.mode === 'service') return 'Service';
    switch (w.state) {
      case 'to_src':  return `Get Stn:${tank(w.job.src)}`;
      case 'lift':    return `Lifting Stn:${tank(w.job.src)}`;
      case 'drip':    return `Dripping Stn:${tank(w.job.src)}`;
      case 'to_dst':  return `Put Stn:${tank(w.job.dst)}`;
      case 'lower':   return `Lowering Stn:${tank(w.job.dst)}`;
      case 'parking': return 'Parking';
      default:        return `At Stn:${tank(w.pos)}`;
    }
  }

  _alarms() {
    const out = [];
    this.wagons.forEach(w => {
      if (w.mode === 'manual')  out.push(`W${w.id} In Manual Mode`);
      if (w.mode === 'service') out.push(`W${w.id} In Service Mode`);
    });
    Object.values(this.stations).forEach(st => {
      if (st.tempSV == null) return;
      const name = st.label || `Stn ${st.id}`;
      if (st.temp > st.tempSV + 3) out.push(`Temperature High At ${name} (Stn ${st.id})`);
      if (st.temp < st.tempSV - 3) out.push(`Temperature Low At ${name} (Stn ${st.id})`);
    });
    Object.keys(this.faults).forEach(k => {
      const [kind, id] = k.split('_');
      if (kind === 'dunk') out.push(`Dunking Unit Not Healthy At Stn ${id}`);
      if (kind === 'pump') out.push(`${SPRAY_PUMPS.find(p => p.id === id)?.label ?? 'Spray Pump'} Not Healthy`);
      if (kind === 'ct')   out.push(`Cross Trolley CT-${id} Not Healthy`);
    });
    return out;
  }

  // Returns { [tagName]: { name, value, unit, timestamp } } — the same shape
  // useTagSocket produces from the backend's WebSocket.
  snapshot(userCfg) {
    const tankTags      = getTankTags(userCfg);
    const wagonTags     = getWagonTags(userCfg);
    const stationParams = getStationParams(userCfg);
    this._syncLabels(tankTags);
    this._syncParams(stationParams);

    const now = new Date().toISOString();
    const tags = {};
    const put = (name, value, unit = '') => {
      if (!name) return;
      tags[name] = { name, value: String(value), unit, timestamp: now };
    };

    // ── Per station ──
    Object.values(this.stations).forEach(st => {
      const sid = String(st.id);
      const loadNo = st.load ? st.load.no : 0;

      // Mimic Page Config tank tag: bool → 1/0, numeric → the load number.
      const tt = tankTags[sid];
      if (tt?.name) put(tt.name, fmtValue(tt.type === 'bool' ? !!st.load : loadNo, tt.type || 'bool'));

      put(`STATION_${sid}_LOADNUM`, loadNo);

      // Station Info parameters, in the same raw units the PLC registers use
      // (Actual PH is pH×100 — see PARAM_SCALE in WagonScada3D.jsx).
      (stationParams[sid] || []).forEach((p, idx) => {
        let raw = 0;
        switch (p.label) {
          case 'Actual Temperature': raw = st.temp; break;
          case 'Actual Current':     raw = st.curr; break;
          case 'Set Current':        raw = st.currSV ?? 0; break;
          case 'Calculated Current': raw = st.load ? (st.currSV ?? 0) * st.calcFactor : 0; break;
          case 'Actual PH':          raw = (st.ph ?? 7) * 100; break;
          default:                   raw = 0;
        }
        put(`STATION_${sid}_P${idx}`, fmtValue(raw, p.type || 'float32'), p.unit || '');
      });

      // Generic per-tank values (Station Info table, Temperature settings, Tag Monitor).
      put(`Tank_${sid}_Temp`, st.temp.toFixed(1), '°C');
      if (st.tempSV != null) {
        put(`Tank_${sid}_TempSV`, st.tempSV.toFixed(0), '°C');
        // Heater output — simple on/off thermostat with a little hysteresis.
        st.heaterOn = st.temp < st.tempSV - (st.heaterOn ? -0.3 : 0.3);
        put(`Tank_${sid}_HeaterOn`, st.heaterOn ? 1 : 0);
      }
      if (st.currSV != null) {
        put(`Tank_${sid}_Current`, Math.round(st.curr), 'A');
        put(`Tank_${sid}_CurrentSV`, st.currSV, 'A');
        put(`Tank_${sid}_RectifierOn`, st.curr > 1 ? 1 : 0);
        // Rectifier DC voltage roughly tracks current (bath resistance ~10 mΩ).
        put(`Tank_${sid}_Voltage`, (st.curr > 0 ? 2 + st.curr * 0.01 : 0).toFixed(1), 'V');
      }
      if (st.ph != null) put(`Tank_${sid}_PH`, st.ph.toFixed(2), 'pH');
      put(`Tank_${sid}_Duration`, st.load ? Math.floor(st.elapsed) : 0, 's');
      put(`Tank_${sid}_Client`, st.load ? st.load.client : 'NA');
      put(`Tank_${sid}_Part`, st.load ? st.load.part : 'NA');

      // Dunking LEDs.
      const dt = dunkingTags(st.id);
      const wagonHere = this.wagons.some(w => w.line === st.line && this.lines[w.line].ids[w.pos] === st.id
        && (w.state === 'lift' || w.state === 'lower'));
      put(dt.homeProxy, wagonHere ? 0 : 1);
      put(dt.output, st.load ? 1 : 0);
      put(dt.healthy, this.faults[`dunk_${sid}`] ? 0 : 1);
    });

    // ── Per wagon ──
    this.lines.forEach(line => line.wagons.forEach(w => {
      const wt = wagonTags[String(w.id)];
      const tankId = line.ids[w.pos] ?? 0;
      if (wt) {
        put(wt.name, fmtValue(tankId, wt.type || 'int16'));
        put(wt.upLiftTag?.name, w.up ? 1 : 0);
        put(wt.downLiftTag?.name, w.down ? 1 : 0);
        put(wt.autoTag?.name, w.mode === 'auto' ? 1 : 0);
        put(wt.manualTag?.name, w.mode === 'manual' ? 1 : 0);
        put(wt.serviceTag?.name, w.mode === 'service' ? 1 : 0);
      }
      put(`W${w.id}_OPERATION`, this._wagonOperation(w, line));
      put(`W${w.id}_LOADNUM`, w.carrying ? w.carrying.no : 0);
    }));

    // ── Pre-requisites page ──
    const wagonById = Object.fromEntries(this.wagons.map(w => [String(w.id), w]));
    PREREQUISITE_SECTIONS.forEach(section => section.tables.forEach(table => {
      table.columns.forEach(col => table.rows.forEach(row => {
        const name = table.tagName(row, col);
        let v = 1;
        if (section.id === 'wagon') {
          const w = wagonById[col.id];
          if (row.id === 'Auto')         v = w ? (w.mode === 'auto' ? 1 : 0) : 1;
          if (row.id === 'Service')      v = w ? (w.mode === 'service' ? 1 : 0) : 0;
          if (row.id === 'EmgStop')      v = 1; // healthy (not pressed)
          if (row.id === 'TrayOutProxi') v = w ? (w.up ? 0 : 1) : 1;
        } else if (section.id === 'cross-trolley') {
          if (this.faults[`ct_${col.id}`] && (row.id === 'Healthy' || row.id === 'ControlOn')) v = 0;
        } else if (section.id === 'tank-lid') {
          if (row.id === 'LidClosePX') v = Math.floor(this.time / 45) % 4 === 0 ? 0 : 1;
        }
        put(name, v);
      }));
    }));

    // ── Spray pumps ──
    SPRAY_PUMPS.forEach(p => {
      const faulted = !!this.faults[`pump_${p.id}`];
      put(p.tags.healthy, faulted ? 0 : 1);
      put(p.tags.scrubberHealthy, 1);
      put(p.tags.outputStatus, !faulted && this.stations[p.station]?.load ? 1 : 0);
    });

    // ── Plant level ──
    const alarms = this._alarms();
    put('PLANT_ALARM_COUNT', alarms.length);
    put('PLANT_ALARM_MSG', alarms.join(' | '));
    put('PLANT_MODE', this.wagons.every(w => w.mode === 'auto') ? 'Auto' : 'Manual');
    put('PLANT_LOADS_DONE', this.loadsDone);
    put('PLANT_LOADS_IN_PROCESS',
      Object.values(this.stations).filter(s => s.load).length + this.wagons.filter(w => w.carrying).length);
    put('PLANT_CYCLE_ACTUAL', Math.floor(this.time - this.lastDoneAt), 's');
    put('PLANT_CYCLE_LAST', this.lastCycle != null ? Math.round(this.lastCycle) : 0, 's');
    put('PLANT_CYCLE_SET', 300, 's');
    put('SYS_DATA_SOURCE', 'MOCK');

    return tags;
  }
}
