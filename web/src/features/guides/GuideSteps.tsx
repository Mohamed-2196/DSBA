// A guide's checklist (Results day): Home's card shows it short, the guide's page in full. Ticks stay in this browser,
// like Career Navigator's checklist. A step's links go to another site, one of Site settings' saved links, a page of
// the hub or the next matching calendar date.
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import type { DateLink as DateLinkData, GuideStep } from '../../api/types';
import { addDaysToKey, formatDay, todayKey } from '../../lib/dates';
import { cx, glyph, Icon, Skeleton } from '../../ui';
import { safeInternalPath } from '../../ui/safeHref';
import { useCalendarEvents } from '../calendar/public';
import { httpsHref, useSite } from '../site/public';
import { nextDated } from './guides';
import type { GuideTicks } from './useGuideTicks';
import './Guides.css';

type GuideLink = GuideStep['links'][number];

/** The next calendar date a step points at (`{ kind: 'date' }`): its day, and whether reps have confirmed it. */
function DateLink({ link }: { link: DateLinkData }) {
  const today = todayKey();
  const events = useCalendarEvents({ from: today, to: addDaysToKey(today, 400), type: link.type });
  if (events.isPending) return <Skeleton width={180} height={16} />;
  if (events.isError) {
    return (
      <span className="guide-step__note">
        The date didn’t load.{' '}
        <button type="button" className="guide-link" onClick={() => void events.refetch()}>
          Try again
        </button>
      </span>
    );
  }
  const event = nextDated(events.data, link.title, today);
  if (!event) {
    return <span className="guide-step__note">{link.label}: not on the calendar yet. Ask your rep.</span>;
  }
  return (
    <Link to={`/calendar?event=${encodeURIComponent(event.id)}`} className="guide-link" data-hub="guide-date">
      {link.label} {formatDay(event.date, { weekday: 'long' })}
      {event.sample ? ', not confirmed yet' : ''}
      <Icon glyph={glyph.forward} />
    </Link>
  );
}

function OutLink({ href, label }: { href: string | null; label: string }) {
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="guide-link">
      {label}
      <Icon glyph={glyph.external} />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  ) : null;
}

function StepLink({ link }: { link: GuideLink }) {
  const { featureOn } = useAuth();
  const site = useSite().data;
  switch (link.kind) {
    case 'web':
      return <OutLink href={httpsHref(link.href)} label={link.label} />;
    case 'site':
      return <OutLink href={httpsHref(site?.links[link.link].url)} label={link.label} />;
    case 'page':
      return (link.feature && !featureOn(link.feature)) || !safeInternalPath(link.to) ? null : (
        <Link to={link.to} className="guide-link">
          {link.label}
          <Icon glyph={glyph.forward} />
        </Link>
      );
    case 'date':
      return featureOn('calendar') ? <DateLink link={link} /> : null;
  }
}

export interface GuideStepsProps {
  steps: readonly GuideStep[];
  ticks: GuideTicks;
  /** 'card': titles and links (Home); 'page': with each step's hint */
  variant: 'card' | 'page';
}

export function GuideSteps({ steps, ticks, variant }: GuideStepsProps) {
  const { done, toggle } = ticks;
  return (
    <ol role="list" className={cx('guide-steps', `guide-steps--${variant}`)} data-hub="guide-steps">
      {steps.map((step) => {
        const ticked = done.has(step.id);
        const hintId = `guide-hint-${step.id}`;
        return (
          <li key={step.id} className={cx('guide-step', ticked && 'is-done')} data-step-id={step.id}>
            <label className="guide-check">
              <input
                type="checkbox"
                className="guide-check__box"
                checked={ticked}
                onChange={() => toggle(step.id)}
                aria-describedby={variant === 'page' ? hintId : undefined}
              />
              <span className="guide-check__title">{step.title}</span>
            </label>
            <div className="guide-step__more">
              {variant === 'page' ? (
                <p className="guide-step__hint" id={hintId}>
                  {step.hint}
                </p>
              ) : null}
              {step.links.length ? (
                <div className="guide-step__links">
                  {step.links.map((link, i) => (
                    <StepLink key={i} link={link} />
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
