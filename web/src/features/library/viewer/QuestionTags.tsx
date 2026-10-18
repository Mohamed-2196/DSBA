// The paper page's "Questions by topic": tag a question with one of the module's chapters, see the tags, flag a
// wrong one, remove your own (people who manage the library remove any).
import { Flag, Tag, Trash } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { LibraryItem, PaperQuestion } from '../../../api/types';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { Button, IconButton, Modal, Select, Skeleton, TextField } from '../../../ui';
import { moduleDetailQuery } from '../../modules/public';
import { questionLabel, useFlagQuestion, usePaperQuestions, useRemoveQuestion, useTagQuestion } from '../papers';

const QUESTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

function TagRow({ tag, onPage }: { tag: PaperQuestion; onPage: (page: number) => void }) {
  const { requireAuth, me } = useAuth();
  const { push } = useToast();
  const flag = useFlagQuestion();
  const remove = useRemoveQuestion();
  const toggleFlag = () => {
    const run = () =>
      flag.mutate(
        { id: tag.id, on: !tag.flagged },
        {
          onSuccess: (t) =>
            push({ title: t.flagged ? 'Thanks: a student rep will check it' : 'Flag taken back', tone: 'success' }),
          onError: (e) => push({ title: 'Couldn’t flag this tag', body: errorMessage(e), tone: 'alert' }),
        },
      );
    if (requireAuth('Sign in to flag a tag', run)) run();
  };
  return (
    <li className="lib-qtags__row">
      {tag.page ? (
        <button
          type="button"
          className="lib-qtags__q"
          onClick={() => onPage(tag.page ?? 1)}
          aria-label={`Go to page ${tag.page} for question ${tag.question}`}
        >
          {questionLabel(tag)}
        </button>
      ) : (
        <span className="lib-qtags__q">{questionLabel(tag)}</span>
      )}
      <span className="lib-qtags__chapter">{tag.chapterTitle}</span>
      {tag.flagCount ? <span className="lib-qtags__flags">Flagged by {tag.flagCount}</span> : null}
      <span className="lib-qtags__acts">
        {!tag.isMine && me?.status !== 'suspended' ? (
          <IconButton
            label={
              tag.flagged
                ? `Take back your flag on question ${tag.question}`
                : `Flag question ${tag.question}: wrong chapter`
            }
            icon={Flag}
            size="sm"
            toggle
            active={tag.flagged}
            onClick={toggleFlag}
            disabled={flag.isPending}
          />
        ) : null}
        {tag.canRemove ? (
          <IconButton
            label={`Remove the tag on question ${tag.question}`}
            icon={Trash}
            size="sm"
            onClick={() =>
              remove.mutate(
                { id: tag.id },
                { onError: (e) => push({ title: 'Couldn’t remove the tag', body: errorMessage(e), tone: 'alert' }) },
              )
            }
            disabled={remove.isPending}
          />
        ) : null}
      </span>
    </li>
  );
}

/** Dialog to tag a question number, page, and chapter in one place. */
export function TagQuestionDialog({
  open,
  onClose,
  item,
  chapters,
}: {
  open: boolean;
  onClose: () => void;
  item: LibraryItem;
  chapters: Array<{ id: string; title: string }>;
}) {
  const { push } = useToast();
  const tag = useTagQuestion(item.id);
  const [question, setQuestion] = useState('');
  const [chapter, setChapter] = useState('');
  const [page, setPage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setQuestion('');
    setChapter('');
    setPage('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!question || !chapter) {
      setError('Pick the question and the chapter it’s on.');
      return;
    }
    tag.mutate(
      { question: Number(question), chapterId: chapter, page: page ? Number(page) : null },
      {
        onSuccess: (t) => {
          push({ title: `Tagged ${questionLabel(t)}: ${t.chapterTitle}`, tone: 'success' });
          handleClose();
        },
        onError: (err) => setError(isApiError(err) && err.code === 'already_tagged' ? err.message : errorMessage(err)),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Tag this question"
      description="Link a question from this paper to its chapter so classmates can find it on the Lessons tab."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="tag-question-form"
            loading={tag.isPending}
            data-hub="tag-question-submit"
          >
            Tag question
          </Button>
        </>
      }
    >
      <form id="tag-question-form" className="lib-qtags__form" onSubmit={submit} noValidate>
        <div className="lib-qtags__fields">
          <Select label="Question" value={question} onChange={(e) => setQuestion(e.target.value)}>
            <option value="">Pick</option>
            {QUESTIONS.map((n) => (
              <option key={n} value={n}>
                Q{n}
              </option>
            ))}
          </Select>
          <TextField
            label="Page"
            inputMode="numeric"
            value={page}
            onChange={(e) => setPage(e.target.value.replace(/\D/g, '').slice(0, 3))}
            hint="Optional"
          />
        </div>
        <Select label="Chapter" value={chapter} onChange={(e) => setChapter(e.target.value)} error={error ?? undefined}>
          <option value="">Pick a chapter</option>
          {chapters.map((c, i) => (
            <option key={c.id} value={c.id}>
              {i + 1}. {c.title}
            </option>
          ))}
        </Select>
      </form>
    </Modal>
  );
}

/** Shown on a module's published past paper while the feature is on. `onPage` opens the PDF at a page. */
export function QuestionTags({ item, onPage }: { item: LibraryItem; onPage: (page: number) => void }) {
  const { requireAuth, me } = useAuth();
  const tags = usePaperQuestions(item.id);
  const module = useQuery({ ...moduleDetailQuery(item.moduleId ?? ''), enabled: !!item.moduleId });
  const [dialogOpen, setDialogOpen] = useState(false);
  const chapters = module.data?.chapters ?? [];
  const canTag = me?.status !== 'suspended' && chapters.length > 0;

  const openDialog = () => {
    const run = () => setDialogOpen(true);
    if (requireAuth('Sign in to tag questions', run)) run();
  };

  return (
    <section className="lib-qtags" aria-labelledby="lib-qtags-h" data-hub="question-tags">
      <div className="lib-qtags__header">
        <h2 id="lib-qtags-h" className="lib-meta__h">
          Questions by topic
        </h2>
        {canTag && tags.data?.length ? (
          <Button size="sm" variant="secondary" leadingIcon={Tag} onClick={openDialog}>
            Tag a question
          </Button>
        ) : null}
      </div>
      <p className="lib-qtags__desc">
        Practice past questions organized by topic. Tag questions to help classmates revise for each chapter on the
        Lessons tab.
      </p>

      {tags.isPending ? (
        <Skeleton lines={2} />
      ) : tags.data?.length ? (
        <ul role="list" className="lib-qtags__list">
          {tags.data.map((t) => (
            <TagRow key={t.id} tag={t} onPage={onPage} />
          ))}
        </ul>
      ) : (
        <div className="lib-qtags__empty">
          <p>No questions tagged yet. Tag one so it shows under its chapter on the Lessons tab.</p>
          {canTag ? (
            <Button size="sm" variant="secondary" leadingIcon={Tag} onClick={openDialog}>
              Tag this question
            </Button>
          ) : null}
        </div>
      )}

      {dialogOpen ? (
        <TagQuestionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} item={item} chapters={chapters} />
      ) : null}
    </section>
  );
}
