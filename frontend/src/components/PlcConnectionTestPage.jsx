import { useEffect, useRef, useState } from 'react';
import {
  loadPlcConfig, savePlcConfig,
  loadPlcConfigFromServer, savePlcConfigToServer,
} from '../config/plcConfig';
import { TAG_DATA_TYPES } from '../config/tagConfig';

// Live PLC reachability test — select a brand, fill in its connection
// fields, hit Test Connection, and the backend opens a real connection to
// that PLC right now (see /api/plc-test-connection in backend-fastapi) and
// reports whether it actually answered.
//
// The form itself IS saved (via config/plcConfig.js, same dual localStorage
// + backend pattern as the rest of this app's config) — the App Builder
// screen requires this to be filled in before it will generate an exe, and
// a generated exe ships pre-seeded with whatever is saved here.

const T = {
  pageBg: '#F0F2F6', panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4',
  border: '#C4C8D4', accent: '#1565C0', ok: '#2E7D32', warn: '#E65100', danger: '#C62828',
  textWh: '#1A2035', textLt: '#3A4F6A', textDim: '#8090A8',
};
const FONT = "'Segoe UI', system-ui, monospace";

const BRANDS = [
  { id: 'siemens',    label: 'SIEMENS',    tag: 'S7',   protocol: 'S7 · ISO-on-TCP',        color: '#1565C0', defaultPort: 102 },
  { id: 'omron',      label: 'OMRON',      tag: 'FINS', protocol: 'FINS · UDP (port fixed)', color: '#2E7D32', defaultPort: null },
  { id: 'mitsubishi', label: 'MITSUBISHI', tag: 'MC',   protocol: 'MC protocol (3E) · TCP',  color: '#E65100', defaultPort: 5002 },
];

const MITSUBISHI_PLC_TYPES = ['Q', 'L', 'QnA', 'iQ-L', 'iQ-R'];
const MITSUBISHI_COMM_TYPES = ['binary', 'ascii'];

function Field({ label, note, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5, letterSpacing: 0.5 }}>{label}</div>
      {children}
      {note && <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

function textInput(extra = {}) {
  return {
    width: '100%', boxSizing: 'border-box',
    background: '#FFFFFF', color: T.textWh,
    border: `1.5px solid ${T.border}`, borderRadius: 6,
    padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
    ...extra,
  };
}

function TextField({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value)}
      placeholder={placeholder}
      style={textInput()}
      onFocus={e => e.target.style.borderColor = T.accent}
      onBlur={e => e.target.style.borderColor = T.border}
    />
  );
}

function SelectField({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...textInput(), cursor: 'pointer' }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function BrandPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {BRANDS.map(b => {
        const active = value === b.id;
        return (
          <button key={b.id} onClick={() => onChange(b.id)} style={{
            flex: 1, padding: '16px 10px', cursor: 'pointer',
            border: `2px solid ${active ? b.color : T.border}`,
            background: active ? `${b.color}18` : T.cardBg,
            color: active ? b.color : T.textDim,
            borderRadius: 8, fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            boxShadow: active ? `0 0 14px ${b.color}44` : 'none',
            transition: 'all 0.14s',
          }}>
            <span style={{
              fontSize: 13, fontWeight: 800, letterSpacing: 1,
              background: active ? b.color : T.border, color: active ? '#fff' : T.textWh,
              padding: '3px 10px', borderRadius: 4,
            }}>{b.tag}</span>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>{b.label}</span>
            <span style={{ fontSize: 10, color: active ? b.color : T.textDim }}>{b.protocol}</span>
          </button>
        );
      })}
    </div>
  );
}

function BrandExtraFields({ cfg, update }) {
  if (cfg.brand === 'siemens') {
    return (
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 140 }}>
          <Field label="RACK">
            <TextField type="number" value={cfg.rack} onChange={v => update({ rack: v })} placeholder="0" />
          </Field>
        </div>
        <div style={{ width: 140 }}>
          <Field label="SLOT">
            <TextField type="number" value={cfg.slot} onChange={v => update({ slot: v })} placeholder="0" />
          </Field>
        </div>
      </div>
    );
  }

  if (cfg.brand === 'omron') {
    return (
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px' }}>
          <Field label="DEST NODE" note="FINS destination address">
            <TextField value={cfg.destNode} onChange={v => update({ destNode: v })} placeholder="0.0.0" />
          </Field>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <Field label="SRC NODE" note="FINS source address">
            <TextField value={cfg.srcNode} onChange={v => update({ srcNode: v })} placeholder="0.127.0" />
          </Field>
        </div>
        <div style={{ width: 140 }}>
          <Field label="TIMEOUT (s)">
            <TextField type="number" value={cfg.timeout} onChange={v => update({ timeout: v })} placeholder="2" />
          </Field>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ width: 160 }}>
        <Field label="PLC TYPE">
          <SelectField value={cfg.plcType} onChange={v => update({ plcType: v })} options={MITSUBISHI_PLC_TYPES} />
        </Field>
      </div>
      <div style={{ width: 160 }}>
        <Field label="COMM TYPE">
          <SelectField value={cfg.commType} onChange={v => update({ commType: v })} options={MITSUBISHI_COMM_TYPES} />
        </Field>
      </div>
    </div>
  );
}

function TestExeStatus({ build }) {
  if (!build) return null;
  if (build.status === 'building') {
    return <span style={{ fontSize: 12, color: T.textLt }}>Building…</span>;
  }
  if (build.status === 'error') {
    return (
      <span style={{ fontSize: 12, color: T.danger, fontWeight: 600, maxWidth: 360 }}>
        ✖ Build failed{build.error ? `: ${build.error}` : ''}
      </span>
    );
  }
  if (build.status === 'done') {
    return (
      <>
        <span style={{ fontSize: 12, color: T.ok, fontWeight: 700 }}>✔ EXE ready</span>
        <a
          href={`/api/build-plc-test-exe/${build.buildId}/download`} download={build.exeName}
          style={{
            padding: '8px 18px', fontSize: 12, fontWeight: 700, textDecoration: 'none',
            background: T.ok, color: '#FFFFFF', borderRadius: 6, boxShadow: `0 0 12px ${T.ok}55`,
          }}
        >⬇ Download {build.exeName}</a>
      </>
    );
  }
  return null;
}

function ResultBanner({ result }) {
  if (!result) return null;
  if (result === 'testing') {
    return <span style={{ fontSize: 12, color: T.textLt }}>Connecting…</span>;
  }
  if (result.ok) {
    return (
      <span style={{ fontSize: 13, color: T.ok, fontWeight: 700 }}>
        ✔ Connected — PLC answered in {result.latencyMs} ms
      </span>
    );
  }
  return (
    <span style={{ fontSize: 13, color: T.danger, fontWeight: 700, maxWidth: 480 }}>
      ✖ Connection failed{result.error ? `: ${result.error}` : ''}
    </span>
  );
}

let testTagSeq = 0;
const newTestTag = () => ({ key: ++testTagSeq, name: '', address: '', type: 'bool' });

export default function PlcConnectionTestPage({ onBack }) {
  const [cfg, setCfg] = useState(loadPlcConfig);
  const [result, setResult] = useState(null); // null | 'testing' | { ok, latencyMs } | { ok:false, error }
  const [testTags, setTestTags] = useState(() => [newTestTag()]);
  const [testBuild, setTestBuild] = useState(null); // null | { status, buildId, error, exeName, log }
  const testPollRef = useRef(null);

  useEffect(() => {
    loadPlcConfigFromServer().then(serverCfg => {
      if (serverCfg) {
        savePlcConfig(serverCfg);
        setCfg(serverCfg);
      }
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setResult({ ok: false, error: data?.detail || `Backend returned ${res.status}` });
        return;
      }
      setResult(data);
    } catch {
      setResult({ ok: false, error: 'Could not reach the backend — is it running on port 50054?' });
    }
  };

  const brandMeta = BRANDS.find(b => b.id === cfg.brand);
  const hasPort = brandMeta.defaultPort !== null;
  const canTest = (cfg.ip || '').trim().length > 0 && result !== 'testing';

  const updateTestTag = (key, patch) =>
    setTestTags(rows => rows.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const addTestTag = () => setTestTags(rows => [...rows, newTestTag()]);
  const removeTestTag = key => setTestTags(rows => rows.filter(r => r.key !== key));

  const [arrayCfg, setArrayCfg] = useState({ start: '', length: 10, type: 'bool' });
  const [arrayError, setArrayError] = useState('');

  const addTagArray = () => {
    const m = arrayCfg.start.trim().match(/^([A-Za-z]+)(\d+)$/);
    const length = +arrayCfg.length;
    if (!m) {
      setArrayError('Start address must be letters followed by a number, e.g. D701');
      return;
    }
    if (!Number.isInteger(length) || length < 1 || length > 500) {
      setArrayError('Array length must be a whole number from 1 to 500');
      return;
    }
    setArrayError('');
    const [, prefix, digits] = m;
    const width = digits.length;
    const base = parseInt(digits, 10);
    const rows = Array.from({ length }, (_, i) => {
      const address = `${prefix}${String(base + i).padStart(width, '0')}`;
      return { key: ++testTagSeq, name: address, address, type: arrayCfg.type };
    });
    setTestTags(prev => [...prev.filter(r => r.name.trim() || r.address.trim()), ...rows]);
  };

  const validTestTags = testTags.filter(r => r.name.trim() && r.address.trim());
  const canBuildTestExe = (cfg.ip || '').trim().length > 0 && validTestTags.length > 0
    && testBuild?.status !== 'building';

  const generateTestExe = async () => {
    if (!canBuildTestExe) return;
    clearInterval(testPollRef.current);
    setTestBuild({ status: 'building' });
    let res;
    try {
      res = await fetch('/api/build-plc-test-exe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plcConfig: cfg,
          tags: validTestTags.map(({ name, address, type }) => ({ name, address, type })),
        }),
      });
    } catch {
      res = null;
    }
    const data = await (res ? res.json().catch(() => null) : null);
    if (!res || !res.ok || !data?.buildId) {
      setTestBuild({ status: 'error', error: data?.detail || 'Could not reach the backend' });
      return;
    }
    const { buildId } = data;
    setTestBuild({ status: 'building', buildId });
    testPollRef.current = setInterval(async () => {
      let s;
      try {
        const r = await fetch(`/api/build-plc-test-exe/${buildId}/status`);
        s = r.ok ? await r.json() : null;
      } catch {
        s = null;
      }
      if (!s) return;
      setTestBuild({ ...s, buildId });
      if (s.status === 'done' || s.status === 'error') clearInterval(testPollRef.current);
    }, 2000);
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
        }}>⚡</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: T.accent, letterSpacing: 3, fontWeight: 600 }}>DIAGNOSTICS</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textWh, marginTop: 2 }}>PLC Connection Test</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 1.5, marginBottom: 12 }}>
              PLC TYPE
            </div>
            <BrandPicker value={cfg.brand} onChange={selectBrand} />
          </div>

          <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 1.5, marginBottom: 12 }}>
              CONNECTION
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <Field label="IP ADDRESS">
                  <TextField value={cfg.ip} onChange={v => update({ ip: v })} placeholder="e.g. 192.168.3.1" />
                </Field>
              </div>
              <div style={{ width: 140 }}>
                {hasPort ? (
                  <Field label="PORT">
                    <TextField type="number" value={cfg.port} onChange={v => update({ port: v })} placeholder={String(brandMeta.defaultPort)} />
                  </Field>
                ) : (
                  <Field label="PORT" note="FINS uses a fixed UDP port">
                    <div style={{ ...textInput(), display: 'flex', alignItems: 'center', background: T.cardBg, color: T.textDim }}>
                      9600 (fixed)
                    </div>
                  </Field>
                )}
              </div>
            </div>
          </div>

          <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 1.5, marginBottom: 12 }}>
              {brandMeta.label} SETTINGS
            </div>
            <BrandExtraFields cfg={cfg} update={update} />
          </div>

          <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 1.5, marginBottom: 4 }}>
              QUICK TEST EXE
            </div>
            <div style={{ fontSize: 11.5, color: T.textDim, marginBottom: 14, lineHeight: 1.5 }}>
              Type in a few PLC addresses and generate a tiny standalone exe that just connects
              with the settings above and prints their live values to a console window, forever —
              a fast way to confirm wiring/addresses on-site before generating the full application.
            </div>

            <div style={{
              background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8,
              padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <div style={{ flex: '1 1 140px' }}>
                <Field label="START ADDRESS">
                  <TextField value={arrayCfg.start} onChange={v => setArrayCfg(c => ({ ...c, start: v }))} placeholder="e.g. D701" />
                </Field>
              </div>
              <div style={{ width: 110 }}>
                <Field label="ARRAY LENGTH">
                  <TextField type="number" value={arrayCfg.length} onChange={v => setArrayCfg(c => ({ ...c, length: v }))} placeholder="20" />
                </Field>
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <Field label="DATA TYPE">
                  <SelectField
                    value={arrayCfg.type} onChange={v => setArrayCfg(c => ({ ...c, type: v }))}
                    options={TAG_DATA_TYPES.map(t => t.id)}
                  />
                </Field>
              </div>
              <button onClick={addTagArray} style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                background: brandMeta.color, border: 'none', color: '#FFFFFF', borderRadius: 6, alignSelf: 'flex-end',
              }}>+ Generate array</button>
              {arrayError && (
                <div style={{ width: '100%', fontSize: 11, color: T.danger, fontWeight: 600 }}>{arrayError}</div>
              )}
              {!arrayError && (
                <div style={{ width: '100%', fontSize: 10.5, color: T.textDim }}>
                  e.g. start D701, length 20 → adds D701..D720, all with the selected data type and the
                  address itself as the tag name — edit any row's name afterward if you want.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {testTags.map(row => (
                <div key={row.key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <TextField value={row.name} onChange={v => updateTestTag(row.key, { name: v })} placeholder="Tag name" />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <TextField value={row.address} onChange={v => updateTestTag(row.key, { address: v })} placeholder="e.g. D701" />
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <SelectField
                      value={row.type} onChange={v => updateTestTag(row.key, { type: v })}
                      options={TAG_DATA_TYPES.map(t => t.id)}
                    />
                  </div>
                  <button
                    onClick={() => removeTestTag(row.key)}
                    title="Remove"
                    style={{
                      flexShrink: 0, width: 30, height: 30, cursor: 'pointer',
                      background: T.cardBg, border: `1.5px solid ${T.border}`, color: T.danger,
                      borderRadius: 6, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                    }}
                  >✕</button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 14 }}>
              <button onClick={addTestTag} style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: T.cardBg, border: `1.5px solid ${T.border}`, color: T.textLt, borderRadius: 6,
              }}>+ Add tag</button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <TestExeStatus build={testBuild} />
                <button onClick={generateTestExe} disabled={!canBuildTestExe} style={{
                  padding: '9px 22px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', borderRadius: 6,
                  border: 'none', color: '#FFFFFF',
                  background: !canBuildTestExe ? T.textDim : brandMeta.color,
                  cursor: !canBuildTestExe ? 'default' : 'pointer',
                  boxShadow: !canBuildTestExe ? 'none' : `0 0 14px ${brandMeta.color}55`,
                }}>
                  {testBuild?.status === 'building' ? '⏳ Building…' : '⚡ Generate Test EXE'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: T.panelBg, borderTop: `2px solid ${T.border}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
      }}>
        {onBack && (
          <button onClick={onBack} style={{
            padding: '10px 20px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            background: T.cardBg, border: `1.5px solid ${T.border}`, color: T.textLt, borderRadius: 6, marginRight: 'auto',
          }}>← Back</button>
        )}
        <ResultBanner result={result} />
        <button onClick={testConnection} disabled={!canTest} style={{
          padding: '10px 32px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', borderRadius: 6,
          border: 'none', color: '#FFFFFF',
          background: !canTest ? T.textDim : T.accent,
          cursor: !canTest ? 'default' : 'pointer',
          boxShadow: !canTest ? 'none' : `0 0 18px ${T.accent}55`,
        }}>
          {result === 'testing' ? '⏳ Connecting…' : '⚡ Test Connection'}
        </button>
      </div>
    </div>
  );
}
