// Zones and sittings, the one place the web app names them (the API's twin is api/app/services/exam_names.py).
// A sitting is an exam year and session; each sitting has a paper per zone: zone A, zone B and, for some modules,
// the RTC paper (the one set for Recognised Teaching Centres).
import type { LibraryItem } from '../api/types';

export type Zone = NonNullable<LibraryItem['zone']>;
export type ExamSession = NonNullable<LibraryItem['examSession']>;

/** Every zone, in the order the library lists them. */
export const ZONES: readonly Zone[] = ['A', 'B', 'RTC'];

export function isZone(raw: unknown): raw is Zone {
  return typeof raw === 'string' && (ZONES as readonly string[]).includes(raw);
}

/** 'Zone A', or 'RTC' for the paper set for Recognised Teaching Centres. */
export function zoneLabel(zone: Zone): string {
  return zone === 'RTC' ? 'RTC' : `Zone ${zone}`;
}

/** What RTC means, for wherever zones are shown. */
export const RTC_NOTE = 'RTC is the paper set for Recognised Teaching Centres.';

/** 'May 2025' or 'October 2024'; just the year when the session isn't known. */
export function sittingLabel(examYear: number, session: ExamSession | null | undefined): string {
  if (session === 'may') return `May ${examYear}`;
  if (session === 'october') return `October ${examYear}`;
  return String(examYear);
}

/** 'May 2025, Zone A'; null when the file says neither. */
export function examLabel(item: Pick<LibraryItem, 'examYear' | 'examSession' | 'zone'>): string | null {
  if (!item.examYear && !item.zone) return null;
  return [item.examYear ? sittingLabel(item.examYear, item.examSession) : null, item.zone ? zoneLabel(item.zone) : null]
    .filter(Boolean)
    .join(', ');
}
