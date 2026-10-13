import { useEffect, useRef, useState } from 'react';
import { THEME, FONT_COND } from '../theme';
import { Page, Card, Button, Badge, Field } from '../ui/kit';

// Branding — what appears in the app's top bar: up to two logos on the left,
// and a company name (rich text: bold/italic/colour/font) plus optional logo
// in the centre. Logos are stored as data URLs. Shape:
//   { left: { logo1, logo2 }, center: { name, logo } }

const LOGO_MAX_H = 26;

const readFileAsDataURL = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const FONT_CHOICES = [
  { label: 'Barlow Condensed', value: "'Barlow Condensed', sans-serif" },
  { label: 'Barlow',           value: "'Barlow', sans-serif" },
  { label: 'Arial',            value: 'Arial, Helvetica, sans-serif' },
  { label: 'Segoe UI',         value: "'Segoe UI', Tahoma, sans-serif" },
  { label: 'Georgia',          value: 'Georgia, serif' },
  { label: 'Verdana',          value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS',     value: "'Trebuchet MS', sans-serif" },
];

const hasText = html => !!html && html.replace(/<[^>]*>/g, '').trim().length > 0;

const toolBtn = {
  height: 32, minWidth: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #D2D8DE',
  background: '#FFFFFF', color: THEME.text, cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

// contentEditable editor: formatting applies to the current selection (the
// selection is saved before the colour/font controls steal focus).
function RichTextInput({ value, onChange }) {
  const editRef = useRef(null);
  const savedSel = useRef(null);

  useEffect(() => {
    if (editRef.current && editRef.current.innerHTML !== (value || '')) editRef.current.innerHTML = value || '';
  }, [value]);

  const emit = () => onChange(editRef.current?.innerHTML || '');
  const exec = (cmd, arg) => { editRef.current?.focus(); document.execCommand(cmd, false, arg); emit(); };
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editRef.current?.contains(sel.anchorNode)) savedSel.current = sel.getRangeAt(0);
  };
  const applyToSelection = (cmd, arg) => {
    editRef.current?.focus();
    const sel = window.getSelection();
    if (sel && savedSel.current) { sel.removeAllRanges(); sel.addRange(savedSel.current); }
    document.execCommand(cmd, false, arg);
    emit();
  };

  return (
    <div style={{ border: '1px solid #D2D8DE', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 6, padding: 8, background: '#F4F6F8', borderBottom: '1px solid #E1E6EA', flexWrap: 'wrap' }}>
        <button type="button" title="Bold" style={toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}><b>B</b></button>
        <button type="button" title="Italic" style={toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')}><i>I</i></button>
        <label title="Text colour" style={{ ...toolBtn, gap: 6, position: 'relative' }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: 'conic-gradient(#C53030, #F2A900, #2F855A, #0E7C86, #6B3FA8, #C53030)' }} />
          Colour
          <input type="color" defaultValue="#1C232B" onMouseDown={saveSelection} onChange={e => applyToSelection('foreColor', e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
        </label>
        <select title="Font" defaultValue="" onMouseDown={saveSelection}
          onChange={e => { if (e.target.value) { applyToSelection('fontName', e.target.value); e.target.value = ''; } }}
          style={{ ...toolBtn, fontWeight: 600 }}>
          <option value="">Font…</option>
          {FONT_CHOICES.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
        </select>
        <button type="button" style={{ ...toolBtn, fontWeight: 600, color: THEME.textMid }} onMouseDown={e => e.preventDefault()} onClick={() => exec('removeFormat')}>Clear format</button>
      </div>
      <div ref={editRef} contentEditable suppressContentEditableWarning onInput={emit}
        style={{ minHeight: 44, padding: '10px 14px', fontSize: 20, fontWeight: 700, fontFamily: FONT_COND, color: THEME.text, outline: 'none', background: '#FFFFFF' }} />
    </div>
  );
}

function LogoSlot({ title, logo, onChange }) {
  const fileRef = useRef(null);
  const pick = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    onChange(await readFileAsDataURL(file));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: THEME.textMid }}>{title}</span>
      <button onClick={() => fileRef.current?.click()} style={{
        height: 96, borderRadius: 12, border: `2px dashed ${logo ? '#B7E1E0' : '#D2D8DE'}`, background: logo ? '#FFFFFF' : '#F8FAFB',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10,
      }}>
        {logo
          ? <img src={logo} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 13, color: THEME.textDim, fontWeight: 600 }}>⇪ Click to upload an image</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      {logo && <Button size="sm" variant="danger" onClick={() => onChange(null)} style={{ alignSelf: 'flex-start' }}>Remove</Button>}
    </div>
  );
}

function HeaderPreview({ cfg }) {
  const pill = (label, value, color) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 13, background: '#F5F7F8', border: '1px solid #D2D8DE', fontSize: 10, fontWeight: 700, color: THEME.textDim }}>
      {label}<span style={{ color, fontSize: 11.5, fontWeight: 800 }}>{value}</span>
    </span>
  );
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #D2D8DE', boxShadow: '0 6px 18px rgba(16,24,40,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 56, padding: '0 16px', background: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 120 }}>
          {cfg.left.logo1 && <img src={cfg.left.logo1} alt="" style={{ height: LOGO_MAX_H, maxWidth: 100, objectFit: 'contain' }} />}
          {cfg.left.logo2 && <img src={cfg.left.logo2} alt="" style={{ height: LOGO_MAX_H, maxWidth: 100, objectFit: 'contain' }} />}
          {!cfg.left.logo1 && !cfg.left.logo2 && <span style={{ fontSize: 12, color: THEME.textDim }}>left logos</span>}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {cfg.center.logo && <img src={cfg.center.logo} alt="" style={{ height: LOGO_MAX_H, maxWidth: 100, objectFit: 'contain' }} />}
          {hasText(cfg.center.name)
            ? <span style={{ fontFamily: FONT_COND, fontSize: 24, fontWeight: 700, color: THEME.text, whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: cfg.center.name }} />
            : !cfg.center.logo && <span style={{ fontSize: 12, color: THEME.textDim }}>company name</span>}
        </div>
        {pill('DATA', 'SIMULATION', '#8E24AA')}{pill('MODE', 'AUTO', THEME.ok)}
        <span style={{ fontFamily: FONT_COND, fontSize: 20, fontWeight: 700, color: THEME.text, paddingLeft: 10, borderLeft: '1px solid #D2D8DE' }}>12:00:00</span>
      </div>
    </div>
  );
}

export default function GeneralConfigPage({ headerConfig, onSave, onBack }) {
  const [draft, setDraft] = useState(headerConfig);
  const dirty = JSON.stringify(draft) !== JSON.stringify(headerConfig);
  const setLeft = patch => setDraft(d => ({ ...d, left: { ...d.left, ...patch } }));
  const setCenter = patch => setDraft(d => ({ ...d, center: { ...d.center, ...patch } }));

  return (
    <Page onBack={onBack} crumbs={['Configuration']} title="Branding"
      subtitle="Logos and company name shown in the top bar of every screen."
      actions={(
        <>
          {dirty && <Badge toneName="amber" dot>Unsaved changes</Badge>}
          <Button disabled={!dirty} onClick={() => setDraft(headerConfig)}>Discard</Button>
          <Button variant="primary" icon="✓" disabled={!dirty} onClick={() => onSave(draft)}>Save branding</Button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Card title="Live preview" icon="◫" pad={18}><HeaderPreview cfg={draft} /></Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 18, alignItems: 'start' }}>
          <Card title="Left side" subtitle="Up to two logos" icon="◧">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <LogoSlot title="Logo 1" logo={draft.left.logo1} onChange={l => setLeft({ logo1: l })} />
              <LogoSlot title="Logo 2" logo={draft.left.logo2} onChange={l => setLeft({ logo2: l })} />
            </div>
          </Card>
          <Card title="Centre" subtitle="Company name and an optional logo" icon="◨">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 14 }}>
              <Field label="Company name"><RichTextInput value={draft.center.name} onChange={html => setCenter({ name: html })} /></Field>
              <LogoSlot title="Centre logo" logo={draft.center.logo} onChange={l => setCenter({ logo: l })} />
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
