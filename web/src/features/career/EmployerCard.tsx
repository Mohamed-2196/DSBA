// One employer on the board: its logo slot, what it offers, why it is there, the tracks it suits and one button to
// its own careers or programme page.
import {
  ArrowUpRight,
  Bank,
  Briefcase,
  Buildings,
  CellTower,
  ChartLineUp,
  Cloud,
  CreditCard,
  Factory,
  Handshake,
  Lightning,
  Scales,
  TrendUp,
  Vault,
  type Icon,
} from '@phosphor-icons/react';
import type { CareerEmployer, CareerOffer, CareerTrack } from '../../api/types';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Badge, Button, Panel, cx } from '../../ui';
import { applicationLine, dayKeyFromToday, useCalendarEvents, type CalendarEvent } from '../calendar/public';
import { hostOf } from '../../lib/share';
import { useCareerData } from './context';
import { webUrl } from './lib/links';
import { LogoSlot } from './LogoSlot';

type OfferType = CareerOffer['type'];

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

const OFFER_ORDER: readonly OfferType[] = ['graduate', 'internship', 'careers'];

/** The distinct offer types of an employer, in the order graduate, internship, careers. */
const offerTypes = (employer: CareerEmployer): OfferType[] => OFFER_ORDER.filter((type) => employer.offers.some((o) => o.type === type));

/** 'EVOLVE and THRIVE' from the named offers of an employer. */
function programmeLine(employer: CareerEmployer): string {
  const names = employer.offers.map((o) => o.name).filter((n): n is string => !!n);
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The employer's next application date on the calendar, with what its card says about it. */
function useApplicationDate(employerId: string): { event: CalendarEvent; line: string } | null {
  const { featureOn } = useAuth();
  const today = dayKeyFromToday();
  const dates = useCalendarEvents({ type: 'careers', from: today }, { enabled: featureOn('calendar') });
  for (const event of dates.data ?? []) {
    if (event.employerId !== employerId) continue;
    const line = applicationLine(event, today);
    if (line) return { event, line };
  }
  return null;
}

export function EmployerCard({ employer, track, tracks }: { employer: CareerEmployer; track: string; tracks: Map<string, CareerTrack> }) {
  const { offerTypes: labels, ctaLabel } = useCareerData();
  const types = offerTypes(employer);
  const programme = programmeLine(employer);
  const url = webUrl(employer.url);
  const host = hostOf(url);
  const SectorIcon = SECTOR_ICONS[employer.sector] ?? Buildings;
  const applications = useApplicationDate(employer.id);
  return (
    <Panel as="li" padding="none" id={`career-emp-${employer.id}`} className="career-emp" data-hub="career-employer" data-employer-id={employer.id} data-offer-types={types.join(' ')}>
      <div className="career-emp__top">
        <LogoSlot kind="employer" id={employer.id} logo={employer.logo} mono={employer.mono} />
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
        {applications ? (
          <p className="career-emp__dates" data-hub="career-application-date">
            <Link to={`/calendar?event=${encodeURIComponent(applications.event.id)}`}>{applications.line}</Link>
            <span className="career-emp__dates-title">{applications.event.title}</span>
          </p>
        ) : null}
      </div>

      <ul role="list" className="career-emp__tracks" aria-label="Good for">
        {employer.tracks.map((id) => (
          <li key={id} className={cx('career-track', id === track && 'is-active')}>
            {tracks.get(id)?.short ?? id}
          </li>
        ))}
      </ul>

      {url ? (
        <footer className="career-emp__foot">
          <Button variant="secondary" size="sm" href={url} trailingIcon={ArrowUpRight} className="career-emp__cta" data-hub="career-apply">
            {ctaLabel[employer.cta]}
            <span className="visually-hidden">{` at ${employer.name}, opens ${host} in a new tab`}</span>
          </Button>
          <span className="career-emp__host" aria-hidden="true">
            {host}
          </span>
        </footer>
      ) : null}
    </Panel>
  );
}
