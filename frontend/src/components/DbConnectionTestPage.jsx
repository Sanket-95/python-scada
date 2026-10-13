import { useEffect, useState } from 'react';
import {
  loadDbConfig, saveDbConfig,
  loadDbConfigFromServer, saveDbConfigToServer,
} from '../config/dbConfig';

// Live SQL Server reachability test — fill in the connection fields, hit
// Test Connection, and the backend opens a real connection right now (see
// POST /api/db-test-connection in backend-fastapi/db_client.py) and reports
// whether it actually answered. Same one-shot pattern as PlcConnectionTestPage.jsx.
//
// This IS what the Part Number column (Station Info Column Config page)
// queries live against — [dbo].[LoadPartDetails] in whatever `database` is
// set here — so this form has to be saved (not just tested) before that
// column can show anything. Saved the same dual way as PLC config
// (config/dbConfig.js): localStorage + backend, and exe_builder.py seeds a
// generated exe with whatever is saved here.

const T = {
  pageBg: '#F0F2F6', panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4',
  border: '#C4C8D4', accent: '#1565C0', ok: '#2E7D32', warn: '#E65100', danger: '#C62828',
  textWh: '#1A2035', textLt: '#3A4F6A', textDim: '#8090A8',
};
const FONT = "'Segoe UI', system-ui, monospace";

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

function ResultBanner({ result }) {
  if (!result) return null;
  if (result === 'testing') {
    return <span style={{ fontSize: 12, color: T.textLt }}>Connecting…</span>;
  }
  if (result.ok) {
    return (
      <span style={{ fontSize: 13, color: T.ok, fontWeight: 700 }}>
        ✔ Connected — SQL Server answered in {result.latencyMs} ms
      </span>
    );
  }
  return (
    <span style={{ fontSize: 13, color: T.danger, fontWeight: 700, maxWidth: 480 }}>
      ✖ Connection failed{result.error ? `: ${result.error}` : ''}
    </span>
  );
}

export default function DbConnectionTestPage({ onBack }) {
  const [cfg, setCfg] = useState(loadDbConfig);
  const [result, setResult] = useState(null); // null | 'testing' | { ok, latencyMs } | { ok:false, error }

  useEffect(() => {
    loadDbConfigFromServer().then(serverCfg => {
      if (serverCfg) {
        saveDbConfig(serverCfg);
        setCfg(serverCfg);
      }
    });
  }, []);

  const update = patch => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveDbConfig(next);
    saveDbConfigToServer(next);
  };

  const testConnection = async () => {
    setResult('testing');
    try {
      const res = await fetch('/api/db-test-connection', {
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

  const canTest = (cfg.server || '').trim().length > 0 && (cfg.database || '').trim().length > 0 && result !== 'testing';

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
        }}>🗄</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: T.accent, letterSpacing: 3, fontWeight: 600 }}>DIAGNOSTICS</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textWh, marginTop: 2 }}>Database Connection Test</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 1.5, marginBottom: 4 }}>
              SQL SERVER
            </div>
            <div style={{ fontSize: 11.5, color: T.textDim, marginBottom: 14, lineHeight: 1.5 }}>
              This is the database the Part Number column (Station Info Column Config page)
              queries live — [dbo].[LoadPartDetails] in the database named below — to turn a
              wagon's Put event into a PartName shown on that station's row.
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ flex: '1 1 220px' }}>
                <Field label="SERVER">
                  <TextField value={cfg.server} onChange={v => update({ server: v })} placeholder="e.g. 192.168.3.50 or SQLHOST\INSTANCE" />
                </Field>
              </div>
              <div style={{ width: 140 }}>
                <Field label="PORT">
                  <TextField type="number" value={cfg.port} onChange={v => update({ port: v })} placeholder="1433" />
                </Field>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Field label="DATABASE">
                <TextField value={cfg.database} onChange={v => update({ database: v })} placeholder="e.g. SVI_STDB" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <Field label="USERNAME">
                  <TextField value={cfg.username} onChange={v => update({ username: v })} placeholder="SQL login" />
                </Field>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <Field label="PASSWORD">
                  <TextField type="password" value={cfg.password} onChange={v => update({ password: v })} placeholder="••••••••" />
                </Field>
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
