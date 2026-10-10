// The "where and what" fields of a thread, shared by the composer and the edit form.
import { Chip, Select } from '../../../ui';
import { useModules } from '../../../state/modules';
import { YEARS, moduleLabel } from '../../../lib/modules';
import { useTaxonomy } from '../lib/taxonomy';
import type { CategoryId } from '../types';

export function CategorySelect({ value, onChange, error }: { value: CategoryId; onChange: (id: CategoryId) => void; error?: string | null }) {
  const { categories, getCategory } = useTaxonomy();
  return (
    <Select
      label="Post in"
      value={value}
      error={error ?? undefined}
      onChange={(e) => {
        const c = getCategory(e.target.value);
        if (c) onChange(c.id);
      }}
      options={categories.map((c) => ({ value: c.id, label: c.label }))}
      data-hub="composer-category"
    />
  );
}

export function ModuleSelect({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string | null }) {
  const { getModulesForYear } = useModules();
  return (
    <Select label="Module" value={value} onChange={(e) => onChange(e.target.value)} hint="Optional" error={error ?? undefined} data-hub="composer-module">
      <option value="">No specific module</option>
      {YEARS.map((y) => (
        <optgroup key={y} label={`Year ${y}`}>
          {getModulesForYear(y).map((m) => (
            <option key={m.id} value={m.id}>
              {moduleLabel(m)}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function TagPicker({ value, onChange, error }: { value: string[]; onChange: (tags: string[]) => void; error?: string | null }) {
  const { tags, maxTags, ready } = useTaxonomy();
  const full = value.length >= maxTags;
  return (
    <fieldset className="forum-composer__tags" aria-busy={!ready || undefined}>
      <legend className="forum-composer__legend">
        Tags <span className="forum-composer__legend-hint">Up to {maxTags}, so people can find it later</span>
      </legend>
      <div className="forum-composer__chips">
        {tags.map((t) => {
          const on = value.includes(t.id);
          return (
            <Chip
              key={t.id}
              size="sm"
              selected={on}
              disabled={!on && full}
              onChange={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id].slice(0, maxTags))}
            >
              {t.label}
            </Chip>
          );
        })}
        {!ready ? <span className="forum-composer__legend-hint">Loading tags…</span> : null}
      </div>
      {error ? (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
