// What requests are called on screen: their kinds, their statuses, and the filters in the URL.
import type { RequestOut } from '../../api/types';
import { libraryKindLabel } from '../library/public';
import type { RequestKind, RequestSort, RequestStatus } from './types';

/** A request's page. */
export const requestPath = (id: string) => `/requests/${id}`;

export const KINDS: { value: RequestKind; label: string; hint: string }[] = [
  {
    value: 'paper',
    label: 'Past paper or notes',
    hint: 'A paper, a mark scheme or notes the library doesn’t have',
  },
  {
    value: 'fix',
    label: 'A fix',
    hint: 'Something on the hub that’s wrong or out of date',
  },
  {
    value: 'event',
    label: 'An event or a date',
    hint: 'A deadline, an exam or an event missing from the calendar',
  },
  {
    value: 'feature',
    label: 'A feature',
    hint: 'Something the hub could do for you',
  },
  {
    value: 'other',
    label: 'Something else',
    hint: 'Anything the reps could help with',
  },
];

export const STATUSES: {
  value: RequestStatus;
  label: string;
  tone: 'outline' | 'cobalt' | 'signal' | 'neutral';
}[] = [
  { value: 'open', label: 'Open', tone: 'outline' },
  { value: 'planned', label: 'Planned', tone: 'cobalt' },
  { value: 'done', label: 'Done', tone: 'signal' },
  { value: 'declined', label: 'Declined', tone: 'neutral' },
];

export const SORTS: { value: RequestSort; label: string }[] = [
  { value: 'me_too', label: 'Most wanted' },
  { value: 'newest', label: 'Newest' },
];

export function kindLabel(kind: RequestKind): string {
  return KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function statusOf(status: RequestStatus): (typeof STATUSES)[number] {
  return STATUSES.find((s) => s.value === status) ?? STATUSES[0];
}

/** A kind from the URL (`?kind=paper`, `?new=paper`), or null for anything else. */
export function parseKind(value: string | null | undefined): RequestKind | null {
  return KINDS.find((k) => k.value === value)?.value ?? null;
}

export function parseStatus(value: string | null | undefined): RequestStatus | null {
  return STATUSES.find((s) => s.value === value)?.value ?? null;
}

export function parseSort(value: string | null | undefined): RequestSort {
  return SORTS.find((s) => s.value === value)?.value ?? 'me_too';
}

/** "3 others want this too" under a request; nothing to say at 0. */
export function meTooLine(count: number, meToo: boolean): string | null {
  if (count <= 0) return null;
  if (meToo)
    return count === 1
      ? 'You want this too'
      : `You and ${count - 1} ${count - 1 === 1 ? 'other' : 'others'} want this too`;
  return `${count} ${count === 1 ? 'other wants' : 'others want'} this too`;
}

/** The requester's own "me too" button: "You asked", or "You and 2 others" once others want it too. */
export function meTooOfMine(count: number): string {
  if (count <= 0) return 'You asked';
  return `You and ${count} ${count === 1 ? 'other' : 'others'}`;
}

/** How many asked for a request: the requester and everyone who said "me too". */
export function askedBy(meTooCount: number): string {
  const n = meTooCount + 1;
  return `Asked by ${n} ${n === 1 ? 'student' : 'students'}`;
}

/** The status change a rep is about to make needs a reply: declining says why. */
export function needsReply(status: RequestStatus): boolean {
  return status === 'declined';
}

/** What a paper request names: "Past paper · 2019 · Zone B"; null when it names no file. */
export function wantsLine(r: Pick<RequestOut, 'wantedKind' | 'examYear' | 'zone'>): string | null {
  if (!r.wantedKind) return null;
  return [libraryKindLabel(r.wantedKind), r.examYear ? String(r.examYear) : null, r.zone ? `Zone ${r.zone}` : null]
    .filter(Boolean)
    .join(' · ');
}

/** The exam years a paper request can name: this year back to 2010, newest first. */
export function examYears(now: Date = new Date()): number[] {
  const last = now.getFullYear();
  return Array.from({ length: last - 2010 + 1 }, (_, i) => last - i);
}

/** A file found for the request is waiting for a yes or no. */
export function awaitsAnswer(r: Pick<RequestOut, 'found' | 'status'>): boolean {
  return !!r.found && (r.status === 'open' || r.status === 'planned');
}
