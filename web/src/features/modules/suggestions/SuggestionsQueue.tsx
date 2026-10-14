// Manage → Suggested videos (content.edit, while the feature is on): students' suggestions, oldest first. Accept
// adds the video as a lesson at the end of a chapter (the suggested one, another, or a new one); Decline needs a
// reason the student sees. Either way the student gets a notification.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowSquareOut, YoutubeLogo } from '@phosphor-icons/react';
import { errorMessage } from '../../../api/errors';
import type { SuggestionOut } from '../../../api/types';
import { useToast } from '../../../state';
import { Badge, Button, EmptyState, Panel, QueryError, SegmentedControl, Select, Skeleton, TextArea, TextField, timeAgo } from '../../../ui';
import { moduleDetailQuery } from '../api';
import { lessonHref } from '../lessons';
import { useAcceptSuggestion, useDeclineSuggestion, useSuggestionQueue } from './api';
import { NEW_CHAPTER, STATUS_LABEL, acceptBody, type SuggestionStatus } from './model';
import './Suggestions.css';

const SHOWN: { value: SuggestionStatus; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
];
const REPLY_MAX = 1000;

function Review({ s }: { s: SuggestionOut }) {
  const chapters = useQuery(moduleDetailQuery(s.moduleId)).data?.chapters ?? [];
  const [choice, setChoice] = useState(s.chapterId ?? '');
  const [newChapter, setNewChapter] = useState('');
  const [title, setTitle] = useState(s.title);
  const [declining, setDeclining] = useState(false);
  const [reply, setReply] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const accept = useAcceptSuggestion();
  const decline = useDeclineSuggestion();
  const { push } = useToast();
  const navigate = useNavigate();
  const busy = accept.isPending || decline.isPending;
  // The suggested chapter stays a choice even while hidden from students (the public module leaves it out).
  const options = [
    ...(s.chapterId && s.chapterTitle && !chapters.some((c) => c.id === s.chapterId) ? [{ value: s.chapterId, label: s.chapterTitle }] : []),
    ...chapters.map((c, i) => ({ value: c.id, label: `${i + 1}. ${c.title}` })),
    { value: NEW_CHAPTER, label: 'A new chapter…' },
  ];

  const onAccept = () => {
    const built = acceptBody(choice, newChapter, title, s.title);
    if ('error' in built) {
      setErrors(built.error === 'newChapter' ? { newChapter: 'Name the new chapter.' } : { chapterId: 'Pick a chapter for the lesson.' });
      return;
    }
    setErrors({});
    accept.mutate(
      { id: s.id, body: built.body },
      {
        onSuccess: (done) =>
          push({
            title: 'Added as a lesson',
            body: 'The student gets a notification.',
            tone: 'success',
            action: done.lessonId ? { label: 'Open it', onClick: () => navigate(lessonHref(done.moduleId, done.lessonId ?? '')) } : undefined,
          }),
        onError: (e) => setErrors({ form: errorMessage(e, 'It wasn’t added. Try again.') }),
      },
    );
  };

  const onDecline = () => {
    if (!reply.trim()) {
      setErrors({ reply: 'Say why it’s declined: the student who suggested it will see it.' });
      return;
    }
    setErrors({});
    decline.mutate(
      { id: s.id, reply: reply.trim() },
      {
        onSuccess: () => push({ title: 'Suggestion declined', body: 'The student gets a notification with your reason.', tone: 'success' }),
        onError: (e) => setErrors({ form: errorMessage(e, 'It wasn’t declined. Try again.') }),
      },
    );
  };

  return (
    <form
      className="sugg-review"
      aria-label={`Review “${s.title}”`}
      onSubmit={(e) => {
        e.preventDefault();
        if (declining) onDecline();
        else onAccept();
      }}
      noValidate
    >
      {declining ? (
        <TextArea
          label="Why it’s declined"
          hint="The student sees it."
          rows={2}
          value={reply}
          maxLength={REPLY_MAX}
          onChange={(e) => setReply(e.target.value)}
          error={errors.reply}
          dir="auto"
          data-autofocus
        />
      ) : (
        <div className="sugg-review__fields">
          <TextField label="Lesson title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} dir="auto" />
          <Select label="Chapter" value={choice} onChange={(e) => setChoice(e.target.value)} placeholder="Pick a chapter" options={options} error={errors.chapterId} />
          {choice === NEW_CHAPTER ? (
            <TextField label="New chapter’s name" value={newChapter} maxLength={160} onChange={(e) => setNewChapter(e.target.value)} error={errors.newChapter} dir="auto" />
          ) : null}
        </div>
      )}
      {errors.form ? (
        <p className="sugg-form__error" role="alert">
          {errors.form}
        </p>
      ) : null}
      <div className="sugg-review__actions">
        {declining ? (
          <>
            <Button type="submit" variant="primary" size="sm" loading={decline.isPending} disabled={busy} data-hub="suggestion-decline">
              Decline
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeclining(false)} disabled={busy}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" variant="primary" size="sm" loading={accept.isPending} disabled={busy} data-hub="suggestion-accept">
              Add as a lesson
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeclining(true)} disabled={busy}>
              Decline…
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function SuggestionCard({ s }: { s: SuggestionOut }) {
  const status = STATUS_LABEL[s.status];
  return (
    <li className="sugg-card" data-hub="suggestion">
      <p className="sugg-card__where">
        {s.moduleTitle}
        <span aria-hidden="true"> · </span>
        {s.chapterTitle ?? 'Any chapter'}
      </p>
      <h3 className="sugg-card__title" dir="auto">
        <a href={s.url} target="_blank" rel="noopener noreferrer">
          {s.title}
          <ArrowSquareOut aria-label="(opens in a new tab)" className="sugg-card__out" />
        </a>
      </h3>
      {s.reason ? (
        <p className="sugg-card__reason" dir="auto">
          “{s.reason}”
        </p>
      ) : null}
      <p className="sugg-card__meta">
        {s.status === 'pending' ? null : (
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
        )}
        <span>
          {s.author?.displayName ?? 'A deleted account'} · <time dateTime={s.createdAt}>{timeAgo(s.createdAt)}</time>
        </span>
        {s.decidedBy ? <span>Reviewed by {s.decidedBy.displayName}</span> : null}
      </p>
      {s.status === 'declined' && s.reply ? (
        <p className="sugg-mine__reply" dir="auto">
          <strong>Why:</strong> {s.reply}
        </p>
      ) : null}
      {s.status === 'pending' ? <Review s={s} /> : null}
    </li>
  );
}

export function SuggestionsQueue() {
  const [status, setStatus] = useState<SuggestionStatus>('pending');
  const list = useSuggestionQueue(status);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="sugg-queue" aria-label="Suggested videos" data-hub="suggestions-queue">
      <div className="sugg-queue__head">
        <p className="sugg-queue__intro">Students’ suggestions for lessons. Watch each one first. The student gets a notification either way.</p>
        <SegmentedControl label="Show" size="sm" options={SHOWN} value={status} onChange={setStatus} />
      </div>
      {list.isError && !list.data ? (
        <QueryError error={list.error} title="Suggestions didn’t load" onRetry={() => void list.refetch()} retrying={list.isFetching} size="sm" />
      ) : list.isPending ? (
        <Skeleton lines={4} />
      ) : items.length ? (
        <>
          <ul role="list" className="sugg-list">
            {items.map((s) => (
              <SuggestionCard key={s.id} s={s} />
            ))}
          </ul>
          {list.hasNextPage ? (
            <div className="sugg-more">
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
            icon={YoutubeLogo}
            title={status === 'pending' ? 'Nothing waiting' : status === 'accepted' ? 'Nothing accepted yet' : 'Nothing declined'}
            body="Students suggest videos from a module’s Lessons tab."
          />
        </Panel>
      )}
    </section>
  );
}
