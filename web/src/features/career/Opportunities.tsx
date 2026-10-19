import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CaretDown, CaretUp, MagnifyingGlass } from '@phosphor-icons/react';
import type { ModuleSummary } from '../../api/types';
import { BREAKPOINTS, useMediaQuery, useQueryParam } from '../../state';
import { useModules } from '../../state/modules';
import { Button, Chip, EmptyState, PageSection, Panel, cx } from '../../ui';
import { useCareerData } from './context';
import { EmployerCard } from './EmployerCard';
import { ModuleLink } from './ModuleLink';
import './Opportunities.css';

// The two kinds of programme a student can filter by. The dot repeats the colour of the badge on the cards.
const TYPE_FILTERS: { id: 'graduate' | 'internship'; color: string }[] = [
  { id: 'graduate', color: 'var(--accent)' },
  { id: 'internship', color: 'var(--success-fill)' },
];

/** How many employers a phone shows before "Show all". */
const PHONE_FIRST = 4;

/**
 * The board: real employers, each with a logo slot, what it offers students and graduates, and one button to the
 * employer's own page. Filters live in the URL: ?track=quant, ?type=graduate, ?all=1 (the whole list, unfolded).
 */
export function Opportunities() {
  const data = useCareerData();
  const { getModule } = useModules();
  const tracks = useMemo(() => new Map(data.tracks.map((t) => [t.id, t])), [data.tracks]);
  const [trackParam, setTrack] = useQueryParam('track', 'all');
  const [typeParam, setType] = useQueryParam('type', 'all');
  const [allParam, setAll] = useQueryParam('all');
  const track = tracks.has(trackParam) ? trackParam : 'all';
  const type = typeParam === 'graduate' || typeParam === 'internship' ? typeParam : 'all';
  const filtered = track !== 'all' || type !== 'all';
  // The grid eases in only after the student changes a filter, never on arrival.
  const [touched, setTouched] = useState(false);

  const pool = useMemo(
    () => (type === 'all' ? data.employers : data.employers.filter((e) => e.offers.some((o) => o.type === type))),
    [type, data.employers],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of pool) for (const t of e.tracks) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [pool]);
  const matches = track === 'all' ? pool : pool.filter((e) => e.tracks.includes(track));
  // Phones show fewer at first: each card is a screen tall there.
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const first = phone ? Math.min(PHONE_FIRST, data.initialCount) : data.initialCount;
  const foldable = !filtered && matches.length > first;
  const folded = foldable && allParam !== '1';
  const shown = folded ? matches.slice(0, first) : matches;
  const active = tracks.get(track) ?? null;

  const pickTrack = (id: string) => {
    setTouched(true);
    setTrack(id, { replace: true });
  };
  const pickType = (value: string) => {
    setTouched(true);
    setType(value, { replace: true });
  };
  // One update for both filters: router param setters do not queue, so two setters in a row would keep only the last.
  const [, setParams] = useSearchParams();
  const reset = () => {
    setTouched(true);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('track');
        p.delete('type');
        return p;
      },
      { replace: true },
    );
  };

  const closest = active ? active.modules.map((id) => getModule(id)).filter((m): m is ModuleSummary => m !== null) : [];

  return (
    <PageSection
      id="career-opportunities"
      className="career-opps"
      aria-labelledby="career-opps-title"
      data-hub="career-opps"
    >
      <h2 id="career-opps-title" className="visually-hidden">
        Where to apply
      </h2>

      <div className="career-opps__filters">
        <div className="career-opps__tracks" role="group" aria-label="Filter by track">
          <Chip
            selected={track === 'all'}
            count={pool.length}
            onChange={() => pickTrack('all')}
            data-hub="career-track"
            data-track-id="all"
          >
            All
          </Chip>
          {data.tracks.map((t) => (
            <Chip
              key={t.id}
              selected={track === t.id}
              count={counts[t.id] ?? 0}
              onChange={(next) => pickTrack(next ? t.id : 'all')}
              data-hub="career-track"
              data-track-id={t.id}
            >
              {t.label}
            </Chip>
          ))}
        </div>
        <div className="career-opps__types" role="group" aria-label="Filter by what is offered">
          {TYPE_FILTERS.map((t) => (
            <Chip
              key={t.id}
              color={t.color}
              selected={type === t.id}
              onChange={(next) => pickType(next ? t.id : 'all')}
              data-hub="career-type"
              data-type-id={t.id}
            >
              {data.offerTypes[t.id].plural}
            </Chip>
          ))}
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
          className={cx('career-emps', touched && 'is-swapped')}
          key={`${track}-${type}`}
          aria-label={`${matches.length} ${matches.length === 1 ? 'employer' : 'employers'}`}
        >
          {shown.map((e) => (
            <EmployerCard key={e.id} employer={e} track={track} tracks={tracks} />
          ))}
        </ul>
      ) : (
        <Panel padding="none" className="career-opps__empty">
          <EmptyState
            icon={MagnifyingGlass}
            title={data.employers.length ? 'No employer matches both filters' : 'No employers listed yet'}
            body={
              data.employers.length
                ? 'Try another track, or look at everything.'
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
            trailingIcon={folded ? CaretDown : CaretUp}
            aria-expanded={!folded}
            onClick={() => setAll(folded ? '1' : null, { replace: true })}
            data-hub="career-show-all"
          >
            {folded ? `Show all ${matches.length} employers` : 'Show fewer'}
          </Button>
        </div>
      ) : null}

      <p className="career-note career-opps__note">
        {data.employersNote}
        {data.checkedOn ? ` Links checked on ${data.checkedOn}.` : ''}
      </p>
    </PageSection>
  );
}
