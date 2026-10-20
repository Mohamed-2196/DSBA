// The paper page's "Questions by topic": tag a question with one of the module's chapters and up to three of its
// study-guide topics, see the tags ("Chapter › Topic, Topic"), flag a wrong one, remove your own (people who manage
// the library remove any).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { LibraryItem, PaperQuestion, StudyTopic } from '../../../api/types';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { Link, useLocation } from 'react-router-dom';
import { appUrl } from '../../../lib/share';
import { useModules } from '../../../state/modules';
import { Button, Chip, Icon, IconButton, Modal, Select, Skeleton, TextField, cx, glyph } from '../../../ui';
import { PaperThreads, useQuestionThreads, useStartsThreads } from '../../forum/public';
import { WorkedAnswerLink } from '../components/QuestionExtras';
import { askAboutHref, examTitle, moduleTag } from '../display';
import { threadCounts, threadKey } from '../questionThreads';
import { questionAbout } from '../topics';
import { moduleDetailQuery } from '../../modules/public';
import {
  questionAnchor,
  questionLabel,
  questionHref,
  questionName,
  questionNumber,
  useFlagQuestion,
  usePaperQuestions,
  useRemoveQuestion,
  useTagQuestion,
} from '../papers';

/** A tag's study-guide topics at most (the API's TOPICS_MAX). */
const TOPICS_MAX = 3;
const QUESTIONS = Array.from({ length: 20 }, (_, i) => i + 1);
/** Sections a paper numbers from 1 each (Section A: 1 to 4, Section B: 1 to 3). */
const SECTIONS = ['A', 'B', 'C', 'D'] as const;

function TagRow({
  tag,
  onQuestion,
  askHref,
  threads,
  target,
}: {
  tag: PaperQuestion;
  onQuestion: (tag: PaperQuestion) => void;
  /** "Ask about Q3": a new thread linking the paper at the question; null while the person can't post */
  askHref: string | null;
  /** threads that link this question */
  threads: number;
  /** the question the page's address points at (#q3) */
  target: boolean;
}) {
  const { requireAuth, me } = useAuth();
  const { push } = useToast();
  const flag = useFlagQuestion();
  const remove = useRemoveQuestion();
  const [showThreads, setShowThreads] = useState(false);
  const number = questionNumber(tag);
  const name = questionName(tag);
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
    <li
      className={cx('lib-qtags__row', target && 'is-target')}
      id={target ? questionAnchor(tag) : undefined}
      data-hub="question-row"
    >
      {tag.page ? (
        <button
          type="button"
          className="lib-qtags__q"
          onClick={() => onQuestion(tag)}
          aria-label={`Show question ${number} on page ${tag.page}`}
        >
          {questionLabel(tag)}
        </button>
      ) : (
        <span className="lib-qtags__q">{questionLabel(tag)}</span>
      )}
      <span className="lib-qtags__chapter">{questionAbout(tag)}</span>
      {tag.flagCount ? <span className="lib-qtags__flags">Flagged by {tag.flagCount}</span> : null}
      <span className="lib-qtags__acts">
        {!tag.isMine && me?.status !== 'suspended' ? (
          <IconButton
            label={tag.flagged ? `Take back your flag on question ${number}` : `Flag question ${number}: wrong chapter`}
            icon={<Icon glyph={glyph.flag} />}
            size="sm"
            toggle
            active={tag.flagged}
            onClick={toggleFlag}
            disabled={flag.isPending}
          />
        ) : null}
        {tag.canRemove ? (
          <IconButton
            label={`Remove the tag on question ${number}`}
            icon={<Icon glyph={glyph.trash} />}
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
      {tag.answer || askHref || threads ? (
        <div className="lib-qx lib-qtags__extras">
          <WorkedAnswerLink question={tag} />
          {threads ? (
            <button
              type="button"
              className="lib-qx__link lib-qx__threads"
              aria-expanded={showThreads}
              onClick={() => setShowThreads((v) => !v)}
              data-hub="question-threads"
            >
              <Icon glyph={glyph.forum} />
              <span className="u-tabular">{threads === 1 ? '1 thread' : `${threads} threads`}</span>
            </button>
          ) : null}
          {askHref ? (
            <Link to={askHref} className="lib-qx__link" data-hub="ask-about-question">
              <Icon glyph={glyph.reply} />
              <span>Ask about {name}</span>
            </Link>
          ) : null}
        </div>
      ) : null}
      {showThreads ? (
        <div className="lib-qtags__threads">
          <PaperThreads slug={tag.paper.slug} question={questionAnchor(tag)} about={name} headingLevel={3} />
        </div>
      ) : null}
    </li>
  );
}

/** Dialog to tag a question number, page, chapter and the chapter's topics in one place. */
export function TagQuestionDialog({
  open,
  onClose,
  item,
  chapters,
}: {
  open: boolean;
  onClose: () => void;
  item: LibraryItem;
  chapters: Array<{ id: string; title: string; topics: StudyTopic[] }>;
}) {
  const { push } = useToast();
  const tag = useTagQuestion(item.id);
  const [section, setSection] = useState('');
  const [question, setQuestion] = useState('');
  const [chapter, setChapter] = useState('');
  const [page, setPage] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const chapterTopics = chapters.find((c) => c.id === chapter)?.topics ?? [];

  const reset = () => {
    setSection('');
    setQuestion('');
    setChapter('');
    setPage('');
    setTopics([]);
    setError(null);
  };

  const toggleTopic = (id: string, on: boolean) =>
    setTopics((now) => (on ? [...now, id].slice(0, TOPICS_MAX) : now.filter((t) => t !== id)));

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
      {
        section: section || null,
        question: Number(question),
        chapterId: chapter,
        page: page ? Number(page) : null,
        topicIds: topics,
      },
      {
        onSuccess: (t) => {
          push({ title: `Tagged ${questionLabel(t)}: ${questionAbout(t)}`, tone: 'success' });
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
          <Select
            label="Section"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            hint="If each section starts at 1"
          >
            <option value="">None</option>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select label="Question" value={question} onChange={(e) => setQuestion(e.target.value)}>
            <option value="">Pick</option>
            {QUESTIONS.map((n) => (
              <option key={n} value={n}>
                {section ? `${section}${n}` : `Q${n}`}
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
        <Select
          label="Chapter"
          value={chapter}
          onChange={(e) => {
            setChapter(e.target.value);
            setTopics([]);
          }}
          error={error ?? undefined}
        >
          <option value="">Pick a chapter</option>
          {chapters.map((c, i) => (
            <option key={c.id} value={c.id}>
              {i + 1}. {c.title}
            </option>
          ))}
        </Select>
        {chapterTopics.length ? (
          <fieldset className="lib-qtags__topics" data-hub="tag-question-topics">
            <legend className="lib-qtags__topics-h">Topics</legend>
            <p className="lib-qtags__topics-hint">Optional. Pick up to {TOPICS_MAX} from the study guide.</p>
            <div className="lib-qtags__topics-list">
              {chapterTopics.map((t) => {
                const on = topics.includes(t.id);
                return (
                  <Chip
                    key={t.id}
                    size="sm"
                    selected={on}
                    disabled={!on && topics.length >= TOPICS_MAX}
                    onChange={(next) => toggleTopic(t.id, next)}
                  >
                    {t.title}
                  </Chip>
                );
              })}
            </div>
          </fieldset>
        ) : null}
      </form>
    </Modal>
  );
}

/** Shown on a module's published past paper while the feature is on. `onQuestion` opens the PDF at a question and
 *  marks where it starts. */
export function QuestionTags({ item, onQuestion }: { item: LibraryItem; onQuestion: (tag: PaperQuestion) => void }) {
  const { requireAuth, me, featureOn } = useAuth();
  const tags = usePaperQuestions(item.id);
  const { getModule } = useModules();
  const starts = useStartsThreads();
  const threads = useQuestionThreads({ paper: item.slug }, { enabled: featureOn('forum') });
  const counts = threadCounts(threads.data);
  const { hash } = useLocation();
  const paperName = examTitle(item, moduleTag(getModule(item.moduleId)));
  const loaded = !!tags.data?.length;
  // A link to one question (/library/<slug>#q3, from a thread or a chapter's list): bring its row into view.
  useEffect(() => {
    if (!loaded || !hash) return;
    document.getElementById(hash.slice(1).toLowerCase())?.scrollIntoView({ block: 'nearest' });
  }, [loaded, hash]);
  const askHref = (t: PaperQuestion) =>
    starts ? askAboutHref(item, `${questionName(t)} of ${paperName}`, appUrl(questionHref(t))) : null;
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
          <Button size="sm" variant="secondary" leadingIcon={<Icon glyph={glyph.edit} />} onClick={openDialog}>
            Tag a question
          </Button>
        ) : null}
      </div>
      {tags.data?.length ? (
        <p className="lib-qtags__desc">Each question shows on its chapter, on the module’s Lessons tab.</p>
      ) : null}

      {tags.isPending ? (
        <Skeleton lines={2} />
      ) : tags.data?.length ? (
        <ul role="list" className="lib-qtags__list">
          {tags.data.map((t) => (
            <TagRow
              key={t.id}
              tag={t}
              onQuestion={onQuestion}
              askHref={askHref(t)}
              threads={counts.get(threadKey(t)) ?? 0}
              target={hash.toLowerCase() === `#${questionAnchor(t)}`}
            />
          ))}
        </ul>
      ) : (
        <div className="lib-qtags__empty">
          <p>No questions tagged yet. Tag one so it shows on its chapter.</p>
          {canTag ? (
            <Button size="sm" variant="secondary" leadingIcon={<Icon glyph={glyph.edit} />} onClick={openDialog}>
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
