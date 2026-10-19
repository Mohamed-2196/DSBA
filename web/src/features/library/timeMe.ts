// "Time me": the one paper being timed, kept in this browser so the clock follows the student around the Hub (the
// paper's page, the notebook, Home) and survives a reload. Pure helpers here, unit-tested; useTimeMe() in
// viewer/useTimeMe.ts is their React face.
import { cleanClock, type ExamClock } from './papers';

/** Personal: it goes on sign-out with the rest (auth/queries.ts PERSONAL_STORAGE_PREFIXES). */
export const TIME_ME_KEY = 'hub.mine.timeMe';

/** The paper being timed: enough to name it and link back to it from anywhere. */
export interface TimedPaper {
  id: string;
  slug: string;
  /** 'ST2134 · May 2025 · Zone A' */
  title: string;
  moduleId: string | null;
}

export interface RunningTimer {
  paper: TimedPaper;
  clock: ExamClock;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 300;

/** The stored timer, or null for anything else (or a clock cleanClock throws out). */
export function cleanTimer(raw: unknown, now: number): RunningTimer | null {
  if (!raw || typeof raw !== 'object') return null;
  const { paper, clock } = raw as Record<string, unknown>;
  if (!paper || typeof paper !== 'object') return null;
  const { id, slug, title, moduleId } = paper as Record<string, unknown>;
  if (!isText(id) || !isText(slug) || !isText(title)) return null;
  if (moduleId !== null && !isText(moduleId)) return null;
  const c = cleanClock(clock, now);
  return c ? { paper: { id, slug, title, moduleId }, clock: c } : null;
}

/** The paper's page: where the full clock shows (the floating one stays out of its way there). */
export const timedPaperPath = (paper: Pick<TimedPaper, 'slug'>): string => `/library/${paper.slug}`;
