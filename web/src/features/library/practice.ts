// Practise a chapter: a student's done, stuck or skipped on a chapter's tagged past questions (/library/question-marks),
// kept in the account. Hooks, and the pure helpers the practise page, the chapter's list and the module page share.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { PaperQuestion, QuestionMark, QuestionMarkSave } from '../../api/types';
import { useAuth } from '../../auth';
import { questionKey, useModuleQuestions } from './papers';

export type Mark = QuestionMark['mark'];

export const MARKS_KEY = ['library', 'question-marks'] as const;
const marksKey = (moduleId: string) => [...MARKS_KEY, moduleId] as const;

/** Whether practising is on for this person: the switches, and an account that has a profile. */
export function usePracticeOn(): boolean {
  const { me, featureOn } = useAuth();
  return (
    featureOn('library') && featureOn('library.questions') && featureOn('library.practice') && !!me && !me.needsProfile
  );
}

/** The student's marks on a module's papers. Nothing for guests. */
export function useQuestionMarks(moduleId: string | null | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: marksKey(moduleId ?? ''),
    queryFn: ({ signal }): Promise<QuestionMark[]> =>
      call(api.GET('/api/v1/library/question-marks', { params: { query: { module_id: moduleId ?? '' } }, signal })),
    enabled: enabled && !!moduleId,
    staleTime: 30_000,
  });
}

/** Marks a question (or takes its mark back with `mark: null`), updating the module's marks at once. */
export function useMarkQuestion(moduleId: string) {
  const qc = useQueryClient();
  const key = marksKey(moduleId);
  return useMutation({
    mutationFn: async (body: Omit<QuestionMarkSave, 'mark'> & { mark: Mark | null }): Promise<void> => {
      if (body.mark === null) {
        await call(
          api.DELETE('/api/v1/library/question-marks', {
            params: { query: { item_id: body.itemId, section: body.section ?? null, question: body.question } },
          }),
        );
      } else {
        await call(api.PUT('/api/v1/library/question-marks', { body: { ...body, mark: body.mark } }));
      }
    },
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<QuestionMark[]>(key);
      qc.setQueryData<QuestionMark[]>(key, (marks) => withMark(marks ?? [], body, new Date().toISOString()));
      return { before };
    },
    onError: (_e, _body, ctx) => qc.setQueryData(key, ctx?.before),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** The marks with one set (or taken off with `mark: null`), the newest first. */
export function withMark(
  marks: readonly QuestionMark[],
  target: Omit<QuestionMarkSave, 'mark'> & { mark: Mark | null },
  now: string,
): QuestionMark[] {
  const key = questionKey({ itemId: target.itemId, section: target.section ?? null, question: target.question });
  const rest = marks.filter((m) => questionKey(m) !== key);
  if (target.mark === null) return rest;
  return [
    {
      itemId: target.itemId,
      section: target.section ?? null,
      question: target.question,
      mark: target.mark,
      updatedAt: now,
    },
    ...rest,
  ];
}

/** Marks by question key (questionKey). */
export function marksByKey(marks: readonly QuestionMark[] | undefined): Map<string, Mark> {
  return new Map((marks ?? []).map((m) => [questionKey(m), m.mark]));
}

/** A tagged question's key, the same as its mark's. */
export function tagKey(q: Pick<PaperQuestion, 'section' | 'question' | 'paper'>): string {
  return questionKey({ itemId: q.paper.id, section: q.section, question: q.question });
}

export interface Progress {
  total: number;
  done: number;
  stuck: number;
  skipped: number;
}

/** How far a student is through these questions; a question tagged with two of them counts once. */
export function progressOf(questions: readonly PaperQuestion[], marks: Map<string, Mark>): Progress {
  const keys = new Set(questions.map(tagKey));
  const out: Progress = { total: keys.size, done: 0, stuck: 0, skipped: 0 };
  for (const key of keys) {
    const mark = marks.get(key);
    if (mark === 'done') out.done += 1;
    else if (mark === 'stuck') out.stuck += 1;
    else if (mark === 'skipped') out.skipped += 1;
  }
  return out;
}

/** '30 of 87 done, 4 stuck'; '0 of 87 done' before the first. */
export function progressLabel(p: Progress): string {
  const parts = [`${p.done} of ${p.total} done`];
  if (p.stuck) parts.push(`${p.stuck} stuck`);
  return parts.join(', ');
}

/** A chapter's questions to practise, one per question (the API lists the newest sitting first). */
export function practiseList(questions: readonly PaperQuestion[], chapterId: string): PaperQuestion[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    if (q.chapterId !== chapterId) return false;
    const key = tagKey(q);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type PractiseFilter = 'all' | 'todo' | 'stuck';

/** The questions a filter keeps: every one, the ones not done yet (unmarked, stuck or skipped), or the stuck ones. */
export function filtered(
  list: readonly PaperQuestion[],
  marks: Map<string, Mark>,
  filter: PractiseFilter,
): PaperQuestion[] {
  if (filter === 'all') return [...list];
  return list.filter((q) => {
    const mark = marks.get(tagKey(q));
    return filter === 'stuck' ? mark === 'stuck' : mark !== 'done';
  });
}

/** Where to go after marking the question at `from`: the next one without a mark, else the next one, else null. */
export function nextAfter(list: readonly PaperQuestion[], marks: Map<string, Mark>, from: number): number | null {
  for (let i = from + 1; i < list.length; i += 1) if (!marks.has(tagKey(list[i]))) return i;
  for (let i = 0; i < from; i += 1) if (!marks.has(tagKey(list[i]))) return i;
  return from + 1 < list.length ? from + 1 : null;
}

/** Where a practice starts: the first question without a mark, else the first. */
export function startAt(list: readonly PaperQuestion[], marks: Map<string, Mark>): number {
  const i = list.findIndex((q) => !marks.has(tagKey(q)));
  return i === -1 ? 0 : i;
}

/** The practise page of a chapter. */
export function practisePath(moduleId: string, chapterId: string): string {
  return `/modules/${encodeURIComponent(moduleId)}/practise/${encodeURIComponent(chapterId)}`;
}

/** Mark words, for buttons and screen readers. */
export const MARK_LABEL: Record<Mark, string> = { done: 'Done', stuck: 'Stuck', skipped: 'Skipped' };

export interface ChapterPractice {
  chapterId: string;
  title: string;
  progress: Progress;
}

/** Group a module's questions into its chapters' practice, in the API's chapter order (pure). */
export function chapterPractice(questions: readonly PaperQuestion[], marks: Map<string, Mark>): ChapterPractice[] {
  const order: string[] = [];
  const titles = new Map<string, string>();
  for (const q of questions) {
    if (!titles.has(q.chapterId)) {
      order.push(q.chapterId);
      titles.set(q.chapterId, q.chapterTitle);
    }
  }
  return order.map((id) => ({
    chapterId: id,
    title: titles.get(id) ?? '',
    progress: progressOf(practiseList(questions, id), marks),
  }));
}

/**
 * The module page's practice: each chapter with tagged past questions and how far the student is through it, and
 * the whole module (a question in two chapters counts once). `chapters` is null while practice is off for them or
 * the module has no tagged questions.
 */
export function useModulePractice(moduleId: string) {
  const on = usePracticeOn();
  const questions = useModuleQuestions(moduleId, { enabled: on });
  const marks = useQuestionMarks(moduleId, { enabled: on });
  const byKey = marksByKey(marks.data);
  const ready = on && !!questions.data?.length && !!marks.data;
  return {
    isPending: on && (questions.isPending || marks.isPending),
    chapters: ready && questions.data ? chapterPractice(questions.data, byKey) : null,
    total: ready && questions.data ? progressOf(questions.data, byKey) : null,
  };
}
