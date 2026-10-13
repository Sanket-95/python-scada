import { useEffect, useRef, useState } from 'react';
import {
  loadPlcConfig, savePlcConfig,
  loadPlcConfigFromServer, savePlcConfigToServer, dataSourceOf,
} from '../config/plcConfig';
import { TAG_DATA_TYPES } from '../config/tagConfig';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, Button, Badge, Input, Select, Field, Tabs, Callout, Mono } from '../ui/kit';

// Connectivity — where live data comes from (built-in simulation or a real
// PLC), the PLC's brand/connection settings, a live connect check against it
// (/api/plc-test-connection), and the "Quick test EXE" builder: a tiny console
// exe that just prints a handful of tags, for checking addresses on site.
// The form is saved on every change (localStorage + backend) — the App
// Builder requires it, and a generated exe ships pre-seeded with it.

const BRANDS = [
  { id: 'siemens',    label: 'Siemens',    proto: 'S7 · ISO-on-TCP',  defaultPort: 102 },
  { id: 'omron',      label: 'Omron',      proto: 'FINS · UDP',       defaultPort: null },
  { id: 'mitsubishi', label: 'Mitsubishi', proto: 'MC protocol (3E)', defaultPort: 5002 },
];
const MITSUBISHI_PLC_TYPES = ['Q', 'L', 'QnA', 'iQ-L', 'iQ-R'];
const MITSUBISHI_COMM_TYPES = ['binary', 'ascii'];
const SOURCES = [
  { id: 'mock', title: 'Simulation', text: 'Built-in mock plant — every screen runs on simulated data, no PLC needed.', icon: '◎', color: '#6B3FA8' },
  { id: 'plc',  title: 'Live PLC',   text: 'Read live values from the PLC configured below.',                          icon: '⚡', color: THEME.ok },
];

let testTagSeq = 0;
const newTestTag = () => ({ key: ++testTagSeq, name: '', address: '', type: 'bool' });
const typeIds = TAG_DATA_TYPES.map(t => t.id);

function OptionCard({ active, color, icon, title, text, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 220, textAlign: 'left', cursor: 'pointer', padding: 16, borderRadius: 14,
      border: `2px solid ${active ? color : '#E1E6EA'}`, background: active ? `${color}0F` : '#FFFFFF',
      display: 'flex', gap: 12, alignItems: 'flex-start', boxShadow: active ? `0 6px 18px ${color}22` : 'none',
    }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#FFFFFF', background: active ? color : '#B5BDC5' }}>{icon}</span>
      <span>
        <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: THEME.text }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: THEME.textMid, marginTop: 3, lineHeight: 1.4 }}>{text}</span>
      </span>
    </button>
  );
}

export default function PlcConnectionTestPage({ onBack, onDataSourceChange }) {
  const [tab, setTab] = useState('connection');
  const [cfg, setCfg] = useState(loadPlcConfig);
  const [result, setResult] = useState(null); // null | 'testing' | { ok, latencyMs } | { ok:false, error }
  const [testTags, setTestTags] = useState(() => [newTestTag()]);
  const [testBuild, setTestBuild] = useState(null); // null | { status, buildId, error, exeName, log }
  const [arrayCfg, setArrayCfg] = useState({ start: '', length: 10, type: 'bool' });
  const [arrayError, setArrayError] = useState('');
  const testPollRef = useRef(null);

  useEffect(() => {
    loadPlcConfigFromServer().then(serverCfg => {
      if (serverCfg) { savePlcConfig(serverCfg); setCfg(serverCfg); }
    });
    return () => clearInterval(testPollRef.current);
  }, []);

  const update = patch => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    savePlcConfig(next);
    savePlcConfigToServer(next);
  };
  const selectBrand = brand => {
    const meta = BRANDS.find(b => b.id === brand);
    update({ brand, port: meta.defaultPort ?? cfg.port });
  };

  const testConnection = async () => {
    setResult('testing');
    try {
      const res = await fetch('/api/plc-test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setResult({ ok: false, error: data?.detail || `Backend returned ${res.status}` }); return; }
      setResult(data);
    } catch {
      setResult({ ok: false, error: 'Could not reach the backend — is it running on port 50054?' });
    }
  };

  const brandMeta = BRANDS.find(b => b.id === cfg.brand) || BRANDS[0];
  const hasPort = brandMeta.defaultPort !== null;
  const canTest = (cfg.ip || '').trim().length > 0 && result !== 'testing';
  const source = dataSourceOf(cfg);

  const updateTestTag = (key, patch) => setTestTags(rows => rows.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const removeTestTag = key => setTestTags(rows => rows.filter(r => r.key !== key));

  const addTagArray = () => {
    const m = arrayCfg.start.trim().match(/^([A-Za-z]+)(\d+)$/);
    const length = +arrayCfg.length;
    if (!m) { setArrayError('Start address must be letters followed by a number, e.g. D701'); return; }
    if (!Number.isInteger(length) || length < 1 || length > 500) { setArrayError('Array length must be a whole number from 1 to 500'); return; }
    setArrayError('');
    const [, prefix, digits] = m;
    const base = parseInt(digits, 10);
    const rows = Array.from({ length }, (_, i) => {
      const address = `${prefix}${String(base + i).padStart(digits.length, '0')}`;
      return { key: ++testTagSeq, name: address, address, type: arrayCfg.type };
    });
    setTestTags(prev => [...prev.filter(r => r.name.trim() || r.address.trim()), ...rows]);
  };

  const validTestTags = testTags.filter(r => r.name.trim() && r.address.trim());
  const canBuildTestExe = (cfg.ip || '').trim().length > 0 && validTestTags.length > 0 && testBuild?.status !== 'building';

  const generateTestExe = async () => {
    if (!canBuildTestExe) return;
    clearInterval(testPollRef.current);
    setTestBuild({ status: 'building' });
    let res;
    try {
      res = await fetch('/api/build-plc-test-exe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plcConfig: cfg, tags: validTestTags.map(({ name, address, type }) => ({ name, address, type })) }),
      });
    } catch { res = null; }
    const data = await (res ? res.json().catch(() => null) : null);
    if (!res || !res.ok || !data?.buildId) { setTestBuild({ status: 'error', error: data?.detail || 'Could not reach the backend' }); return; }
    const { buildId } = data;
    setTestBuild({ status: 'building', buildId });
    testPollRef.current = setInterval(async () => {
      let s;
      try { const r = await fetch(`/api/build-plc-test-exe/${buildId}/status`); s = r.ok ? await r.json() : null; } catch { s = null; }
      if (!s) return;
      setTestBuild({ ...s, buildId });
      if (s.status === 'done' || s.status === 'error') clearInterval(testPollRef.current);
    }, 2000);
  };

  const statusPanel = (() => {
    if (result === 'testing') return { tone: THEME.accent, bg: THEME.accentSoft, icon: '⟳', title: 'Connecting…', text: `Trying ${cfg.ip}` };
    if (result?.ok) return { tone: THEME.ok, bg: '#E3F4EA', icon: '✓', title: 'PLC answered', text: `Round trip ${result.latencyMs} ms` };
    if (result) return { tone: THEME.danger, bg: '#FBE7E6', icon: '✕', title: 'Connection failed', text: result.error };
    return { tone: THEME.textDim, bg: '#F4F6F8', icon: '?', title: 'Not tested yet', text: 'Fill in the address and run a check.' };
  })();

  return (
    <Page onBack={onBack} crumbs={['Diagnostics']} title="Connectivity"
      subtitle="Choose where live data comes from, set up the PLC link and check it answers."
      actions={<Badge toneName={source === 'mock' ? 'violet' : 'ok'} dot>{source === 'mock' ? 'Running on simulation' : 'Reading live PLC'}</Badge>}
      tabs={<Tabs value={tab} onChange={setTab} tabs={[{ value: 'connection', label: 'Connection' }, { value: 'exe', label: 'Quick test EXE', count: validTestTags.length || null }]} />}>
      {tab === 'connection' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title="Data source" icon="⇄">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {SOURCES.map(s => (
                  <OptionCard key={s.id} active={source === s.id} color={s.color} icon={s.icon} title={s.title} text={s.text}
                    onClick={() => { update({ dataSource: s.id }); onDataSourceChange?.(s.id); }} />
                ))}
              </div>
            </Card>
            <Card title="PLC" subtitle="Brand and network address" icon="▣">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                {BRANDS.map(b => {
                  const active = b.id === cfg.brand;
                  return (
                    <button key={b.id} onClick={() => selectBrand(b.id)} style={{
                      flex: 1, minWidth: 150, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      border: `2px solid ${active ? THEME.accent : '#E1E6EA'}`, background: active ? THEME.accentSoft : '#FFFFFF',
                    }}>
                      <div style={{ fontFamily: FONT_COND, fontSize: 20, fontWeight: 700, color: active ? THEME.accentDark : THEME.text }}>{b.label}</div>
                      <div style={{ fontSize: 12, color: THEME.textDim }}>{b.proto}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
                <Field label="IP address"><Input mono value={cfg.ip} placeholder="e.g. 192.168.3.1" onChange={e => update({ ip: e.target.value })} /></Field>
                {hasPort
                  ? <Field label="Port"><Input mono type="number" value={cfg.port} placeholder={String(brandMeta.defaultPort)} onChange={e => update({ port: e.target.value === '' ? '' : +e.target.value })} /></Field>
                  : <Field label="Port" hint="FINS uses a fixed UDP port"><Input mono value="9600" disabled /></Field>}
                {cfg.brand === 'siemens' && (<>
                  <Field label="Rack"><Input mono type="number" value={cfg.rack} onChange={e => update({ rack: e.target.value === '' ? '' : +e.target.value })} /></Field>
                  <Field label="Slot"><Input mono type="number" value={cfg.slot} onChange={e => update({ slot: e.target.value === '' ? '' : +e.target.value })} /></Field>
                </>)}
                {cfg.brand === 'omron' && (<>
                  <Field label="Destination node"><Input mono value={cfg.destNode} placeholder="0.0.0" onChange={e => update({ destNode: e.target.value })} /></Field>
                  <Field label="Source node"><Input mono value={cfg.srcNode} placeholder="0.127.0" onChange={e => update({ srcNode: e.target.value })} /></Field>
                  <Field label="Timeout (s)"><Input mono type="number" value={cfg.timeout} onChange={e => update({ timeout: e.target.value === '' ? '' : +e.target.value })} /></Field>
                </>)}
                {cfg.brand === 'mitsubishi' && (<>
                  <Field label="PLC series"><Select value={cfg.plcType} options={MITSUBISHI_PLC_TYPES} onChange={e => update({ plcType: e.target.value })} /></Field>
                  <Field label="Frame encoding"><Select value={cfg.commType} options={MITSUBISHI_COMM_TYPES} onChange={e => update({ commType: e.target.value })} /></Field>
                </>)}
              </div>
            </Card>
          </div>
          <Card title="Connection check" icon="⚡" style={{ position: 'sticky', top: 0 }}>
            <div style={{ borderRadius: 14, padding: 18, background: statusPanel.bg, textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: '#FFFFFF', background: statusPanel.tone }}>{statusPanel.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: THEME.text }}>{statusPanel.title}</div>
              <div style={{ fontSize: 13, color: THEME.textMid, marginTop: 4, wordBreak: 'break-word' }}>{statusPanel.text}</div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: THEME.textMid }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Target</span><Mono>{cfg.ip || '—'}{hasPort && cfg.port ? `:${cfg.port}` : ''}</Mono></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Protocol</span><span style={{ fontWeight: 600 }}>{brandMeta.proto}</span></div>
            </div>
            <Button variant="primary" size="lg" icon="⚡" disabled={!canTest} onClick={testConnection} style={{ width: '100%', marginTop: 16 }}>
              {result === 'testing' ? 'Connecting…' : 'Test connection'}
            </Button>
          </Card>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Callout title="What this builds">
            A tiny standalone console exe that connects with the settings on the Connection tab and prints these tags'
            live values forever — the fastest way to confirm wiring and addresses on site before building the full app.
          </Callout>
          <Card title="Add a block of addresses" icon="⇣" pad={16}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Start address" style={{ width: 170 }}><Input mono value={arrayCfg.start} placeholder="e.g. D701" onChange={e => setArrayCfg(c => ({ ...c, start: e.target.value }))} /></Field>
              <Field label="Count" style={{ width: 100 }}><Input mono type="number" value={arrayCfg.length} onChange={e => setArrayCfg(c => ({ ...c, length: e.target.value }))} /></Field>
              <Field label="Data type" style={{ width: 160 }}><Select value={arrayCfg.type} options={typeIds} onChange={e => setArrayCfg(c => ({ ...c, type: e.target.value }))} /></Field>
              <Button onClick={addTagArray} icon="+">Add block</Button>
            </div>
            <div style={{ fontSize: 12.5, color: arrayError ? THEME.danger : THEME.textDim, marginTop: 8, fontWeight: arrayError ? 600 : 400 }}>
              {arrayError || 'Start D701, count 20 → D701…D720, each named after its address (rename any row below).'}
            </div>
          </Card>
          <Card title="Tags to read" subtitle={`${validTestTags.length} ready`} icon="☰" pad={0}
            actions={<Button size="sm" icon="+" onClick={() => setTestTags(rows => [...rows, newTestTag()])}>Add tag</Button>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,1fr) 160px 180px 40px', gap: 10, padding: '10px 18px', background: '#F4F6F8', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: THEME.textDim }}>
              <span>TAG NAME</span><span>ADDRESS</span><span>DATA TYPE</span><span />
            </div>
            <div style={{ maxHeight: 'calc(100vh - 560px)', minHeight: 140, overflowY: 'auto' }}>
              {testTags.map(row => (
                <div key={row.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,1fr) 160px 180px 40px', gap: 10, alignItems: 'center', padding: '7px 18px', borderTop: '1px solid #EEF1F3' }}>
                  <Input mono value={row.name} placeholder="Tag name" onChange={e => updateTestTag(row.key, { name: e.target.value })} style={{ height: 34 }} />
                  <Input mono value={row.address} placeholder="e.g. D701" onChange={e => updateTestTag(row.key, { address: e.target.value })} style={{ height: 34 }} />
                  <Select value={row.type} options={typeIds} onChange={e => updateTestTag(row.key, { type: e.target.value })} style={{ height: 34, fontSize: 13 }} />
                  <button title="Remove" onClick={() => removeTestTag(row.key)} style={{ height: 34, border: 'none', borderRadius: 8, background: '#FBE7E6', color: THEME.danger, cursor: 'pointer', fontWeight: 800 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderTop: '1px solid #EEF1F3', flexWrap: 'wrap' }}>
              {testBuild?.status === 'building' && <Badge toneName="info" dot>Building…</Badge>}
              {testBuild?.status === 'error' && <Badge toneName="danger">Build failed{testBuild.error ? `: ${testBuild.error}` : ''}</Badge>}
              {testBuild?.status === 'done' && (
                <a href={`/api/build-plc-test-exe/${testBuild.buildId}/download`} download={testBuild.exeName} style={{ textDecoration: 'none' }}>
                  <Button variant="dark" icon="⬇">Download {testBuild.exeName}</Button>
                </a>
              )}
              <div style={{ flex: 1 }} />
              {!(cfg.ip || '').trim() && <span style={{ fontSize: 12.5, color: THEME.textDim }}>Set the PLC IP on the Connection tab first</span>}
              <Button variant="primary" icon="⚙" disabled={!canBuildTestExe} onClick={generateTestExe}>
                {testBuild?.status === 'building' ? 'Building…' : 'Build test EXE'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}
