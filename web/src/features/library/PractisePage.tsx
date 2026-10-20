// Practise a chapter (/modules/<module>/practise/<chapter>): the chapter's tagged past questions one at a time, the
// newest sitting first, each opening its paper at the question's page. Done, Stuck or Skip saves a mark to the account
// and moves on to the next question without one; Stuck offers the worked answer in the report and the forum.
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import type { PaperQuestion } from '../../api/types';
import { useAuth } from '../../auth';
import { paperLabel } from '../../lib/exams';
import { appUrl } from '../../lib/share';
import { useDocumentTitle, useToast } from '../../state';
import { useModules } from '../../state/modules';
import {
  Button,
  DocThumb,
  EmptyState,
  Icon,
  Page,
  PageHeader,
  Panel,
  QueryError,
  SegmentedControl,
  Skeleton,
  cx,
  glyph,
} from '../../ui';
import { useQuestionThreads, useStartsThreads } from '../forum/public';
import { askAboutPaper, useNooraAiReady } from '../noora/public';
import { MarkBadge } from './components/MarkBadge';
import { ThreadCount, WorkedAnswerLink } from './components/QuestionExtras';
import { askAboutHref, moduleTag } from './display';
import { answerHref, questionHref, questionLink, questionName, questionNumber, useModuleQuestions } from './papers';
import {
  filtered,
  marksByKey,
  nextAfter,
  practiseList,
  progressLabel,
  progressOf,
  startAt,
  tagKey,
  useMarkQuestion,
  usePracticeOn,
  useQuestionMarks,
  withMark,
  type Mark,
  type PractiseFilter,
  type Progress,
} from './practice';
import { threadCounts, threadKey } from './questionThreads';
import './PractisePage.css';

function Bar({ progress }: { progress: Progress }) {
  const pct = (n: number) => (progress.total ? (n / progress.total) * 100 : 0);
  return (
    <div className="lib-prac__bar" aria-hidden="true">
      <span className="lib-prac__bar-done" style={{ width: `${pct(progress.done)}%` }} />
      <span className="lib-prac__bar-stuck" style={{ width: `${pct(progress.stuck)}%` }} />
      <span className="lib-prac__bar-skipped" style={{ width: `${pct(progress.skipped)}%` }} />
    </div>
  );
}

const MARKS: { mark: Mark; label: string; icon: keyof typeof glyph }[] = [
  { mark: 'done', label: 'Done', icon: 'check' },
  { mark: 'stuck', label: 'Stuck', icon: 'flag' },
  { mark: 'skipped', label: 'Skip', icon: 'forward' },
];

export default function PractisePage() {
  const { moduleId = '', chapterId = '' } = useParams();
  const { requireAuth, me, featureOn } = useAuth();
  const { push } = useToast();
  const { getModule } = useModules();
  const location = useLocation();
  const module = getModule(moduleId);
  const practising = usePracticeOn();
  const questions = useModuleQuestions(moduleId);
  const marks = useQuestionMarks(moduleId, { enabled: practising });
  const threads = useQuestionThreads({ module_id: moduleId }, { enabled: featureOn('forum') });
  const starts = useStartsThreads();
  const save = useMarkQuestion(moduleId);
  const noora = useNooraAiReady();
  const [filter, setFilter] = useState<PractiseFilter>('all');
  const [current, setCurrent] = useState<string | null>(null);

  const list = questions.data ? practiseList(questions.data, chapterId) : [];
  const chapterTitle = list[0]?.chapterTitle ?? 'Chapter';
  useDocumentTitle(`Practise: ${chapterTitle}`);
  const byKey = marksByKey(marks.data);
  const progress = progressOf(list, byKey);
  const shown = filtered(list, byKey, filter);
  const found = current ? shown.findIndex((q) => tagKey(q) === current) : -1;
  const index = found >= 0 ? found : startAt(shown, byKey);
  const q: PaperQuestion | undefined = shown[index];
  const code = moduleTag(module) ?? module?.name ?? '';
  const moduleHref = `/modules/${encodeURIComponent(moduleId)}?tab=lessons`;
  const linkState = { from: `${location.pathname}${location.search}` };

  const go = (i: number) => {
    const next = shown[i];
    if (next) setCurrent(tagKey(next));
  };

  const markAs = (mark: Mark) => {
    if (!q) return;
    const run = () => {
      const target = { itemId: q.paper.id, section: q.section, question: q.question };
      const again = byKey.get(tagKey(q)) === mark; // pressing the mark it has takes it off
      save.mutate(
        { ...target, mark: again ? null : mark },
        { onError: (e) => push({ title: 'Couldn’t save your mark', body: errorMessage(e), tone: 'alert' }) },
      );
      if (again || mark === 'stuck') return; // stuck: stay, with the help below
      const after = marksByKey(withMark(marks.data ?? [], { ...target, mark }, new Date().toISOString()));
      const next = nextAfter(
        list,
        after,
        list.findIndex((x) => tagKey(x) === tagKey(q)),
      );
      if (next !== null && list[next]) setCurrent(tagKey(list[next]));
    };
    if (requireAuth('Sign in to keep your marks', run)) run();
  };

  const header = (
    <PageHeader
      section="modules"
      title={`Practise: ${chapterTitle}`}
      description={
        list.length
          ? `${code ? `${code} · ` : ''}${list.length} past ${list.length === 1 ? 'question' : 'questions'}, the newest sitting first.`
          : undefined
      }
      actions={
        <Button variant="secondary" size="sm" to={moduleHref} leadingIcon={<Icon glyph={glyph.back} />}>
          Back to the lessons
        </Button>
      }
    />
  );

  if (questions.isPending) {
    return (
      <Page width="narrow" className="lib-prac" data-section="modules">
        {header}
        <Skeleton height={220} radius={20} />
      </Page>
    );
  }
  if (questions.isError) {
    return (
      <Page width="narrow" className="lib-prac" data-section="modules">
        {header}
        <QueryError
          error={questions.error}
          title="The questions didn’t load"
          onRetry={() => void questions.refetch()}
          retrying={questions.isFetching}
        />
      </Page>
    );
  }
  if (!list.length) {
    return (
      <Page width="narrow" className="lib-prac" data-section="modules">
        {header}
        <EmptyState
          mate="binder"
          title="No past questions on this chapter yet"
          body="Tag a question on a past paper and it shows up here to practise."
          action={<Button to={`/modules/${encodeURIComponent(moduleId)}?tab=files`}>Open the past papers</Button>}
        />
      </Page>
    );
  }

  const mark = q ? byKey.get(tagKey(q)) : undefined;
  const n = q ? (threads.data ? (threadCounts(threads.data).get(threadKey(q)) ?? 0) : 0) : 0;
  const ask =
    q && starts
      ? askAboutHref(
          { moduleId },
          `${questionName(q)} of ${code ? `${code} · ` : ''}${paperLabel(q.paper)}`,
          appUrl(questionLink(q)),
        )
      : null;

  return (
    <Page width="narrow" className="lib-prac" data-section="modules" data-hub="practise-page">
      {header}

      <section className="lib-prac__progress" aria-label="Your progress">
        <div className="lib-prac__progress-line">
          <p className="lib-prac__count u-tabular" data-hub="practise-progress">
            {me ? progressLabel(progress) : `${progress.total} questions`}
          </p>
          <SegmentedControl<PractiseFilter>
            label="Which questions"
            size="sm"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setCurrent(null);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'todo', label: 'Not done' },
              { value: 'stuck', label: `Stuck${progress.stuck ? ` (${progress.stuck})` : ''}` },
            ]}
          />
        </div>
        {me ? <Bar progress={progress} /> : null}
        {!me ? <p className="lib-prac__hint">Sign in to keep your marks: done, stuck or skipped.</p> : null}
      </section>

      {!q ? (
        <EmptyState
          mate="binder"
          title={filter === 'stuck' ? 'Nothing marked stuck' : 'Every question done'}
          body={
            filter === 'stuck'
              ? 'Questions you mark Stuck wait here, with their worked answers.'
              : 'You’ve done every past question on this chapter. Go over them again, or practise another chapter.'
          }
          action={
            <Button
              onClick={() => {
                setFilter('all');
                setCurrent(null);
              }}
            >
              Show every question
            </Button>
          }
        />
      ) : (
        <Panel as="article" className="lib-prac__card" aria-labelledby="lib-prac-q" data-hub="practise-question">
          <div className="lib-prac__top">
            <p className="lib-prac__pos u-tabular">
              {index + 1} of {shown.length}
            </p>
            {mark ? <MarkBadge mark={mark} /> : null}
          </div>
          <div className="lib-prac__q">
            <DocThumb tone="paper" size="lg" />
            <div className="lib-prac__qtext">
              <h2 id="lib-prac-q" className="lib-prac__name u-tabular">
                {questionName(q)}
                {q.page ? <span className="lib-prac__page"> p. {q.page}</span> : null}
              </h2>
              <p className="lib-prac__paper">{paperLabel(q.paper)}</p>
            </div>
          </div>
          <div className="lib-prac__open">
            <Button
              variant="primary"
              to={questionHref(q)}
              state={linkState}
              trailingIcon={<Icon glyph={glyph.forward} />}
              data-hub="practise-open"
            >
              Open the paper
            </Button>
            <div className="lib-qx">
              <WorkedAnswerLink question={q} />
              <ThreadCount question={q} threads={n} />
            </div>
          </div>

          <div className="lib-prac__marks" role="group" aria-label={`How did ${questionName(q)} go?`}>
            {MARKS.map((m) => (
              <Button
                key={m.mark}
                variant={mark === m.mark ? 'primary' : 'secondary'}
                aria-pressed={mark === m.mark}
                leadingIcon={<Icon glyph={glyph[m.icon]} />}
                onClick={() => markAs(m.mark)}
                className={cx('lib-prac__mark', `lib-prac__mark--${m.mark}`)}
                data-hub={`practise-${m.mark}`}
              >
                {m.label}
              </Button>
            ))}
          </div>

          {mark === 'stuck' ? (
            <div className="lib-prac__help" data-hub="practise-help">
              <p className="lib-prac__help-h">Stuck? Try these</p>
              <ul role="list" className="lib-prac__help-list">
                {q.answer ? (
                  <li>
                    <Link to={answerHref(q.answer)} state={linkState}>
                      The worked answer in the examiners’ report, page {q.answer.page}
                    </Link>
                  </li>
                ) : (
                  <li className="lib-prac__help-none">This sitting’s report has no worked answer to this question.</li>
                )}
                {ask ? (
                  <li>
                    <Link to={ask}>Ask classmates about {questionName(q)} in the forum</Link>
                  </li>
                ) : null}
                {noora && q.page ? (
                  <li>
                    <button
                      type="button"
                      className="lib-prac__help-btn"
                      onClick={(e) =>
                        askAboutPaper(
                          {
                            itemId: q.paper.id,
                            title: q.paper.title,
                            page: q.page ?? 1,
                            question: questionNumber(q),
                          },
                          e.currentTarget,
                        )
                      }
                    >
                      Ask Mini Noora about {questionName(q)}
                    </button>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <div className="lib-prac__nav">
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<Icon glyph={glyph.back} />}
              onClick={() => go(index - 1)}
              disabled={index === 0}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              trailingIcon={<Icon glyph={glyph.forward} />}
              onClick={() => go(index + 1)}
              disabled={index >= shown.length - 1}
            >
              Next
            </Button>
          </div>
        </Panel>
      )}
    </Page>
  );
}
