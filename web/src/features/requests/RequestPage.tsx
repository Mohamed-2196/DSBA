// /requests/:requestId: one request, its me-toos and the reps' answer. People who handle requests answer or remove it
// here; others can report it.
import { ArrowLeft, HandWaving } from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { useDocumentTitle } from '../../state';
import { Badge, Button, EmptyState, Page, Panel, QueryError, Skeleton, timeAgo } from '../../ui';
import { ReportButton } from '../forum/public';
import { useRequest } from './api';
import { AnswerForm } from './components/AnswerForm';
import { MeTooButton } from './components/MeTooButton';
import { kindLabel, meTooLine, statusOf } from './labels';
import './requests.css';

const back = (
  <Button variant="ghost" size="sm" to="/requests" leadingIcon={ArrowLeft}>
    All requests
  </Button>
);

export default function RequestPage() {
  const { requestId } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const req = useRequest(requestId);
  useDocumentTitle(req.data?.title ?? 'Request');

  if (req.isError) {
    const gone = isApiError(req.error) && req.error.status === 404;
    return (
      <Page width="narrow" className="req-page">
        {back}
        {gone ? (
          <Panel padding="none">
            <EmptyState icon={HandWaving} title="This request doesn’t exist" body="It may have been removed by the reps." action={<Button to="/requests">See all requests</Button>} />
          </Panel>
        ) : (
          <QueryError error={req.error} title="The request didn’t load" onRetry={() => void req.refetch()} retrying={req.isFetching} />
        )}
      </Page>
    );
  }
  if (!req.data) {
    return (
      <Page width="narrow" className="req-page">
        {back}
        <Skeleton lines={6} />
      </Page>
    );
  }
  const r = req.data;
  const status = statusOf(r.status);
  const others = meTooLine(r.meTooCount, r.meToo);
  return (
    <Page width="narrow" className="req-page">
      {back}
      <article className="req-detail" data-hub="request-page">
        <p className="req-card__kind">
          {kindLabel(r.kind)}
          {r.moduleTitle ? (
            <>
              <span aria-hidden="true"> · </span>
              {r.moduleTitle}
            </>
          ) : null}
        </p>
        <h1 className="req-detail__title" dir="auto">
          {r.title}
        </h1>
        <div className="req-card__meta">
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
          <span>
            Asked by {r.author?.displayName ?? 'a deleted account'} · <time dateTime={r.createdAt}>{timeAgo(r.createdAt)}</time>
          </span>
        </div>
        {r.details ? (
          <p className="req-detail__details" dir="auto">
            {r.details}
          </p>
        ) : null}
        <div className="req-detail__metoo">
          <MeTooButton request={r} size="lg" />
          <span>{others ?? (r.mine ? 'Nobody else has said me too yet.' : 'Want this too? Say so, and the reps see it matters.')}</span>
        </div>
        {r.reply ? (
          <Panel className="req-detail__reply">
            <p className="req-detail__reply-h">
              Reps’ answer
              {r.answeredBy ? ` from ${r.answeredBy.displayName}` : ''}
              {r.answeredAt ? (
                <>
                  {' '}
                  · <time dateTime={r.answeredAt}>{timeAgo(r.answeredAt)}</time>
                </>
              ) : null}
            </p>
            <p dir="auto">{r.reply}</p>
          </Panel>
        ) : null}
        {!r.mine ? <ReportButton targetType="request" targetId={r.id} /> : null}
      </article>
      {can('requests.manage') ? (
        <Panel className="req-detail__manage" aria-label="Answer this request">
          <h2 className="req-detail__manage-h">Answer</h2>
          <AnswerForm key={`${r.id}:${r.status}:${r.reply ?? ''}`} request={r} onRemoved={() => navigate('/requests', { replace: true })} />
        </Panel>
      ) : null}
    </Page>
  );
}
