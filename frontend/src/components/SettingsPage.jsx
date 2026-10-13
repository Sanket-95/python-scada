import { useState } from 'react';
import { getSettingsSections, findSettingsPage } from '../config/settingsPages';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, EmptyState, UI, Badge } from '../ui/kit';
import { indexTags, ledStateOf } from '../config/ledState';
import { PREREQUISITE_SECTIONS, checkState } from '../config/prerequisites';
import { SPRAY_PUMPS } from '../config/sprayPumps';
import { dunkingTags } from '../config/dunking';
import { loadTempSetpoints } from '../config/temperatureSetpoints';
import { loadAlarmTimes } from '../config/alarmTimes';
import { loadDripBypass } from '../config/dripTrays';
import { loadProgramValues } from '../config/programSelection';

// "Plant Controls": master/detail. Left = menu of every control page grouped
// by section; right = the open page, or (nothing open) an overview of tiles,
// each with a live one-line summary of its area.

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function summarize(id, ctx) {
  const { grpcTags = {}, grpcConnected = false, stations = [] } = ctx;
  const idx = indexTags(grpcTags);
  switch (id) {
    case 'io-status': {
      const loaded = stations.filter(st => num(grpcTags[`STATION_${st.id}_LOADNUM`]?.value) > 0).length;
      return { value: `${loaded}/${stations.length}`, sub: 'tanks holding a load', toneName: 'info' };
    }
    case 'prerequisite': {
      let ok = 0, total = 0;
      PREREQUISITE_SECTIONS.forEach(s => s.tables.forEach(t => t.columns.forEach(c => t.rows.forEach(r => {
        total++; if (checkState(r, ledStateOf(idx, grpcConnected, t.tagName(r, c))) === 'on') ok++;
      }))));
      return { value: `${ok}/${total}`, sub: 'interlocks healthy', toneName: ok === total ? 'ok' : 'warn' };
    }
    case 'temperature': {
      const sp = loadTempSetpoints();
      let out = 0;
      stations.forEach(st => {
        const t = num(grpcTags[`Tank_${st.id}_Temp`]?.value), b = sp[st.id] || {};
        if (t == null) return;
        if ((b.low !== undefined && b.low !== '' && t < Number(b.low)) || (b.high !== undefined && b.high !== '' && t > Number(b.high))) out++;
      });
      return { value: out, sub: `out of band · ${Object.keys(sp).length} bands set`, toneName: out ? 'danger' : 'ok' };
    }
    case 'alarm-time': {
      const n = Object.values(loadAlarmTimes()).reduce((a, r) => a + Object.keys(r || {}).length, 0);
      return { value: n, sub: 'timeouts configured', toneName: 'neutral' };
    }
    case 'spray-pump': {
      const running = SPRAY_PUMPS.filter(p => ledStateOf(idx, grpcConnected, p.tags.outputStatus) === 'on').length;
      return { value: `${running}/${SPRAY_PUMPS.length}`, sub: 'pumps running', toneName: 'info' };
    }
    case 'drip-tray-bypass': {
      const n = Object.keys(loadDripBypass()).length;
      return { value: n, sub: 'trays bypassed', toneName: n ? 'warn' : 'ok' };
    }
    case 'dunking': {
      const faults = stations.filter(st => ledStateOf(idx, grpcConnected, dunkingTags(st.id).healthy) === 'off').length;
      return { value: faults, sub: 'units reporting a fault', toneName: faults ? 'danger' : 'ok' };
    }
    case 'program-selection': {
      const v = loadProgramValues();
      return { value: v.running ? `R${v.running}` : '—', sub: v.selected ? `next: R${v.selected}` : 'no recipe queued', toneName: 'violet' };
    }
    default:
      return null;
  }
}

function MenuItem({ page, active, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
      padding: '9px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
      background: active ? THEME.accentSoft : hover ? '#F2F5F7' : 'transparent',
      color: active ? THEME.accentDark : THEME.text, fontSize: 14, fontWeight: active ? 700 : 600,
    }}>
      <span style={{ width: 28, textAlign: 'center', fontSize: 15 }}>{page.icon || '•'}</span>
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{page.label}</span>
    </button>
  );
}

function OverviewTile({ page, summary, onOpen }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      textAlign: 'left', cursor: 'pointer', padding: 18, borderRadius: UI.radius,
      background: THEME.panel, border: `1px solid ${hover ? THEME.accent : UI.cardBorder}`,
      boxShadow: hover ? `0 8px 22px ${THEME.accent}22` : UI.shadow, transition: 'box-shadow 0.15s, border-color 0.15s',
      display: 'flex', flexDirection: 'column', gap: 12, minHeight: 150,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: THEME.accentSoft, color: THEME.accentDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{page.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: THEME.text }}>{page.label}</div>
          <div style={{ fontSize: 12.5, color: THEME.textDim }}>{page.desc}</div>
        </div>
      </div>
      {summary && (
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: FONT_COND, fontSize: 30, fontWeight: 700, color: THEME.text, lineHeight: 1 }}>{summary.value}</span>
          <Badge toneName={summary.toneName}>{summary.sub}</Badge>
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, color: THEME.accent }}>Open →</div>
    </button>
  );
}

export default function SettingsPage({ activePageId, onOpenPage, onClosePage, onBack, pageContext = {}, pageSelection = {} }) {
  const sections = getSettingsSections(pageSelection);
  const found = activePageId ? findSettingsPage(activePageId, pageSelection) : null;
  const Content = found?.page.component;

  const menu = (
    <Card pad={10} style={{ position: 'sticky', top: 0 }}>
      <MenuItem page={{ label: 'Overview', icon: '▦' }} active={!found} onClick={onClosePage} />
      {sections.map(section => (
        <div key={section.id}>
          <div style={{ padding: '14px 10px 6px', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: THEME.textDim, textTransform: 'uppercase' }}>{section.title}</div>
          {section.pages.map(p => (
            <MenuItem key={p.id} page={p} active={found?.page.id === p.id} onClick={() => onOpenPage(p.id)} />
          ))}
        </div>
      ))}
    </Card>
  );

  return (
    <Page
      crumbs={found ? ['Plant Controls', found.section.title] : ['Plant Controls']}
      title={found ? (found.page.title || found.page.label) : 'Plant Controls'}
      subtitle={found ? found.page.desc : 'Interlocks, signals and process parameters for the whole line — pick an area on the left.'}
      width={1380}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        {menu}
        <div style={{ minWidth: 0 }}>
          {found ? (
            Content
              ? <Content {...pageContext} page={found.page} section={found.section} onBack={onClosePage} />
              : <Card><EmptyState title={found.page.label} text="This area hasn't been set up yet." /></Card>
          ) : (
            sections.map(section => (
              <div key={section.id} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textMid, marginBottom: 10 }}>{section.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
                  {section.pages.map(p => (
                    <OverviewTile key={p.id} page={p} summary={summarize(p.id, pageContext)} onOpen={() => onOpenPage(p.id)} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Page>
  );
}
