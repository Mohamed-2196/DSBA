// The reps' answer to a request: a status and a public reply, and "Remove" behind a confirmation. Shown to people
// with requests.manage, on the request's page and in Manage.
import { useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { errorMessage } from '../../../api/errors';
import type { RequestOut } from '../../../api/types';
import { useToast } from '../../../state';
import { Button, ConfirmDialog, SegmentedControl, TextArea } from '../../../ui';
import { useAnswerRequest, useRemoveRequest } from '../api';
import { STATUSES, needsReply } from '../labels';
import type { RequestStatus } from '../types';

const REPLY_MAX = 2000;

export function AnswerForm({ request, onRemoved }: { request: RequestOut; onRemoved?: () => void }) {
  const [status, setStatus] = useState<RequestStatus>(request.status);
  const [reply, setReply] = useState(request.reply ?? '');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const answer = useAnswerRequest();
  const remove = useRemoveRequest();
  const { push } = useToast();
  const changed = status !== request.status || reply.trim() !== (request.reply ?? '');

  const save = () => {
    if (needsReply(status) && !reply.trim()) {
      setError('Say why it’s declined: the students who asked will see it.');
      return;
    }
    setError(null);
    answer.mutate(
      { id: request.id, body: { status, reply: reply.trim() || null } },
      {
        onSuccess: (fresh) =>
          push({
            title: fresh.status === request.status ? 'Reply saved' : 'Status changed',
            body: fresh.status === request.status ? undefined : 'Everyone who asked for it gets a notification.',
            tone: 'success',
          }),
        onError: (e) => setError(errorMessage(e, 'That didn’t save. Try again.')),
      },
    );
  };

  return (
    <>
      <form
        className="req-answer"
        aria-label={`Answer “${request.title}”`}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <SegmentedControl label="Status" size="sm" options={STATUSES.map((s) => ({ value: s.value, label: s.label }))} value={status} onChange={setStatus} />
        <TextArea
          label={needsReply(status) ? 'Why it’s declined' : 'Reply'}
          hint="Everyone can read it."
          rows={2}
          value={reply}
          maxLength={REPLY_MAX}
          onChange={(e) => setReply(e.target.value)}
          error={error ?? undefined}
          dir="auto"
        />
        <div className="req-answer__actions">
          <Button type="submit" variant="primary" size="sm" loading={answer.isPending} disabled={!changed} data-hub="request-answer">
            Save answer
          </Button>
          <Button variant="ghost" size="sm" leadingIcon={Trash} onClick={() => setRemoving(true)}>
            Remove
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={removing}
        onClose={() => {
          setRemoving(false);
          setRemoveError(null);
        }}
        tone="danger"
        title="Remove this request?"
        body="It disappears for everyone, me-toos included. The activity log keeps its title."
        confirmLabel="Remove"
        busy={remove.isPending}
        error={removeError}
        onConfirm={() =>
          remove.mutate(request.id, {
            onSuccess: () => {
              setRemoving(false);
              push({ title: 'Request removed', tone: 'success' });
              onRemoved?.();
            },
            onError: (e) => setRemoveError(errorMessage(e, 'It wasn’t removed. Try again.')),
          })
        }
      />
    </>
  );
}
