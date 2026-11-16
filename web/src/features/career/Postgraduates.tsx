// Postgraduates: master's courses and scholarships for students heading to further study, laid out like the
// vacancies: a search and filters (kind and region) down the side, the results beside them with how many match and a
// sort (the soonest to close first, if asked), one per row with the days left to apply.
import { useEffect, useMemo, useState } from 'react';
import type { FurtherStudyOption } from '../../api/types';
import { useAuth } from '../../auth';
import { todayKey, type DayKey } from '../../lib/dates';
import { hostOf } from '../../lib/share';
import { useDebouncedValue, useQueryParam, useSetQueryParams } from '../../state';
import { Button, EmptyState, glyph, Icon, PageSection, Panel, Select } from '../../ui';
import { ProjectedClass } from '../grades/public';
import { BoardFilters, type FacetGroup } from './BoardFilters';
import { useCareerData } from './context';
import { listParam, parseList, resultsLine } from './lib/board';
import { appPath, webUrl } from './lib/links';
import {
  STUDY_KINDS,
  daysToApply,
  filterStudy,
  isStudyFacet,
  parseStudySort,
  regionsOf,
  sortStudy,
  studyCounts,
  studyFiltered,
  type StudyFilters,
} from './lib/postgrad';
import './Opportunities.css';
import './Postgraduates.css';

const NOUN = { one: 'course or scholarship', many: 'courses and scholarships' };
const KIND_LABEL = { course: 'Master’s course', scholarship: 'Scholarship' } as const;
const KIND_PLURAL = { course: 'Master’s courses', scholarship: 'Scholarships' } as const;

function StudyRow({ option: o, today }: { option: FurtherStudyOption; today: DayKey }) {
  const url = webUrl(o.url);
  const left = daysToApply(o.closes, today);
  return (
    <li className="career-emp career-study-row" data-hub="career-study-option">
      <span className="career-study-row__icon" aria-hidden="true">
        <Icon glyph={o.kind === 'scholarship' ? glyph.medal : glyph.cap} />
      </span>
      <div className="career-emp__main">
        <h3 className="career-emp__name">{o.name}</h3>
        <p className="career-emp__meta">
          <span>{KIND_LABEL[o.kind]}</span>
          {o.region ? <span>{o.region}</span> : null}
          <span>{o.when ?? 'Dates on its page'}</span>
        </p>
        <p className="career-emp__why">{o.note}</p>
        {left ? (
          <p className={left === 'Closed' ? 'career-study-row__left is-closed' : 'career-study-row__left'}>{left}</p>
        ) : null}
      </div>
      {url ? (
        <Button
          variant="secondary"
          size="sm"
          href={url}
          trailingIcon={<Icon glyph={glyph.external} />}
          className="career-emp__cta"
        >
          Official page
          <span className="visually-hidden">{` for ${o.name}, opens ${hostOf(url)} in a new tab`}</span>
        </Button>
      ) : null}
    </li>
  );
}

/**
 * The URL holds the state: ?pq= the search, ?pkind= and ?pregion= comma lists, ?psort=name or closing.
 */
export function Postgraduates() {
  const { furtherStudy: study } = useCareerData();
  const { featureOn } = useAuth();
  const setParams = useSetQueryParams();
  const [qParam] = useQueryParam('pq', '');
  const [kindParam] = useQueryParam('pkind');
  const [regionParam] = useQueryParam('pregion');
  const [sortParam, setSort] = useQueryParam('psort');
  const options = useMemo(() => study?.options ?? [], [study]);
  const regions = useMemo(() => regionsOf(options), [options]);
  const filters: StudyFilters = useMemo(
    () => ({
      q: qParam,
      kind: parseList(kindParam, new Set(STUDY_KINDS)),
      region: parseList(regionParam, new Set(regions)),
    }),
    [qParam, kindParam, regionParam, regions],
  );
  const sort = parseStudySort(sortParam);
  const today = todayKey();

  // The box answers every key; the URL (and so the list) follows once typing settles.
  const [search, setSearch] = useState(qParam);
  const settled = useDebouncedValue(search, 250);
  useEffect(() => {
    if (settled.trim() !== qParam) setParams({ pq: settled.trim() || null }, { replace: true });
    // Only typing writes the URL; a URL change (Reset, back) is mirrored into the box below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);
  useEffect(() => {
    if (qParam !== settled.trim()) setSearch(qParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam]);

  const matches = useMemo(() => sortStudy(filterStudy(options, filters), sort, today), [options, filters, sort, today]);
  if (!study) return null;
  const studyTo = appPath(study.action.to);

  const reset = () => {
    setSearch('');
    setParams({ pq: null, pkind: null, pregion: null }, { replace: true });
  };
  const toggle = (facet: string, id: string, on: boolean) => {
    if (!isStudyFacet(facet)) return;
    const next = on ? [...filters[facet], id] : filters[facet].filter((v) => v !== id);
    setParams({ [`p${facet}`]: listParam(next) }, { replace: true });
  };
  const groups: FacetGroup[] = [
    {
      facet: 'kind',
      title: 'Type',
      options: STUDY_KINDS.map((id) => ({ id, label: KIND_PLURAL[id] })),
      counts: studyCounts(options, filters, 'kind'),
      picked: filters.kind,
    },
    ...(regions.length
      ? [
          {
            facet: 'region',
            title: 'Where',
            options: regions.map((r) => ({ id: r, label: r })),
            counts: studyCounts(options, filters, 'region'),
            picked: filters.region,
          },
        ]
      : []),
  ];

  return (
    <PageSection
      id="career-postgrad"
      className="career-opps career-postgrad"
      aria-labelledby="career-postgrad-title"
      data-hub="career-postgrad"
    >
      <h2 id="career-postgrad-title" className="visually-hidden">
        Postgraduates
      </h2>

      <div className="career-board">
        <BoardFilters
          label="Search courses and scholarships"
          placeholder="Search courses"
          noun={NOUN}
          search={search}
          searching={filters.q.trim() !== ''}
          onSearch={setSearch}
          groups={groups}
          onToggle={toggle}
          onReset={reset}
        />

        <div className="career-results">
          <div className="career-results__bar">
            <p className="career-results__count" aria-live="polite" data-hub="career-study-count">
              {resultsLine(matches.length, matches.length, NOUN)}
            </p>
            <div className="career-results__sort">
              <span className="career-results__sort-label" aria-hidden="true">
                Sort by:
              </span>
              <Select
                label="Sort by"
                hideLabel
                options={[
                  { value: 'suggested', label: 'Suggested' },
                  { value: 'closing', label: 'Closing soonest' },
                  { value: 'name', label: 'Name, A to Z' },
                ]}
                value={sort}
                onChange={(e) =>
                  setSort(e.currentTarget.value === 'suggested' ? null : e.currentTarget.value, { replace: true })
                }
                data-hub="career-study-sort"
              />
            </div>
          </div>

          <div className="career-opps__about career-postgrad__intro" data-hub="career-study">
            <p className="career-opps__about-text">
              <strong>{study.title}</strong> {study.body}
            </p>
            {studyTo ? (
              <Button variant="secondary" size="sm" to={studyTo} trailingIcon={<Icon glyph={glyph.forward} />}>
                {study.action.label}
              </Button>
            ) : null}
          </div>

          {matches.length ? (
            <ul role="list" className="career-emps" aria-label={resultsLine(matches.length, matches.length, NOUN)}>
              {matches.map((o, n) => (
                <StudyRow key={`${n}-${o.url}`} option={o} today={today} />
              ))}
            </ul>
          ) : (
            <Panel padding="none" className="career-opps__empty">
              <EmptyState
                mate="loupe"
                title={options.length ? 'Nothing matches' : 'No courses or scholarships listed yet'}
                body={options.length ? 'Try other words, or take a filter off.' : 'They show up here once listed.'}
                action={
                  studyFiltered(filters) ? (
                    <Button variant="secondary" size="sm" onClick={reset}>
                      Show them all
                    </Button>
                  ) : null
                }
              />
            </Panel>
          )}

          {featureOn('grades') ? (
            <ProjectedClass className="career-postgrad__projected" calculatorLink={studyTo !== '/grades'} />
          ) : null}
        </div>
      </div>
    </PageSection>
  );
}
