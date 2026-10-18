// Home's "Results day" card: for a few weeks from each results date on the calendar (the Results day guide), until
// it is hidden.
import { ArrowRight, X } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import type { ResultsDay } from '../../api/types';
import { addDaysToKey, todayKey } from '../../lib/dates';
import { useLocalStorage } from '../../state';
import { Badge, Button, IconButton, Panel } from '../../ui';
import { useCalendarEvents } from '../calendar/public';
import { useGuides } from './api';
import { GuideSteps } from './GuideSteps';
import { latestWithin } from './startHere';
import { useResultsTicks } from './useGuideTicks';
import './StartHere.css';

/** The id of the results date the card was hidden for: it comes back on the next one. */
const HIDDEN_KEY = 'hub.results.hidden';

function Card({ guide, eventId }: { guide: ResultsDay; eventId: string }) {
  const [hiddenFor, setHiddenFor] = useLocalStorage<unknown>(HIDDEN_KEY, null);
  const ticks = useResultsTicks(guide.steps);
  if (hiddenFor === eventId) return null;
  const n = ticks.done.size;
  return (
    <Panel
      as="section"
      padding="none"
      radius="feature"
      className="start-card start-card--results"
      aria-labelledby="results-card-title"
      data-hub="results-card"
    >
      <div className="start-card__head">
        <div className="start-card__titles">
          <h2 id="results-card-title" className="start-card__title">
            {guide.title}
          </h2>
          <Badge
            tone={n === ticks.total ? 'signal' : 'neutral'}
            aria-live="polite"
          >{`${n} of ${ticks.total} done`}</Badge>
        </div>
        <IconButton
          icon={X}
          label="Hide Results day"
          size="sm"
          onClick={() => setHiddenFor(eventId)}
          data-hub="results-hide"
        />
      </div>
      <p className="start-card__intro">{guide.intro}</p>
      <GuideSteps steps={guide.steps} ticks={ticks} variant="card" />
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
  const guide = useGuides().data?.resultsDay;
  return featureOn('calendar') && guide ? <WhenResultsAreOut guide={guide} /> : null;
}

function WhenResultsAreOut({ guide }: { guide: ResultsDay }) {
  const today = todayKey();
  const events = useCalendarEvents({ from: addDaysToKey(today, -(guide.weeks * 7 - 1)), to: today, type: 'event' });
  if (!events.data) return null;
  const event = latestWithin(events.data, guide.eventTitle, today, guide.weeks);
  return event ? <Card guide={guide} eventId={event.id} /> : null;
}
