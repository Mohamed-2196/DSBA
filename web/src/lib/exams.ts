// Zones and sittings, the one place the web app names them (the API's twin is api/app/services/exam_names.py).
// A sitting is an exam year and session; each sitting has a paper per zone: zone A, zone B and, for some modules,
// the RTC paper (the one set for Recognised Teaching Centres).
import type { LibraryItem } from '../api/types';

export type Zone = NonNullable<LibraryItem['zone']>;
export type ExamSession = NonNullable<LibraryItem['examSession']>;

/** Every zone, in the order the library lists them. */
export const ZONES: readonly Zone[] = ['A', 'B', 'RTC'];

/** Every session, in the order they are sat: the May sitting, then the October resits. */
export const SESSIONS: readonly ExamSession[] = ['may', 'october'];

const MONTHS: Record<ExamSession, string> = { may: 'May', october: 'October' };

export function isZone(raw: unknown): raw is Zone {
  return typeof raw === 'string' && (ZONES as readonly string[]).includes(raw);
}

export function isExamSession(raw: unknown): raw is ExamSession {
  return typeof raw === 'string' && (SESSIONS as readonly string[]).includes(raw);
}

/** 'Zone A', or 'RTC' for the paper set for Recognised Teaching Centres. */
export function zoneLabel(zone: Zone): string {
  return zone === 'RTC' ? 'RTC' : `Zone ${zone}`;
}

/** What RTC means, for wherever zones are shown. */
export const RTC_NOTE = 'RTC is the paper set for Recognised Teaching Centres.';

/** A session on its own, as a form offers it: 'May', or 'October (resits)'. */
export function sessionLabel(session: ExamSession): string {
  return session === 'october' ? `${MONTHS.october} (resits)` : MONTHS[session];
}

/** 'May 2025' or 'October 2024'; just the year when the session isn't known. */
export function sittingLabel(examYear: number, session: ExamSession | null | undefined): string {
  return session ? `${MONTHS[session]} ${examYear}` : String(examYear);
}

/** The sitting a file belongs to, as a key: its exam year and session, which every zone's paper of the sitting
 *  shares, as the library groups them. Null without an exam year. */
export function sittingKey(file: { examYear?: number | null; examSession?: ExamSession | null }): string | null {
  return file.examYear ? `${file.examYear}-${file.examSession ?? ''}` : null;
}

type ExamFields = Pick<LibraryItem, 'examYear' | 'examSession' | 'zone'>;

function examParts(file: ExamFields): string[] {
  const parts: string[] = [];
  if (file.examYear) parts.push(sittingLabel(file.examYear, file.examSession));
  if (file.zone) parts.push(zoneLabel(file.zone));
  return parts;
}

/** 'May 2025, Zone A'; null when the file says neither. */
export function examLabel(file: ExamFields): string | null {
  const parts = examParts(file);
  return parts.length ? parts.join(', ') : null;
}

/** A past paper as a list of them names it: 'May 2024, Zone A', or its title when it has no exam year. */
export function paperLabel(paper: ExamFields & Pick<LibraryItem, 'title'>): string {
  return paper.examYear ? examParts(paper).join(', ') : paper.title;
}
