import { useState } from 'react';
import { getSettingsSections, findSettingsPage } from '../config/settingsPages';

const T = {
  pageBg:   '#F0F2F6', panelBg:  '#FFFFFF', cardBg:   '#F4F5FA',
  cardHdr:  '#E8EBF4', border:   '#C4C8D4', accent:   '#1565C0',
  textWh:   '#1A2035', textLt:   '#3A4F6A', textDim:  '#8090A8',
};

const FONT = "'Segoe UI', system-ui, monospace";

function PageFrame({ badge, eyebrow, title, footer, children }) {
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
        }}>{badge}</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: T.accent, letterSpacing: 3, fontWeight: 600 }}>{eyebrow}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textWh, marginTop: 2 }}>{title}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>{children}</div>

      <div style={{
        background: T.panelBg, borderTop: `2px solid ${T.border}`,
        padding: '14px 28px', flexShrink: 0,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
      }}>{footer}</div>
    </div>
  );
}

function BackButton({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 24px', fontSize: 13, fontWeight: 600,
      background: T.cardBg, border: `1.5px solid ${T.border}`,
      color: T.textLt, cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
    }}>{children}</button>
  );
}

function NavButton({ label, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '15px 18px', fontSize: 14, fontWeight: 700,
        background: hover ? '#E3F2FD' : T.cardBg,
        border: `1.5px solid ${hover ? T.accent : T.border}`,
        borderLeft: `5px solid ${T.accent}`,
        color: hover ? T.accent : T.textWh, borderRadius: 8,
        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 18, color: hover ? T.accent : T.textDim }}>›</span>
    </button>
  );
}

// Opened for any registry page that has no component of its own yet.
function PlaceholderPage({ page }) {
  return (
    <div style={{
      background: T.panelBg, border: `1px dashed ${T.border}`, borderRadius: 10,
      padding: '40px 24px', textAlign: 'center', maxWidth: 560, margin: '0 auto',
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.textLt }}>{page.label}</div>
      <div style={{ fontSize: 12, color: T.textDim, marginTop: 8 }}>
        This page hasn't been set up yet.
      </div>
    </div>
  );
}

// Hub of navigation buttons (one card per registry section) or, when
// activePageId is set, that page. Which page is open is owned by the parent so
// clicking "Settings" in the sidebar can reset it back to the hub.
export default function SettingsPage({ activePageId, onOpenPage, onClosePage, onBack, pageContext = {}, pageSelection = {} }) {
  const found = activePageId ? findSettingsPage(activePageId, pageSelection) : null;

  if (found) {
    const { page, section } = found;
    const Content = page.component || PlaceholderPage;
    return (
      <PageFrame
        badge="⚙" eyebrow={`SETTINGS — ${section.title}`} title={page.title || page.label}
        footer={<BackButton onClick={onClosePage}>← Back to Settings</BackButton>}
      >
        <Content {...pageContext} page={page} section={section} onBack={onClosePage} />
      </PageFrame>
    );
  }

  const sections = getSettingsSections(pageSelection);
  return (
    <PageFrame
      badge="☰" eyebrow="SETTINGS" title="Plant status & set points"
      footer={<BackButton onClick={onBack}>← Back</BackButton>}
    >
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
        {sections.map(section => (
          <div key={section.id} style={{
            flex: '1 1 320px', minWidth: 280, maxWidth: 560,
            background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 10,
            padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 1.5, marginBottom: 4, textAlign: 'center' }}>
              {section.title}
            </div>
            {section.pages.map(page => (
              <NavButton key={page.id} label={page.label} onClick={() => onOpenPage(page.id)} />
            ))}
          </div>
        ))}
      </div>
    </PageFrame>
  );
}
