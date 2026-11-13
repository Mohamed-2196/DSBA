// The side of a Career Navigator list (the vacancies, the certificates): a search, the filters that are on (each one
// removable, and Reset), then a folding group for each filter. Each option shows how many items it would leave. On a
// narrow screen the groups sit behind a Filters button, so the results stay near the top.
import { useId, useState, type ReactNode } from 'react';
import { Button, glyph, Icon, SearchField, cx } from '../../ui';

export interface FacetOption {
  id: string;
  label: string;
}

export interface FacetGroup {
  /** the filter's name in the URL and in data-hub ('type', 'track', 'effort', ...) */
  facet: string;
  title: string;
  options: readonly FacetOption[];
  /** facetCounts()-style counts: how many items each option would leave */
  counts: Readonly<Record<string, number>>;
  /** the options picked now */
  picked: readonly string[];
}

/** What the list holds, for counts and labels: 'employer' / 'employers'. */
export interface Noun {
  one: string;
  many: string;
}

function Group({
  group,
  noun,
  startOpen,
  onToggle,
}: {
  group: FacetGroup;
  noun: Noun;
  startOpen: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  const { picked } = group;
  const [open, setOpen] = useState(startOpen || picked.length > 0);
  const panelId = useId();
  return (
    <section className={cx('career-filter', open && 'is-open')} data-hub="career-filter" data-facet={group.facet}>
      <h3 className="career-filter__head">
        <button
          type="button"
          className="career-filter__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <span>{group.title}</span>
          {picked.length ? <span className="career-filter__count">{picked.length}</span> : null}
          <Icon glyph={glyph.chevronDown} className="career-filter__caret" />
        </button>
      </h3>
      <ul role="list" id={panelId} className="career-filter__options" hidden={!open}>
        {group.options.map((o) => {
          const on = picked.includes(o.id);
          const count = group.counts[o.id] ?? 0;
          return (
            <li key={o.id}>
              <label className={cx('career-filter__option', !on && !count && 'is-empty')}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => onToggle(o.id, e.currentTarget.checked)}
                  data-hub={`career-${group.facet}`}
                  data-option-id={o.id}
                />
                <span className="career-filter__label">{o.label}</span>
                <span className="career-filter__n" aria-label={`${count} ${count === 1 ? noun.one : noun.many}`}>
                  {count}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BoardFilters({
  label,
  placeholder,
  noun,
  search,
  searching,
  onSearch,
  groups,
  onToggle,
  onReset,
}: {
  /** the side's name, and the search box's: 'Search and filter employers', 'Search employers or programmes' */
  label: string;
  placeholder: string;
  noun: Noun;
  /** what is in the search box (the list follows once typing settles) */
  search: string;
  /** a search narrows the list now */
  searching: boolean;
  onSearch: (value: string) => void;
  groups: readonly FacetGroup[];
  onToggle: (facet: string, id: string, on: boolean) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const active = groups.flatMap((g) =>
    g.picked.map((id) => ({ facet: g.facet, id, label: g.options.find((o) => o.id === id)?.label ?? id })),
  );
  const pills: ReactNode[] = active.map(({ facet, id, label: text }) => (
    <li key={`${facet}-${id}`}>
      <button
        type="button"
        className="career-active__pill"
        onClick={() => onToggle(facet, id, false)}
        data-hub="career-active-filter"
      >
        {text}
        <Icon glyph={glyph.close} size={14} />
        <span className="visually-hidden">, remove this filter</span>
      </button>
    </li>
  ));

  return (
    <aside className="career-filters" aria-label={`Search and filter ${noun.many}`} data-open={open || undefined}>
      <SearchField
        value={search}
        onValueChange={onSearch}
        onClear={() => onSearch('')}
        placeholder={placeholder}
        label={label}
        className="career-filters__search"
        data-hub="career-search"
      />

      <Button
        variant="secondary"
        className="career-filters__open"
        leadingIcon={<Icon glyph={glyph.filter} />}
        trailingIcon={<Icon glyph={open ? glyph.chevronUp : glyph.chevronDown} />}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        {active.length ? `Filters (${active.length})` : 'Filters'}
      </Button>

      <div id={bodyId} className="career-filters__body">
        {active.length || searching ? (
          <section className="career-active" aria-labelledby={`${bodyId}-active`}>
            <div className="career-active__head">
              <h3 id={`${bodyId}-active`} className="career-active__title">
                Active filters
              </h3>
              <button type="button" className="career-active__reset" onClick={onReset} data-hub="career-reset">
                Reset
              </button>
            </div>
            {pills.length ? (
              <ul role="list" className="career-active__pills">
                {pills}
              </ul>
            ) : null}
          </section>
        ) : null}
        {groups.map((g, i) => (
          <Group
            key={g.facet}
            group={g}
            noun={noun}
            startOpen={i < 2}
            onToggle={(id, on) => onToggle(g.facet, id, on)}
          />
        ))}
      </div>
    </aside>
  );
}
