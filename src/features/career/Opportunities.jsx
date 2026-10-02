import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Bank,
  Briefcase,
  Buildings,
  CaretDown,
  CaretUp,
  CellTower,
  ChartLineUp,
  Cloud,
  CreditCard,
  Factory,
  Handshake,
  Lightning,
  MagnifyingGlass,
  Scales,
  TrendUp,
  Vault,
} from '@phosphor-icons/react';
import { getModule } from '../../data/modules.js';
import { useQueryParam } from '../../state';
import { Badge, Button, Chip, EmptyState, PageSection, Panel, cx } from '../../ui';
import { CHECKED_ON, CTA_LABEL, EMPLOYERS, FEATURED, INITIAL_COUNT, OFFER_TYPES, TRACKS, getTrack, hostOf, offerTypes } from './data/employers.js';
import { LogoSlot } from './LogoSlot.jsx';
import { ModuleLink } from './ModuleLink.jsx';
import './Opportunities.css';

// Generic icons for the sector line (never a brand mark).
const SECTOR_ICONS = {
  Bank,
  Investment: ChartLineUp,
  Regulator: Scales,
  'Sovereign fund': Vault,
  'Public body': Buildings,
  Exchange: TrendUp,
  'Audit & consulting': Briefcase,
  Consulting: Handshake,
  Telecom: CellTower,
  Technology: Cloud,
  Fintech: CreditCard,
  Energy: Lightning,
  Industry: Factory,
};

const TYPE_TONE = { graduate: 'cobalt', internship: 'signal', careers: 'outline' };

// The two kinds of programme a student can filter by. The dot repeats the colour of the badge on the cards.
const TYPE_FILTERS = [
  { id: 'graduate', color: 'var(--cobalt)' },
  { id: 'internship', color: 'var(--signal)' },
];

/** 'EVOLVE and THRIVE' from the named offers of an employer. */
function programmeLine(offers) {
  const names = offers.map((o) => o.name).filter(Boolean);
  if (names.length < 2) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function EmployerCard({ employer, track }) {
  const types = offerTypes(employer);
  const programme = programmeLine(employer.offers);
  const host = hostOf(employer.url);
  const SectorIcon = SECTOR_ICONS[employer.sector] || Buildings;
  return (
    <Panel
      as="li"
      padding="none"
      id={`career-emp-${employer.id}`}
      className="career-emp"
      data-hub="career-employer"
      data-employer-id={employer.id}
      data-offer-types={types.join(' ')}
    >
      <div className="career-emp__top">
        <LogoSlot kind="employer" id={employer.id} mono={employer.mono} />
        <ul role="list" className="career-emp__types" aria-label="What it offers">
          {types.map((t) => (
            <li key={t}>
              <Badge tone={TYPE_TONE[t]}>{OFFER_TYPES[t].label}</Badge>
            </li>
          ))}
        </ul>
      </div>

      <div className="career-emp__who">
        <h3 className="career-emp__name">{employer.name}</h3>
        <p className="career-emp__sector">
          <SectorIcon className="career-emp__sector-icon" aria-hidden="true" />
          {employer.sector}
        </p>
      </div>

      <div className="career-emp__body">
        {programme ? <p className="career-emp__programme">{programme}</p> : null}
        <p className="career-emp__why">{employer.why}</p>
      </div>

      <ul role="list" className="career-emp__tracks" aria-label="Good for">
        {employer.tracks.map((id) => (
          <li key={id} className={cx('career-track', id === track && 'is-active')}>
            {getTrack(id).short}
          </li>
        ))}
      </ul>

      <footer className="career-emp__foot">
        <Button variant="secondary" size="sm" href={employer.url} trailingIcon={ArrowUpRight} className="career-emp__cta" data-hub="career-apply">
          {CTA_LABEL[employer.cta]}
          <span className="visually-hidden">{` at ${employer.name}, opens ${host} in a new tab`}</span>
        </Button>
        <span className="career-emp__host" aria-hidden="true">
          {host}
        </span>
      </footer>
    </Panel>
  );
}

/**
 * The one competition on the board, featured beside the page title. BIBF is taking participants, so the way in
 * is the programme office (no deadline is shown, and none is invented).
 */
export function FeaturedCompetition() {
  const f = FEATURED;
  return (
    <aside id={`career-opp-${f.id}`} className="career-featured" aria-labelledby="career-featured-title" data-hub="career-featured" data-opp-id={f.id}>
      <LogoSlot kind={f.logo.kind} id={f.logo.id} mono={f.mono} size="sm" />
      <div className="career-featured__text">
        <div className="career-featured__head">
          <h2 id="career-featured-title" className="career-featured__title">
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="career-featured__link">
              {f.title}
              <ArrowUpRight className="career-featured__go" weight="bold" aria-hidden="true" />
              <span className="visually-hidden">{`, opens ${hostOf(f.url)} in a new tab`}</span>
            </a>
          </h2>
          <Badge tone="signal">{f.badge}</Badge>
        </div>
        <p className="career-featured__blurb">
          <span className="career-featured__kind">{f.kind}.</span> {f.blurb} <strong>{f.note}</strong>
        </p>
      </div>
    </aside>
  );
}

/**
 * The board: real employers, each with a logo slot, what it offers students and graduates, and one button to the
 * employer's own page. Filters live in the URL: ?track=quant, ?type=graduate, ?all=1 (the whole list, unfolded).
 */
export function Opportunities() {
  const [trackParam, setTrack] = useQueryParam('track', 'all');
  const [typeParam, setType] = useQueryParam('type', 'all');
  const [allParam, setAll] = useQueryParam('all', null);
  const track = getTrack(trackParam) ? trackParam : 'all';
  const type = typeParam === 'graduate' || typeParam === 'internship' ? typeParam : 'all';
  const filtered = track !== 'all' || type !== 'all';
  // The grid eases in only after the student changes a filter, never on arrival.
  const [touched, setTouched] = useState(false);

  const pool = useMemo(() => (type === 'all' ? EMPLOYERS : EMPLOYERS.filter((e) => e.offers.some((o) => o.type === type))), [type]);
  const counts = useMemo(() => {
    const c = {};
    for (const e of pool) for (const t of e.tracks) c[t] = (c[t] || 0) + 1;
    return c;
  }, [pool]);
  const matches = track === 'all' ? pool : pool.filter((e) => e.tracks.includes(track));
  const foldable = !filtered && matches.length > INITIAL_COUNT;
  const folded = foldable && allParam !== '1';
  const shown = folded ? matches.slice(0, INITIAL_COUNT) : matches;
  const active = getTrack(track);

  const pickTrack = (id) => {
    setTouched(true);
    setTrack(id, { replace: true });
  };
  const pickType = (value) => {
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

  return (
    <PageSection id="career-opportunities" className="career-opps" aria-labelledby="career-opps-title" data-hub="career-opps">
      <h2 id="career-opps-title" className="visually-hidden">
        Where to apply
      </h2>

      <div className="career-opps__filters">
        <div className="career-opps__tracks" role="group" aria-label="Filter by track">
          <Chip selected={track === 'all'} count={pool.length} onChange={() => pickTrack('all')} data-hub="career-track" data-track-id="all">
            All
          </Chip>
          {TRACKS.map((t) => (
            <Chip
              key={t.id}
              selected={track === t.id}
              count={counts[t.id] || 0}
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
            <Chip key={t.id} color={t.color} selected={type === t.id} onChange={(next) => pickType(next ? t.id : 'all')} data-hub="career-type" data-type-id={t.id}>
              {OFFER_TYPES[t.id].plural}
            </Chip>
          ))}
        </div>
      </div>

      {active ? (
        <p className="career-opps__about" data-hub="career-track-note">
          <span className="career-opps__about-text">{active.about}</span>
          <span className="career-opps__about-mods">
            <span className="career-opps__about-label">Closest modules</span>
            {active.modules
              .map((id) => getModule(id))
              .filter(Boolean)
              .map((m) => (
                <ModuleLink key={m.id} module={m} />
              ))}
          </span>
        </p>
      ) : null}

      {shown.length ? (
        <ul role="list" className={cx('career-emps', touched && 'is-swapped')} key={`${track}-${type}`} aria-label={`${matches.length} ${matches.length === 1 ? 'employer' : 'employers'}`}>
          {shown.map((e) => (
            <EmployerCard key={e.id} employer={e} track={track} />
          ))}
        </ul>
      ) : (
        <Panel padding="none" className="career-opps__empty">
          <EmptyState
            icon={MagnifyingGlass}
            title="No employer matches both filters"
            body="Try another track, or look at everything."
            action={
              <Button variant="secondary" size="sm" onClick={reset}>
                Show all employers
              </Button>
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
        Every button opens the employer’s own careers or programme page in a new tab. Programmes open and close during the year and each sets its
        own entry rules, so check the page for current dates. The track tags are our guide to the kind of work, not a list of vacancies. Links
        checked on {CHECKED_ON}. Logos belong to their owners and are shown only to identify each organisation; DSBA Hub is not affiliated with
        or endorsed by any of them.
      </p>
    </PageSection>
  );
}
