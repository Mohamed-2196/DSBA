import { useRef, useState } from 'react';
import type { ThreadDetail, ThreadUpdate } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { Button, TextField } from '../../../ui';
import { useUpdateThread } from '../api';
import { usePlacementRules, type Placement } from '../lib/placement';
import { BODY_MAX, TITLE_MAX, threadFieldErrors, titleProblem, type ThreadErrors } from '../lib/threadForm';
import { useAttachImages } from '../lib/useAttachImages';
import { AttachmentList } from './ImageAttachments';
import { MarkdownEditor } from './MarkdownEditor';
import { CategorySelect, ModuleSelect, TagPicker } from './ThreadFields';
import './dialogs.css';

type Errors = ThreadErrors & { form?: string };

/** What changed between the thread and the form (only that is sent). */
function changes(thread: ThreadDetail, form: { title: string; body: string; place: Placement; tags: string[] }): ThreadUpdate {
  const patch: ThreadUpdate = {};
  if (form.title !== thread.title) patch.title = form.title;
  if (form.body !== thread.body.trim()) patch.body = form.body;
  if (form.place.category !== thread.category) patch.category = form.place.category;
  if ((form.place.moduleId || null) !== (thread.moduleId ?? null)) patch.moduleId = form.place.moduleId || null;
  if (form.tags.join() !== thread.tags.join()) patch.tags = form.tags;
  return patch;
}

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
    const next: Errors = {};
    const problem = titleProblem(title);
    if (problem) next.title = problem;
    if (images.busy) next.form = 'Wait for the image to finish uploading.';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    const patch = changes(thread, { title: title.trim(), body: body.trim(), place, tags });
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
        // A field the API turned down (an unknown module, too many tags) says so under that field.
        onError: (e) => setErrors(threadFieldErrors(e) ?? { form: errorMessage(e, "Your changes weren't saved. Try again.") }),
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
      <input {...images.fileInput} />
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
