import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarBlank, ChatsCircle, Star } from '@phosphor-icons/react';
import { cohortColor, cohortLabel, useLocalStorage, useQueryParam } from '../../state';
import { Badge, Button, Chip, EmptyState, IconButton, PageSection, Panel, SectionHeader, Tooltip, cx } from '../../ui';
import { OPPORTUNITIES, OPP_TYPES } from './data/opportunities.js';
import { addDays, daysBetween, relativeDays, shortDate } from './lib/dates.js';
import { askLink } from './lib/links.js';
import './Opportunities.css';

const SAVED_KEY = 'hub.career.saved';

const TYPE_BY_ID = Object.fromEntries(OPP_TYPES.map((t) => [t.id, t]));
const KNOWN_IDS = new Set(OPPORTUNITIES.map((o) => o.id));

/** Who a listing suits, as cohort dots and words: "Years 2 and 3". Listings that name no cohort say who they are for. */
function Suits({ opp }) {
  const { years, suits } = opp;
  if (!years) return <span className="career-opp__suits-text">{suits}</span>;
  const label = years.length === 3 ? 'All years' : years.length === 1 ? `Year ${years[0]}` : `Years ${years.join(' and ')}`;
  return (
    <span className="career-opp__suits-text">
      <span className="career-dots" aria-hidden="true">
        {years.map((y) => (
          <span key={y} className="career-dots__dot" style={{ background: cohortColor(y) }} />
        ))}
      </span>
      {label}
    </span>
  );
}

function Deadline({ opp, due, days }) {
  if (!due) {
    return (
      <Badge tone="outline" icon={CalendarBlank} className="career-due">
        No deadline posted yet
      </Badge>
    );
  }
  const verb = opp.type === 'event' ? 'On' : 'Closes';
  return (
    <>
      <Badge tone={days <= 7 ? 'alert' : 'neutral'} icon={CalendarBlank} className="career-due">
        {verb} {shortDate(due)}
      </Badge>
      <span className="career-opp__rel">{relativeDays(days)}</span>
    </>
  );
}

function OppRow({ opp, due, now, saved, onSave }) {
  const type = TYPE_BY_ID[opp.type];
  const days = due ? daysBetween(now, due) : null;
  return (
    <li id={`career-opp-${opp.id}`} className={cx('career-opp', opp.real && 'is-real')} data-hub="career-opp" data-opp-id={opp.id} data-opp-type={opp.type}>
      <div className="career-opp__save">
        <Tooltip label={saved ? 'Saved' : 'Save'} side="right" describe={false}>
          <IconButton
            icon={<Star weight={saved ? 'fill' : 'regular'} />}
            label={`Save ${opp.title}`}
            toggle
            active={saved}
            size="sm"
            className="career-opp__star"
            onClick={() => onSave(opp.id)}
          />
        </Tooltip>
      </div>

      <div className="career-opp__main">
        <div className="career-opp__titleline">
          <h3 className="career-opp__title">{opp.title}</h3>
          <Badge tone="neutral">{type.single}</Badge>
          {opp.real ? (
            <Badge tone="signal">{opp.badge}</Badge>
          ) : (
            <Badge tone="outline" className="career-example">
              Example
            </Badge>
          )}
        </div>
        <p className="career-opp__about">
          <span className="career-opp__org">{opp.organiser}</span>
          <span aria-hidden="true"> · </span>
          {opp.blurb}
        </p>
        {opp.note ? <p className="career-opp__note">{opp.note}</p> : null}
      </div>

      <div className="career-opp__suits">
        <span className="visually-hidden">Suits: </span>
        <Suits opp={opp} />
      </div>

      <div className="career-opp__due">
        <span className="visually-hidden">{opp.type === 'event' ? 'Date: ' : 'Deadline: '}</span>
        <Deadline opp={opp} due={due} days={days} />
      </div>

      <div className="career-opp__ask">
        <Button variant="ghost" size="sm" leadingIcon={ChatsCircle} to={askLink(opp.ask || `${opp.title}: what should I know?`)}>
          Ask about this in the forum
        </Button>
      </div>
    </li>
  );
}

/**
 * The board. One real listing (the CFA Institute Research Challenge); the rest are marked Example. Deadlines are
 * day offsets from `now`, so an example never goes stale. Filters live in the URL (?opp=, ?mine=1, ?saved=1);
 * saved stars live in localStorage.
 */
export function Opportunities({ now, year }) {
  const [typeParam, setType] = useQueryParam('opp', 'all');
  const [mineParam, setMine] = useQueryParam('mine', null);
  const [savedParam, setSavedOnly] = useQueryParam('saved', null);
  const type = TYPE_BY_ID[typeParam] ? typeParam : 'all';
  const mine = mineParam === '1';
  const savedOnly = savedParam === '1';

  const [stored, setStored] = useLocalStorage(SAVED_KEY, []);
  const saved = useMemo(() => new Set(Array.isArray(stored) ? stored.filter((id) => KNOWN_IDS.has(id)) : []), [stored]);
  const toggleSave = (id) =>
    setStored((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    });

  // Listings with no deadline come first (the one real listing), then the soonest deadline.
  const rows = useMemo(
    () =>
      OPPORTUNITIES.map((opp) => ({ opp, due: opp.inDays == null ? null : addDays(now, opp.inDays) })).sort(
        (a, b) => (a.opp.inDays ?? -1) - (b.opp.inDays ?? -1),
      ),
    [now],
  );

  const pool = useMemo(
    () => rows.filter(({ opp }) => (!mine || !opp.years || opp.years.includes(year)) && (!savedOnly || saved.has(opp.id))),
    [rows, mine, savedOnly, saved, year],
  );
  const counts = useMemo(() => {
    const c = {};
    for (const { opp } of pool) c[opp.type] = (c[opp.type] || 0) + 1;
    return c;
  }, [pool]);
  const visible = type === 'all' ? pool : pool.filter(({ opp }) => opp.type === type);

  const refined = type !== 'all' || mine || savedOnly;
  // One update for all three: router param setters don't queue, so calling the three setters above would keep only the last.
  const [, setParams] = useSearchParams();
  const reset = () =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const key of ['opp', 'mine', 'saved']) p.delete(key);
        return p;
      },
      { replace: true },
    );

  return (
    <PageSection id="career-opportunities" className="career-opps" aria-labelledby="career-opps-title" data-hub="career-opps">
      <SectionHeader
        id="career-opps-title"
        title="Opportunities"
        description="Internships, graduate programmes, competitions, scholarships and events. Save the ones you want to come back to."
      />

      <div className="career-opps__filters" role="group" aria-label="Filter opportunities">
        <div className="career-opps__types">
          <Chip selected={type === 'all'} count={pool.length} onChange={() => setType('all', { replace: true })}>
            All
          </Chip>
          {OPP_TYPES.map((t) => (
            <Chip key={t.id} selected={type === t.id} count={counts[t.id] || 0} onChange={(next) => setType(next ? t.id : 'all', { replace: true })}>
              {t.label}
            </Chip>
          ))}
        </div>
        <div className="career-opps__toggles">
          <Chip color={cohortColor(year)} selected={mine} onChange={(next) => setMine(next ? '1' : null, { replace: true })}>
            {`Suits ${cohortLabel(year)}`}
          </Chip>
          <Chip icon={Star} selected={savedOnly} count={saved.size} onChange={(next) => setSavedOnly(next ? '1' : null, { replace: true })}>
            Saved
          </Chip>
        </div>
      </div>

      <Panel padding="none" className="career-opps__panel">
        {visible.length ? (
          <>
            <div className="career-opps__head" aria-hidden="true">
              <span />
              <span>Opportunity</span>
              <span>Suits</span>
              <span>Deadline</span>
              <span />
            </div>
            <ul role="list" className="career-opps__list" aria-label={`${visible.length} ${visible.length === 1 ? 'listing' : 'listings'}`}>
              {visible.map(({ opp, due }) => (
                <OppRow key={opp.id} opp={opp} due={due} now={now} saved={saved.has(opp.id)} onSave={toggleSave} />
              ))}
            </ul>
          </>
        ) : (
          <EmptyState
            icon={Star}
            title={savedOnly && !saved.size ? 'Nothing saved yet' : 'No listings match these filters'}
            body={savedOnly && !saved.size ? 'Press the star on a listing to keep it here.' : 'Try another type, or clear the filters.'}
            action={
              refined ? (
                <Button variant="secondary" size="sm" onClick={reset}>
                  Show all listings
                </Button>
              ) : null
            }
          />
        )}
      </Panel>

      <p className="career-note">Listings marked Example show how this board will work once students and the programme office start posting.</p>
    </PageSection>
  );
}
