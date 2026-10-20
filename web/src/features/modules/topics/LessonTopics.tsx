// "In this recording" beside the player (IDEA-52): what the lesson's video covers, by time, like chapters on YouTube.
// A time takes the video there (a class recording loads again at that time). Students suggest one with "Add a time
// stamp" (the video's time is filled in when the player tells it); a content manager checks it first, and the student
// sees it waiting, or why it was declined.
import { useId, useState } from 'react';
import { ApiError, errorMessage } from '../../../api/errors';
import type { Video } from '../../../api/types';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { Badge, Button, Icon, TextField, glyph } from '../../../ui';
import { useMyTopics, useSuggestTopic } from './api';
import { clockLabel, parseClock } from './time';
import './Topics.css';

const LABEL_MAX = 120;

interface LessonTopicsProps {
  video: Video;
  /** the player's time now, in seconds (null: it doesn't tell, or isn't playing) */
  now: () => number | null;
  onSeek: (seconds: number) => void;
}

function SuggestForm({ video, now, onDone }: { video: Video; now: () => number | null; onDone: () => void }) {
  const [time, setTime] = useState(() => {
    const t = now();
    return t === null ? '' : clockLabel(t);
  });
  const [label, setLabel] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suggest = useSuggestTopic();
  const { push } = useToast();
  const playerTime = now();

  const submit = () => {
    const seconds = parseClock(time);
    const missing: Record<string, string> = {};
    if (seconds === null) missing.seconds = 'Write the time like 12:40, or 1:02:05.';
    if (!label.trim()) missing.label = 'Say what the video covers at this time.';
    if (seconds === null || Object.keys(missing).length) {
      setErrors(missing);
      return;
    }
    setErrors({});
    suggest.mutate(
      { lessonId: video.id, seconds, label: label.trim() },
      {
        onSuccess: () => {
          onDone();
          push({
            title: 'Time stamp sent',
            body: 'A content manager checks it before it shows here. You’ll get a notification.',
            tone: 'success',
          });
        },
        onError: (e) =>
          setErrors(
            e instanceof ApiError && e.fields.label
              ? { label: e.fields.label }
              : { form: errorMessage(e, 'Your time stamp wasn’t sent. Try again.') },
          ),
      },
    );
  };

  return (
    <form
      className="mod-topics__form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      data-hub="topic-form"
    >
      <div className="mod-topics__fields">
        <TextField
          label="Time"
          value={time}
          inputMode="numeric"
          placeholder="12:40"
          maxLength={8}
          onChange={(e) => setTime(e.target.value)}
          error={errors.seconds}
          className="mod-topics__time"
        />
        <TextField
          label="What it covers"
          value={label}
          placeholder="Point estimation example"
          maxLength={LABEL_MAX}
          onChange={(e) => setLabel(e.target.value)}
          error={errors.label}
          dir="auto"
        />
      </div>
      {playerTime !== null ? (
        <button type="button" className="mod-topics__now" onClick={() => setTime(clockLabel(now() ?? playerTime))}>
          Use the video’s time
        </button>
      ) : null}
      {errors.form ? (
        <p className="mod-topics__error" role="alert">
          {errors.form}
        </p>
      ) : null}
      <div className="mod-topics__actions">
        <Button type="submit" size="sm" variant="primary" loading={suggest.isPending} data-hub="topic-send">
          Send for review
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={suggest.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function LessonTopics({ video, now, onSeek }: LessonTopicsProps) {
  const { me, featureOn, requireAuth } = useAuth();
  const [adding, setAdding] = useState(false);
  const headId = useId();
  const signedIn = !!me && !me.needsProfile && me.status !== 'suspended';
  const mine = useMyTopics(video.id, signedIn && featureOn('modules.time-stamps'));
  if (video.kind === 'youtube-playlist') return null;
  const topics = video.topics;
  const waiting = (mine.data ?? []).filter((t) => t.status === 'pending');
  const declined = (mine.data ?? []).filter((t) => t.status === 'declined').slice(0, 2);
  const startAdding = () => {
    if (requireAuth('Sign in to add a time stamp', () => setAdding(true))) setAdding(true);
  };

  return (
    <section className="mod-topics" aria-labelledby={headId} data-hub="lesson-topics">
      <div className="mod-topics__head">
        <h2 id={headId} className="mod-topics__title">
          In this {video.kind === 'bbb' ? 'recording' : 'video'}
        </h2>
        {topics.length ? <span className="mod-topics__count u-tabular">{topics.length}</span> : null}
      </div>
      {topics.length ? (
        <ol className="mod-topics__list" role="list">
          {topics.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="mod-topics__item"
                onClick={() => onSeek(t.seconds)}
                aria-label={`Go to ${clockLabel(t.seconds)}: ${t.label}`}
                data-hub="lesson-topic"
              >
                <span className="mod-topics__at u-tabular">{clockLabel(t.seconds)}</span>
                <span className="mod-topics__label" dir="auto">
                  {t.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mod-topics__empty">
          No time stamps yet. Know where something is? Add it, and the next student finds it in a tap.
        </p>
      )}
      {waiting.length || declined.length ? (
        <ul className="mod-topics__mine" role="list" aria-label="Your time stamps">
          {waiting.map((t) => (
            <li key={t.id}>
              <Badge tone="outline" size="sm">
                Waiting
              </Badge>
              <span className="u-tabular">{clockLabel(t.seconds)}</span> <span dir="auto">{t.label}</span>
            </li>
          ))}
          {declined.map((t) => (
            <li key={t.id} className="is-declined">
              <Badge tone="neutral" size="sm">
                Declined
              </Badge>
              <span className="u-tabular">{clockLabel(t.seconds)}</span> <span dir="auto">{t.label}</span>
              {t.reply ? <span className="mod-topics__why">: {t.reply}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {adding ? (
        <SuggestForm video={video} now={now} onDone={() => setAdding(false)} />
      ) : me?.status === 'suspended' ? null : (
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<Icon glyph={glyph.plus} />}
          onClick={startAdding}
          className="mod-topics__add"
          data-hub="topic-add"
        >
          Add a time stamp
        </Button>
      )}
    </section>
  );
}
