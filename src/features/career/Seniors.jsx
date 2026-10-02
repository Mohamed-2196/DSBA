import { useMemo } from 'react';
import { ChatsCircle } from '@phosphor-icons/react';
import { Avatar, Badge, Button, CohortBadge, PageSection, Panel, SectionHeader } from '../../ui';
import { getSeniors } from './data/seniors.js';
import { askLink } from './lib/links.js';
import './Seniors.css';

function Senior({ s }) {
  return (
    <Panel as="li" padding="none" className="career-senior" data-hub="career-senior" data-senior-id={s.id}>
      <div className="career-senior__who">
        <Avatar name={s.name} size="xl" decorative />
        <div className="career-senior__id">
          <h3 className="career-senior__name">{s.name}</h3>
          {s.year ? <CohortBadge year={s.year} /> : <Badge tone="neutral">{s.badge}</Badge>}
        </div>
      </div>
      <p className="career-senior__headline">{s.headline}</p>
      <p className="career-senior__helps">
        <span className="career-senior__label">Can help with</span>
        {s.helps}
      </p>
      <ul role="list" className="career-senior__topics" aria-label="Topics">
        {s.topics.map((t) => (
          <li key={t}>
            <Badge tone="outline">{t}</Badge>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" leadingIcon={ChatsCircle} to={askLink(s.ask)} className="career-senior__ask">
        {`Ask ${s.short} in the forum`}
      </Button>
    </Panel>
  );
}

/** Cross-cohort mentors: Year 3 students and recent graduates. Sample profiles, never staff. */
export function Seniors() {
  const seniors = useMemo(() => getSeniors(), []);
  return (
    <PageSection id="career-seniors" aria-labelledby="career-seniors-title" data-hub="career-seniors">
      <SectionHeader
        id="career-seniors-title"
        title="Ask a senior"
        description="Year 3 students and recent graduates who have already made the choices you are about to make."
        action={
          <Button variant="primary" leadingIcon={ChatsCircle} to="/forum/new">
            Ask in the forum
          </Button>
        }
      />
      <ul role="list" className="career-seniors__grid">
        {seniors.map((s) => (
          <Senior key={s.id} s={s} />
        ))}
      </ul>
      <p className="career-note">Sample profiles. Seniors will opt in to answer questions here.</p>
    </PageSection>
  );
}
