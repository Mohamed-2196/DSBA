import { useMemo } from 'react';
import { ChatsCircle } from '@phosphor-icons/react';
import { Avatar, Badge, Button, CohortBadge, Panel } from '../../ui';
import { getSeniors } from './data/seniors';
import { askLink } from './lib/links';
import './Seniors.css';

function Senior({ s }) {
  return (
    <li className="career-senior" data-hub="career-senior" data-senior-id={s.id}>
      <Avatar name={s.name} size="lg" decorative />
      <div className="career-senior__body">
        <p className="career-senior__who">
          <span className="career-senior__name">{s.name}</span>
          {s.year ? <CohortBadge year={s.year} /> : <Badge tone="neutral">{s.badge}</Badge>}
        </p>
        <p className="career-senior__helps">{s.helps}</p>
      </div>
      <Button variant="ghost" size="sm" leadingIcon={ChatsCircle} to={askLink(s.ask)} className="career-senior__ask">
        {`Ask ${s.short}`}
      </Button>
    </li>
  );
}

/** Cross-cohort mentors: Year 3 students and recent graduates. Sample profiles (marked as such), never staff. */
export function Seniors() {
  const seniors = useMemo(() => getSeniors(), []);
  return (
    <Panel as="section" padding="none" id="career-seniors" className="career-seniors" aria-labelledby="career-seniors-title" data-hub="career-seniors">
      <div className="career-seniors__head">
        <div className="career-seniors__titles">
          <h3 id="career-seniors-title" className="career-seniors__title">
            Ask a senior
          </h3>
          <Badge tone="outline">Sample profiles</Badge>
        </div>
        <Button variant="primary" size="sm" leadingIcon={ChatsCircle} to="/forum/new">
          Ask in the forum
        </Button>
      </div>
      <p className="career-seniors__desc">Year 3 students and recent graduates will opt in to answer questions here. These four show how it will look.</p>
      <ul role="list" className="career-seniors__list">
        {seniors.map((s) => (
          <Senior key={s.id} s={s} />
        ))}
      </ul>
    </Panel>
  );
}
