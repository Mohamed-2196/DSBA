import { ChatsCircle } from '@phosphor-icons/react';
import { Avatar, Badge, Button, CohortBadge, Panel } from '../../ui';
import { useCareerData } from './context';
import { askLink } from './lib/links';
import type { Senior as SeniorData } from './types';
import './Seniors.css';

function Senior({ s }: { s: SeniorData }) {
  return (
    <li className="career-senior" data-hub="career-senior" data-senior-id={s.id}>
      <Avatar name={s.name} size="lg" decorative />
      <div className="career-senior__body">
        <p className="career-senior__who">
          <span className="career-senior__name">{s.name}</span>
          {s.year ? <CohortBadge year={s.year} /> : s.badge ? <Badge tone="neutral">{s.badge}</Badge> : null}
        </p>
        <p className="career-senior__helps">{s.helps}</p>
      </div>
      {s.ask ? (
        <Button variant="ghost" size="sm" leadingIcon={ChatsCircle} to={askLink(s.ask)} className="career-senior__ask">
          {`Ask ${s.short}`}
        </Button>
      ) : null}
    </li>
  );
}

/** Year 3 students and recent graduates who answer questions. Hidden while nobody has signed up. */
export function Seniors() {
  const { seniors } = useCareerData();
  if (!seniors.length) return null;
  return (
    <Panel as="section" padding="none" id="career-seniors" className="career-seniors" aria-labelledby="career-seniors-title" data-hub="career-seniors">
      <div className="career-seniors__head">
        <div className="career-seniors__titles">
          <h3 id="career-seniors-title" className="career-seniors__title">
            Ask a senior
          </h3>
        </div>
        <Button variant="primary" size="sm" leadingIcon={ChatsCircle} to="/forum/new">
          Ask in the forum
        </Button>
      </div>
      <p className="career-seniors__desc">Year 3 students and recent graduates who answer questions about applying, interviews and first jobs.</p>
      <ul role="list" className="career-seniors__list">
        {seniors.map((s) => (
          <Senior key={s.id} s={s} />
        ))}
      </ul>
    </Panel>
  );
}
