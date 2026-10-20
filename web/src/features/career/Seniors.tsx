import type { Senior as SeniorData } from '../../api/types';
import { Avatar, Badge, Button, CohortBadge, glyph, Icon, Panel } from '../../ui';
import { useStartsThreads } from '../forum/public';
import { askSeniorLink, topicLine } from './lib/seniors';
import './Seniors.css';

function Senior({ s, ask }: { s: SeniorData; ask: boolean }) {
  const first = s.user.displayName.split(' ')[0] || s.user.displayName;
  return (
    <li className="career-senior" data-hub="career-senior" data-senior-id={s.user.id}>
      <Avatar name={s.user.displayName} size="lg" decorative />
      <div className="career-senior__body">
        <p className="career-senior__who">
          <span className="career-senior__name">{s.user.displayName}</span>
          {s.user.badge ? (
            <Badge tone="neutral">{s.user.badge}</Badge>
          ) : s.user.year ? (
            <CohortBadge year={s.user.year} />
          ) : null}
        </p>
        <p className="career-senior__helps">{topicLine(s.topics)}</p>
        {s.note ? <p className="career-senior__note">{s.note}</p> : null}
      </div>
      {ask ? (
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<Icon glyph={glyph.forum} />}
          to={askSeniorLink(s.user.id)}
          className="career-senior__ask"
        >
          {`Ask ${first}`}
        </Button>
      ) : null}
    </li>
  );
}

/** Year 3 students who answer questions, from Your account. Hidden while nobody is listed. */
export function Seniors({ seniors }: { seniors: SeniorData[] }) {
  const startsThreads = useStartsThreads();
  if (!seniors.length) return null;
  return (
    <Panel
      as="section"
      padding="none"
      id="career-seniors"
      className="career-seniors"
      aria-labelledby="career-seniors-title"
      data-hub="career-seniors"
    >
      <div className="career-seniors__head">
        <div className="career-seniors__titles">
          <h3 id="career-seniors-title" className="career-seniors__title">
            Ask a senior
          </h3>
        </div>
      </div>
      <p className="career-seniors__desc">
        Year 3 students who answer questions about applying, interviews and what comes next. Asking one starts a forum
        thread and tells them.
      </p>
      <ul role="list" className="career-seniors__list">
        {seniors.map((s) => (
          <Senior key={s.user.id} s={s} ask={startsThreads} />
        ))}
      </ul>
    </Panel>
  );
}
