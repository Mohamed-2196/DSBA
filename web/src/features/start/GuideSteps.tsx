// A guide's checklist (data/guides.ts: Start here, Results day): Home's cards show it short, the guide's page in full.
// Ticks stay in this browser, like Career Navigator's checklist.
import { ArrowRight, ArrowSquareOut, CheckCircle, DownloadSimple } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import type { GuideLink, GuideStep } from '../../data/guides';
import { addDaysToKey, formatDay, todayKey } from '../../lib/dates';
import { useInstall } from '../../lib/pwa';
import { Badge, Button, Skeleton, cx } from '../../ui';
import { safeHref } from '../../ui/safeHref';
import { useCalendarEvents } from '../calendar/public';
import { nextDated } from './startHere';
import type { GuideTicks } from './useGuideTicks';
import './StartHere.css';

/** The next calendar date a step points at (`{ kind: 'date' }`): its day, and whether reps have confirmed it. */
function DateLink({ link }: { link: Extract<GuideLink, { kind: 'date' }> }) {
  const today = todayKey();
  const events = useCalendarEvents({ from: today, to: addDaysToKey(today, 400), type: link.type });
  if (events.isPending) return <Skeleton width={180} height={16} />;
  if (events.isError) {
    return (
      <span className="start-step__note">
        The date didn’t load.{' '}
        <button type="button" className="start-link" onClick={() => void events.refetch()}>
          Try again
        </button>
      </span>
    );
  }
  const event = nextDated(events.data, link.title, today);
  if (!event) {
    return (
      <Link to={`/calendar?types=${link.type}`} className="start-link">
        {link.label}: not on the calendar yet. Check the calendar
        <ArrowRight weight="bold" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <Link to={`/calendar?event=${encodeURIComponent(event.id)}`} className="start-link" data-hub="guide-date">
      {link.label} {formatDay(event.date, { weekday: 'long' })}
      {event.sample ? ', not confirmed yet' : ''}
      <ArrowRight weight="bold" aria-hidden="true" />
    </Link>
  );
}

/** "Install the app" where the browser offers it; the steps for iPhone and Android where it doesn't. */
function InstallLink() {
  const { canPrompt, installed, prompt } = useInstall();
  if (installed) {
    return (
      <Badge tone="signal" icon={CheckCircle}>
        Installed
      </Badge>
    );
  }
  if (canPrompt) {
    return (
      <Button size="sm" leadingIcon={DownloadSimple} onClick={() => void prompt()} data-hub="start-install">
        Install the app
      </Button>
    );
  }
  return <span className="start-step__note">On iPhone, tap Share, then Add to Home Screen. On Android, open the browser menu, then Install app.</span>;
}

function StepLink({ link }: { link: GuideLink }) {
  const { featureOn } = useAuth();
  switch (link.kind) {
    case 'web': {
      const safe = safeHref(link.href);
      const href = safe?.kind === 'external' && safe.href.startsWith('https:') ? safe.href : null;
      return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="start-link">
          {link.label}
          <ArrowSquareOut weight="bold" aria-hidden="true" />
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      ) : null;
    }
    case 'page':
      return link.feature && !featureOn(link.feature) ? null : (
        <Link to={link.to} className="start-link">
          {link.label}
          <ArrowRight weight="bold" aria-hidden="true" />
        </Link>
      );
    case 'date':
      return featureOn('calendar') ? <DateLink link={link} /> : null;
    case 'install':
      return <InstallLink />;
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
    <ol role="list" className={cx('start-steps', `start-steps--${variant}`)} data-hub="guide-steps">
      {steps.map((step) => {
        const ticked = done.has(step.id);
        const hintId = `guide-hint-${step.id}`;
        return (
          <li key={step.id} className={cx('start-step', ticked && 'is-done')} data-step-id={step.id}>
            <label className="start-check">
              <input type="checkbox" className="start-check__box" checked={ticked} onChange={() => toggle(step.id)} aria-describedby={variant === 'page' ? hintId : undefined} />
              <span className="start-check__title">{step.title}</span>
            </label>
            <div className="start-step__more">
              {variant === 'page' ? (
                <p className="start-step__hint" id={hintId}>
                  {step.hint}
                </p>
              ) : null}
              {step.links.length ? (
                <div className="start-step__links">
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
