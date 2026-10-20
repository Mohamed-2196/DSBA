// Roles: what each job is, its tools, the skills it needs (most important first), the question students ask seniors
// about it, and, for a skill, a step of its own instead of the skill's usual one.
import { useState } from 'react';
import type { CareerRole } from '../../../../api/types';
import { Button, glyph, Icon, IconButton, Select, TextArea, TextField } from '../../../../ui';
import { freeId, moveItem, removalBlocker, removeItem, savedIdsOf } from '../doc';
import { PickList, StepField, WordList } from '../fields';
import { ItemList } from '../ItemList';
import { useEditor } from '../state';
import { IdField } from './common';
import { useItemSetter, useNameToId } from '../hooks';

export function RolesSection() {
  const { doc, update, err } = useEditor();
  const set = useItemSetter('roles');
  return (
    <>
      <div className="cedit-grid">
        <Select
          label="The page opens on"
          hint="The role students see first."
          value={doc.defaultRoleId}
          onChange={(v) => update((d) => ({ ...d, defaultRoleId: v.target.value }))}
          options={doc.roles.filter((r) => !r.hidden).map((r) => ({ value: r.id, label: r.label || r.id }))}
          error={err('defaultRoleId')}
        />
      </div>
      <ItemList
        section="roles"
        noun="role"
        items={doc.roles}
        idOf={(r) => r.id}
        titleOf={(r) => r.label}
        metaOf={(r) => `${r.skills.length} skills${r.id === doc.defaultRoleId ? ' · the page opens on it' : ''}`}
        isHidden={(r) => r.hidden}
        onHide={(id, hidden) => set(id, { hidden })}
        onMove={(from, by) => update((d) => ({ ...d, roles: moveItem(d.roles, from, by) }))}
        onRemove={(id) => update((d) => removeItem(d, 'role', id))}
        blocker={(id) => removalBlocker(doc, 'role', id)}
        onAdd={() => {
          const id = freeId('new', savedIdsOf(doc, 'roles'));
          update((d) => ({
            ...d,
            roles: [
              ...d.roles,
              { id, label: '', title: '', about: '', tools: [], skills: [], ask: '', close: {}, hidden: false },
            ],
          }));
          return id;
        }}
      >
        {(r, i) => <RoleForm role={r} index={i} />}
      </ItemList>
    </>
  );
}

function RoleForm({ role: r, index }: { role: CareerRole; index: number }) {
  const { doc, err } = useEditor();
  const set = useItemSetter('roles');
  const nameToId = useNameToId('roles', 'role');
  const at = `roles.${index}`;
  const skills = Object.entries(doc.skills).map(([id, s]) => ({ value: id, label: s.name }));
  return (
    <div className="cedit-form">
      <div className="cedit-grid">
        <TextField
          label="Name"
          hint="On the role’s chip."
          value={r.label}
          onChange={(v) => set(r.id, { label: v.target.value })}
          onBlur={() => nameToId(r.id, r.label)}
          error={err(`${at}.label`)}
          maxLength={60}
          required
        />
        <TextField
          label="Title"
          hint="Above what the role is."
          value={r.title}
          onChange={(v) => set(r.id, { title: v.target.value })}
          error={err(`${at}.title`)}
          maxLength={160}
          required
        />
        <IdField section="roles" kind="role" id={r.id} error={err(`${at}.id`)} />
      </div>
      <TextArea
        label="What the job is"
        rows={3}
        value={r.about}
        onChange={(v) => set(r.id, { about: v.target.value })}
        error={err(`${at}.about`)}
        maxLength={600}
        required
      />
      <WordList
        label="Tools"
        hint="Type one and press Enter."
        value={r.tools}
        onChange={(tools) => set(r.id, { tools })}
        error={err(`${at}.tools`)}
      />
      <PickList
        label="Skills it needs"
        hint="The most important first. The electives guide reads these too."
        value={r.skills}
        options={skills}
        onChange={(next) => set(r.id, { skills: next })}
        addLabel="Add a skill"
        error={err(`${at}.skills`)}
      />
      <TextField
        label="Question for seniors"
        hint="“Ask seniors about this role” starts a thread with it."
        value={r.ask}
        onChange={(v) => set(r.id, { ask: v.target.value })}
        error={err(`${at}.ask`)}
        maxLength={600}
        required
      />
      <OwnSteps role={r} index={index} />
    </div>
  );
}

/** Steps this role gives for a skill instead of the skill's own. */
function OwnSteps({ role: r, index }: { role: CareerRole; index: number }) {
  const { doc } = useEditor();
  const set = useItemSetter('roles');
  const [adding, setAdding] = useState('');
  const free = r.skills.filter((s) => !(s in r.close));
  return (
    <fieldset className="cedit-group">
      <legend className="cedit-group__legend">This role’s own steps</legend>
      <p className="cedit__note">
        For a skill the modules don’t teach far enough, this role can point somewhere other than the skill’s usual step.
      </p>
      {Object.entries(r.close).map(([skill, step]) => (
        <div key={skill} className="cedit-step">
          <StepField
            legend={doc.skills[skill]?.name ?? skill}
            value={step}
            noneLabel="Use the skill’s own step"
            path={`roles.${index}.close.${skill}`}
            onChange={(next) => {
              const close = { ...r.close };
              if (next) close[skill] = next;
              else delete close[skill];
              set(r.id, { close });
            }}
          />
          <IconButton
            icon={<Icon glyph={glyph.trash} />}
            label={`Remove the step for ${doc.skills[skill]?.name ?? skill}`}
            onClick={() => {
              const close = { ...r.close };
              delete close[skill];
              set(r.id, { close });
            }}
          />
        </div>
      ))}
      {free.length ? (
        <div className="cedit-pick__row">
          <Select
            label="Skill"
            hideLabel
            value={adding}
            onChange={(v) => setAdding(v.target.value)}
            options={[
              { value: '', label: 'Choose a skill' },
              ...free.map((s) => ({ value: s, label: doc.skills[s]?.name ?? s })),
            ]}
          />
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Icon glyph={glyph.plus} />}
            disabled={!adding}
            onClick={() => {
              set(r.id, { close: { ...r.close, [adding]: { kind: 'opps', text: '' } } });
              setAdding('');
            }}
          >
            Add a step
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
