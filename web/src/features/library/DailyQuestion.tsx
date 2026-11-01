// A past question a day, by module: one tagged past question a day from the chapters the student picked (all of them
// by default), the same for everyone who picked the same that day, opening its paper at the question's page. Each
// module's page has its own (the module's Overview); Home asks the module the student put there, else their next
// exam's in the six weeks before it. The API picks the question (GET /library/daily-question); daily.ts has the rules
// and useDaily.ts the choice and the query.
//   <DailyQuestionBody question meta? />     the question, and the ways into it
//   <DailyQuestionDialog onClose moduleId modules? />
//                                            pick a module's chapters, and whether Home asks it (on Home, `modules`:
//                                            the modules to pick from); render it while open
//   <HomeDailyQuestion exam modules />       Home's card
import { useMemo, useState } from 'react';
import type { ModuleSummary, PaperQuestion } from '../../api/types';
import { useAuth } from '../../auth';
import { inDays } from '../../lib/dates';
import { paperLabel } from '../../lib/exams';
import { moduleLabel } from '../../lib/modules';
import { useModules } from '../../state/modules';
import {
  Button,
  DocThumb,
  Icon,
  Modal,
  PageSection,
  Panel,
  QueryError,
  SectionHeader,
  Select,
  Skeleton,
  glyph,
} from '../../ui';
import { AddToBoard } from '../board/public';
import { chaptersFor, homeDaily, withChapters, withHomeModule } from './daily';
import { answerHref, questionHref, questionNumber, useModuleQuestions } from './papers';
import { chapterPractice } from './practice';
import { questionAbout } from './topics';
import { useDailyChoice, useDailyOn, useDailyQuestion } from './useDaily';
import './DailyQuestion.css';

/** The day's question: which one, what it's on, and the ways into it. */
export function DailyQuestionBody({ question: q, meta }: { question: PaperQuestion; meta?: string | null }) {
  const { featureOn } = useAuth();
  const p = q.paper;
  return (
    <div className="lib-daily">
      {meta ? <p className="lib-daily__meta">{meta}</p> : null}
      <p className="lib-daily__q">
        <span className="u-tabular">Question {questionNumber(q)}</span>, {paperLabel(p)}
        {q.page ? <span className="lib-daily__page u-tabular"> (p. {q.page})</span> : null}
      </p>
      <p className="lib-daily__chapter">On {questionAbout(q)}. A new one tomorrow.</p>
      <div className="lib-daily__actions">
        <Button
          size="sm"
          variant="primary"
          to={questionHref(q)}
          trailingIcon={<Icon glyph={glyph.forward} />}
          data-hub="daily-open"
        >
          Open the question
        </Button>
        {q.answer ? (
          <Button
            size="sm"
            variant="secondary"
            to={answerHref(q.answer)}
            leadingIcon={<DocThumb tone="report" size="sm" />}
            data-hub="daily-answer"
          >
            Worked answer
          </Button>
        ) : null}
        {featureOn('board') ? <AddToBoard link={{ type: 'library_item', id: p.id }} /> : null}
      </div>
    </div>
  );
}

/** A module's chapters that have tagged questions, with how many each has, in the module's order. */
function useQuestionChapters(moduleId: string | null) {
  const questions = useModuleQuestions(moduleId, { enabled: !!moduleId });
  const chapters = useMemo(
    () =>
      chapterPractice(questions.data ?? [], new Map()).map((c) => ({
        id: c.chapterId,
        title: c.title,
        count: c.progress.total,
      })),
    [questions.data],
  );
  return { ...questions, chapters };
}

/**
 * Pick the chapters a module's question comes from, and whether Home asks it. On Home (`modules` given) the student
 * picks the module first, or leaves Home on their next exam. It starts from the saved choice each time it mounts.
 */
export function DailyQuestionDialog({
  onClose,
  moduleId,
  modules,
}: {
  onClose: () => void;
  /** the module whose chapters to pick (on Home: the one the card shows, if any) */
  moduleId: string | null;
  /** Home: the modules to pick from */
  modules?: readonly ModuleSummary[];
}) {
  const { choice, save } = useDailyChoice();
  const { getModule } = useModules();
  const onHomeCard = !!modules;
  // Home: '' is "your next exam's module"
  const [picked, setPicked] = useState(choice.moduleId ?? '');
  const target = onHomeCard ? picked || null : moduleId;
  const [homeToo, setHomeToo] = useState(choice.moduleId != null && choice.moduleId === moduleId);
  const { chapters, isPending, isError, error, refetch, isFetching } = useQuestionChapters(target);
  const all = useMemo(() => chapters.map((c) => c.id), [chapters]);
  // The ticks, per module: what the student picked before, or every chapter.
  const [ticks, setTicks] = useState<{ moduleId: string; ids: string[] } | null>(null);
  const before = target ? chaptersFor(choice, target).filter((id) => all.includes(id)) : [];
  const ticked = target && ticks?.moduleId === target ? ticks.ids : before.length ? before : all;
  const tick = (id: string, on: boolean) => {
    if (target) setTicks({ moduleId: target, ids: on ? [...ticked, id] : ticked.filter((x) => x !== id) });
  };

  const none = !!target && all.length > 0 && !ticked.length;
  const submit = () => {
    let next = target && all.length ? withChapters(choice, target, ticked, all) : choice;
    if (onHomeCard) next = withHomeModule(next, picked || null);
    else if (homeToo) next = withHomeModule(next, moduleId);
    else if (choice.moduleId === moduleId) next = withHomeModule(next, null);
    save(next);
    onClose();
  };

  // Home: the student's modules, and the one on Home now if it is another year's (picked on its page).
  const current = getModule(choice.moduleId);
  const moduleOptions =
    current && !modules?.some((m) => m.id === current.id) ? [...(modules ?? []), current] : (modules ?? []);

  const name = (id: string | null) => {
    const m = getModule(id);
    return m ? m.unitCode || m.shortName || m.name : 'this module';
  };

  let chapterList;
  if (!target) {
    chapterList = (
      <p className="lib-daily-dlg__note">
        In the six weeks before your next exam, Home asks a question from that module, from the chapters you ticked on
        its page.
      </p>
    );
  } else if (isPending) {
    chapterList = <Skeleton lines={4} />;
  } else if (isError) {
    chapterList = (
      <QueryError
        error={error}
        title="The chapters didn’t load"
        onRetry={() => void refetch()}
        retrying={isFetching}
        size="sm"
      />
    );
  } else if (!chapters.length) {
    chapterList = <p className="lib-daily-dlg__note">{name(target)} has no tagged past questions yet.</p>;
  } else {
    chapterList = (
      <fieldset className="lib-daily-dlg__group">
        <legend>Chapters</legend>
        {chapters.map((c) => (
          <label key={c.id} className="lib-daily-check" data-hub="daily-chapter">
            <input type="checkbox" checked={ticked.includes(c.id)} onChange={(e) => tick(c.id, e.target.checked)} />
            <span className="lib-daily-check__title">{c.title}</span>
            <span className="lib-daily-check__count u-tabular">
              {c.count} {c.count === 1 ? 'question' : 'questions'}
            </span>
          </label>
        ))}
        <div className="lib-daily-dlg__row">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTicks({ moduleId: target, ids: all })}
            disabled={ticked.length === all.length}
          >
            Tick every chapter
          </Button>
          {none ? (
            <p className="lib-daily-dlg__problem" role="alert">
              Tick at least one chapter.
            </p>
          ) : null}
        </div>
      </fieldset>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={onHomeCard ? 'Your past question a day' : `A question a day from ${name(moduleId)}`}
      description={
        onHomeCard
          ? 'Pick the module Home asks a question from each day, and its chapters.'
          : 'Each day’s question comes from the chapters you tick.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={none} data-hub="daily-save">
            Save
          </Button>
        </>
      }
    >
      <div className="lib-daily-dlg" data-hub="daily-dialog">
        {onHomeCard ? (
          <Select
            label="Module"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            options={[
              { value: '', label: 'Your next exam’s module' },
              ...moduleOptions.map((m) => ({ value: m.id, label: moduleLabel(m) })),
            ]}
            data-hub="daily-module"
          />
        ) : null}
        {chapterList}
        {onHomeCard ? null : (
          <label className="lib-daily-check lib-daily-check--home">
            <input type="checkbox" checked={homeToo} onChange={(e) => setHomeToo(e.target.checked)} />
            <span className="lib-daily-check__title">Ask me this module’s question on Home too</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

/**
 * Home's past question a day: from the module the student put on Home, else from their next exam's in the six weeks
 * before it, from the chapters they picked for it. With neither, it invites them to pick a module.
 */
export function HomeDailyQuestion({
  exam,
  modules,
}: {
  /** the student's next exam: its module and the days to it */
  exam: { moduleId: string | null | undefined; days: number } | null;
  /** the modules the student can pick from (their year's, or their papers) */
  modules: readonly ModuleSummary[];
}) {
  const on = useDailyOn();
  const { choice } = useDailyChoice();
  const { getModule } = useModules();
  const [open, setOpen] = useState(false);
  const target = homeDaily(choice, exam);
  const chapters = target ? chaptersFor(choice, target.moduleId) : [];
  const daily = useDailyQuestion(target?.moduleId, chapters, { enabled: on });
  if (!on) return null;

  const m = getModule(target?.moduleId);
  const name = m ? m.unitCode || m.shortName || m.name : 'This module';
  // nothing picked, and no exam soon (or its module has no question): an invitation to pick a module
  const inviting = !target || (target.examDays != null && !!daily.data && !daily.data.question);
  let body;
  if (inviting) {
    body = (
      <p className="lib-daily__lead">
        One past exam question a day, from a module and the chapters you choose: a few minutes of revision.
      </p>
    );
  } else if (daily.isPending) {
    body = <Skeleton lines={3} />;
  } else if (daily.isError) {
    body = (
      <QueryError
        error={daily.error}
        title="Today’s question didn’t load"
        onRetry={() => void daily.refetch()}
        retrying={daily.isFetching}
        size="sm"
      />
    );
  } else if (daily.data.question) {
    const what =
      target.examDays != null
        ? `exam ${inDays(target.examDays)}`
        : chapters.length
          ? `${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'}`
          : 'every chapter';
    body = <DailyQuestionBody question={daily.data.question} meta={`${name} · ${what}`} />;
  } else {
    body = (
      <p className="lib-daily__lead">
        {daily.data.offered
          ? `None of the chapters you ticked for ${name} has a tagged past question yet.`
          : `${name} doesn’t have enough tagged past questions for a question a day yet.`}
      </p>
    );
  }

  return (
    <PageSection aria-labelledby="home-daily" data-hub="daily-question">
      <SectionHeader
        id="home-daily"
        title="A past question a day"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            data-hub="daily-change"
          >
            {inviting ? 'Choose a module' : 'Change'}
          </Button>
        }
      />
      <Panel as="div">{body}</Panel>
      {open ? (
        <DailyQuestionDialog onClose={() => setOpen(false)} moduleId={target?.moduleId ?? null} modules={modules} />
      ) : null}
    </PageSection>
  );
}
