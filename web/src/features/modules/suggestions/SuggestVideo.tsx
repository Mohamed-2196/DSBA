// "Suggest a video" under a module's lessons (IDEA-15): a student suggests a YouTube video or playlist, or a class
// recording, for one of the module's chapters, and sees what became of their suggestions. Content managers review
// them in Manage → Suggested videos. Shown while the feature is on for the viewer.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, YoutubeLogo } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '../../../api/errors';
import type { ModuleDetail, SuggestionOut } from '../../../api/types';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { Badge, Button, Modal, Select, TextField, timeAgo } from '../../../ui';
import { lessonHref } from '../lessons';
import { useMySuggestions, useSuggestVideo } from './api';
import { STATUS_LABEL } from './model';
import './Suggestions.css';

const TITLE_MAX = 200;
const REASON_MAX = 300;

function SuggestDialog({ module: m, open, onClose }: { module: ModuleDetail; open: boolean; onClose: () => void }) {
  const [chapterId, setChapterId] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suggest = useSuggestVideo();
  const { push } = useToast();

  const close = () => {
    if (suggest.isPending) return;
    onClose();
    setChapterId('');
    setUrl('');
    setTitle('');
    setReason('');
    setErrors({});
  };

  const submit = () => {
    const missing: Record<string, string> = {};
    if (!url.trim()) missing.url = 'Paste the video’s link.';
    if (!title.trim()) missing.title = 'Give the video a title.';
    if (Object.keys(missing).length) {
      setErrors(missing);
      return;
    }
    suggest.mutate(
      { moduleId: m.id, chapterId: chapterId || null, url: url.trim(), title: title.trim(), reason: reason.trim() },
      {
        onSuccess: () => {
          close();
          push({ title: 'Video suggested', body: 'A content manager will review it. You’ll get a notification when they do.', tone: 'success' });
        },
        onError: (e) => {
          if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
          else setErrors({ form: errorMessage(e, 'Your suggestion wasn’t sent. Try again.') });
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Suggest a video"
      description={`For ${m.unitCode || m.name}. A content manager checks it before it becomes a lesson.`}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={suggest.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={suggest.isPending} data-hub="suggestion-send">
            Send suggestion
          </Button>
        </>
      }
    >
      <form
        className="sugg-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <TextField
          label="Link"
          type="url"
          inputMode="url"
          value={url}
          maxLength={500}
          onChange={(e) => setUrl(e.target.value)}
          error={errors.url}
          hint="A YouTube video or playlist, or a class recording from vc.bibf.com."
          required
          data-autofocus
        />
        <TextField
          label="Title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          hint="What the video covers, like “Gradient descent, step by step”."
          required
          dir="auto"
        />
        {m.chapters.length ? (
          <Select
            label="Chapter"
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            placeholder="Not sure: let the editors choose"
            options={m.chapters.map((c, i) => ({ value: c.id, label: `${i + 1}. ${c.title}` }))}
            error={errors.chapterId}
          />
        ) : null}
        <TextField
          label="Why this video?"
          value={reason}
          maxLength={REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          hint="Optional. One line, like “Clearer than the study guide on chapter 3”."
          dir="auto"
        />
        {errors.form || errors.moduleId ? (
          <p className="sugg-form__error" role="alert">
            {errors.form ?? errors.moduleId}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function MySuggestion({ s }: { s: SuggestionOut }) {
  const status = STATUS_LABEL[s.status];
  return (
    <li className="sugg-mine__item">
      <p className="sugg-mine__title" dir="auto">
        {s.lessonId ? <Link to={lessonHref(s.moduleId, s.lessonId)}>{s.title}</Link> : s.title}
      </p>
      <p className="sugg-mine__meta">
        <Badge tone={status.tone} size="sm">
          {status.label}
        </Badge>
        <span>
          {s.chapterTitle ?? 'Any chapter'} · <time dateTime={s.createdAt}>{timeAgo(s.createdAt)}</time>
        </span>
      </p>
      {s.status === 'declined' && s.reply ? (
        <p className="sugg-mine__reply" dir="auto">
          <strong>Why:</strong> {s.reply}
        </p>
      ) : null}
    </li>
  );
}

export function SuggestVideo({ module: m }: { module: ModuleDetail }) {
  const { me, requireAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const signedIn = !!me && !me.needsProfile;
  const mine = useMySuggestions(m.id, signedIn);
  if (me?.status === 'suspended') return null;
  const start = () => {
    if (requireAuth('Sign in to suggest a video', () => setOpen(true))) setOpen(true);
  };
  const items = signedIn ? (mine.data ?? []) : [];
  return (
    <section className="sugg-panel" aria-labelledby="sugg-panel-title" data-hub="suggest-video">
      <div className="sugg-panel__head">
        <YoutubeLogo className="sugg-panel__icon" weight="duotone" aria-hidden="true" />
        <div className="sugg-panel__text">
          <h2 id="sugg-panel-title" className="sugg-panel__title">
            Know a good video for this module?
          </h2>
          <p className="sugg-panel__body">Suggest it for a chapter. A content manager checks every suggestion before it becomes a lesson.</p>
        </div>
        <Button leadingIcon={Plus} onClick={start} className="sugg-panel__action">
          Suggest a video
        </Button>
      </div>
      {items.length ? (
        <div className="sugg-mine">
          <h3 className="sugg-mine__h">Your suggestions</h3>
          <ul role="list" className="sugg-mine__list">
            {items.map((s) => (
              <MySuggestion key={s.id} s={s} />
            ))}
          </ul>
        </div>
      ) : null}
      <SuggestDialog module={m} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
