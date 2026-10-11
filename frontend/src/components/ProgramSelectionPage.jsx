import { useRef, useState } from 'react';
import { PROGRAM_FIELDS, loadProgramValues, saveProgramValues } from '../config/programSelection';

const T = {
  panelBg: '#FFFFFF', cardBg: '#F4F5FA', cardHdr: '#E8EBF4', border: '#C4C8D4',
  accent: '#1565C0', ok: '#2E7D32', danger: '#C62828',
  textWh: '#1A2035', textDim: '#8090A8',
};

// A program is identified by its number: empty is fine (nothing chosen yet),
// otherwise a whole number, 0 or more.
const badProgram = v => v !== '' && !/^\d+$/.test(v);

// The saved shape: empty and invalid fields are both dropped, so an
// in-progress bad value in one field never gets persisted just because the
// other field was blurred.
const tidy = values => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && !badProgram(v)));

// Left panel: the label is here now; the description content comes later, so
// the body is just a reserved area.
function ProgramDescription() {
  return (
    <div style={{
      flex: '1 1 300px', minWidth: 260, maxWidth: 440, alignSelf: 'stretch',
      background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 1.5, textAlign: 'center' }}>
        PROGRAM DESCRIPTION
      </div>
      <div style={{ flex: 1, minHeight: 160, border: `1px dashed ${T.border}`, borderRadius: 8 }} />
    </div>
  );
}

export default function ProgramSelectionPage() {
  const [values, setValues] = useState(loadProgramValues);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);

  const setField = (id, value) => {
    setFlash(false);
    setValues(v => ({ ...v, [id]: value }));
  };

  const anyBad = PROGRAM_FIELDS.some(f => badProgram(values[f.id] ?? ''));

  // Saves on blur, never on every keystroke. A bad field is left exactly as
  // typed, red border and all, and simply isn't persisted until it's fixed —
  // the other field still saves fine on its own. `tidy` (empty/invalid
  // fields dropped) is recomputed fresh from `values` every time, so this
  // always reflects whatever's currently on screen.
  const commit = id => {
    if (badProgram(values[id] ?? '')) return;
    saveProgramValues(tidy(values));
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1200);
  };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
        flexWrap: 'wrap', marginBottom: 12,
      }}>
        {anyBad && <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>Program must be a whole number</span>}
        {!anyBad && flash && <span style={{ fontSize: 12, fontWeight: 700, color: T.ok }}>✔ Saved</span>}
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
        <ProgramDescription />

        <div style={{
          flex: '1 1 300px', minWidth: 260, maxWidth: 440,
          background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden',
        }}>
          {PROGRAM_FIELDS.map((f, i) => {
            const value = values[f.id] ?? '';
            return (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                padding: '18px 20px', background: i % 2 ? T.cardBg : T.panelBg,
                borderBottom: i < PROGRAM_FIELDS.length - 1 ? `1px solid ${T.border}55` : 'none',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.textWh }}>{f.label}</div>
                <input
                  type="number" step="1" min="0" placeholder="—"
                  aria-label={f.label} value={value}
                  onChange={e => setField(f.id, e.target.value)}
                  onBlur={() => commit(f.id)}
                  onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                  style={{
                    width: 130, boxSizing: 'border-box', padding: '8px 10px', fontSize: 14, fontWeight: 600,
                    fontFamily: 'inherit', textAlign: 'right', outline: 'none', borderRadius: 6,
                    background: '#FFFFFF', color: T.textWh,
                    border: `1.5px solid ${badProgram(value) ? T.danger : T.border}`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
