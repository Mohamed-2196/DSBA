// The "where and what" fields of a thread, shared by the composer and the edit form.
import { Button, Chip, Select } from '../../../ui';
import { useModules } from '../../../state/modules';
import { YEARS, moduleLabel } from '../../../lib/modules';
import { useTaxonomy } from '../lib/taxonomy';
import { moduleCodeIn } from '../lib/threadForm';
import type { CategoryId } from '../types';

/** The categories offered, and the thread's own when it was retired since (it may stay there). */
export function CategorySelect({
  value,
  onChange,
  error,
}: {
  value: CategoryId;
  onChange: (id: CategoryId) => void;
  error?: string | null;
}) {
  const { categories, getCategory } = useTaxonomy();
  const current = getCategory(value);
  const shown = current?.retired ? [...categories, current] : categories;
  return (
    <Select
      label="Post in"
      value={value}
      error={error ?? undefined}
      onChange={(e) => {
        const c = getCategory(e.target.value);
        if (c) onChange(c.id);
      }}
      options={shown.map((c) => ({ value: c.id, label: c.retired ? `${c.label} (retired)` : c.label }))}
      data-hub="composer-category"
    />
  );
}

/**
 * The modules a thread can be about: a year's category offers that year's modules only (ST-51); a category for every
 * year offers them all, by year. A module from elsewhere that the thread has already stays listed.
 */
export function ModuleSelect({
  value,
  category,
  onChange,
  error,
}: {
  value: string;
  /** where the thread goes: its year decides the modules offered */
  category: CategoryId;
  onChange: (id: string) => void;
  error?: string | null;
}) {
  const { getModule, getModulesForYear } = useModules();
  const { getCategory } = useTaxonomy();
  const year = getCategory(category)?.year ?? null;
  const offered = year ? getModulesForYear(year) : [];
  const current = getModule(value);
  const kept = year && current && !offered.some((m) => m.id === current.id) ? current : null;
  return (
    <Select
      label="Module"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      hint={year ? `Optional. Year ${year} modules` : 'Optional'}
      error={error ?? undefined}
      data-hub="composer-module"
    >
      <option value="">No specific module</option>
      {year
        ? [...offered, ...(kept ? [kept] : [])].map((m) => (
            <option key={m.id} value={m.id}>
              {moduleLabel(m)}
            </option>
          ))
        : YEARS.map((y) => (
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

/**
 * A module code in the title ("MT1186: …") that isn't the thread's module yet: one tap tags it (ST-51). Picking it
 * moves a year's thread to the module's year (lib/placement.ts).
 */
export function ModuleFromTitle({
  title,
  moduleId,
  onPick,
}: {
  title: string;
  moduleId: string;
  onPick: (id: string) => void;
}) {
  const { getModuleByUnitCode } = useModules();
  const found = getModuleByUnitCode(moduleCodeIn(title));
  if (!found || found.id === moduleId) return null;
  return (
    <p className="forum-composer__suggest" data-hub="composer-module-suggestion">
      <span>
        Your title mentions {found.unitCode}, {found.name}.
      </span>
      <Button size="sm" onClick={() => onPick(found.id)}>
        Tag {found.unitCode}
      </Button>
    </p>
  );
}

/** The tags offered, and those the thread has that were retired since (they may stay, or go). */
export function TagPicker({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  error?: string | null;
}) {
  const { tags: offered, getTag, maxTags, ready } = useTaxonomy();
  const kept = value.map((id) => getTag(id)).filter((t) => t?.retired === true);
  const tags = [...offered, ...kept.filter((t) => t !== null)];
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
