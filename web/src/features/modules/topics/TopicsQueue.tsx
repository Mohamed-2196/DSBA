// Manage → Suggested videos → Time stamps (content.edit, while time stamps are on): students' time stamps for lessons'
// videos, oldest first. Open the lesson at the time to check it; Accept shows it beside the player (with the time or
// the words put right), Decline needs a reason the student sees. Accepted ones can be taken off again.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../../api/errors';
import type { TopicOut } from '../../../api/types';
import { useToast } from '../../../state';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Panel,
  QueryError,
  SegmentedControl,
  Skeleton,
  TextArea,
  TextField,
  glyph,
  timeAgo,
} from '../../../ui';
import { lessonHref } from '../lessons';
import { STATUS_LABEL, type SuggestionStatus } from '../suggestions/model';
import { useAcceptTopic, useDeclineTopic, useRemoveTopic, useTopicQueue } from './api';
import { clockLabel, parseClock } from './time';
import '../suggestions/Suggestions.css';
import './Topics.css';

const SHOWN: { value: SuggestionStatus; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
];
const REPLY_MAX = 1000;

const atTime = (t: TopicOut) => `${lessonHref(t.moduleId, t.lessonId)}?t=${t.seconds}`;

function Review({ t }: { t: TopicOut }) {
  const [time, setTime] = useState(clockLabel(t.seconds));
  const [label, setLabel] = useState(t.label);
  const [declining, setDeclining] = useState(false);
  const [reply, setReply] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const accept = useAcceptTopic();
  const decline = useDeclineTopic();
  const { push } = useToast();
  const busy = accept.isPending || decline.isPending;

  const onAccept = () => {
    const seconds = parseClock(time);
    if (seconds === null) {
      setErrors({ seconds: 'Write the time like 12:40, or 1:02:05.' });
      return;
    }
    if (!label.trim()) {
      setErrors({ label: 'Say what the video covers at this time.' });
      return;
    }
    setErrors({});
    accept.mutate(
      {
        id: t.id,
        body: {
          ...(seconds !== t.seconds ? { seconds } : {}),
          ...(label.trim() !== t.label ? { label: label.trim() } : {}),
        },
      },
      {
        onSuccess: () => push({ title: 'Time stamp added', body: 'It shows beside the video now.', tone: 'success' }),
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
      { id: t.id, reply: reply.trim() },
      {
        onSuccess: () => push({ title: 'Time stamp declined', body: 'The student gets your reason.', tone: 'success' }),
        onError: (e) => setErrors({ form: errorMessage(e, 'It wasn’t declined. Try again.') }),
      },
    );
  };

  return (
    <form
      className="sugg-review"
      aria-label={`Review “${t.label}”`}
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
        />
      ) : (
        <div className="mod-topics__fields">
          <TextField
            label="Time"
            value={time}
            inputMode="numeric"
            maxLength={8}
            onChange={(e) => setTime(e.target.value)}
            error={errors.seconds}
          />
          <TextField
            label="What it covers"
            value={label}
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
            error={errors.label}
            dir="auto"
          />
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
            <Button type="submit" variant="primary" size="sm" loading={decline.isPending} disabled={busy}>
              Decline
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeclining(false)} disabled={busy}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={accept.isPending}
              disabled={busy}
              data-hub="topic-accept"
            >
              Add beside the video
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

function TopicCard({ t }: { t: TopicOut }) {
  const remove = useRemoveTopic();
  const { push } = useToast();
  const status = t.status === 'accepted' ? { label: 'Shown', tone: 'signal' as const } : STATUS_LABEL[t.status];
  return (
    <li className="sugg-card" data-hub="topic-suggestion">
      <p className="sugg-card__where">
        {t.moduleTitle}
        <span aria-hidden="true"> · </span>
        {t.lessonTitle}
      </p>
      <h3 className="sugg-card__title" dir="auto">
        <Link to={atTime(t)}>
          <span className="mod-topics__at u-tabular">{clockLabel(t.seconds)}</span> {t.label}
        </Link>
      </h3>
      <p className="sugg-card__meta">
        {t.status === 'pending' ? null : (
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
        )}
        <span>
          {t.author?.displayName ?? 'A deleted account'} · <time dateTime={t.createdAt}>{timeAgo(t.createdAt)}</time>
        </span>
        {t.decidedBy ? <span>Reviewed by {t.decidedBy.displayName}</span> : null}
      </p>
      {t.status === 'declined' && t.reply ? (
        <p className="sugg-mine__reply" dir="auto">
          <strong>Why:</strong> {t.reply}
        </p>
      ) : null}
      {t.status === 'pending' ? <Review t={t} /> : null}
      {t.status === 'accepted' ? (
        <div className="sugg-review__actions">
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Icon glyph={glyph.trash} />}
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(
                { id: t.id, moduleId: t.moduleId },
                {
                  onSuccess: () => push({ title: 'Taken off the video', tone: 'info' }),
                  onError: (e) =>
                    push({ title: 'It’s still there', body: errorMessage(e, 'Try again.'), tone: 'alert' }),
                },
              )
            }
          >
            Take it off the video
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function TopicsQueue() {
  const [status, setStatus] = useState<SuggestionStatus>('pending');
  const list = useTopicQueue(status);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="sugg-queue" aria-label="Time stamps" data-hub="topics-queue">
      <div className="sugg-queue__head">
        <p className="sugg-queue__intro">
          Students’ time stamps for lessons’ videos. Open each at its time to check it. The student gets a notification
          either way.
        </p>
        <SegmentedControl label="Show" size="sm" options={SHOWN} value={status} onChange={setStatus} />
      </div>
      {list.isError && !list.data ? (
        <QueryError
          error={list.error}
          title="Time stamps didn’t load"
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
          size="sm"
        />
      ) : list.isPending ? (
        <Skeleton lines={4} />
      ) : items.length ? (
        <>
          <ul role="list" className="sugg-list">
            {items.map((t) => (
              <TopicCard key={t.id} t={t} />
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
            icon={<Icon glyph={glyph.clock} />}
            title={
              status === 'pending'
                ? 'Nothing waiting'
                : status === 'accepted'
                  ? 'Nothing accepted yet'
                  : 'Nothing declined'
            }
            body="Students add time stamps beside a lesson’s video."
          />
        </Panel>
      )}
    </section>
  );
}
