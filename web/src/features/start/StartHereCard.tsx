// Home's "Start here" card: Year 1, the first weeks of the academic year (the Start here guide), until it is hidden.
import { ArrowRight, X } from '@phosphor-icons/react';
import type { StartHere } from '../../api/types';
import { todayKey } from '../../lib/dates';
import { useLocalStorage, type CohortYear } from '../../state';
import { Badge, Button, IconButton, Panel } from '../../ui';
import { useGuides } from './api';
import { startWindow } from './startHere';
import { GuideSteps } from './GuideSteps';
import { useStartTicks } from './useGuideTicks';
import './StartHere.css';

/** The first day of the academic year the card was hidden in: it comes back the next September. */
const HIDDEN_KEY = 'hub.start.hidden';

export function StartHereCard({ year }: { year: CohortYear }) {
  const guide = useGuides().data?.startHere;
  return year === 1 && guide ? <Card guide={guide} /> : null;
}

function Card({ guide }: { guide: StartHere }) {
  const term = startWindow(todayKey(), guide.termStart, guide.weeks);
  const [hiddenIn, setHiddenIn] = useLocalStorage<unknown>(HIDDEN_KEY, null);
  const ticks = useStartTicks(guide.steps);
  const { done, total } = ticks;
  if (!term.open || hiddenIn === term.from) return null;
  const n = done.size;
  return (
    <Panel
      as="section"
      padding="none"
      radius="feature"
      className="start-card"
      aria-labelledby="start-card-title"
      data-hub="start-card"
    >
      <div className="start-card__head">
        <div className="start-card__titles">
          <h2 id="start-card-title" className="start-card__title">
            {guide.title}
          </h2>
          <Badge tone={n === total ? 'signal' : 'neutral'} aria-live="polite">{`${n} of ${total} done`}</Badge>
        </div>
        <IconButton
          icon={X}
          label="Hide Start here"
          size="sm"
          onClick={() => setHiddenIn(term.from)}
          data-hub="start-hide"
        />
      </div>
      <p className="start-card__intro">{guide.intro}</p>
      <GuideSteps steps={guide.steps} ticks={ticks} variant="card" />
      <div className="start-card__foot">
        <Button variant="ghost" size="sm" to="/start-here" trailingIcon={ArrowRight}>
          What each step means
        </Button>
      </div>
    </Panel>
  );
}
