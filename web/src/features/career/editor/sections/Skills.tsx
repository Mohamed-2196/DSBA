// Skills: which modules teach each one and how far, a note when they don't go far enough, and the usual step to
// close the gap. Electives: which modules a student chooses. The electives guide is built from both, with the roles.
import { useMemo } from 'react';
import type { CareerSkill, SkillTaught } from '../../../../api/types';
import { moduleLabel } from '../../../../lib/modules';
import { useModules } from '../../../../state/modules';
import { Button, glyph, Icon, IconButton, Select, TextArea, TextField } from '../../../../ui';
import { electives } from '../../lib/electives';
import { freeId, publicDoc, removeItem, savedIdsOf } from '../doc';
import { StepField } from '../fields';
import { ItemList } from '../ItemList';
import { useEditor } from '../state';
import { IdField } from './common';
import { useModuleOptions, useNameToId } from '../hooks';

type SkillRow = CareerSkill & { id: string };

export function SkillsSection() {
  const { doc, update } = useEditor();
  const rows: SkillRow[] = Object.entries(doc.skills).map(([id, s]) => ({ ...s, id }));
  return (
    <ItemList
      section="skills"
      noun="skill"
      items={rows}
      idOf={(s) => s.id}
      titleOf={(s) => s.name}
      metaOf={(s) => {
        const roles = doc.roles.filter((r) => r.skills.includes(s.id)).length;
        return `${s.taught.length === 1 ? '1 module' : `${s.taught.length} modules`} · ${roles === 1 ? '1 role' : `${roles} roles`}`;
      }}
      onRemove={(id) => update((d) => removeItem(d, 'skill', id))}
      onAdd={() => {
        const id = freeId('new', savedIdsOf(doc, 'skills'));
        update((d) => ({ ...d, skills: { ...d.skills, [id]: { name: '', taught: [], gapNote: null, close: null } } }));
        return id;
      }}
    >
      {(s) => <SkillForm skill={s} />}
    </ItemList>
  );
}

function SkillForm({ skill: s }: { skill: SkillRow }) {
  const { doc, update, err } = useEditor();
  const nameToId = useNameToId('skills', 'skill');
  const modules = useModuleOptions();
  const at = `skills.${s.id}`;
  const set = (patch: Partial<CareerSkill>) =>
    update((d) => ({ ...d, skills: { ...d.skills, [s.id]: { ...(d.skills[s.id] as CareerSkill), ...patch } } }));
  const setTaught = (n: number, patch: Partial<SkillTaught>) =>
    set({ taught: s.taught.map((t, k) => (k === n ? { ...t, ...patch } : t)) });
  const depths = (['0', '1', '2', '3'] as const).map((d) => ({ value: d, label: doc.depthLabel[d] ?? d }));
  return (
    <div className="cedit-form">
      <div className="cedit-grid">
        <TextField
          label="Name"
          value={s.name}
          onChange={(v) => set({ name: v.target.value })}
          onBlur={() => nameToId(s.id, s.name)}
          error={err(`${at}.name`)}
          maxLength={160}
          required
        />
        <IdField section="skills" kind="skill" id={s.id} error={err(`${at}.id`)} />
      </div>
      <fieldset className="cedit-group">
        <legend className="cedit-group__legend">Taught in</legend>
        <ol role="list" className="cedit-rows">
          {s.taught.map((t, n) => (
            <li key={n} className="cedit-rows__row cedit-rows__row--taught">
              <Select
                label="Module"
                value={t.module}
                onChange={(v) => setTaught(n, { module: v.target.value })}
                options={modules}
                error={err(`${at}.taught.${n}.module`)}
              />
              <Select
                label="How far"
                value={String(t.depth)}
                onChange={(v) => setTaught(n, { depth: Number(v.target.value) as SkillTaught['depth'] })}
                options={depths}
              />
              <TextField
                label="What it covers"
                value={t.what}
                onChange={(v) => setTaught(n, { what: v.target.value })}
                error={err(`${at}.taught.${n}.what`)}
                maxLength={600}
                required
              />
              <IconButton
                icon={<Icon glyph={glyph.trash} />}
                label={`Remove module ${n + 1}`}
                onClick={() => set({ taught: s.taught.filter((_, k) => k !== n) })}
                className="cedit-rows__remove"
              />
            </li>
          ))}
        </ol>
        {s.taught.length < 20 ? (
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<Icon glyph={glyph.plus} />}
            onClick={() =>
              set({ taught: [...s.taught, { module: String(modules[0]?.value ?? ''), depth: 2, what: '' }] })
            }
          >
            Add a module
          </Button>
        ) : null}
      </fieldset>
      <TextArea
        label="When the modules don’t go far enough"
        hint="Optional. Shown with the step below."
        rows={2}
        value={s.gapNote ?? ''}
        onChange={(v) => set({ gapNote: v.target.value || null })}
        error={err(`${at}.gapNote`)}
        maxLength={600}
      />
      <StepField
        legend="The usual step to close the gap"
        value={s.close ?? null}
        onChange={(close) => set({ close })}
        path={`${at}.close`}
      />
    </div>
  );
}

const CHOICES = [
  { value: '', label: 'Compulsory' },
  { value: 'option', label: 'Option (one of a pair)' },
  { value: 'elective', label: 'Elective' },
];

export function ElectivesSection() {
  const { doc, update, err } = useEditor();
  const { modules } = useModules();
  const guide = useMemo(() => electives(publicDoc(doc), modules), [doc, modules]);
  const years = [1, 2, 3].map((y) => ({ year: y, list: modules.filter((m) => m.year === y) }));
  const choose = (id: string, value: string) =>
    update((d) => {
      const chosen = { ...d.chosen };
      if (value === 'option' || value === 'elective') chosen[id] = value;
      else delete chosen[id];
      return { ...d, chosen };
    });
  return (
    <div className="cedit-form">
      <p className="cedit__note">
        Which modules a student chooses. The electives guide lists the electives, with the skills each teaches (from
        Skills) and the roles that need them (from Roles).
      </p>
      {err('chosen') ? <p className="cedit__error">{err('chosen')}</p> : null}
      {years.map(({ year, list }) =>
        list.length ? (
          <fieldset key={year} className="cedit-group">
            <legend className="cedit-group__legend">{`Year ${year}`}</legend>
            <ul role="list" className="cedit-choices">
              {list.map((m) => (
                <li key={m.id}>
                  <Select
                    label={moduleLabel(m)}
                    value={doc.chosen[m.id] ?? ''}
                    onChange={(v) => choose(m.id, v.target.value)}
                    options={CHOICES}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null,
      )}
      <section className="cedit-preview" aria-label="The electives guide">
        <h5 className="cedit-preview__title">Preview of the electives guide</h5>
        {guide.length ? (
          <ul role="list" className="cedit-guide">
            {guide.map((g) => (
              <li key={g.module.id}>
                <strong>{moduleLabel(g.module)}</strong>
                <span>
                  {g.skills.length
                    ? g.skills.map((s) => `${s.name}${s.adds ? ' (adds)' : ''}`).join(', ')
                    : 'No skills listed yet.'}
                </span>
                <span className="cedit__note">
                  {g.roles.length ? `Roles: ${g.roles.map((r) => r.label).join(', ')}` : 'No roles yet.'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cedit__empty">No electives chosen yet: the guide doesn’t show.</p>
        )}
      </section>
    </div>
  );
}
