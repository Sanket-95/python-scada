import { useState, useRef, useEffect } from 'react';

const T = {
  pageBg:   '#F0F2F6', panelBg:  '#FFFFFF', cardBg:   '#F4F5FA',
  cardHdr:  '#E8EBF4', inputBg:  '#FFFFFF', inputText:'#1A2035',
  border:   '#C4C8D4', teal:     '#1565C0', tealBr:   '#1565C0',
  accent:   '#1565C0', ok:       '#2E7D32', warn:     '#E65100',
  textWh:   '#1A2035', textLt:   '#3A4F6A', textDim:  '#8090A8',
};

// Same box the real header uses (see HeaderBrand in WagonScada3D.jsx) — the
// preview below is rendered at this exact size so what you see here is what
// you'll get, not an approximation.
const LOGO_MAX_H = 26;

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// System fonts only — no Google Fonts / CDN lookups, so the picker stays
// consistent with the app's offline-only requirement.
const FONT_CHOICES = [
  { label: 'Arial',       value: 'Arial, Helvetica, sans-serif' },
  { label: 'Segoe UI',    value: "'Segoe UI', Tahoma, sans-serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Georgia',     value: 'Georgia, serif' },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
  { label: 'Verdana',     value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma',      value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet MS',value: "'Trebuchet MS', sans-serif" },
];

// Minimal rich-text editor — Bold / Italic / text color / font style, backed by a
// contentEditable div. `value`/`onChange` carry HTML (not plain text), so
// the styling travels with the name wherever it's rendered. Uses
// document.execCommand — deprecated but still supported everywhere, and the
// simplest zero-dependency way to get real bold/italic/color editing without
// pulling in an external rich-text library (this app must run offline).
function RichTextInput({ value, onChange }) {
  const editRef   = useRef(null);
  const savedSel  = useRef(null);

  // Sync the DOM only when the value changes from *outside* (e.g. switching
  // drafts) — never on every keystroke, or the caret would jump to the end.
  useEffect(() => {
    if (editRef.current && editRef.current.innerHTML !== (value || '')) {
      editRef.current.innerHTML = value || '';
    }
  }, [value]);

  const emit = () => onChange(editRef.current?.innerHTML || '');

  const exec = (cmd, arg) => {
    editRef.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  // The native color <input> steals focus/selection when its picker opens,
  // so the current text selection is captured on mousedown (before that
  // happens) and restored right before applying the color.
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editRef.current?.contains(sel.anchorNode)) {
      savedSel.current = sel.getRangeAt(0);
    }
  };
  // Focus must happen BEFORE the selection is restored — focusing a
  // contentEditable that wasn't already focused resets its caret to a
  // browser-remembered position, which would silently discard the range we
  // just restored if done in the other order (the actual bug: color/font
  // picks were landing on the wrong spot, or nowhere, since the native
  // <input type=color>/<select> steals focus when their picker opens).
  const applyToSelection = (cmd, arg) => {
    editRef.current?.focus();
    const sel = window.getSelection();
    if (sel && savedSel.current) { sel.removeAllRanges(); sel.addRange(savedSel.current); }
    document.execCommand(cmd, false, arg);
    emit();
  };
  const applyColor = e => applyToSelection('foreColor', e.target.value);
  const applyFont = e => {
    if (!e.target.value) return;
    applyToSelection('fontName', e.target.value);
    e.target.value = '';
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <button type="button" title="Bold" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}
          style={richBtn()}><b>B</b></button>
        <button type="button" title="Italic" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')}
          style={richBtn()}><i>I</i></button>
        <input type="color" title="Text color" defaultValue="#1A2035"
          onMouseDown={saveSelection} onChange={applyColor}
          style={{ width: 30, height: 28, padding: 0, border: `1.5px solid ${T.border}`, borderRadius: 4, cursor: 'pointer', background: 'none' }}
        />
        <select title="Font style" defaultValue=""
          onMouseDown={saveSelection} onChange={applyFont}
          style={{
            height: 28, fontSize: 11.5, cursor: 'pointer',
            background: T.panelBg, border: `1.5px solid ${T.border}`, color: T.textLt,
            borderRadius: 4, fontFamily: 'inherit', padding: '0 4px',
          }}
        >
          <option value="">Font…</option>
          {FONT_CHOICES.map(f => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
          ))}
        </select>
        <button type="button" title="Clear formatting" onMouseDown={e => e.preventDefault()} onClick={() => exec('removeFormat')}
          style={{ ...richBtn(), width: 'auto', padding: '0 8px', fontSize: 10.5, fontWeight: 600 }}>Clear</button>
      </div>
      <div
        ref={editRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        style={{
          minHeight: 20, width: '100%', boxSizing: 'border-box',
          background: T.inputBg, color: T.inputText,
          border: `1.5px solid ${T.border}`, borderRadius: 6,
          padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
        }}
        onFocus={e => e.target.style.borderColor = T.teal}
        onBlur={e  => e.target.style.borderColor = T.border}
      />
    </div>
  );
}

function richBtn() {
  return {
    width: 30, height: 28, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    background: T.panelBg, border: `1.5px solid ${T.border}`, color: T.textLt,
    borderRadius: 4, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

// One logo upload control: preview box + upload/remove buttons. `logo` is a
// data-URL string or null; onChange receives the new data-URL (or null).
function LogoUpload({ subLabel, logo, onChange }) {
  const fileRef = useRef(null);

  const handleFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const dataUrl = await readFileAsDataURL(file);
    onChange(dataUrl);
  };

  return (
    <div>
      {subLabel && (
        <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5, letterSpacing: 0.5 }}>{subLabel}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 64, height: 44, borderRadius: 6, flexShrink: 0,
          background: '#FFFFFF', border: `1.5px dashed ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {logo
            ? <img src={logo} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 9, color: T.textDim }}>none</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} style={{
          padding: '7px 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
          background: T.panelBg, border: `1.5px solid ${T.border}`,
          color: T.textLt, borderRadius: 5, fontFamily: 'inherit',
        }}>⤒ Upload</button>
        {logo && (
          <button onClick={() => onChange(null)} style={{
            padding: '7px 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            background: T.panelBg, border: `1.5px solid ${T.border}`,
            color: T.warn, borderRadius: 5, fontFamily: 'inherit',
          }}>✕ Remove</button>
        )}
      </div>
    </div>
  );
}

// Left slot: two logos, no name — the left brand slot no longer offers a
// name option.
function BrandFieldLeft({ value, onChange }) {
  return (
    <div style={{
      background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.tealBr, letterSpacing: 1.5 }}>LEFT SIDE</div>
      <LogoUpload subLabel="LOGO 1" logo={value.logo1} onChange={l => onChange({ ...value, logo1: l })} />
      <LogoUpload subLabel="LOGO 2" logo={value.logo2} onChange={l => onChange({ ...value, logo2: l })} />
    </div>
  );
}

// Center slot: name + a single logo, unchanged from before.
function BrandFieldCenter({ value, onChange }) {
  return (
    <div style={{
      background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.tealBr, letterSpacing: 1.5 }}>CENTER</div>

      <div>
        <div style={{ fontSize: 10.5, color: T.textDim, marginBottom: 5, letterSpacing: 0.5 }}>NAME</div>
        <RichTextInput
          value={value.name}
          onChange={html => onChange({ ...value, name: html })}
        />
      </div>

      <LogoUpload subLabel="LOGO" logo={value.logo} onChange={l => onChange({ ...value, logo: l })} />
    </div>
  );
}

// Mirrors the header's own left-slot layout exactly: two logos, no name.
function BrandPreviewSlotLeft({ value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, minWidth: 0,
      height: LOGO_MAX_H + 12, padding: '4px 10px',
      background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 6,
    }}>
      {value.logo1 && (
        <img src={value.logo1} alt="" style={{ height: LOGO_MAX_H, maxWidth: 90, objectFit: 'contain', flexShrink: 0 }} />
      )}
      {value.logo2 && (
        <img src={value.logo2} alt="" style={{ height: LOGO_MAX_H, maxWidth: 90, objectFit: 'contain', flexShrink: 0 }} />
      )}
      {!value.logo1 && !value.logo2 && (
        <span style={{ fontSize: 11, color: T.textDim }}>(empty)</span>
      )}
    </div>
  );
}

// Mirrors the header's own center-slot layout: name shown in full — no
// max-width, no truncation — plus an optional logo.
// `name` is now rich-text HTML (bold/italic/color from RichTextInput), not
// plain text — strip tags just to test whether there's any actual text.
function hasText(html) {
  return !!html && html.replace(/<[^>]*>/g, '').trim().length > 0;
}

function BrandPreviewSlotCenter({ value }) {
  const nameHasText = hasText(value.name);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
      height: LOGO_MAX_H + 12, padding: '4px 10px',
      background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 6,
    }}>
      {value.logo && (
        <img src={value.logo} alt="" style={{ height: LOGO_MAX_H, maxWidth: 90, objectFit: 'contain', flexShrink: 0 }} />
      )}
      {nameHasText && (
        <span
          style={{
            fontSize: 18, fontWeight: 900, color: T.textWh, whiteSpace: 'nowrap',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
          dangerouslySetInnerHTML={{ __html: value.name }}
        />
      )}
      {!value.logo && !nameHasText && (
        <span style={{ fontSize: 11, color: T.textDim }}>(empty)</span>
      )}
    </div>
  );
}

export default function GeneralConfigPage({ headerConfig, onSave, onBack }) {
  const [draft, setDraft] = useState(headerConfig);

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'hidden', background: T.pageBg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, monospace",
    }}>
      {/* Header */}
      <div style={{
        background: T.cardHdr, borderBottom: `3px solid ${T.teal}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 14,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <div style={{
          background: T.teal, color: '#FFFFFF', fontWeight: 900,
          fontSize: 18, padding: '6px 12px', borderRadius: 4, letterSpacing: 1,
        }}>⚑</div>
        <div>
          <div style={{ fontSize: 11, color: T.tealBr, letterSpacing: 3, fontWeight: 600 }}>
            GENERAL CONFIGURATION
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textWh, marginTop: 2 }}>
            Header branding — left &amp; center
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{
          background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 18,
        }}>
          <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 1, marginBottom: 10 }}>LIVE PREVIEW</div>
          <div style={{
            background: 'linear-gradient(90deg,#DDE4F0,#E8EDF8,#DDE4F0)',
            border: `1px solid ${T.border}`, borderRadius: 6,
            padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <BrandPreviewSlotLeft value={draft.left} />
            <BrandPreviewSlotCenter value={draft.center} />
            <div style={{ fontSize: 11, color: T.textDim, flexShrink: 0 }}>date / time →</div>
          </div>
          <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 8 }}>
            The header bar height never changes — logos are always capped to fit it. The center name is always shown in full, never cropped, and stays centered regardless of its length.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          <BrandFieldLeft value={draft.left}
            onChange={v => setDraft(d => ({ ...d, left: v }))} />
          <BrandFieldCenter value={draft.center}
            onChange={v => setDraft(d => ({ ...d, center: v }))} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: T.panelBg, borderTop: `2px solid ${T.border}`,
        padding: '14px 28px', flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
      }}>
        <button onClick={onBack} style={{
          padding: '10px 24px', fontSize: 13, fontWeight: 600,
          background: T.cardBg, border: `1.5px solid ${T.border}`,
          color: T.textLt, cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
        }}>← Back</button>

        <button onClick={() => onSave(draft)} style={{
          padding: '10px 32px', fontSize: 13, fontWeight: 700,
          background: T.teal, border: 'none', color: '#FFFFFF',
          cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
          boxShadow: `0 0 18px ${T.teal}55`,
        }}>✔ Save &amp; Apply</button>
      </div>
    </div>
  );
}
