// The Start here checklist (data/guides.ts): Home's card shows it short, /start-here in full. Ticks stay in this
// browser, like Career Navigator's checklist.
import { ArrowRight, ArrowSquareOut, CheckCircle, DownloadSimple } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { START_HERE, type GuideLink } from '../../data/guides';
import { addDaysToKey, formatDay, todayKey } from '../../lib/dates';
import { useInstall } from '../../lib/pwa';
import { Badge, Button, Skeleton, cx } from '../../ui';
import { safeHref } from '../../ui/safeHref';
import { useCalendarEvents } from '../calendar/public';
import { nextDated } from './startHere';
import { useStartTicks } from './useStartTicks';
import './StartHere.css';

/** The registration deadline from the calendar: its date, and whether reps have confirmed it. */
function DeadlineLink() {
  const today = todayKey();
  const events = useCalendarEvents({ from: today, to: addDaysToKey(today, 400), type: 'deadline' });
  if (events.isPending) return <Skeleton width={180} height={16} />;
  if (events.isError) {
    return (
      <span className="start-step__note">
        The deadline didn’t load.{' '}
        <button type="button" className="start-link" onClick={() => void events.refetch()}>
          Try again
        </button>
      </span>
    );
  }
  const event = nextDated(events.data, START_HERE.deadlineTitle, today);
  if (!event) {
    return (
      <Link to="/calendar?types=deadline" className="start-link">
        No date on the calendar yet. Check the calendar
        <ArrowRight weight="bold" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <Link to={`/calendar?event=${encodeURIComponent(event.id)}`} className="start-link" data-hub="start-deadline">
      Deadline {formatDay(event.date, { weekday: 'long' })}
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
    case 'deadline':
      return featureOn('calendar') ? <DeadlineLink /> : null;
    case 'install':
      return <InstallLink />;
  }
}

export interface StartHereStepsProps {
  /** 'card': titles and links (Home); 'page': with each step's hint */
  variant: 'card' | 'page';
}

export function StartHereSteps({ variant }: StartHereStepsProps) {
  const { done, toggle } = useStartTicks();
  return (
    <ol role="list" className={cx('start-steps', `start-steps--${variant}`)} data-hub="start-steps">
      {START_HERE.steps.map((step) => {
        const ticked = done.has(step.id);
        const hintId = `start-hint-${step.id}`;
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
