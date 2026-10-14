// A past question a day (IDEA-27): one tagged question from the module of your next exam, picked from the date so
// everyone sees the same one that day.
import type { PaperQuestion } from '../../api/types';
import { DAY_MS, type DayKey } from '../../lib/dates';

/** Fewer tags than this and the card stays hidden: the same handful would come round too often. */
export const DAILY_MIN_TAGS = 10;

/** The days before an exam the card shows for: six weeks. */
export const DAILY_WINDOW_DAYS = 42;

/** The day's question: the same for everyone on `day`, a different one the next day. null below DAILY_MIN_TAGS. */
export function dailyQuestion(questions: readonly PaperQuestion[], day: DayKey): PaperQuestion | null {
  if (questions.length < DAILY_MIN_TAGS) return null;
  const sorted = [...questions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
  return sorted[((n % sorted.length) + sorted.length) % sorted.length] ?? null;
}
