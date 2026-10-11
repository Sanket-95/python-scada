import { useState } from 'react';
import RotarySwitch from './RotarySwitch';
import StatusLed from './StatusLed';
import {
  SPRAY_PUMPS, ledState, loadSprayPumpSwitches, saveSprayPumpSwitches,
} from '../config/sprayPumps';

const T = {
  panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4', border: '#C4C8D4',
  accent: '#1565C0', textWh: '#1A2035', textDim: '#8090A8',
};

const COLS = '210px 118px 118px repeat(3, minmax(96px, 1fr))';

const HEADERS = ['PUMP', 'MAN / AUTO', 'MANUAL OFF / ON', 'HEALTHY', 'SCRUBBER HEALTHY', 'OUTPUT STATUS'];

// grpcTags / grpcConnected come from the app shell through SettingsPage's
// pageContext. The switches are local for now (persisted so they survive a
// reload); the LEDs only ever show live tag values.
export default function SprayPumpPage({ grpcTags = {}, grpcConnected = false }) {
  const [switches, setSwitches] = useState(loadSprayPumpSwitches);

  const flip = (pumpId, field, a, b) => setSwitches(prev => {
    const next = { ...prev, [pumpId]: { ...prev[pumpId], [field]: prev[pumpId][field] === a ? b : a } };
    saveSprayPumpSwitches(next);
    return next;
  });

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', overflowX: 'auto' }}>
      <div style={{ minWidth: 760, background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 16px',
          background: T.cardHdr, borderBottom: `2px solid ${T.accent}`,
          fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.accent,
        }}>
          {HEADERS.map((h, i) => <div key={h} style={{ textAlign: i === 0 ? 'left' : 'center' }}>{h}</div>)}
        </div>

        {SPRAY_PUMPS.map((pump, i) => {
          const sw = switches[pump.id];
          const title = `${pump.label} (Stn ${pump.station})`;
          const led = tag => ledState(grpcTags, grpcConnected, tag);
          return (
            <div key={pump.id} style={{
              display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
              padding: '14px 16px', background: i % 2 ? T.cardBg : T.panelBg,
              borderBottom: i < SPRAY_PUMPS.length - 1 ? `1px solid ${T.border}55` : 'none',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.textWh }}>{title}</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <RotarySwitch
                  label={`${title} Man/Auto`} leftLabel="MAN" rightLabel="AUTO"
                  isRight={sw.mode === 'auto'} onToggle={() => flip(pump.id, 'mode', 'man', 'auto')}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <RotarySwitch
                  label={`${title} Manual Off/On`} leftLabel="OFF" rightLabel="ON"
                  isRight={sw.manual === 'on'} onToggle={() => flip(pump.id, 'manual', 'off', 'on')}
                />
              </div>
              <StatusLed label={`${title} Healthy`} state={led(pump.tags.healthy)} />
              <StatusLed label={`${title} Scrubber Healthy`} state={led(pump.tags.scrubberHealthy)} />
              <StatusLed label={`${title} Output Status`} state={led(pump.tags.outputStatus)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
