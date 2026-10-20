// The exam timetable in one paste (Manage → Calendar): pure helpers for the rows the API read from the pasted text
// (POST /calendar/timetable/preview) and the rep checks, fixes and saves (POST /calendar/timetable).
import type { TimetableNotice, TimetableRow, TimetableRowIn, TimetableSaved } from '../../../api/types';
import { formatDay, formatShort, parseDay } from '../../../lib/dates';
import { cohortLabel } from '../../../state';

/** An exam's sitting: the main one (for the module's year) or a resit (for the year after and those resitting). */
export type Sitting = 'main' | 'resit';

export const SITTING_OPTIONS: { value: Sitting; label: string }[] = [
  { value: 'main', label: 'Main sitting' },
  { value: 'resit', label: 'Resit' },
];

/** A row as the rep edits it: its fields, and a key that stays while rows above it are removed. */
export interface DraftRow {
  key: string;
  unitCode: string;
  date: string;
  time: string;
  place: string;
  sitting: Sitting;
}

/** Whose a row's exam is, under its module: 'Year 1', or 'Year 1 resit, for Year 2' (none after the final year). */
export function rowWhose(row: Pick<TimetableRow, 'year' | 'resit'>): string | null {
  if (!row.year) return null;
  if (!row.resit) return cohortLabel(row.year);
  return row.year < 3 ? `${cohortLabel(row.year)} resit, for Year ${row.year + 1}` : `${cohortLabel(row.year)} resit`;
}

export const ACTION_LABEL: Record<TimetableRow['action'], string> = {
  update: 'Changes',
  new: 'New exam',
  same: 'No change',
  fix: 'Fix first',
};

/** The rows the API answered with, as drafts to edit. */
export const draftsOf = (rows: readonly TimetableRow[]): DraftRow[] =>
  rows.map((r, i) => ({
    key: `${r.line ?? 'r'}-${i}`,
    unitCode: r.unitCode ?? '',
    date: r.date ?? '',
    time: r.time ?? '',
    place: r.place ?? '',
    sitting: r.resit ? 'resit' : 'main',
  }));

/** A draft as the API takes it: empty fields are left out (a row without a time keeps the exam's). */
export const rowIn = (d: DraftRow): TimetableRowIn => ({
  unitCode: d.unitCode.trim() || null,
  date: d.date || null,
  time: d.time.trim() || null,
  place: d.place.trim() || null,
  resit: d.sitting === 'resit',
});

/** '14 rows: 9 change an exam, 3 new exams, 1 the same, 1 to fix.' */
export function summaryLine(rows: readonly Pick<TimetableRow, 'action'>[]): string {
  const n = (a: TimetableRow['action']) => rows.filter((r) => r.action === a).length;
  const parts = [
    [n('update'), (k: number) => (k === 1 ? '1 changes an exam' : `${k} change an exam`)],
    [n('new'), (k: number) => (k === 1 ? '1 new exam' : `${k} new exams`)],
    [n('same'), (k: number) => `${k} the same`],
    [n('fix'), (k: number) => `${k} to fix`],
  ] as const;
  const said = parts.filter(([k]) => k > 0).map(([k, say]) => say(k));
  const total = rows.length === 1 ? '1 row' : `${rows.length} rows`;
  return said.length ? `${total}: ${said.join(', ')}.` : `${total}.`;
}

/** What the exam says now, for a row that changes it: 'On the calendar: Tue 12 Oct, time not set, no venue. Not
 *  confirmed.' */
export function wasLine(row: Pick<TimetableRow, 'was'>): string | null {
  const was = row.was;
  if (!was) return null;
  const parts = [formatShort(parseDay(was.date)), was.time || 'time not set', was.place || 'no venue'];
  return `On the calendar${was.resit ? ' (resit)' : ''}: ${parts.join(', ')}.${was.sample ? ' Not confirmed.' : ''}`;
}

/** The rows a save refused, by index, from the API's field errors ('rows.3' → 3). */
export function refusedRows(fields: Readonly<Record<string, string>>): Map<number, string> {
  const out = new Map<number, string>();
  for (const [key, message] of Object.entries(fields)) {
    const m = /^rows\.(\d+)/.exec(key);
    if (m) out.set(Number(m[1]), message);
  }
  return out;
}

/** What a save told each year: 'Year 2: 3 exams, 41 people told.' Final-year resits go to those resitting them. */
export function noticeLine(n: TimetableNotice): string {
  const who = n.resitters ? 'Those resitting' : cohortLabel(n.year);
  const exams = n.resitters
    ? n.exams === 1
      ? '1 resit'
      : `${n.exams} resits`
    : n.exams === 1
      ? '1 exam'
      : `${n.exams} exams`;
  if (n.notice === 'sent') return `${who}: ${exams}, ${n.told === 1 ? '1 person' : `${n.told} people`} told.`;
  if (n.notice === 'limit') return `${who}: ${exams}. They had a timetable notice today already, so not again.`;
  return `${who}: ${exams}. Nobody was told.`;
}

/** The toast after a save: 'Saved: 3 new exams and 9 changed.' */
export function savedLine(s: Pick<TimetableSaved, 'created' | 'updated' | 'unchanged'>): string {
  const parts = [];
  if (s.created) parts.push(s.created === 1 ? '1 new exam' : `${s.created} new exams`);
  if (s.updated) parts.push(`${s.updated} changed`);
  if (!parts.length) return 'Nothing changed: every exam already had these details.';
  return `Saved: ${parts.join(' and ')}.`;
}

/** A source for the save, until the rep types their own: 'Exam timetable, 20 October 2026'. */
export const defaultSource = (today: Date): string => `Exam timetable, ${formatDay(today)}`;
