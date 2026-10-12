import { useRef, useState } from 'react';
import type { ThreadDetail, ThreadUpdate } from '../../../api/types';
import { ApiError, errorMessage } from '../../../api/errors';
import { Button, TextField } from '../../../ui';
import { useUpdateThread } from '../api';
import { usePlacementRules, type Placement } from '../lib/placement';
import { useAttachImages } from '../lib/useAttachImages';
import { AttachmentList } from './ImageAttachments';
import { MarkdownEditor } from './MarkdownEditor';
import { CategorySelect, ModuleSelect, TagPicker } from './ThreadFields';
import './dialogs.css';

const TITLE_MIN = 5;
const TITLE_MAX = 160;
const BODY_MAX = 20_000;

type Errors = Partial<Record<'title' | 'body' | 'category' | 'moduleId' | 'tags' | 'form', string>>;

/** Edit the original post in place: title, details (with pictures), where it lives and its tags. */
export function ThreadEditForm({ thread, onDone }: { thread: ThreadDetail; onDone: (updated: ThreadDetail | null) => void }) {
  const update = useUpdateThread();
  const rules = usePlacementRules();
  const [title, setTitle] = useState(thread.title);
  const [body, setBody] = useState(thread.body);
  const [place, setPlace] = useState<Placement>({ category: thread.category, moduleId: thread.moduleId ?? '' });
  const [tags, setTags] = useState<string[]>(thread.tags);
  const [errors, setErrors] = useState<Errors>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const images = useAttachImages({ text: body, setText: setBody, textareaRef: bodyRef });

  const save = () => {
    const t = title.trim();
    const next: Errors = {};
    if (t.length < TITLE_MIN) next.title = `Make the title at least ${TITLE_MIN} characters long.`;
    if (images.busy) next.form = 'Wait for the image to finish uploading.';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    // Only what changed.
    const patch: ThreadUpdate = {};
    if (t !== thread.title) patch.title = t;
    if (body.trim() !== thread.body.trim()) patch.body = body.trim();
    if (place.category !== thread.category) patch.category = place.category;
    if ((place.moduleId || null) !== (thread.moduleId ?? null)) patch.moduleId = place.moduleId || null;
    if (tags.join() !== thread.tags.join()) patch.tags = tags;
    if (!Object.keys(patch).length) {
      onDone(null);
      return;
    }
    update.mutate(
      { threadId: thread.id, patch },
      {
        onSuccess: (updated) => {
          images.reset();
          onDone(updated);
        },
        onError: (e) => {
          const f = e instanceof ApiError ? e.fields : {};
          if (f.title || f.body || f.category || f.moduleId || f.tags) {
            setErrors({ title: f.title, body: f.body, category: f.category, moduleId: f.moduleId, tags: f.tags });
          } else {
            setErrors({ form: errorMessage(e, "Your changes weren't saved. Try again.") });
          }
        },
      },
    );
  };

  return (
    <form
      className="forum-edit forum-edit--thread"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
      aria-label="Edit thread"
    >
      <TextField
        label="Title"
        value={title}
        maxLength={TITLE_MAX}
        error={errors.title}
        dir="auto"
        onChange={(e) => {
          setTitle(e.target.value);
          if (errors.title) setErrors((x) => ({ ...x, title: undefined }));
        }}
        autoFocus
      />
      <div className="forum-composer__row">
        <CategorySelect value={place.category} error={errors.category} onChange={(id) => setPlace((p) => rules.withCategory(p, id))} />
        <ModuleSelect
          value={place.moduleId}
          error={errors.moduleId}
          onChange={(id) => {
            setPlace((p) => rules.withModule(p, id));
            if (errors.moduleId) setErrors((x) => ({ ...x, moduleId: undefined }));
          }}
        />
      </div>
      <TagPicker value={tags} onChange={setTags} error={errors.tags} />
      {images.input}
      <MarkdownEditor
        label="Details"
        value={body}
        onChange={(v) => {
          setBody(v);
          if (errors.body) setErrors((x) => ({ ...x, body: undefined }));
        }}
        error={errors.body}
        rows={7}
        onSubmit={save}
        textareaRef={bodyRef}
        onAttachImage={images.pick}
        onImageFiles={images.addFiles}
        textareaProps={{ dir: 'auto', maxLength: BODY_MAX }}
      />
      <AttachmentList
        uploads={images.cards}
        onRetry={images.retry}
        onRemove={(key) => {
          images.remove(key);
          requestAnimationFrame(() => bodyRef.current?.focus({ preventScroll: true }));
        }}
      />
      {errors.form ? (
        <p className="forum-form-error" role="alert">
          {errors.form}
        </p>
      ) : null}
      <div className="forum-edit__actions">
        <Button variant="ghost" onClick={() => onDone(null)} disabled={update.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={update.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
