// One request in a list: me too, the title (a link to its page), its kind, module and status, who asked, and the
// reps' reply when there is one. `children` holds extra controls (the reps' answer form in Manage).
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { RequestOut } from '../../../api/types';
import { Badge, timeAgo } from '../../../ui';
import { kindLabel, meTooLine, requestPath, statusOf } from '../labels';
import { MeTooButton } from './MeTooButton';

export function RequestCard({ request, children }: { request: RequestOut; children?: ReactNode }) {
  const status = statusOf(request.status);
  const others = meTooLine(request.meTooCount, request.meToo);
  return (
    <li className="req-card" data-hub="request">
      <MeTooButton request={request} />
      <div className="req-card__main">
        <p className="req-card__kind">
          {kindLabel(request.kind)}
          {request.moduleTitle ? (
            <>
              <span aria-hidden="true"> · </span>
              {request.moduleTitle}
            </>
          ) : null}
        </p>
        <h3 className="req-card__title" dir="auto">
          <Link to={requestPath(request.id)}>{request.title}</Link>
        </h3>
        <div className="req-card__meta">
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
          {request.mine ? (
            <Badge tone="highlight" size="sm">
              Yours
            </Badge>
          ) : null}
          <span>
            {request.author?.displayName ?? 'A deleted account'} · <time dateTime={request.createdAt}>{timeAgo(request.createdAt)}</time>
          </span>
          {others ? <span>{others}</span> : null}
        </div>
        {request.reply ? (
          <p className="req-card__reply" dir="auto">
            <strong>Reps:</strong> {request.reply}
          </p>
        ) : null}
        {children}
      </div>
    </li>
  );
}
