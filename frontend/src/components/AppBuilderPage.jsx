import { useEffect, useRef, useState } from 'react';
import { PAGE_CATALOG, ALL_PAGE_IDS } from '../config/pageCatalog';
import {
  loadPageSelection, savePageSelection,
  loadPageSelectionFromServer, savePageSelectionToServer,
  isPageEnabled, pruneToCatalog,
} from '../config/pageSelection';
import { loadPlcConfigFromServer, hasPlcConfig } from '../config/plcConfig';

const T = {
  pageBg: '#F0F2F6', panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4',
  border: '#C4C8D4', accent: '#1565C0', ok: '#2E7D32', warn: '#E65100', danger: '#C62828',
  textWh: '#1A2035', textLt: '#3A4F6A', textDim: '#8090A8',
};
const FONT = "'Segoe UI', system-ui, monospace";

// This selection only controls what a generated exe ships with — it does
// not affect this running app, which always shows every page regardless of
// what's checked here. Generating also requires a saved PLC connection (see
// the PLC Connection Test screen) — the backend refuses the build without
// one too (belt and suspenders), and it's what gets seeded into the exe so
// it starts already pointed at that PLC.
export default function AppBuilderPage({ onNavigateToPlcTest }) {
  const [selection, setSelection] = useState(() => pruneToCatalog(loadPageSelection()));
  const [clientName, setClientName] = useState('');
  const [build, setBuild] = useState(null); // null | { status, buildId, error, exeName, log }
  const [plcCfg, setPlcCfg] = useState(null); // null while loading
  const [masterMsg, setMasterMsg] = useState(null); // null | { ok, text }
  const pollRef = useRef(null);
  const importInputRef = useRef(null);

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const plcReady = hasPlcConfig(plcCfg);

  const persist = next => {
    setSelection(next);
    savePageSelection(next);
    savePageSelectionToServer(next);
  };

  const toggle = id => persist({ ...selection, [id]: !isPageEnabled(selection, id) });
  const setAll = enabled => persist(Object.fromEntries(ALL_PAGE_IDS.map(id => [id, enabled])));

  const enabledCount = ALL_PAGE_IDS.filter(id => isPageEnabled(selection, id)).length;

  const generate = async () => {
    if (!plcReady) return; // the button is disabled in this case, but guard anyway
    clearInterval(pollRef.current);
    setBuild({ status: 'building' });
    let res;
    try {
      res = await fetch('/api/generate-app-exe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, selection }),
      });
    } catch {
      res = null;
    }
    const result = res && res.ok ? await res.json().catch(() => null) : null;
    if (!result?.buildId) {
      setBuild({ status: 'error', error: 'Could not reach the backend — is it running on port 50054?' });
      return;
    }
    const { buildId } = result;
    setBuild({ status: 'building', buildId });
    pollRef.current = setInterval(async () => {
      let s;
      try {
        const r = await fetch(`/api/generate-app-exe/${buildId}/status`);
        s = r.ok ? await r.json() : null;
      } catch {
        s = null;
      }
      if (!s) return;
      setBuild({ ...s, buildId });
      if (s.status === 'done' || s.status === 'error') clearInterval(pollRef.current);
    }, 3000);
  };

  // ── Master config backup — exports/imports EVERY saved config file in one
  // JSON (see main.py's /api/master-config/export|import — the same 5 files
  // exe_builder.py seeds into an exe), so a whole project's setup (lines/
  // tanks/wagons/every tag, PLC/DB connection, branding, page selection)
  // survives even if the only thing kept from an old project was its exe.
  const exportMasterConfig = async () => {
    setMasterMsg(null);
    try {
      const res = await fetch('/api/master-config/export');
      if (!res.ok) throw new Error('export failed');
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const safeName = (clientName || 'project').trim().replace(/[^a-z0-9_-]+/gi, '_') || 'project';
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}-master-config-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMasterMsg({ ok: true, text: 'Exported.' });
    } catch {
      setMasterMsg({ ok: false, text: 'Export failed — is the backend running?' });
    }
  };

  const importMasterConfig = async file => {
    setMasterMsg(null);
    let bundle;
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      setMasterMsg({ ok: false, text: 'That file is not valid JSON.' });
      return;
    }
    if (!bundle || typeof bundle.files !== 'object') {
      setMasterMsg({ ok: false, text: 'That file is not a master config export (missing "files").' });
      return;
    }
    if (!window.confirm('This replaces the CURRENT project\'s saved configuration (lines/tanks/wagons, tags, PLC/DB connection, branding, page selection) with the imported file. Continue?')) {
      return;
    }
    try {
      const res = await fetch('/api/master-config/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
      });
      if (!res.ok) throw new Error('import failed');
      setMasterMsg({ ok: true, text: 'Imported — reloading…' });
      setTimeout(() => window.location.reload(), 700);
    } catch {
      setMasterMsg({ ok: false, text: 'Import failed — is the backend running?' });
    }
  };

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'hidden', background: T.pageBg,
      display: 'flex', flexDirection: 'column', fontFamily: FONT,
    }}>
      <div style={{
        background: T.cardHdr, borderBottom: `3px solid ${T.accent}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <div style={{
          background: T.accent, color: '#FFFFFF', fontWeight: 900,
          fontSize: 18, padding: '6px 12px', borderRadius: 4, letterSpacing: 1,
        }}>⧉</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: T.accent, letterSpacing: 3, fontWeight: 600 }}>APP BUILDER</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textWh, marginTop: 2 }}>
            Choose pages, then generate a standalone exe
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div style={{
            background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20,
            display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ minWidth: 220, maxWidth: 480 }}>
              <div style={{ fontSize: 10.5, color: T.textDim, letterSpacing: 0.5, marginBottom: 4 }}>PROJECT CONFIG BACKUP</div>
              <div style={{ fontSize: 12, color: T.textLt }}>
                Export every saved setting for this project — lines/tanks/wagons, every tag address,
                PLC &amp; DB connection, branding, page selection — into one file. Import it later (on
                this machine or a different one) to bring a project's full setup back for editing,
                even if the only thing you kept was its exe.
              </div>
              {masterMsg && (
                <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 6, color: masterMsg.ok ? T.ok : T.danger }}>
                  {masterMsg.ok ? '✔' : '✖'} {masterMsg.text}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={exportMasterConfig} style={ghostBtn()}>⬇ Export Master Config</button>
              <button onClick={() => importInputRef.current?.click()} style={ghostBtn()}>⬆ Import Master Config</button>
              <input
                ref={importInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = ''; // so picking the same file again still fires onChange
                  if (file) importMasterConfig(file);
                }}
              />
            </div>
          </div>

          <div style={{
            background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20,
            display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
              <label style={{ fontSize: 10.5, color: T.textDim, letterSpacing: 0.5 }}>CLIENT / BUILD NAME</label>
              <input
                value={clientName} onChange={e => setClientName(e.target.value)}
                placeholder="e.g. Acme Corp" style={{
                  boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, fontWeight: 600,
                  fontFamily: 'inherit', outline: 'none', borderRadius: 6,
                  background: '#FFFFFF', color: T.textWh, border: `1.5px solid ${T.border}`,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAll(true)} style={ghostBtn()}>Select all</button>
              <button onClick={() => setAll(false)} style={ghostBtn()}>Select none</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            {PAGE_CATALOG.map(group => (
              <div key={group.group} style={{
                flex: '1 1 260px', minWidth: 240, maxWidth: 320,
                background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10,
                padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 1.2, marginBottom: 4 }}>
                  {group.group}
                </div>
                {group.pages.map(page => (
                  <label key={page.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '5px 6px',
                    borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: T.textWh,
                  }}>
                    <input
                      type="checkbox" checked={isPageEnabled(selection, page.id)}
                      onChange={() => toggle(page.id)}
                      style={{ width: 15, height: 15, accentColor: T.accent, cursor: 'pointer', flexShrink: 0 }}
                    />
                    {page.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {plcCfg !== null && !plcReady && (
        <div style={{
          background: '#FFF3E0', borderTop: `2px solid ${T.warn}`,
          padding: '12px 28px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12.5, color: T.warn, fontWeight: 700 }}>
            ⚠ No PLC connection info saved yet — fill in the PLC Connection Test form before generating an exe.
          </span>
          {onNavigateToPlcTest && (
            <button onClick={onNavigateToPlcTest} style={{
              padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: T.warn, border: 'none', color: '#FFFFFF', borderRadius: 6,
            }}>Go to PLC Connection Test →</button>
          )}
        </div>
      )}

      <div style={{
        background: T.panelBg, borderTop: `2px solid ${T.border}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
      }}>
        <span style={{ fontSize: 12, color: T.textDim, marginRight: 'auto' }}>
          {enabledCount} / {ALL_PAGE_IDS.length} pages selected
        </span>
        <BuildStatus build={build} />
        <button onClick={generate} disabled={!plcReady || build?.status === 'building'} style={{
          padding: '10px 32px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', borderRadius: 6,
          border: 'none', color: '#FFFFFF',
          background: (!plcReady || build?.status === 'building') ? T.textDim : T.accent,
          cursor: (!plcReady || build?.status === 'building') ? 'default' : 'pointer',
          boxShadow: (!plcReady || build?.status === 'building') ? 'none' : `0 0 18px ${T.accent}55`,
        }}>
          {build?.status === 'building' ? '⏳ Building… (can take a few minutes)' : '⚡ Generate EXE'}
        </button>
      </div>
    </div>
  );
}

function ghostBtn() {
  return {
    padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    background: T.cardBg, border: `1.5px solid ${T.border}`, color: T.textLt, borderRadius: 6,
  };
}

function BuildStatus({ build }) {
  if (!build) return null;
  if (build.status === 'building') {
    return <span style={{ fontSize: 12, color: T.textLt }}>Building frontend + backend into one exe…</span>;
  }
  if (build.status === 'error') {
    return (
      <span style={{ fontSize: 12, color: T.danger, fontWeight: 600, maxWidth: 420 }}>
        ✖ Build failed{build.error ? `: ${build.error}` : ''}
      </span>
    );
  }
  if (build.status === 'done') {
    return (
      <>
        <span style={{ fontSize: 12, color: T.ok, fontWeight: 700 }}>✔ EXE ready</span>
        <a
          href={`/api/generate-app-exe/${build.buildId}/download`} download={build.exeName}
          style={{
            padding: '9px 20px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
            background: T.ok, color: '#FFFFFF', borderRadius: 6, boxShadow: `0 0 14px ${T.ok}55`,
          }}
        >⬇ Download {build.exeName}</a>
      </>
    );
  }
  return null;
}
