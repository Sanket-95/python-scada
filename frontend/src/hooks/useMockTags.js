import { useEffect, useRef, useState } from 'react';
import { MockPlant } from '../sim/mockPlant';

const TICK_MS = 500; // same cadence as the real PLC poller

// Drop-in replacement for useTagSocket() when the data source is "mock":
// same { tags, connected } shape, but the tags come from an in-browser plant
// simulation (see sim/mockPlant.js) instead of the backend's WebSocket.
// Inactive (empty tags, not connected) when `enabled` is false.
export function useMockTags(enabled, userCfg) {
  const [tags, setTags] = useState({});
  const cfgRef = useRef(userCfg);
  cfgRef.current = userCfg;

  useEffect(() => {
    if (!enabled) { setTags({}); return; }
    const plant = new MockPlant(cfgRef.current);
    let last = performance.now();
    const publish = () => setTags(plant.snapshot(cfgRef.current));
    publish();
    // Advances by real elapsed time, so a throttled background tab catches up
    // instead of freezing the plant (same idea as useWagonSimulation).
    const id = setInterval(() => {
      const now = performance.now();
      plant.advance((now - last) / 1000);
      last = now;
      publish();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);

  return { tags, connected: enabled };
}
