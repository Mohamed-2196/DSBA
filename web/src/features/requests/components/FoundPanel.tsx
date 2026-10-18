// The file found for a paper request. While it waits, the requester or a rep says whether it's the one: yes closes
// the request as done, no keeps it open for the next file. Once done, it links to the file.
import { FileText } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../../api/errors';
import type { RequestOut } from '../../../api/types';
import { useAuth } from '../../../auth';
import { zoneLabel } from '../../../lib/exams';
import { useToast } from '../../../state';
import { Button, Panel } from '../../../ui';
import { libraryItemPath, libraryKindLabel } from '../../library/public';
import { useAnswerFound } from '../api';
import { awaitsAnswer } from '../labels';

export function FoundPanel({ request }: { request: RequestOut }) {
  const { can } = useAuth();
  const answer = useAnswerFound();
  const { push } = useToast();
  const file = request.found;
  if (!file) return null;
  const waiting = awaitsAnswer(request);
  if (!waiting && request.status !== 'done') return null;
  const mayAnswer = waiting && (request.mine || can('requests.manage'));
  const facts = [
    libraryKindLabel(file.kind),
    file.examYear ? String(file.examYear) : null,
    file.zone ? zoneLabel(file.zone) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const say = (confirm: boolean) =>
    answer.mutate(
      { id: request.id, confirm },
      {
        onSuccess: () =>
          push(
            confirm
              ? {
                  title: 'Request closed',
                  body: 'Everyone who wanted it will hear it’s in the library.',
                  tone: 'success',
                }
              : { title: 'Still looking', body: 'Your request stays open. You’ll hear when another file is added.' },
          ),
        onError: (e) => push({ title: 'That didn’t save', body: errorMessage(e, 'Try again.'), tone: 'alert' }),
      },
    );

  return (
    <Panel className="req-found" data-hub="request-found">
      <p className="req-found__h">{waiting ? 'Is this the file?' : 'It’s in the library'}</p>
      <p className="req-found__file">
        <FileText aria-hidden="true" />{' '}
        <Link to={libraryItemPath(file)} dir="auto">
          {file.title}
        </Link>{' '}
        <span className="req-card__kind">{facts}</span>
      </p>
      {waiting && !mayAnswer ? (
        <p className="req-found__note">
          A file that may match was added. The person who asked will say if it’s the one.
        </p>
      ) : null}
      {mayAnswer ? (
        <div className="req-found__actions">
          <Button
            variant="primary"
            size="sm"
            onClick={() => say(true)}
            loading={answer.isPending && answer.variables.confirm}
            disabled={answer.isPending}
            data-hub="request-found-yes"
          >
            Yes, that’s it
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => say(false)}
            loading={answer.isPending && !answer.variables.confirm}
            disabled={answer.isPending}
          >
            No, keep looking
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
