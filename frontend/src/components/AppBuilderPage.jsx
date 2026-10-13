import { useEffect, useRef, useState } from 'react';
import { PAGE_CATALOG, ALL_PAGE_IDS } from '../config/pageCatalog';
import {
  loadPageSelection, savePageSelection,
  loadPageSelectionFromServer, savePageSelectionToServer,
  isPageEnabled, pruneToCatalog,
} from '../config/pageSelection';
import { loadPlcConfigFromServer, hasPlcConfig } from '../config/plcConfig';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, Button, Badge, Input, Field, Toggle, Grid } from '../ui/kit';

// Package Builder (App Builder) — pick which screens a customer's build ships
// with, then generate a standalone exe (frontend + backend bundled by
// PyInstaller on the backend). The selection is saved as it changes and is the
// same one that filters the sidebar inside the generated exe.

function Step({ n, title, done, children }) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{
          width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 14, color: '#FFFFFF', background: done ? THEME.ok : THEME.accent, flexShrink: 0,
        }}>{done ? '✓' : n}</span>
        <span style={{ flex: 1, width: 2, background: '#DCE2E7', marginTop: 6 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text, margin: '5px 0 12px' }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

export default function AppBuilderPage({ onNavigateToPlcTest }) {
  const [selection, setSelection] = useState(() => pruneToCatalog(loadPageSelection()));
  const [clientName, setClientName] = useState('');
  const [build, setBuild] = useState(null); // null | { status, buildId, error, exeName, log }
  const [plcCfg, setPlcCfg] = useState(null); // null while loading
  const pollRef = useRef(null);

  useEffect(() => {
    loadPageSelectionFromServer().then(serverSel => {
      if (serverSel) {
        const pruned = pruneToCatalog(serverSel);
        savePageSelection(pruned);
        setSelection(pruned);
      }
    });
    loadPlcConfigFromServer().then(cfg => setPlcCfg(cfg || {}));
    return () => clearInterval(pollRef.current);
  }, []);

  const plcReady = hasPlcConfig(plcCfg);
  const persist = next => { setSelection(next); savePageSelection(next); savePageSelectionToServer(next); };
  const setMany = (ids, enabled) => persist({ ...selection, ...Object.fromEntries(ids.map(id => [id, enabled])) });
  const enabledCount = ALL_PAGE_IDS.filter(id => isPageEnabled(selection, id)).length;

  const generate = async () => {
    if (!plcReady) return;
    clearInterval(pollRef.current);
    setBuild({ status: 'building' });
    let res;
    try {
      res = await fetch('/api/generate-app-exe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientName, selection }),
      });
    } catch { res = null; }
    const result = res && res.ok ? await res.json().catch(() => null) : null;
    if (!result?.buildId) { setBuild({ status: 'error', error: 'Could not reach the backend — is it running on port 50054?' }); return; }
    const { buildId } = result;
    setBuild({ status: 'building', buildId });
    pollRef.current = setInterval(async () => {
      let s;
      try { const r = await fetch(`/api/generate-app-exe/${buildId}/status`); s = r.ok ? await r.json() : null; } catch { s = null; }
      if (!s) return;
      setBuild({ ...s, buildId });
      if (s.status === 'done' || s.status === 'error') clearInterval(pollRef.current);
    }, 3000);
  };

  return (
    <Page crumbs={['Deploy']} title="Package Builder"
      subtitle="Build a standalone application for a customer site, with only the screens they need."
      actions={<Badge toneName="info">{enabledCount}/{ALL_PAGE_IDS.length} screens selected</Badge>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 20, alignItems: 'start' }}>
        <div>
          <Step n={1} title="PLC connection saved" done={plcReady}>
            {plcCfg === null ? <Badge>Checking…</Badge> : plcReady ? (
              <Badge toneName="ok" dot>{plcCfg.brand} · {plcCfg.ip}{plcCfg.port ? `:${plcCfg.port}` : ''}</Badge>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Badge toneName="danger">No PLC configured — the package needs one</Badge>
                {onNavigateToPlcTest && <Button size="sm" onClick={onNavigateToPlcTest}>Open Connectivity →</Button>}
              </div>
            )}
          </Step>
          <Step n={2} title="Choose screens" done={enabledCount > 0}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Button size="sm" onClick={() => setMany(ALL_PAGE_IDS, true)}>Select all</Button>
              <Button size="sm" onClick={() => setMany(ALL_PAGE_IDS, false)}>Select none</Button>
            </div>
            <Grid min={300} gap={14}>
              {PAGE_CATALOG.map(group => {
                const ids = group.pages.map(p => p.id);
                const on = ids.filter(id => isPageEnabled(selection, id)).length;
                return (
                  <Card key={group.group} pad={14}
                    title={<span style={{ fontSize: 14 }}>{group.group.charAt(0) + group.group.slice(1).toLowerCase()}</span>}
                    actions={<Toggle size="sm" checked={on === ids.length} onChange={v => setMany(ids, v)} />}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {group.pages.map(p => (
                        <Toggle key={p.id} size="sm" checked={isPageEnabled(selection, p.id)} label={p.label}
                          onChange={v => setMany([p.id], v)} />
                      ))}
                    </div>
                  </Card>
                );
              })}
            </Grid>
          </Step>
          <Step n={3} title="Build" done={build?.status === 'done'}>
            <div style={{ fontSize: 13.5, color: THEME.textMid }}>Use the panel on the right — the build runs on this machine and takes a few minutes.</div>
          </Step>
        </div>

        <Card title="Build package" icon="⧉" style={{ position: 'sticky', top: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Customer / site name" hint="Used in the exe file name">
              <Input value={clientName} placeholder="e.g. Pune Plant 2" onChange={e => setClientName(e.target.value)} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'center' }}>
              <div style={{ padding: 10, borderRadius: 12, background: '#F4F6F8' }}>
                <div style={{ fontFamily: FONT_COND, fontSize: 26, fontWeight: 700, color: THEME.text }}>{enabledCount}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.textDim }}>SCREENS</div>
              </div>
              <div style={{ padding: 10, borderRadius: 12, background: plcReady ? '#E3F4EA' : '#FBE7E6' }}>
                <div style={{ fontFamily: FONT_COND, fontSize: 26, fontWeight: 700, color: plcReady ? THEME.ok : THEME.danger }}>{plcReady ? 'OK' : '—'}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.textDim }}>PLC</div>
              </div>
            </div>
            <Button variant="primary" size="lg" icon="⚙" disabled={!plcReady || build?.status === 'building'} onClick={generate}>
              {build?.status === 'building' ? 'Building…' : 'Generate exe'}
            </Button>
            {build?.status === 'error' && <Badge toneName="danger" style={{ whiteSpace: 'normal', height: 'auto', padding: '6px 10px' }}>{build.error || 'Build failed'}</Badge>}
            {build?.status === 'done' && (
              <a href={`/api/generate-app-exe/${build.buildId}/download`} download={build.exeName} style={{ textDecoration: 'none' }}>
                <Button variant="dark" icon="⬇" style={{ width: '100%' }}>Download {build.exeName}</Button>
              </a>
            )}
            {build?.log && (
              <pre style={{ margin: 0, maxHeight: 220, overflow: 'auto', padding: 12, borderRadius: 10, background: THEME.frame, color: '#C9D1D9', fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{build.log}</pre>
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}
