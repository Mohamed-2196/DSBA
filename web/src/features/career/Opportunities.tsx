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
  type Icon,
} from '@phosphor-icons/react';
import type { ModuleSummary } from '../../api/types';
import { useQueryParam } from '../../state';
import { useModules } from '../../state/modules';
import { Badge, Button, Chip, EmptyState, PageSection, Panel, cx } from '../../ui';
import { useCareerData } from './context';
import { hostOf } from './lib/links';
import { LogoSlot } from './LogoSlot';
import { ModuleLink } from './ModuleLink';
import type { Employer, OfferType, Track } from './types';
import './Opportunities.css';

// Generic icons for the sector line (never a brand mark).
const SECTOR_ICONS: Record<string, Icon> = {
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

const TYPE_TONE: Record<OfferType, 'cobalt' | 'signal' | 'outline'> = { graduate: 'cobalt', internship: 'signal', careers: 'outline' };

// The two kinds of programme a student can filter by. The dot repeats the colour of the badge on the cards.
const TYPE_FILTERS: { id: 'graduate' | 'internship'; color: string }[] = [
  { id: 'graduate', color: 'var(--cobalt)' },
  { id: 'internship', color: 'var(--signal)' },
];

const OFFER_ORDER: readonly OfferType[] = ['graduate', 'internship', 'careers'];

/** The distinct offer types of an employer, in the order graduate, internship, careers. */
const offerTypes = (employer: Employer): OfferType[] => OFFER_ORDER.filter((type) => employer.offers.some((o) => o.type === type));

/** 'EVOLVE and THRIVE' from the named offers of an employer. */
function programmeLine(employer: Employer): string {
  const names = employer.offers.map((o) => o.name).filter((n): n is string => !!n);
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function EmployerCard({ employer, track, tracks }: { employer: Employer; track: string; tracks: Map<string, Track> }) {
  const { offerTypes: labels, ctaLabel } = useCareerData();
  const types = offerTypes(employer);
  const programme = programmeLine(employer);
  const host = hostOf(employer.url);
  const SectorIcon = SECTOR_ICONS[employer.sector] ?? Buildings;
  return (
    <Panel as="li" padding="none" id={`career-emp-${employer.id}`} className="career-emp" data-hub="career-employer" data-employer-id={employer.id} data-offer-types={types.join(' ')}>
      <div className="career-emp__top">
        <LogoSlot kind="employer" id={employer.id} mono={employer.mono} />
        <ul role="list" className="career-emp__types" aria-label="What it offers">
          {types.map((t) => (
            <li key={t}>
              <Badge tone={TYPE_TONE[t]}>{labels[t].label}</Badge>
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
            {tracks.get(id)?.short ?? id}
          </li>
        ))}
      </ul>

      <footer className="career-emp__foot">
        <Button variant="secondary" size="sm" href={employer.url} trailingIcon={ArrowUpRight} className="career-emp__cta" data-hub="career-apply">
          {ctaLabel[employer.cta]}
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
  const { featured: f } = useCareerData();
  if (!f) return null;
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
          {f.badge ? <Badge tone="signal">{f.badge}</Badge> : null}
        </div>
        <p className="career-featured__blurb">
          {f.kind ? <span className="career-featured__kind">{f.kind}.</span> : null} {f.blurb} {f.note ? <strong>{f.note}</strong> : null}
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

  const pool = useMemo(() => (type === 'all' ? data.employers : data.employers.filter((e) => e.offers.some((o) => o.type === type))), [type, data.employers]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of pool) for (const t of e.tracks) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [pool]);
  const matches = track === 'all' ? pool : pool.filter((e) => e.tracks.includes(track));
  const foldable = !filtered && matches.length > data.initialCount;
  const folded = foldable && allParam !== '1';
  const shown = folded ? matches.slice(0, data.initialCount) : matches;
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
    <PageSection id="career-opportunities" className="career-opps" aria-labelledby="career-opps-title" data-hub="career-opps">
      <h2 id="career-opps-title" className="visually-hidden">
        Where to apply
      </h2>

      <div className="career-opps__filters">
        <div className="career-opps__tracks" role="group" aria-label="Filter by track">
          <Chip selected={track === 'all'} count={pool.length} onChange={() => pickTrack('all')} data-hub="career-track" data-track-id="all">
            All
          </Chip>
          {data.tracks.map((t) => (
            <Chip key={t.id} selected={track === t.id} count={counts[t.id] ?? 0} onChange={(next) => pickTrack(next ? t.id : 'all')} data-hub="career-track" data-track-id={t.id}>
              {t.label}
            </Chip>
          ))}
        </div>
        <div className="career-opps__types" role="group" aria-label="Filter by what is offered">
          {TYPE_FILTERS.map((t) => (
            <Chip key={t.id} color={t.color} selected={type === t.id} onChange={(next) => pickType(next ? t.id : 'all')} data-hub="career-type" data-type-id={t.id}>
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
        <ul role="list" className={cx('career-emps', touched && 'is-swapped')} key={`${track}-${type}`} aria-label={`${matches.length} ${matches.length === 1 ? 'employer' : 'employers'}`}>
          {shown.map((e) => (
            <EmployerCard key={e.id} employer={e} track={track} tracks={tracks} />
          ))}
        </ul>
      ) : (
        <Panel padding="none" className="career-opps__empty">
          <EmptyState
            icon={MagnifyingGlass}
            title={data.employers.length ? 'No employer matches both filters' : 'No employers listed yet'}
            body={data.employers.length ? 'Try another track, or look at everything.' : 'Employers show up here once the list is filled in.'}
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
          <Button variant="secondary" trailingIcon={folded ? CaretDown : CaretUp} aria-expanded={!folded} onClick={() => setAll(folded ? '1' : null, { replace: true })} data-hub="career-show-all">
            {folded ? `Show all ${matches.length} employers` : 'Show fewer'}
          </Button>
        </div>
      ) : null}

      <p className="career-note career-opps__note">
        Every button opens the employer’s own careers or programme page in a new tab. Programmes open and close during the year and each sets its own entry rules,
        so check the page for current dates. The track tags are our guide to the kind of work, not a list of vacancies.{data.checkedOn ? ` Links checked on ${data.checkedOn}.` : ''} Logos
        belong to their owners and are shown only to identify each organisation; DSBA Hub is not affiliated with or endorsed by any of them.
      </p>
    </PageSection>
  );
}
