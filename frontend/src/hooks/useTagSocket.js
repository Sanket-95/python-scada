import { useEffect, useState } from 'react';

const WS_URL = 'ws://localhost:50054/';

// `enabled` = false (data source is the built-in simulation) keeps the socket
// closed entirely, so a missing backend doesn't spam reconnect attempts.
export function useTagSocket(enabled = true) {
  const [tags, setTags]           = useState({});  // { name: { name, value, unit, timestamp } }
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) { setTags({}); setConnected(false); return; }
    let ws;
    let timer;
    let closed = false;

    function connect() {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setConnected(true);
        console.log('[SCADA] connected to TagServer');
      };

      ws.onmessage = (e) => {
        try {
          const tag = JSON.parse(e.data);
          console.log(`[TAG]  ${tag.name} = ${tag.value}${tag.unit ? '  ' + tag.unit : ''}`);
          setTags(prev => ({ ...prev, [tag.name]: tag }));
        } catch {
          console.warn('[SCADA] bad message:', e.data);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, [enabled]);

  return { tags, connected };
}
