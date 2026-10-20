// Home's "Results day" card: for a few weeks from each results date on the calendar (the Results day guide), until
// it is hidden. Home's answer (GET /home) says which results date it is for, if any.
import type { ResultsDay } from '../../api/types';
import { useLocalStorage } from '../../state';
import { Badge, Button, glyph, Icon, IconButton, Panel } from '../../ui';
import { useGuides } from './api';
import { GuideSteps } from './GuideSteps';
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
          icon={<Icon glyph={glyph.close} />}
          label="Hide Results day"
          size="sm"
          onClick={() => setHiddenFor(eventId)}
          data-hub="results-hide"
        />
      </div>
      <p className="start-card__intro">{guide.intro}</p>
      <GuideSteps steps={guide.steps} ticks={ticks} variant="card" />
      <div className="start-card__foot">
        <Button variant="ghost" size="sm" to="/results-day" trailingIcon={<Icon glyph={glyph.forward} />}>
          What each step means
        </Button>
      </div>
    </Panel>
  );
}

/** `eventId`: the results date the card is for. */
export function ResultsDayCard({ eventId }: { eventId: string }) {
  const guide = useGuides().data?.resultsDay;
  return guide ? <Card guide={guide} eventId={eventId} /> : null;
}
