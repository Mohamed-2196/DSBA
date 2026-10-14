// Home's "Start here" card: Year 1, the first weeks of the academic year (data/guides.ts), until it is hidden.
import { ArrowRight, X } from '@phosphor-icons/react';
import { START_HERE } from '../../data/guides';
import { todayKey } from '../../lib/dates';
import { useLocalStorage, type CohortYear } from '../../state';
import { Badge, Button, IconButton, Panel } from '../../ui';
import { startWindow } from './startHere';
import { StartHereSteps } from './StartHereSteps';
import { useStartTicks } from './useStartTicks';
import './StartHere.css';

/** The first day of the academic year the card was hidden in: it comes back the next September. */
const HIDDEN_KEY = 'hub.start.hidden';

export function StartHereCard({ year }: { year: CohortYear }) {
  const term = startWindow(todayKey(), START_HERE.termStart, START_HERE.weeks);
  const [hiddenIn, setHiddenIn] = useLocalStorage<unknown>(HIDDEN_KEY, null);
  const { done, total } = useStartTicks();
  if (year !== 1 || !term.open || hiddenIn === term.from) return null;
  const n = done.size;
  return (
    <Panel as="section" padding="none" radius="feature" className="start-card" aria-labelledby="start-card-title" data-hub="start-card">
      <div className="start-card__head">
        <div className="start-card__titles">
          <h2 id="start-card-title" className="start-card__title">
            {START_HERE.title}
          </h2>
          <Badge tone={n === total ? 'signal' : 'neutral'} aria-live="polite">{`${n} of ${total} done`}</Badge>
        </div>
        <IconButton icon={X} label="Hide Start here" size="sm" onClick={() => setHiddenIn(term.from)} data-hub="start-hide" />
      </div>
      <p className="start-card__intro">{START_HERE.intro}</p>
      <StartHereSteps variant="card" />
      <div className="start-card__foot">
        <Button variant="ghost" size="sm" to="/start-here" trailingIcon={ArrowRight}>
          What each step means
        </Button>
      </div>
    </Panel>
  );
}
