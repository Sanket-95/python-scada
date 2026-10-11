import { memo, useCallback, useMemo, useState } from 'react';
import RotarySwitch from './RotarySwitch';
import StatusLed from './StatusLed';
import { indexTags, ledStateOf } from '../config/ledState';
import {
  dunkingTags, DEFAULT_DUNKING_SWITCH, loadDunkingSwitches, saveDunkingSwitches,
} from '../config/dunking';

const T = {
  panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4', border: '#C4C8D4',
  accent: '#1565C0', textWh: '#1A2035',
};

const COLS = 'minmax(180px, 1fr) 104px 104px repeat(3, 84px)';
const HEADERS = ['DUNKING', 'MAN / AUTO', 'MANUAL OFF / ON', 'HOME PROXY', 'OUTPUT', 'HEALTHY'];

// One row per station. Memoised on plain values only — the app re-renders on
// every simulation tick and there are 60+ rows, each with two SVG switches, so
// a row must repaint only when its own switch or LED actually changes.
const Row = memo(function Row({ id, no, name, mode, manual, home, output, healthy, onFlip }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
      padding: '4px 16px', borderBottom: `1px solid ${T.border}55`,
      background: no % 2 ? T.panelBg : T.cardBg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{
          flexShrink: 0, minWidth: 26, textAlign: 'center', fontSize: 10.5, fontWeight: 800,
          color: T.accent, background: '#E3F2FD', borderRadius: 4, padding: '2px 6px',
        }}>{no}</span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: T.textWh,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={name}>{name}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <RotarySwitch
          label={`${name} Man/Auto`} leftLabel="MAN" rightLabel="AUTO"
          isRight={mode === 'auto'} onToggle={() => onFlip(id, 'mode')}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <RotarySwitch
          label={`${name} Manual Off/On`} leftLabel="OFF" rightLabel="ON"
          isRight={manual === 'on'} onToggle={() => onFlip(id, 'manual')}
        />
      </div>
      <StatusLed label={`${name} Home Proxy`} state={home} />
      <StatusLed label={`${name} Output`} state={output} />
      <StatusLed label={`${name} Healthy`} state={healthy} />
    </div>
  );
});

// stations / stationNames / grpcTags / grpcConnected come from the app shell
// through SettingsPage's pageContext. Rows are the same configured station list
// the Temperature page uses; the switches are local for now (saved the moment
// they're turned) and the LEDs only ever show live tag values.
export default function DunkingPage({ stations = [], stationNames = [], grpcTags = {}, grpcConnected = false }) {
  const [switches, setSwitches] = useState(loadDunkingSwitches);

  const flip = useCallback((id, field) => setSwitches(prev => {
    const cur = { ...DEFAULT_DUNKING_SWITCH, ...prev[id] };
    if (field === 'mode') cur.mode = cur.mode === 'auto' ? 'man' : 'auto';
    else cur.manual = cur.manual === 'on' ? 'off' : 'on';

    const next = { ...prev };
    if (cur.mode === DEFAULT_DUNKING_SWITCH.mode && cur.manual === DEFAULT_DUNKING_SWITCH.manual) delete next[id];
    else next[id] = cur;
    saveDunkingSwitches(next);
    return next;
  }), []);

  const tagIndex = useMemo(() => indexTags(grpcTags), [grpcTags]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', overflowX: 'auto' }}>
      <div style={{ minWidth: 720, background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 16px',
          background: T.cardHdr, borderBottom: `2px solid ${T.accent}`,
          fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.accent,
        }}>
          {HEADERS.map((h, i) => <div key={h} style={{ textAlign: i === 0 ? 'left' : 'center' }}>{h}</div>)}
        </div>
        <div style={{ maxHeight: 'calc(100vh - 270px)', minHeight: 220, overflowY: 'auto' }}>
          {stations.map((st, i) => {
            const sw = switches[st.id] || DEFAULT_DUNKING_SWITCH;
            const tags = dunkingTags(st.id);
            return (
              <Row
                key={st.id} id={st.id} no={i + 1}
                name={stationNames[i] || `Station ${i + 1}`}
                mode={sw.mode} manual={sw.manual}
                home={ledStateOf(tagIndex, grpcConnected, tags.homeProxy)}
                output={ledStateOf(tagIndex, grpcConnected, tags.output)}
                healthy={ledStateOf(tagIndex, grpcConnected, tags.healthy)}
                onFlip={flip}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
