// A past question a day, organised by module: the student picks a module's chapters on its page (all by default),
// and which module Home's question comes from (none picked: their next exam's, in the six weeks before it). The
// choice is kept on the account (preferences.dailyQuestion), or in this browser for a guest. Pure, so it is tested
// (daily.test.ts); useDaily.ts reads and saves it, and asks for the day's question (GET /library/daily-question).
import type { DailyQuestionChoice } from '../../api/types';

export type DailyChoice = DailyQuestionChoice;

/** Every chapter of every module, and Home following the next exam. */
export const NO_CHOICE: DailyChoice = { moduleId: null, chapters: {} };

/** The weeks before an exam Home asks its module's question by itself, when the student picked no module: six. */
export const DAILY_WINDOW = 42;

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CHAPTER = /^[a-z0-9]{1,16}$/;
const isId = (x: unknown): x is string => typeof x === 'string' && ID.test(x);
const isChapter = (x: unknown): x is string => typeof x === 'string' && CHAPTER.test(x);

/** A choice read from this browser: what fits kept, the rest dropped; null when there is none. */
export function normalizeChoice(raw: unknown): DailyChoice | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { moduleId, chapters } = raw as Record<string, unknown>;
  const kept: Record<string, string[]> = {};
  if (chapters && typeof chapters === 'object' && !Array.isArray(chapters)) {
    for (const [m, ids] of Object.entries(chapters)) {
      const list = Array.isArray(ids) ? [...new Set(ids.filter(isChapter))] : [];
      if (isId(m) && list.length) kept[m] = list;
    }
  }
  return { moduleId: isId(moduleId) ? moduleId : null, chapters: kept };
}

/** Nothing chosen: every chapter, and Home on the next exam (saved as null). */
export function isNoChoice(c: DailyChoice): boolean {
  return c.moduleId == null && Object.keys(c.chapters).length === 0;
}

/** The chapters a module's question comes from; empty: all of them. */
export function chaptersFor(c: DailyChoice, moduleId: string): string[] {
  return c.chapters[moduleId] ?? [];
}

/** The choice with a module's chapters: `ids` of `all` its chapters (every one, or none: all of them again). */
export function withChapters(
  c: DailyChoice,
  moduleId: string,
  ids: readonly string[],
  all: readonly string[],
): DailyChoice {
  const chosen = all.filter((id) => ids.includes(id));
  const chapters = { ...c.chapters };
  if (!chosen.length || chosen.length === all.length) delete chapters[moduleId];
  else chapters[moduleId] = chosen;
  return { ...c, chapters };
}

/** The choice with Home's question from `moduleId` (null: the next exam's). */
export function withHomeModule(c: DailyChoice, moduleId: string | null): DailyChoice {
  return { ...c, moduleId };
}

export interface HomeDaily {
  moduleId: string;
  /** days to that module's exam, when Home follows the next exam; null for a module the student picked */
  examDays: number | null;
}

/** The module Home's question comes from: the one picked, else the next exam's in the DAILY_WINDOW days before it. */
export function homeDaily(
  c: DailyChoice,
  exam: { moduleId: string | null | undefined; days: number } | null,
): HomeDaily | null {
  if (c.moduleId) return { moduleId: c.moduleId, examDays: null };
  if (exam?.moduleId && exam.days >= 0 && exam.days <= DAILY_WINDOW)
    return { moduleId: exam.moduleId, examDays: exam.days };
  return null;
}

/** 'From 34 questions in the 3 chapters you chose', 'From all 120 questions in ST2133'. */
export function poolLine(pool: number, chosen: number, moduleName: string): string {
  const questions = `${pool} ${pool === 1 ? 'question' : 'questions'}`;
  if (chosen) return `From ${questions} in the ${chosen === 1 ? 'chapter' : `${chosen} chapters`} you chose`;
  return pool === 1 ? `From the one question in ${moduleName}` : `From all ${questions} in ${moduleName}`;
}
