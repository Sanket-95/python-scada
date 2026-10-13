import { useRef, useState, useEffect, useCallback } from 'react';
import { C } from '../config/scadaConfig';

const rnd   = (a, b) => a + Math.random() * (b - a);
const rndMs = ([a, b]) => Math.floor(rnd(a, b));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Tag-commanded moves (case 'moving_to_position') ignore each wagon's own
// randomized demo speed and use this one fixed multiplier on cfg.wagon.speedBase
// instead — so every tag-controlled wagon moves at exactly the same speed,
// loaded or empty, never varying by which wagon it is. History: 2.5x, then
// +75% (x1.75) twice more, then doubled, as requested while tuning against
// real hardware.
const TAG_MOVE_SPEED_MUL = 2.5 * 1.75 * 1.75 * 2; // = 15.3125

// Hoist dip played when a tag-controlled wagon picks up or sets down a load
// (lift tag latch): the hook goes down into the tank, the load changes hands
// at the bottom, and it comes back up. Seconds per half; the mock PLC
// (sim/mockPlant.js HOIST_BOTTOM_AT) swaps the tank's load at the same moment.
const DIP_DOWN_S = 2.0;
const DIP_UP_S   = 2.0;
const easeInOut  = t => t * t * (3 - 2 * t);

// Advances a running dip. Returns true while it's still playing.
function stepDip(wagon, dt) {
  const dip = wagon.dip;
  dip.t += dt;
  if (dip.t < DIP_DOWN_S) {                        // going down
    wagon.armExtension = easeInOut(dip.t / DIP_DOWN_S);
    wagon.loadPercent  = dip.pickup ? 0 : 100;     // empty hook down / load going in
    wagon.status = dip.pickup ? 'arm_extending_load' : 'arm_extending_unload';
    return true;
  }
  if (dip.t < DIP_DOWN_S + DIP_UP_S) {             // coming up
    wagon.armExtension = 1 - easeInOut((dip.t - DIP_DOWN_S) / DIP_UP_S);
    wagon.loadPercent  = dip.pickup ? 100 : 0;     // load coming out / empty hook up
    wagon.status = dip.pickup ? 'arm_retracting_loaded' : 'arm_retracting_empty';
    return true;
  }
  wagon.armExtension = 0;
  wagon.loadPercent  = dip.pickup ? 100 : 0;
  wagon.status = 'idle';
  wagon.timer = 0;
  wagon.dip = null;
  return false;
}

// ── Trip planner: pick source (has load) and destination (any free tank) ─────
// hasLoad here is purely READ — it comes from the live PLC poll, not
// anything this file writes. With nothing connected/configured yet, no
// station ever has hasLoad=true, so wagons simply stay idle rather than
// running a fabricated demo trip.
function pickTrip(wagon, trackSts) {
  const sources = trackSts
    .map((st, i) => ({ st, i }))
    .filter(({ st }) => st.hasLoad && !st.isActive);

  if (sources.length === 0) return false;

  const src = sources[Math.floor(Math.random() * sources.length)];

  // Destinations: must be empty tanks (no load) so the deposit is clearly visible
  const dests = trackSts
    .map((st, i) => ({ st, i }))
    .filter(({ st, i }) => i !== src.i && !st.hasLoad && !st.isActive);

  if (dests.length === 0) return false;

  wagon.sourceStIdx = src.i;
  wagon.destStIdx   = dests[Math.floor(Math.random() * dests.length)].i;
  return true;
}

// Tag value -> an actual tank id on this wagon's track: 0 (or missing) means
// "no specific target yet" and resolves to that track's lowest tank number;
// an id that isn't on this track is treated as "ignore" (null) rather than
// guessed at.
function resolveTankId(trackSts, wantedId) {
  if (trackSts.length === 0) return null;
  if (!wantedId) {
    return trackSts.reduce((min, st) => (st.id < min ? st.id : min), trackSts[0].id);
  }
  return trackSts.some(st => st.id === wantedId) ? wantedId : null;
}

// ── Initial state ─────────────────────────────────────────────────────────────
// hasLoad is no longer mock/simulated data — it starts false for every tank
// and only ever changes via setStationHasLoad, which the live PLC poll (see
// WagonScada3D.jsx's grpcTags effect) calls continuously. The simulation
// below moves wagons and only READS hasLoad (to pick a trip), it never
// writes it — real data is the only source of truth for which tanks are
// loaded.
function buildInitState(cfg) {
  const stations = cfg.tracks.flatMap(track => {
    return track.stations.map((st, i) => ({
      id:            st.id,
      trackId:       track.id,
      x:             st.x,
      label:         st.label,
      fillLevel:     st.initFill,   // static — display only, never changes
      temperature:   st.baseTemp + rnd(-4, 4),
      baseTemp:      st.baseTemp,
      hasLoad:       false,
      isActive:      false,
      activeWagonId: null,
    }));
  });

  const wagons = cfg.tracks.flatMap(track => {
    const trackSts = stations.filter(s => s.trackId === track.id);
    const spd = () => cfg.wagon.speedBase + rnd(-cfg.wagon.speedVar, cfg.wagon.speedVar);

    return track.wagonIds.map((wId, idx) => {
      const staggered = [
        // 0 — idle at home
        { x: track.homeX, status: 'idle', loadPercent: 0, armExtension: 0,
          sourceStIdx: 0, destStIdx: 5,
          timer: rnd(200, 700), timerDuration: rndMs(cfg.sim.idlePause) },

        // 1 — moving to source (source in loaded zone, dest in empty zone)
        (() => {
          const si = Math.floor(trackSts.length * 0.10); // within loaded 25%
          const di = Math.floor(trackSts.length * 0.55); // in empty zone
          return { x: track.homeX + (trackSts[si].x - track.homeX) * 0.25,
            status: 'moving_to_source', loadPercent: 0, armExtension: 0,
            sourceStIdx: si, destStIdx: di, timer: 0, timerDuration: 0 };
        })(),

        // 2 — arm extending, picking up load (source in loaded zone, dest in empty zone)
        (() => {
          const si = Math.floor(trackSts.length * 0.20); // within loaded 25%
          const di = Math.floor(trackSts.length * 0.70); // in empty zone
          const st = trackSts[si];
          st.isActive = true; st.activeWagonId = wId;
          return { x: st.x,
            status: 'arm_extending_load', loadPercent: 55, armExtension: 0.55,
            sourceStIdx: si, destStIdx: di,
            timer: cfg.sim.armExtendDur * 0.55, timerDuration: cfg.sim.armExtendDur };
        })(),

        // 3 — loaded, moving toward destination (dest is in empty zone)
        (() => {
          const si = Math.floor(trackSts.length * 0.08);
          const di = Math.floor(trackSts.length * 0.85); // in empty zone
          const srcX = trackSts[si].x;
          const dstX = trackSts[di].x;
          return { x: srcX + (dstX - srcX) * 0.4,
            status: 'moving_to_dest', loadPercent: 100, armExtension: 0,
            sourceStIdx: si, destStIdx: di, timer: 0, timerDuration: 0 };
        })(),
      ];

      // Each wagon gets its own home position so they queue without overlapping —
      // spread away from the tanks, toward whichever side the home zone is on.
      const wagonHomeX = track.homeX + (track.homeDir ?? 1) * idx * (cfg.wagon.w + 12);
      const init = staggered[idx] ?? staggered[0];
      return {
        id: wId, trackId: track.id, homeX: wagonHomeX, speed: spd(),
        // Set the first time a live Wagon Location tag value is seen for
        // this wagon (see snapWagonToTank) — from then on it's driven
        // entirely by that tag and never runs the autonomous demo trip
        // planner (pickTrip) again.
        tagControlled: false, committedTagTarget: null,
        // 'auto' | 'manual' | 'service' | null — set by setWagonMode from
        // the wagon's live Auto/Manual/Service tags; null until the first
        // one of those reads 1 (no mode LED/label suffix shown until then).
        mode: null,
        ...init,
      };
    });
  });

  return { wagons, stations };
}

// ── Physics tick ──────────────────────────────────────────────────────────────
function tick(state, dt, cfg, pendingTargets) {
  const { wagons, stations } = state;

  const MIN_GAP = cfg.wagon.w + 10; // minimum spacing between wagons on the same track

  wagons.forEach(wagon => {
    // A hoist dip in progress owns the wagon until it finishes — no travel
    // or redirect meanwhile (a new location target is picked up right after).
    if (wagon.dip && stepDip(wagon, dt)) return;

    const trackSts    = stations.filter(s => s.trackId === wagon.trackId);
    const trackWagons = wagons.filter(w => w.id !== wagon.id && w.trackId === wagon.trackId);

    // Returns true when wagon reaches targetX; respects collision with same-track wagons.
    // fixedSpeed lets a tag-commanded move (see TAG_MOVE_SPEED below) use one
    // shared speed instead of this wagon's own randomized demo speed — loaded
    // and empty must move identically, and loadPercent never factors into
    // movement speed anywhere in this function either way.
    const moveTo = (targetX, fixedSpeed = null) => {
      const dx  = targetX - wagon.x;
      if (Math.abs(dx) < 0.5) { wagon.x = targetX; return true; }
      const dir = Math.sign(dx);

      // Block if another wagon on the same track is too close in the direction of travel
      const blocked = trackWagons.some(other =>
        Math.sign(other.x - wagon.x) === dir &&
        Math.abs(other.x - wagon.x) < MIN_GAP
      );
      if (blocked) return false;

      const step = (fixedSpeed ?? wagon.speed) * dt;
      if (Math.abs(dx) <= step) { wagon.x = targetX; return true; }
      wagon.x += dir * step;
      return false;
    };

    // Tag-controlled wagons: continuously compare the live-commanded target
    // against what's currently committed, and redirect immediately on a
    // genuine change — even mid-move, and regardless of current status.
    // Reaching it just parks the wagon there (case 'moving_to_position'
    // below) until the tag value changes again; it never runs the
    // autonomous demo trip planner (guarded in the 'idle' case below).
    if (wagon.tagControlled) {
      const wanted = resolveTankId(trackSts, pendingTargets?.[String(wagon.id)]);
      if (wanted != null && wanted !== wagon.committedTagTarget) {
        const idx = trackSts.findIndex(st => st.id === wanted);
        if (idx !== -1) {
          wagon.committedTagTarget = wanted;
          wagon.destStIdx  = idx;
          wagon.status     = 'moving_to_position';
          wagon.timer      = 0;
        }
      }
    }

    switch (wagon.status) {

      case 'idle': {
        wagon.timer += dt * 1000;
        if (wagon.timer >= wagon.timerDuration) {
          if (!wagon.tagControlled && pickTrip(wagon, trackSts)) {
            wagon.status = 'moving_to_source';
            wagon.loadPercent  = 0;
            wagon.armExtension = 0;
          } else {
            wagon.timerDuration = rndMs(cfg.sim.idlePause);
          }
          wagon.timer = 0;
        }
        break;
      }

      case 'moving_to_source': {
        const st = trackSts[wagon.sourceStIdx];
        if (!st) { wagon.status = 'idle'; wagon.timer = 0; wagon.timerDuration = rndMs(cfg.sim.idlePause); break; }
        if (moveTo(st.x)) {
          wagon.status = 'arm_extending_load';
          wagon.timer = 0; wagon.timerDuration = cfg.sim.armExtendDur;
          st.isActive = true; st.activeWagonId = wagon.id;
        }
        break;
      }

      case 'arm_extending_load': {
        wagon.timer += dt * 1000;
        wagon.armExtension = clamp(wagon.timer / wagon.timerDuration, 0, 1);
        wagon.loadPercent  = wagon.armExtension * 100;
        // Tank level is static; hasLoad is live-data-only now (never written
        // here) — only isActive/activeWagonId (pure UI highlight) are reset
        if (wagon.timer >= wagon.timerDuration) {
          wagon.armExtension = 1; wagon.loadPercent = 100;
          wagon.status = 'arm_retracting_loaded';
          wagon.timer = 0; wagon.timerDuration = cfg.sim.armRetractDur;
          const src = trackSts[wagon.sourceStIdx];
          if (src) { src.isActive = false; src.activeWagonId = null; }
        }
        break;
      }

      case 'arm_retracting_loaded': {
        wagon.timer += dt * 1000;
        wagon.armExtension = clamp(1 - wagon.timer / wagon.timerDuration, 0, 1);
        if (wagon.timer >= wagon.timerDuration) {
          wagon.armExtension = 0;
          wagon.status = 'moving_to_dest'; wagon.timer = 0;
        }
        break;
      }

      case 'moving_to_dest': {
        const st = trackSts[wagon.destStIdx];
        if (!st) { wagon.status = 'returning'; wagon.timer = 0; break; }
        if (moveTo(st.x)) {
          wagon.status = 'arm_extending_unload';
          wagon.timer = 0; wagon.timerDuration = cfg.sim.armExtendDur;
          st.isActive = true; st.activeWagonId = wagon.id;
        }
        break;
      }

      case 'arm_extending_unload': {
        wagon.timer += dt * 1000;
        wagon.armExtension = clamp(wagon.timer / wagon.timerDuration, 0, 1);
        wagon.loadPercent  = clamp(100 - wagon.armExtension * 100, 0, 100);
        const dst = trackSts[wagon.destStIdx];
        // hasLoad is live-data-only now — the arm still visually dips and
        // drops here, but whether the tank actually shows as loaded
        // afterward comes from the next real PLC reading, not this tick.
        if (wagon.timer >= wagon.timerDuration) {
          wagon.armExtension = 1; wagon.loadPercent = 0;
          wagon.status = 'arm_retracting_empty';
          wagon.timer = 0; wagon.timerDuration = cfg.sim.armRetractDur;
          if (dst) { dst.isActive = false; dst.activeWagonId = null; }
        }
        break;
      }

      case 'arm_retracting_empty': {
        wagon.timer += dt * 1000;
        wagon.armExtension = clamp(1 - wagon.timer / wagon.timerDuration, 0, 1);
        if (wagon.timer >= wagon.timerDuration) {
          wagon.armExtension = 0;
          wagon.status = 'returning'; wagon.timer = 0;
        }
        break;
      }

      case 'moving_to_position': {
        // Tag-commanded move: just travel to the target tank, no arm ops —
        // a fixed speed (TAG_MOVE_SPEED_MUL x cfg.wagon.speedBase, ignoring
        // this wagon's own random demo-speed variance) so it's identical
        // whether the wagon is currently flagged loaded or empty, and
        // reliably keeps up with the PLC tag changing again before it
        // arrives.
        const st = trackSts[wagon.destStIdx];
        if (!st) { wagon.status = 'idle'; wagon.timer = 0; wagon.timerDuration = rndMs(cfg.sim.idlePause); break; }
        if (moveTo(st.x, cfg.wagon.speedBase * TAG_MOVE_SPEED_MUL)) {
          wagon.status = 'idle';
          wagon.timer  = 0;
          wagon.timerDuration = rndMs(cfg.sim.idlePause);
        }
        break;
      }

      case 'returning': {
        const arrived = moveTo(wagon.homeX);
        // Also settle as idle if close to home but blocked by a parked wagon
        const nearHome = Math.abs(wagon.x - wagon.homeX) < MIN_GAP * 1.5;
        const blockedAtHome = nearHome && trackWagons.some(other =>
          other.status === 'idle' && Math.abs(other.x - wagon.x) < MIN_GAP
        );
        if (arrived || blockedAtHome) {
          wagon.status = 'idle'; wagon.loadPercent = 0; wagon.armExtension = 0;
          wagon.timer = 0; wagon.timerDuration = rndMs(cfg.sim.idlePause);
        }
        break;
      }
    }
  });

  // Temperature drift only — hasLoad is driven entirely by live PLC data now,
  // nothing here touches it
  stations.forEach(st => {
    if (st.liveTemp) return;
    const target = st.baseTemp + (st.isActive ? 8 : 0);
    st.temperature += (target - st.temperature) * cfg.sim.tempDrift * dt;
    if (Math.random() < 0.008) st.temperature += rnd(-0.8, 0.8);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useWagonSimulation(cfgOverride) {
  const cfg = cfgOverride ?? C;
  const stateRef         = useRef(null);
  const pendingTargetsRef = useRef({});  // { wagonId: tankId } — consumed per tick
  if (!stateRef.current) stateRef.current = buildInitState(cfg);

  const [display, setDisplay] = useState(() => ({
    wagons:   stateRef.current.wagons.map(w => ({ ...w })),
    stations: stateRef.current.stations.map(s => ({ ...s })),
  }));

  // Command a wagon to move to a specific tank (by tank ID), animated —
  // also marks it tag-controlled (see tick()'s continuous dispatch above).
  const setWagonTarget = useCallback((wagonId, tankId) => {
    const wagon = stateRef.current.wagons.find(w => w.id === Number(wagonId));
    if (wagon) wagon.tagControlled = true;
    pendingTargetsRef.current[String(wagonId)] = tankId;
  }, []);

  // Places a wagon directly at a tank with no animation and no arm ops —
  // for the very first Wagon Location tag value seen on page load, so the
  // wagon starts where the PLC says it is instead of at its demo position.
  // 0/missing resolves to that wagon's track's lowest tank number.
  const snapWagonToTank = useCallback((wagonId, tankId) => {
    const state = stateRef.current;
    const wagon = state.wagons.find(w => w.id === Number(wagonId));
    if (!wagon) return;
    const trackSts = state.stations.filter(s => s.trackId === wagon.trackId);
    const resolved = resolveTankId(trackSts, tankId);
    if (resolved == null) return;
    const idx = trackSts.findIndex(st => st.id === resolved);
    wagon.x = trackSts[idx].x;
    wagon.destStIdx = idx;
    wagon.status = 'idle';
    wagon.loadPercent = 0;
    wagon.armExtension = 0;
    wagon.timer = 0;
    wagon.timerDuration = rndMs(cfg.sim.idlePause);
    wagon.tagControlled = true;
    wagon.committedTagTarget = resolved;
  }, [cfg]);

  // Live temperature (°C) for a station — once set, the station's own
  // drift model stops touching it, so the live value is shown as-is.
  const setStationTemperature = useCallback((stationId, temperature) => {
    const st = stateRef.current.stations.find(s => s.id === Number(stationId));
    if (st) { st.temperature = temperature; st.liveTemp = true; }
  }, []);

  // Directly set a station's hasLoad (for manual tag testing)
  const setStationHasLoad = useCallback((stationId, hasLoad) => {
    const st = stateRef.current.stations.find(s => s.id === Number(stationId));
    if (st) st.hasLoad = hasLoad;
  }, []);

  // Directly sets whether a wagon is shown carrying its load — driven by
  // the up-lift/down-lift tag SET/RESET latch in WagonScada3D.jsx (loadType
  // and the barrel/basket/rack visual itself are entirely driven by
  // wagon.loadPercent > 0 in Wagon3D, so nothing else needs to change for
  // the right cargo to appear/disappear). Also marks the wagon
  // tag-controlled so the demo arm-extend/retract animation — which
  // otherwise owns loadPercent — never fights over it.
  //
  // animate = true plays the hoist dip (down into the tank, hand over the
  // load, back up) instead of switching instantly — used for a real change
  // of state, not for the first value seen on page load. A wagon that's
  // mid-travel just switches instantly.
  const setWagonLoadFlag = useCallback((wagonId, hasLoad, animate = false) => {
    const wagon = stateRef.current.wagons.find(w => w.id === Number(wagonId));
    if (!wagon) return;
    wagon.tagControlled = true;
    if (animate && wagon.status !== 'moving_to_position') {
      wagon.dip = { t: 0, pickup: !!hasLoad };
      return;
    }
    wagon.dip = null;
    wagon.loadPercent = hasLoad ? 100 : 0;
    wagon.armExtension = 0;
  }, []);

  // Directly sets a wagon's Auto/Manual/Service mode — driven by the
  // mode-tag selector effect in WagonScada3D.jsx. Purely a display flag
  // (LED + label suffix in Wagon3D); doesn't affect movement/load logic.
  const setWagonMode = useCallback((wagonId, mode) => {
    const wagon = stateRef.current.wagons.find(w => w.id === Number(wagonId));
    if (wagon) wagon.mode = mode;
  }, []);

  useEffect(() => {
    let last = performance.now();
    let raf;
    const FIXED_DT = 1 / 60;
    // Browsers throttle or fully pause requestAnimationFrame while the tab
    // is hidden/minimized — capping dt at a small fixed value on the frame
    // after that (as this used to do) silently discards all the real time
    // that passed, so the wagon just froze and resumed from the same spot
    // instead of being where it actually should be by now. Instead, replay
    // the real elapsed gap as a tight loop of normal-size fixed steps, so
    // every subsystem (movement, arm timers, temperature drift) behaves the
    // same whether the tab stayed focused or is catching up after being
    // hidden. MAX_CATCHUP_S caps a truly extreme gap (laptop sleep
    // overnight) so resuming can't stall — the live PLC tag is always the
    // source of truth anyway and corrects anything still off on the very
    // next real reading.
    const MAX_CATCHUP_S = 30;
    const animate = now => {
      let elapsed = Math.min((now - last) / 1000, MAX_CATCHUP_S);
      last = now;
      while (elapsed > 0) {
        const step = Math.min(elapsed, FIXED_DT);
        tick(stateRef.current, step, cfg, pendingTargetsRef.current);
        elapsed -= step;
      }
      setDisplay({
        wagons:   stateRef.current.wagons.map(w => ({ ...w })),
        stations: stateRef.current.stations.map(s => ({ ...s })),
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { ...display, setWagonTarget, snapWagonToTank, setWagonLoadFlag, setWagonMode, setStationHasLoad, setStationTemperature };
}
