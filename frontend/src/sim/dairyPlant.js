// Milk dairy plant simulation — drives the Dairy 3D screen with mock data.
// Process (matches the screen's process-flow strip):
//   1 Collection    cow / buffalo tankers arrive in turn and unload
//   2 Receiving     raw milk reception tank + flow meter
//   3 Flow control  diverter valve routes cow milk → cow tank, buffalo → buffalo tank
//   4 Pasteurize    both silos feed the HTST pasteurizer (72 °C, 15 s hold)
//   5 Homogenize    ~200 bar
//   6 Cooling       storage/cooling tank at 4 °C
//   7 Packaging     1 L pouches, packets/hour
//   8 Cold storage  2–4 °C, dispatched by truck periodically
// Plus a CIP (clean-in-place) cycle every few minutes and plant utilities.
// All volumes in litres, rates in L/s, time in seconds of real time.

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const TANKER_CAP   = 9000;
const UNLOAD_RATE  = 110;   // tanker → reception
const TRANSFER     = 95;    // reception → silo (via diverter)
const PROCESS_RATE = 38;    // silos → pasteurizer (combined)
const PACK_RATE    = 34;    // cooling tank → packaging
const SUB_STEP     = 0.25;

export const DAIRY_TANKS = [
  { id: 'reception', name: 'Raw Milk Reception', cap: 15000 },
  { id: 'cow',       name: 'Cow Milk Tank',       cap: 50000 },
  { id: 'buffalo',   name: 'Buffalo Milk Tank',   cap: 50000 },
  { id: 'cooling',   name: 'Storage / Cooling',   cap: 30000 },
  { id: 'cold',      name: 'Cold Storage',        cap: 30000 },
];

export class DairyPlant {
  constructor() {
    this.time = 0;
    this.tank = { reception: 1200, cow: 24900, buffalo: 16200, cooling: 14500, cold: 18400 };
    this.temp = { reception: 6.5, cow: 4.0, buffalo: 4.2, cooling: 4.0, cold: 3.1 };
    this.source = 'cow';                // which milk the reception tank is holding/passing
    this.tankers = {
      cow:     { state: 'unloading', left: TANKER_CAP * 0.55, timer: 0 },
      buffalo: { state: 'away',      left: 0,                timer: rnd(25, 40) },
    };
    this.received = { cow: 27500, buffalo: 13700 };     // today
    this.packed = 35600;                                 // units today
    this.packRate = 0;                                   // packets/hour (smoothed)
    this.pasteurTemp = 72;
    this.homPressure = 200;
    this.flow = { cowIn: 0, bufIn: 0, toCow: 0, toBuf: 0, process: 0, pack: 0, cip: 0, coldWater: 0 };
    this.cip = { state: 'idle', timer: 140, target: 'Cow Milk Tank' };
    this.compressor = 'running';
    this.dispatchTimer = 60;
    this.upset = null;                  // transient cold-storage temperature upset
  }

  advance(seconds) {
    let left = Math.min(seconds, 600);
    while (left > 0) { const dt = Math.min(left, SUB_STEP); this._step(dt); left -= dt; }
  }

  _step(dt) {
    this.time += dt;
    const f = { cowIn: 0, bufIn: 0, toCow: 0, toBuf: 0, process: 0, pack: 0, cip: 0, coldWater: 0 };

    // 1 — tankers take turns: arrive, unload into reception, leave.
    for (const kind of ['cow', 'buffalo']) {
      const t = this.tankers[kind], other = this.tankers[kind === 'cow' ? 'buffalo' : 'cow'];
      if (t.state === 'away') {
        t.timer -= dt;
        if (t.timer <= 0 && other.state !== 'unloading' && this.tank.reception < 6000) {
          t.state = 'unloading'; t.left = TANKER_CAP * rnd(0.75, 1);
        }
      } else if (t.state === 'unloading') {
        // Reception only takes one kind at a time — wait until it has drained.
        if (this.source !== kind && this.tank.reception > 50) continue;
        this.source = kind;
        const q = Math.min(UNLOAD_RATE * dt, t.left, DAIRY_TANKS[0].cap - this.tank.reception);
        t.left -= q; this.tank.reception += q; this.received[kind] += q;
        f[kind === 'cow' ? 'cowIn' : 'bufIn'] = q / dt;
        if (t.left <= 1) { t.state = 'away'; t.timer = rnd(35, 70); }
      }
    }
    this.temp.reception += ((this.tank.reception > 100 ? 6.5 : 4.5) - this.temp.reception) * dt * 0.05;

    // 2/3 — reception → diverter → matching silo.
    const dest = this.source === 'cow' ? 'cow' : 'buffalo';
    const room = DAIRY_TANKS.find(d => d.id === dest).cap - this.tank[dest];
    const xfer = Math.min(TRANSFER * dt, this.tank.reception, room);
    if (xfer > 0) {
      this.tank.reception -= xfer; this.tank[dest] += xfer;
      f[dest === 'cow' ? 'toCow' : 'toBuf'] = xfer / dt;
      this.temp[dest] += (this.temp.reception - this.temp[dest]) * (xfer / Math.max(this.tank[dest], 1));
    }

    // 4–6 — silos feed the process line in proportion to what they hold;
    // stops if the cooling tank is full or a CIP is running on the line.
    const cipOnLine = this.cip.state === 'running';
    const coolRoom = DAIRY_TANKS[3].cap - this.tank.cooling;
    let proc = 0;
    if (!cipOnLine && coolRoom > 0) {
      const total = this.tank.cow + this.tank.buffalo;
      if (total > 500) {
        proc = Math.min(PROCESS_RATE * dt, coolRoom, total - 400);
        const fromCow = proc * (this.tank.cow / total);
        this.tank.cow -= fromCow; this.tank.buffalo -= proc - fromCow;
        this.tank.cooling += proc;
      }
    }
    f.process = proc / dt;
    const running = f.process > 1;
    this.pasteurTemp += ((running ? 72 : 45) + rnd(-0.15, 0.15) - this.pasteurTemp) * dt * 0.3;
    this.homPressure += ((running ? 200 : 0) + rnd(-2, 2) - this.homPressure) * dt * 0.5;
    this.temp.cooling += (4 - this.temp.cooling) * dt * 0.08 + (running ? 0.002 : 0);
    f.coldWater = running ? 60 : 15;

    // 7/8 — packaging (1 L packets) into cold storage.
    const coldRoom = DAIRY_TANKS[4].cap - this.tank.cold;
    const pack = Math.min(PACK_RATE * dt, Math.max(this.tank.cooling - 300, 0), coldRoom);
    this.tank.cooling -= pack; this.tank.cold += pack; this.packed += pack;
    f.pack = pack / dt;
    this.packRate += (f.pack * 3600 - this.packRate) * clamp(dt * 0.3, 0, 1);

    // Cold storage: periodic dispatch, temperature with occasional door-open upset.
    this.dispatchTimer -= dt;
    if (this.dispatchTimer <= 0) { this.tank.cold = Math.max(0, this.tank.cold - rnd(6000, 9000)); this.dispatchTimer = rnd(70, 110); this.upset = { left: 20 }; }
    if (this.upset) { this.upset.left -= dt; if (this.upset.left <= 0) this.upset = null; }
    this.temp.cold += ((this.upset ? 5.6 : 3) - this.temp.cold) * dt * 0.1;
    this.temp.cow += (4 - this.temp.cow) * dt * 0.02;
    this.temp.buffalo += (4.2 - this.temp.buffalo) * dt * 0.02;

    // CIP — every few minutes, clean for ~45 s.
    const c = this.cip;
    c.timer -= dt;
    if (c.state === 'idle' && c.timer <= 0) { c.state = 'running'; c.timer = 45; c.target = ['Pasteurizer', 'Homogenizer', 'Process line'][Math.floor(Math.random() * 3)]; }
    else if (c.state === 'running' && c.timer <= 0) { c.state = 'idle'; c.timer = rnd(150, 220); }
    if (c.state === 'running') f.cip = 25;

    // Compressor cycles between running and standby.
    if (Math.random() < dt / 40) this.compressor = this.compressor === 'running' ? 'standby' : 'running';

    this.flow = f;
  }

  snapshot() {
    const pct = id => Math.round((this.tank[id] / DAIRY_TANKS.find(d => d.id === id).cap) * 100);
    const running = this.flow.process > 1;
    const cipRunning = this.cip.state === 'running';
    const tankStatus = id => (pct(id) > 92 ? 'High' : pct(id) < 5 ? 'Low' : 'Normal');
    const alarms = [];
    if (this.temp.cold > 4.5) alarms.push('Cold storage temperature high');
    DAIRY_TANKS.forEach(d => { if (pct(d.id) > 92) alarms.push(`${d.name} level high`); });
    if (!running && !cipRunning && this.tank.cow + this.tank.buffalo < 600) alarms.push('Process line starved — silos empty');

    const activeSteps = new Set();
    if (this.flow.cowIn || this.flow.bufIn) { activeSteps.add(1); activeSteps.add(2); }
    if (this.flow.toCow || this.flow.toBuf) activeSteps.add(3);
    if (running) { activeSteps.add(4); activeSteps.add(5); activeSteps.add(6); }
    if (this.flow.pack > 1) { activeSteps.add(7); activeSteps.add(8); }

    return {
      time: this.time,
      levels: Object.fromEntries(DAIRY_TANKS.map(d => [d.id, { litres: Math.round(this.tank[d.id]), cap: d.cap, pct: pct(d.id), temp: +this.temp[d.id].toFixed(1), status: tankStatus(d.id) }])),
      source: this.source,
      tankers: {
        cow: { state: this.tankers.cow.state, left: Math.round(this.tankers.cow.left) },
        buffalo: { state: this.tankers.buffalo.state, left: Math.round(this.tankers.buffalo.left) },
      },
      flow: { ...this.flow },
      pasteurizer: { temp: +this.pasteurTemp.toFixed(1), hold: 15, status: cipRunning && this.cip.target === 'Pasteurizer' ? 'CIP' : running ? 'Running' : 'Idle' },
      homogenizer: { pressure: Math.round(this.homPressure), status: cipRunning && this.cip.target === 'Homogenizer' ? 'CIP' : running ? 'Running' : 'Idle' },
      packaging: { rate: Math.round(this.packRate), status: this.flow.pack > 1 ? 'Running' : 'Idle' },
      cip: { status: cipRunning ? 'Running' : 'Idle', target: this.cip.target, remaining: Math.max(0, Math.round(this.cip.timer)) },
      utilities: { generator: 'Running', compressor: this.compressor === 'running' ? 'Running' : 'Standby' },
      kpi: {
        totalReceived: Math.round(this.received.cow + this.received.buffalo),
        cow: Math.round(this.received.cow), buffalo: Math.round(this.received.buffalo),
        packed: Math.round(this.packed),
        avgTemp: +(((this.temp.cow + this.temp.buffalo + this.temp.cooling + this.temp.cold) / 4)).toFixed(1),
        production: cipRunning ? 'CIP cleaning' : running ? 'Running' : 'Waiting for milk',
      },
      activeSteps: [...activeSteps],
      alarms,
    };
  }
}
