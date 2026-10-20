// "Time me": the one paper being timed, kept in this browser so the clock follows the student around the Hub (the
// paper's page, the notebook, Home) and survives a reload. Pure helpers here, unit-tested; useTimeMe() in
// viewer/ExamTimer.tsx is their React face.
import { clockLabel, clockLeft, clockPause, clockResume, cleanClock, type ExamClock } from './papers';

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
  /** The student ended the attempt: the clock is stopped where it was, and Resume still carries on from there. */
  ended: boolean;
}

/** Where the attempt stands: the clock going, paused, ended by the student (resumable), or out of time. */
export type TimerPhase = 'running' | 'paused' | 'ended' | 'done';

export function timerPhase(t: RunningTimer, now: number): TimerPhase {
  if (clockLeft(t.clock, now) <= 0) return 'done';
  if (t.ended) return 'ended';
  return t.clock.endsAt === null ? 'paused' : 'running';
}

export const pauseTimer = (t: RunningTimer, now: number): RunningTimer => ({ ...t, clock: clockPause(t.clock, now) });

/** Resume, from a pause or from an ended attempt alike. */
export const resumeTimer = (t: RunningTimer, now: number): RunningTimer => ({
  ...t,
  clock: clockResume(t.clock, now),
  ended: false,
});

/** End the attempt: the clock stops where it is, so skipping "How did it go?" loses nothing. */
export const endTimer = (t: RunningTimer, now: number): RunningTimer => ({
  ...t,
  clock: clockPause(t.clock, now),
  ended: true,
});

/** Closing the timer asks "End this attempt?" first while the attempt is still on; once ended or out of time it
 *  just closes. */
export const closeAsksFirst = (phase: TimerPhase): boolean => phase === 'running' || phase === 'paused';

/** How far in the student is: '1:30:12'. */
export const elapsedLabel = (clock: ExamClock, now: number): string => clockLabel(clock.total - clockLeft(clock, now));

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 300;

/** The stored timer, or null for anything else (or a clock cleanClock throws out). */
export function cleanTimer(raw: unknown, now: number): RunningTimer | null {
  if (!raw || typeof raw !== 'object') return null;
  const { paper, clock, ended } = raw as Record<string, unknown>;
  if (!paper || typeof paper !== 'object') return null;
  const { id, slug, title, moduleId } = paper as Record<string, unknown>;
  if (!isText(id) || !isText(slug) || !isText(title)) return null;
  if (moduleId !== null && !isText(moduleId)) return null;
  const c = cleanClock(clock, now);
  // An ended attempt is a stopped clock; a running one can't be ended.
  return c ? { paper: { id, slug, title, moduleId }, clock: c, ended: ended === true && c.endsAt === null } : null;
}

/** The paper's page: where the full clock shows (the floating one stays out of its way there). */
export const timedPaperPath = (paper: Pick<TimedPaper, 'slug'>): string => `/library/${paper.slug}`;
