// Manage → Requests: the requests waiting for an answer (or planned), the most wanted first, each with the answer
// form. For people with requests.manage while requests are on (features/manage/sections.ts).
import { useState } from 'react';
import { Button, EmptyState, glyph, Icon, Panel, QueryError, SegmentedControl, Skeleton } from '../../ui';
import { useRequests } from './api';
import { AnswerForm } from './components/AnswerForm';
import { RequestCard } from './components/RequestCard';
import type { RequestStatus } from './types';
import './requests.css';

const SHOWN: { value: RequestStatus; label: string }[] = [
  { value: 'open', label: 'Waiting' },
  { value: 'planned', label: 'Planned' },
];

export function RequestsQueue() {
  const [status, setStatus] = useState<RequestStatus>('open');
  const list = useRequests({ kind: null, status, sort: 'me_too', mine: false });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="req-queue" aria-label="Requests" data-hub="requests-queue">
      <div className="req-queue__head">
        <p className="req-queue__intro">
          Answer with a status and a reply everyone can read. The student who asked, and everyone who said “me too”, get
          a notification.
        </p>
        <SegmentedControl label="Show" size="sm" options={SHOWN} value={status} onChange={setStatus} />
      </div>
      {list.isError && !list.data ? (
        <QueryError
          error={list.error}
          title="Requests didn’t load"
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
          size="sm"
        />
      ) : list.isPending ? (
        <Skeleton lines={4} />
      ) : items.length ? (
        <>
          <ul role="list" className="req-list">
            {items.map((r) => (
              <RequestCard key={r.id} request={r}>
                <AnswerForm key={`${r.id}:${r.status}:${r.reply ?? ''}`} request={r} />
              </RequestCard>
            ))}
          </ul>
          {list.hasNextPage ? (
            <div className="req-more">
              <Button onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
                Show more
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <Panel padding="none">
          <EmptyState
            size="sm"
            icon={<Icon glyph={glyph.question} />}
            title={status === 'open' ? 'Nothing waiting' : 'Nothing planned'}
            body="New requests show up here."
            action={<Button to="/requests">See every request</Button>}
          />
        </Panel>
      )}
    </section>
  );
}
