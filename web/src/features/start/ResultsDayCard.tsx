// Home's "Results day" card: for two weeks from each results date on the calendar (data/guides.ts), until hidden.
import { ArrowRight, X } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { RESULTS_DAY } from '../../data/guides';
import { addDaysToKey, todayKey } from '../../lib/dates';
import { useLocalStorage } from '../../state';
import { Badge, Button, IconButton, Panel } from '../../ui';
import { useCalendarEvents } from '../calendar/public';
import { GuideSteps } from './GuideSteps';
import { latestWithin } from './startHere';
import { useResultsTicks } from './useGuideTicks';
import './StartHere.css';

/** The id of the results date the card was hidden for: it comes back on the next one. */
const HIDDEN_KEY = 'hub.results.hidden';

function Card({ eventId }: { eventId: string }) {
  const [hiddenFor, setHiddenFor] = useLocalStorage<unknown>(HIDDEN_KEY, null);
  const ticks = useResultsTicks();
  if (hiddenFor === eventId) return null;
  const n = ticks.done.size;
  return (
    <Panel as="section" padding="none" radius="feature" className="start-card start-card--results" aria-labelledby="results-card-title" data-hub="results-card">
      <div className="start-card__head">
        <div className="start-card__titles">
          <h2 id="results-card-title" className="start-card__title">
            {RESULTS_DAY.title}
          </h2>
          <Badge tone={n === ticks.total ? 'signal' : 'neutral'} aria-live="polite">{`${n} of ${ticks.total} done`}</Badge>
        </div>
        <IconButton icon={X} label="Hide Results day" size="sm" onClick={() => setHiddenFor(eventId)} data-hub="results-hide" />
      </div>
      <p className="start-card__intro">{RESULTS_DAY.intro}</p>
      <GuideSteps steps={RESULTS_DAY.steps} ticks={ticks} variant="card" />
      <div className="start-card__foot">
        <Button variant="ghost" size="sm" to="/results-day" trailingIcon={ArrowRight}>
          What each step means
        </Button>
      </div>
    </Panel>
  );
}

export function ResultsDayCard() {
  const { featureOn } = useAuth();
  const today = todayKey();
  const on = featureOn('calendar');
  const events = useCalendarEvents({ from: addDaysToKey(today, -(RESULTS_DAY.weeks * 7 - 1)), to: today, type: 'event' }, { enabled: on });
  if (!on || !events.data) return null;
  const event = latestWithin(events.data, RESULTS_DAY.eventTitle, today, RESULTS_DAY.weeks);
  return event ? <Card eventId={event.id} /> : null;
}
