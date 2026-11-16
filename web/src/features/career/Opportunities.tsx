import { useEffect, useMemo, useState } from 'react';
import type { ModuleSummary } from '../../api/types';
import { useDebouncedValue, useQueryParam, useSetQueryParams } from '../../state';
import { useModules } from '../../state/modules';
import { Button, EmptyState, glyph, Icon, PageSection, Panel, Select } from '../../ui';
import { BoardFilters, type FacetGroup } from './BoardFilters';
import { useCareerData } from './context';
import { EmployerCard } from './EmployerCard';
import { useApplicationDates } from './useApplicationDates';
import {
  OFFER_ORDER,
  facetCounts,
  filterEmployers,
  isFacet,
  isFiltered,
  listParam,
  parseList,
  parseSort,
  resultsLine,
  sectorsOf,
  sortEmployers,
  type BoardFilters as Filters,
} from './lib/board';
import { ModuleLink } from './ModuleLink';
import './Opportunities.css';

/**
 * Vacancies, laid out as a search: filters down the side, the results beside them with how many match and a
 * sort, each employer one row. Everything lives in the URL: ?q= the search, ?type=, ?track= and ?sector= comma lists,
 * ?sort=name or closing, ?all=1 every employer when nothing narrows the list.
 */
export function Opportunities() {
  const data = useCareerData();
  const { getModule } = useModules();
  const setParams = useSetQueryParams();
  const tracks = useMemo(() => new Map(data.tracks.map((t) => [t.id, t])), [data.tracks]);
  const sectors = useMemo(() => sectorsOf(data.employers), [data.employers]);
  const applications = useApplicationDates();
  const closes = useMemo(() => new Map([...applications].map(([id, a]) => [id, a.closes])), [applications]);

  const [qParam] = useQueryParam('q', '');
  const [typeParam] = useQueryParam('type');
  const [trackParam] = useQueryParam('track');
  const [sectorParam] = useQueryParam('sector');
  const [sortParam, setSort] = useQueryParam('sort');
  const [allParam, setAll] = useQueryParam('all');

  const filters: Filters = useMemo(
    () => ({
      q: qParam,
      type: parseList(typeParam, new Set(OFFER_ORDER)),
      track: parseList(trackParam, new Set(tracks.keys())),
      sector: parseList(sectorParam, new Set(sectors)),
    }),
    [qParam, typeParam, trackParam, sectorParam, tracks, sectors],
  );
  const sort = parseSort(sortParam, closes.size > 0);

  // The box answers every key; the URL (and so the list) follows once typing settles.
  const [search, setSearch] = useState(qParam);
  const settled = useDebouncedValue(search, 250);
  useEffect(() => {
    if (settled.trim() !== qParam) setParams({ q: settled.trim() || null }, { replace: true });
    // Only typing writes the URL; a URL change (Reset, back) is mirrored into the box below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);
  useEffect(() => {
    if (qParam !== settled.trim()) setSearch(qParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam]);

  const matches = useMemo(
    () => sortEmployers(filterEmployers(data.employers, filters), sort, closes),
    [data.employers, filters, sort, closes],
  );
  const filtered = isFiltered(filters);
  const foldable = !filtered && matches.length > data.initialCount;
  const folded = foldable && allParam !== '1';
  const shown = folded ? matches.slice(0, data.initialCount) : matches;

  const groups: FacetGroup[] = [
    {
      facet: 'type',
      title: 'What’s offered',
      options: OFFER_ORDER.map((id) => ({ id, label: data.offerTypes[id].plural })),
      counts: facetCounts(data.employers, filters, 'type'),
      picked: filters.type,
    },
    {
      facet: 'track',
      title: 'Track',
      options: data.tracks.map((t) => ({ id: t.id, label: t.label })),
      counts: facetCounts(data.employers, filters, 'track'),
      picked: filters.track,
    },
    {
      facet: 'sector',
      title: 'Sector',
      options: sectors.map((s) => ({ id: s, label: s })),
      counts: facetCounts(data.employers, filters, 'sector'),
      picked: filters.sector,
    },
  ];

  const toggle = (facet: string, id: string, on: boolean) => {
    if (!isFacet(facet)) return;
    const next = on ? [...filters[facet], id] : filters[facet].filter((v) => v !== id);
    setParams({ [facet]: listParam(next) }, { replace: true });
  };
  const reset = () => {
    setSearch('');
    setParams({ q: null, type: null, track: null, sector: null }, { replace: true });
  };

  // One track picked: what it means, and the modules closest to it.
  const active = filters.track.length === 1 ? (tracks.get(filters.track[0]) ?? null) : null;
  const closest = active ? active.modules.map((id) => getModule(id)).filter((m): m is ModuleSummary => m !== null) : [];

  const sortOptions = [
    { value: 'suggested', label: 'Suggested' },
    { value: 'name', label: 'Name, A to Z' },
    ...(closes.size ? [{ value: 'closing', label: 'Closing soonest' }] : []),
  ];

  return (
    <PageSection
      id="career-opportunities"
      className="career-opps"
      aria-labelledby="career-opps-title"
      data-hub="career-opps"
    >
      <h2 id="career-opps-title" className="visually-hidden">
        Vacancies
      </h2>

      <div className="career-board">
        <BoardFilters
          label="Search employers or programmes"
          placeholder="Search employers"
          noun={{ one: 'employer', many: 'employers' }}
          searching={filters.q.trim() !== ''}
          search={search}
          onSearch={setSearch}
          groups={groups}
          onToggle={toggle}
          onReset={reset}
        />

        <div className="career-results">
          <div className="career-results__bar">
            <p className="career-results__count" aria-live="polite" data-hub="career-count">
              {resultsLine(shown.length, matches.length)}
            </p>
            <div className="career-results__sort">
              <span className="career-results__sort-label" aria-hidden="true">
                Sort by:
              </span>
              <Select
                label="Sort by"
                hideLabel
                options={sortOptions}
                value={sort}
                onChange={(e) =>
                  setSort(e.currentTarget.value === 'suggested' ? null : e.currentTarget.value, { replace: true })
                }
                data-hub="career-sort"
              />
            </div>
          </div>

          {active ? (
            <p className="career-opps__about" data-hub="career-track-note">
              <span className="career-opps__about-text">{active.about}</span>
              {closest.length ? (
                <span className="career-opps__about-mods">
                  <span className="career-opps__about-label">Closest modules</span>
                  {closest.map((m) => (
                    <ModuleLink key={m.id} module={m} />
                  ))}
                </span>
              ) : null}
            </p>
          ) : null}

          {shown.length ? (
            <ul
              role="list"
              className="career-emps"
              aria-label={`${matches.length} ${matches.length === 1 ? 'employer' : 'employers'}`}
            >
              {shown.map((e) => (
                <EmployerCard
                  key={e.id}
                  employer={e}
                  picked={filters.track}
                  tracks={tracks}
                  application={applications.get(e.id)}
                />
              ))}
            </ul>
          ) : (
            <Panel padding="none" className="career-opps__empty">
              <EmptyState
                mate="loupe"
                title={data.employers.length ? 'No employer matches' : 'No employers listed yet'}
                body={
                  data.employers.length
                    ? 'Try other words, or take a filter off.'
                    : 'Employers show up here once the list is filled in.'
                }
                action={
                  data.employers.length ? (
                    <Button variant="secondary" size="sm" onClick={reset}>
                      Show all employers
                    </Button>
                  ) : null
                }
              />
            </Panel>
          )}

          {foldable ? (
            <div className="career-opps__more">
              <Button
                variant="secondary"
                trailingIcon={<Icon glyph={folded ? glyph.chevronDown : glyph.chevronUp} />}
                aria-expanded={!folded}
                onClick={() => setAll(folded ? '1' : null, { replace: true })}
                data-hub="career-show-all"
              >
                {folded ? `Show all ${matches.length} employers` : 'Show fewer'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </PageSection>
  );
}
