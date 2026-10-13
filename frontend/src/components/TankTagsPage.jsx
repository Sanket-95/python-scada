import { useMemo, useState } from 'react';
import { getTankIdsByLine, TAG_DATA_TYPES } from '../config/tagConfig';
import ExcelTagImportModal from './ExcelTagImportModal';
import { THEME } from '../theme';
import { Page, Card, Button, Badge, Input, Select, Segmented, SearchBox, Row, Callout, Mono } from '../ui/kit';

// Tank Register (Mimic Page Config) — every tank's display name (this is the
// station's name everywhere in the app), its load-status tag name, PLC address
// and data type. A tank counts as loaded whenever its tag reads non-zero.

const typeOptions = TAG_DATA_TYPES.map(t => ({ value: t.id, label: t.label }));

export default function TankTagsPage({ userCfg, tankTags, onSave, onBack }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(tankTags)));
  const [showImport, setShowImport] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [lineSel, setLineSel] = useState('all');
  const [fill, setFill] = useState({ start: '', error: '' });
  const dirty = JSON.stringify(draft) !== JSON.stringify(tankTags);

  const setTag = (id, field, val) => setDraft(d => ({ ...d, [id]: { ...d[id], [field]: val } }));

  const applyImport = patch => {
    setDraft(d => {
      const next = { ...d };
      Object.entries(patch).forEach(([id, u]) => { next[id] = { ...next[id], ...u }; });
      return next;
    });
    setNotice(`Imported ${Object.keys(patch).length} tank${Object.keys(patch).length === 1 ? '' : 's'} from Excel — review and save.`);
    setShowImport(false);
  };

  const lines = useMemo(() => getTankIdsByLine(userCfg).map((ids, i) => ({ line: userCfg.lines[i], ids: ids.map(String) })), [userCfg]);
  const visibleIds = (lineSel === 'all' ? lines : lines.filter(l => String(l.line.id) === lineSel))
    .flatMap(l => l.ids)
    .filter(id => {
      if (!query) return true;
      const t = draft[id] || {};
      return `${id} ${t.label || ''} ${t.name || ''} ${t.address || ''}`.toLowerCase().includes(query.toLowerCase());
    });

  // Fill PLC addresses sequentially over the visible tanks: D701 → D701, D702, …
  const autoFill = () => {
    const m = fill.start.trim().match(/^([A-Za-z]+)(\d+)$/);
    if (!m) { setFill(f => ({ ...f, error: 'Use letters then a number, e.g. D701' })); return; }
    const [, prefix, digits] = m;
    const base = parseInt(digits, 10);
    setDraft(d => {
      const next = { ...d };
      visibleIds.forEach((id, i) => { next[id] = { ...next[id], address: `${prefix}${String(base + i).padStart(digits.length, '0')}` }; });
      return next;
    });
    setFill({ start: '', error: '' });
    setNotice(`Addresses filled for ${visibleIds.length} tanks starting at ${fill.start.trim()} — review and save.`);
  };

  const mapped = Object.values(draft).filter(t => (t.address || '').trim()).length;

  return (
    <Page onBack={onBack} crumbs={['Configuration']} title="Tank Register"
      subtitle="Name every tank and map its load-status signal. The name here is how the tank appears across the whole app."
      width={1320}
      actions={(
        <>
          <Badge toneName={mapped === Object.keys(draft).length ? 'ok' : 'info'}>{mapped}/{Object.keys(draft).length} mapped</Badge>
          {dirty && <Badge toneName="amber" dot>Unsaved changes</Badge>}
          <Button icon="⇪" onClick={() => setShowImport(true)}>Import Excel</Button>
          <Button disabled={!dirty} onClick={() => { setDraft(JSON.parse(JSON.stringify(tankTags))); setNotice(''); }}>Discard</Button>
          <Button variant="primary" icon="✓" disabled={!dirty} onClick={() => onSave(draft)}>Save register</Button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {notice && <Callout toneName="ok" icon="✓">{notice}</Callout>}
        <Card pad={0}
          title="Tanks" subtitle={`${visibleIds.length} shown`} icon="▥"
          actions={(
            <Row>
              <Segmented size="sm" value={lineSel} onChange={setLineSel}
                options={[{ value: 'all', label: 'All lines' }, ...lines.map(l => ({ value: String(l.line.id), label: l.line.label }))]} />
              <SearchBox value={query} onChange={setQuery} placeholder="Name, tag or address…" width={220} />
            </Row>
          )}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: '#F8FAFB', borderBottom: '1px solid #EEF1F3', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: THEME.textMid }}>Bulk address fill</span>
            <Input mono value={fill.start} placeholder="Start, e.g. D701" invalid={!!fill.error}
              onChange={e => setFill({ start: e.target.value, error: '' })} style={{ width: 170, height: 32 }} />
            <Button size="sm" onClick={autoFill} disabled={!fill.start.trim() || visibleIds.length === 0}>Fill {visibleIds.length} shown tanks</Button>
            {fill.error && <span style={{ fontSize: 12.5, color: THEME.danger, fontWeight: 600 }}>{fill.error}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '70px minmax(200px, 1.3fr) minmax(180px, 1fr) 150px 220px', gap: 10, padding: '10px 18px', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: THEME.textDim, background: '#F4F6F8' }}>
            <span>TANK</span><span>DISPLAY NAME</span><span>TAG NAME</span><span>PLC ADDRESS</span><span>DATA TYPE</span>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 400px)', minHeight: 240, overflowY: 'auto' }}>
            {visibleIds.map(id => {
              const t = draft[id] || {};
              return (
                <div key={id} style={{ display: 'grid', gridTemplateColumns: '70px minmax(200px, 1.3fr) minmax(180px, 1fr) 150px 220px', gap: 10, alignItems: 'center', padding: '7px 18px', borderTop: '1px solid #EEF1F3' }}>
                  <Mono style={{ fontWeight: 700, color: THEME.accentDark }}>T{id.padStart(2, '0')}</Mono>
                  <Input value={t.label || ''} placeholder={`Tank ${id}`} onChange={e => setTag(id, 'label', e.target.value)} style={{ height: 34, fontWeight: 600 }} />
                  <Input mono value={t.name || ''} onChange={e => setTag(id, 'name', e.target.value)} style={{ height: 34 }} />
                  <Input mono value={t.address || ''} placeholder="not mapped" onChange={e => setTag(id, 'address', e.target.value)} style={{ height: 34 }} />
                  <Select value={t.type || 'bool'} onChange={e => setTag(id, 'type', e.target.value)} options={typeOptions} style={{ height: 34, fontSize: 13 }} />
                </div>
              );
            })}
            {visibleIds.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: THEME.textDim }}>No tanks match</div>}
          </div>
        </Card>
      </div>
      {showImport && <ExcelTagImportModal userCfg={userCfg} onApply={applyImport} onClose={() => setShowImport(false)} />}
    </Page>
  );
}
