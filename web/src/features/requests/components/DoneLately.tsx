// "You asked, we did" on /requests (requests.done): the requests done in the last 30 days, the latest first, with how
// many asked for each. Nothing while the switch is off or nothing was done.
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth';
import { Button, countOf, glyph, Icon, PageSection, timeAgo } from '../../../ui';
import { useDoneRequests } from '../api';
import { askedBy, kindLabel, requestPath } from '../labels';

const SHOWN = 5;

export function DoneLately({ onShowAll }: { onShowAll: () => void }) {
  const on = useAuth().featureOn('requests.done');
  const q = useDoneRequests({ limit: SHOWN, enabled: on });
  const done = q.data;
  if (!on || !done?.total) return null;
  return (
    <PageSection className="req-done" aria-labelledby="req-done-title" data-hub="requests-done">
      <div className="req-done__head">
        <h2 id="req-done-title" className="req-done__title">
          You asked, we did
        </h2>
        <p className="req-done__desc">{countOf(done.total, 'request')} done in the last 30 days.</p>
      </div>
      <ol role="list" className="req-done__list">
        {done.items.map((r) => (
          <li key={r.id}>
            <Link to={requestPath(r.id)} className="req-done__row">
              <Icon glyph={glyph.success} className="req-done__icon" />
              <span className="req-done__main">
                <span className="req-done__name" dir="auto">
                  {r.title}
                </span>
                <span className="req-done__meta">
                  <span>{kindLabel(r.kind)}</span>
                  <span>{askedBy(r.meTooCount)}</span>
                  {r.answeredAt ? (
                    <span>
                      Done <time dateTime={r.answeredAt}>{timeAgo(r.answeredAt)}</time>
                    </span>
                  ) : null}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {done.total > done.items.length ? (
        <div>
          <Button variant="ghost" onClick={onShowAll}>
            See every done request
          </Button>
        </div>
      ) : null}
    </PageSection>
  );
}
