import { useEffect, useState } from 'react';

const WS_URL = 'ws://localhost:50054/';

export function useTagSocket() {
  const [tags, setTags]           = useState({});  // { name: { name, value, unit, timestamp } }
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws;
    let timer;

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
        timer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => { clearTimeout(timer); ws?.close(); };
  }, []);

  return { tags, connected };
}
