import { useState } from 'react';
import { SPRAY_PUMPS, ledState, loadSprayPumpSwitches, saveSprayPumpSwitches } from '../config/sprayPumps';
import { THEME, FONT_COND } from '../theme';
import { Card, Grid, Segmented, Toggle, SignalPill, Badge } from '../ui/kit';

// Spray Pumps — one equipment card per pump: running state up top, the
// Man/Auto selector and manual run switch (saved locally the moment they
// change), and the live health signals underneath.

export default function SprayPumpPage({ grpcTags = {}, grpcConnected = false, stationNames = [] }) {
  const [switches, setSwitches] = useState(loadSprayPumpSwitches);

  const set = (pumpId, field, value) => setSwitches(prev => {
    const next = { ...prev, [pumpId]: { ...prev[pumpId], [field]: value } };
    saveSprayPumpSwitches(next);
    return next;
  });

  return (
    <Grid min={340}>
      {SPRAY_PUMPS.map(pump => {
        const sw = switches[pump.id];
        const led = tag => ledState(grpcTags, grpcConnected, tag);
        const running = led(pump.tags.outputStatus) === 'on';
        const healthy = led(pump.tags.healthy) === 'on';
        const stationName = stationNames[pump.station - 1];
        return (
          <Card key={pump.id} pad={0}>
            <div style={{
              padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16,
              background: running ? 'linear-gradient(120deg, #E3F4EA, #FFFFFF)' : '#FAFBFC',
              borderBottom: '1px solid #EEF1F3',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, color: '#FFFFFF', background: running ? THEME.ok : '#9AA4AD',
                animation: running ? 'spin 2.4s linear infinite' : 'none',
              }}>✣</div>
              <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT_COND, fontSize: 24, fontWeight: 700, color: THEME.text }}>{pump.label}</div>
                <div style={{ fontSize: 13, color: THEME.textDim }}>Tank {pump.station}{stationName ? ` · ${stationName}` : ''}</div>
              </div>
              <Badge toneName={running ? 'ok' : 'neutral'} dot>{running ? 'Running' : 'Stopped'}</Badge>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: THEME.textMid }}>Control mode</span>
                <Segmented size="sm" value={sw.mode} onChange={v => set(pump.id, 'mode', v)} options={[
                  { value: 'man', label: 'Manual' }, { value: 'auto', label: 'Auto', color: THEME.accent },
                ]} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: THEME.textMid }}>Manual run</span>
                <Toggle checked={sw.manual === 'on'} disabled={sw.mode === 'auto'}
                  onChange={on => set(pump.id, 'manual', on ? 'on' : 'off')}
                  label={sw.mode === 'auto' ? 'PLC controlled' : sw.manual === 'on' ? 'On' : 'Off'} />
              </div>
              <div style={{ height: 1, background: '#EEF1F3' }} />
              {[
                ['Pump healthy', pump.tags.healthy],
                ['Scrubber healthy', pump.tags.scrubberHealthy],
                ['Output feedback', pump.tags.outputStatus],
              ].map(([label, tag]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13.5, color: THEME.text, fontWeight: 600 }}>{label}</span>
                  <SignalPill state={led(tag)} onText="OK" offText={label === 'Output feedback' ? 'OFF' : 'FAULT'} />
                </div>
              ))}
              {!healthy && grpcConnected && <Badge toneName="danger" style={{ alignSelf: 'flex-start' }}>Check pump — health signal lost</Badge>}
            </div>
          </Card>
        );
      })}
    </Grid>
  );
}
