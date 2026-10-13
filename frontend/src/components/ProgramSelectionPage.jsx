import { useRef, useState } from 'react';
import { loadProgramValues, saveProgramValues } from '../config/programSelection';
import { RECIPES, recipeByNo } from '../config/recipes';
import { THEME, FONT_COND } from '../theme';
import { Card, Grid, Input, Button, Badge, SavedNote, Segmented, Field } from '../ui/kit';

// Recipes — what's running now, what's queued next, and the recipe library to
// queue from. Stored exactly as before: { selected: "3", running: "2" }
// (recipe numbers as strings; empty = none).

const badNo = v => v !== '' && !/^\d+$/.test(v);
const tidy = values => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && !badNo(v)));

function RecipeSummary({ recipe, emptyText }) {
  if (!recipe) return <div style={{ fontSize: 14, color: THEME.textDim }}>{emptyText}</div>;
  return (
    <>
      <div style={{ fontFamily: FONT_COND, fontSize: 26, fontWeight: 700, color: THEME.text, lineHeight: 1.1 }}>{recipe.name}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <Badge toneName="info">{recipe.line} line</Badge>
        <Badge>{recipe.coating}</Badge>
        {recipe.thickness !== '—' && <Badge>{recipe.thickness}</Badge>}
        <Badge toneName="violet">{recipe.minutes} min cycle</Badge>
      </div>
    </>
  );
}

export default function ProgramSelectionPage() {
  const [values, setValues] = useState(loadProgramValues);
  const [flash, setFlash] = useState(false);
  const [lineFilter, setLineFilter] = useState('All');
  const flashTimer = useRef(null);

  const save = next => {
    if (Object.values(next).some(badNo)) return;
    saveProgramValues(tidy(next));
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1400);
  };
  const setField = (id, value) => { setFlash(false); setValues(v => ({ ...v, [id]: value })); };
  const queue = no => { const next = { ...values, selected: String(no) }; setValues(next); save(next); };
  const startQueued = () => { if (!values.selected) return; const next = { ...values, running: values.selected, selected: '' }; setValues(next); save(next); };

  const running = recipeByNo(values.running);
  const queued  = recipeByNo(values.selected);
  const library = RECIPES.filter(r => lineFilter === 'All' || r.line === lineFilter || r.line === 'Both');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={{ borderRadius: 14, padding: 20, color: '#FFFFFF', background: `linear-gradient(135deg, ${THEME.frame}, #24414A)`, boxShadow: '0 10px 26px rgba(22,27,34,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#9FD9DD' }}>NOW RUNNING</span>
            <span style={{ fontFamily: FONT_COND, fontSize: 38, fontWeight: 700, color: THEME.amber, lineHeight: 1 }}>{values.running ? `R${values.running}` : '—'}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            {running
              ? <><div style={{ fontFamily: FONT_COND, fontSize: 26, fontWeight: 700 }}>{running.name}</div>
                  <div style={{ fontSize: 13, color: '#C9D1D9', marginTop: 4 }}>{running.steps.join(' → ')}</div></>
              : <div style={{ fontSize: 14, color: '#C9D1D9' }}>{values.running ? 'Recipe not in library' : 'No recipe running'}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 16 }}>
            <Field label={<span style={{ color: '#C9D1D9' }}>Running recipe no.</span>} style={{ width: 160 }}>
              <Input type="number" min="0" step="1" value={values.running ?? ''} placeholder="—" invalid={badNo(values.running ?? '')}
                onChange={e => setField('running', e.target.value)} onBlur={() => save(values)}
                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
            </Field>
          </div>
        </div>

        <Card title="Queued next" icon="⏭" actions={<SavedNote show={flash} />}>
          <RecipeSummary recipe={queued} emptyText={values.selected ? `Recipe R${values.selected} (not in library)` : 'Nothing queued — pick a recipe from the library below.'} />
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Button variant="primary" icon="▶" disabled={!values.selected} onClick={startQueued}>Make it the running recipe</Button>
            {values.selected && <Button variant="ghost" onClick={() => { const next = { ...values, selected: '' }; setValues(next); save(next); }}>Clear queue</Button>}
          </div>
        </Card>
      </div>

      <Card title="Recipe library" subtitle={`${library.length} recipes`} icon="☰"
        actions={<Segmented size="sm" value={lineFilter} onChange={setLineFilter} options={['All', 'Barrel', 'Basket']} />}>
        <Grid min={260} gap={12}>
          {library.map(r => {
            const isRun = String(r.no) === String(values.running);
            const isQ = String(r.no) === String(values.selected);
            return (
              <div key={r.no} style={{
                borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
                border: `1px solid ${isQ ? THEME.accent : '#E1E6EA'}`, background: isRun ? '#F1FAF9' : '#FFFFFF',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: FONT_COND, fontSize: 22, fontWeight: 700, color: THEME.accentDark }}>R{r.no}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: THEME.text }}>{r.name}</span>
                </div>
                <div style={{ fontSize: 12.5, color: THEME.textDim }}>{r.line} line · {r.finish} · {r.minutes} min</div>
                <div style={{ fontSize: 12.5, color: THEME.textMid, lineHeight: 1.45 }}>{r.steps.join(' → ')}</div>
                <div style={{ marginTop: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isRun && <Badge toneName="ok" dot>Running</Badge>}
                  {isQ && <Badge toneName="info">Queued</Badge>}
                  <div style={{ flex: 1 }} />
                  {!isQ && <Button size="sm" onClick={() => queue(r.no)}>Queue next</Button>}
                </div>
              </div>
            );
          })}
        </Grid>
      </Card>
    </div>
  );
}
