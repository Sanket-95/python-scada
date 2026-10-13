import { useRef, useState } from 'react';
import { THEME } from '../theme';
import { Page, Card, Button, Badge, Input, Select, Field, Toggle, Mono } from '../ui/kit';

// Built-in Tank Overview table columns. Ids are fixed — the overview renders
// each built-in id from live data; any other id is a custom column showing
// the live value of its tagName.
export const DEFAULT_STATION_COLS = [
  { id: 'wagon',  label: 'Wagon',       enabled: true, dataType: '',       tagName: '', address: '' },
  { id: 'op',     label: 'Operation',   enabled: true, dataType: '',       tagName: '', address: '' },
  { id: 'stNo',   label: 'Station No',  enabled: true, dataType: '',       tagName: '', address: '' },
  { id: 'stName', label: 'Station Name',enabled: true, dataType: 'STRING', tagName: '', address: '' },
  { id: 'loadNo', label: 'Load No',     enabled: true, dataType: 'INT',    tagName: '', address: '' },
  { id: 'dur',    label: 'Duration',    enabled: true, dataType: 'TIME',   tagName: '', address: '' },
  { id: 'client', label: 'Client Name', enabled: true, dataType: 'STRING', tagName: '', address: '' },
  { id: 'part',   label: 'Part Name',   enabled: true, dataType: 'STRING', tagName: '', address: '' },
  { id: 'tempPV', label: 'Temp PV',     enabled: true, dataType: 'REAL',   tagName: '', address: '' },
  { id: 'tempSV', label: 'Temp SV',     enabled: true, dataType: 'REAL',   tagName: '', address: '' },
  { id: 'currPV', label: 'Current PV',  enabled: true, dataType: 'REAL',   tagName: '', address: '' },
  { id: 'currSV', label: 'Current SV',  enabled: true, dataType: 'REAL',   tagName: '', address: '' },
  { id: 'pH',     label: 'pH PV',       enabled: true, dataType: 'REAL',   tagName: '', address: '' },
];

const BUILT_IN = new Set(DEFAULT_STATION_COLS.map(c => c.id));
const DATA_TYPES = ['INT', 'REAL', 'STRING', 'TIME', 'BOOL'];
const BLANK = { label: '', dataType: 'REAL', tagName: '', address: '' };

export default function StationColumnConfigPage({ colConfig, onSave, onBack }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(colConfig)));
  const [newCol, setNewCol] = useState(BLANK);
  const [dropIdx, setDropIdx] = useState(-1);
  const dragIdx = useRef(-1);
  const dirty = JSON.stringify(draft) !== JSON.stringify(colConfig);

  const update = (id, field, val) => setDraft(d => d.map(c => (c.id === id ? { ...c, [field]: val } : c)));
  const move = (from, to) => {
    if (from === to || from < 0 || to < 0 || to >= draft.length) return;
    setDraft(d => { const n = [...d]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });
  };
  const add = () => {
    if (!newCol.label.trim()) return;
    setDraft(d => [...d, { id: `col_${Date.now()}`, enabled: true, label: newCol.label.trim(), dataType: newCol.dataType, tagName: newCol.tagName.trim(), address: newCol.address.trim() }]);
    setNewCol(BLANK);
  };

  const enabled = draft.filter(c => c.enabled);
  const arrow = disabled => ({ width: 28, height: 28, borderRadius: 8, border: '1px solid #D2D8DE', background: '#FFFFFF', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1, fontWeight: 800, color: THEME.textMid });

  return (
    <Page onBack={onBack} crumbs={['Configuration']} title="Table Columns"
      subtitle="Choose and order the columns of the Tank Overview table view. Drag a row (or use the arrows) to reorder."
      actions={(
        <>
          {dirty && <Badge toneName="amber" dot>Unsaved changes</Badge>}
          <Button onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_STATION_COLS)))}>Reset to default</Button>
          <Button disabled={!dirty} onClick={() => setDraft(JSON.parse(JSON.stringify(colConfig)))}>Discard</Button>
          <Button variant="primary" icon="✓" disabled={!dirty} onClick={() => onSave(draft)}>Save columns</Button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="Preview" subtitle={`${enabled.length} visible columns, in order`} icon="▤" pad={14}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {enabled.map((c, i) => (
              <span key={c.id} style={{ padding: '6px 12px', borderRadius: 8, background: '#F4F6F8', border: '1px solid #E1E6EA', fontSize: 12.5, fontWeight: 700, color: THEME.textMid }}>
                <span style={{ color: THEME.textDim, marginRight: 6 }}>{i + 1}</span>{c.label}
              </span>
            ))}
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 18, alignItems: 'start' }}>
          <Card title="Columns" icon="⇅" pad={0}>
            {draft.map((c, i) => {
              const custom = !BUILT_IN.has(c.id);
              return (
                <div key={c.id} draggable
                  onDragStart={e => { dragIdx.current = i; e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => { e.preventDefault(); if (dropIdx !== i) setDropIdx(i); }}
                  onDrop={e => { e.preventDefault(); move(dragIdx.current, i); dragIdx.current = -1; setDropIdx(-1); }}
                  onDragEnd={() => { dragIdx.current = -1; setDropIdx(-1); }}
                  style={{
                    display: 'grid', gridTemplateColumns: '24px 46px minmax(140px,1fr) 110px minmax(120px,0.8fr) 64px 36px', gap: 10, alignItems: 'center',
                    padding: '8px 16px', borderTop: i ? '1px solid #EEF1F3' : 'none', opacity: c.enabled ? 1 : 0.55,
                    background: dropIdx === i ? THEME.accentSoft : '#FFFFFF', cursor: 'grab',
                  }}>
                  <span style={{ color: THEME.textDim, fontSize: 16 }}>⠿</span>
                  <Toggle size="sm" checked={c.enabled} onChange={v => update(c.id, 'enabled', v)} />
                  <Input value={c.label} onChange={e => update(c.id, 'label', e.target.value)} style={{ height: 32, fontWeight: 600 }} />
                  {custom
                    ? <Select value={c.dataType || 'REAL'} onChange={e => update(c.id, 'dataType', e.target.value)} options={DATA_TYPES} style={{ height: 32, fontSize: 13 }} />
                    : <Badge>{c.dataType || 'auto'}</Badge>}
                  {custom
                    ? <Input mono value={c.tagName} placeholder="Tag name" onChange={e => update(c.id, 'tagName', e.target.value)} style={{ height: 32 }} />
                    : <Mono style={{ color: THEME.textDim }}>built-in</Mono>}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={arrow(i === 0)} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                    <button style={arrow(i === draft.length - 1)} disabled={i === draft.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                  </div>
                  {custom
                    ? <button title="Delete column" onClick={() => setDraft(d => d.filter(x => x.id !== c.id))} style={{ height: 28, border: 'none', borderRadius: 8, background: '#FBE7E6', color: THEME.danger, cursor: 'pointer', fontWeight: 800 }}>✕</button>
                    : <span />}
                </div>
              );
            })}
          </Card>

          <Card title="Add custom column" icon="+" pad={16} style={{ position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Column title"><Input value={newCol.label} placeholder="e.g. Rectifier voltage" onChange={e => setNewCol(n => ({ ...n, label: e.target.value }))} /></Field>
              <Field label="Data type"><Select value={newCol.dataType} options={DATA_TYPES} onChange={e => setNewCol(n => ({ ...n, dataType: e.target.value }))} /></Field>
              <Field label="Live tag name" hint="The column shows this tag's live value"><Input mono value={newCol.tagName} placeholder="e.g. Tank_12_Voltage" onChange={e => setNewCol(n => ({ ...n, tagName: e.target.value }))} /></Field>
              <Field label="PLC address" hint="For reference"><Input mono value={newCol.address} placeholder="e.g. D820" onChange={e => setNewCol(n => ({ ...n, address: e.target.value }))} /></Field>
              <Button variant="primary" icon="+" disabled={!newCol.label.trim()} onClick={add}>Add column</Button>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
