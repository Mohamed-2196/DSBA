// Past papers by sitting (GET /library/papers) and past questions by topic (/library/questions): TanStack Query
// hooks, and the pure helpers the paper page and the chapter lists share.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type {
  LibraryItem,
  PaperQuestion,
  PaperQuestionCreate,
  PaperSittings,
  Sitting,
  SittingZone,
} from '../../api/types';
import { zoneLabel } from '../../lib/exams';

export const PAPERS_KEY = ['library', 'papers'] as const;
export const QUESTIONS_KEY = ['library', 'questions'] as const;

export const paperKeys = {
  sittings: (moduleId: string) => [...PAPERS_KEY, moduleId] as const,
  paper: (itemId: string) => [...QUESTIONS_KEY, 'paper', itemId] as const,
  module: (moduleId: string, flagged = false) => [...QUESTIONS_KEY, 'module', moduleId, flagged] as const,
  flagged: [...QUESTIONS_KEY, 'flagged'] as const,
};

/** A module's past papers, examiners' reports and solutions by sitting, newest first. */
export function usePaperSittings(moduleId: string | null | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: paperKeys.sittings(moduleId ?? ''),
    queryFn: ({ signal }): Promise<PaperSittings> =>
      call(api.GET('/api/v1/library/papers', { params: { query: { module_id: moduleId ?? '' } }, signal })),
    enabled: enabled && !!moduleId,
    staleTime: 60_000,
  });
}

/** A past paper's tagged questions, by question number. */
export function usePaperQuestions(itemId: string | null, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: paperKeys.paper(itemId ?? ''),
    queryFn: ({ signal }): Promise<PaperQuestion[]> =>
      call(
        api.GET('/api/v1/library/items/{item_id}/questions', { params: { path: { item_id: itemId ?? '' } }, signal }),
      ),
    enabled: enabled && !!itemId,
  });
}

/** A module's tagged questions, chapter by chapter (`flagged`: library managers' list of tags said to be wrong). */
export function useModuleQuestions(
  moduleId: string | null | undefined,
  { enabled = true, flagged = false }: { enabled?: boolean; flagged?: boolean } = {},
) {
  return useQuery({
    queryKey: paperKeys.module(moduleId ?? '', flagged),
    queryFn: ({ signal }): Promise<PaperQuestion[]> =>
      call(api.GET('/api/v1/library/questions', { params: { query: { module_id: moduleId ?? '', flagged } }, signal })),
    enabled: enabled && !!moduleId,
    staleTime: 60_000,
  });
}

/** Library managers: every module's tags that students flagged, the most flagged first. */
export function useFlaggedQuestions({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: paperKeys.flagged,
    queryFn: ({ signal }): Promise<PaperQuestion[]> =>
      call(api.GET('/api/v1/library/questions', { params: { query: { flagged: true } }, signal })),
    enabled,
  });
}

/** Library managers: the tag is right, clear its flags. */
export function useKeepQuestion() {
  const refresh = useRefreshQuestions();
  return useMutation({
    mutationFn: ({ id }: { id: string }): Promise<PaperQuestion> =>
      call(api.POST('/api/v1/library/questions/{question_id}/keep', { params: { path: { question_id: id } } })),
    onSuccess: refresh,
  });
}

function useRefreshQuestions() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: QUESTIONS_KEY });
}

export function useTagQuestion(itemId: string) {
  const refresh = useRefreshQuestions();
  return useMutation({
    mutationFn: (body: PaperQuestionCreate): Promise<PaperQuestion> =>
      call(api.POST('/api/v1/library/items/{item_id}/questions', { params: { path: { item_id: itemId } }, body })),
    onSuccess: refresh,
  });
}

export function useRemoveQuestion() {
  const refresh = useRefreshQuestions();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      call(api.DELETE('/api/v1/library/questions/{question_id}', { params: { path: { question_id: id } } })),
    onSuccess: refresh,
  });
}

export function useFlagQuestion() {
  const refresh = useRefreshQuestions();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }): Promise<PaperQuestion> =>
      call(
        on
          ? api.PUT('/api/v1/library/questions/{question_id}/flag', { params: { path: { question_id: id } } })
          : api.DELETE('/api/v1/library/questions/{question_id}/flag', { params: { path: { question_id: id } } }),
      ),
    onSuccess: refresh,
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Every file of a sitting, in one list. */
export function sittingFiles(s: Sitting): LibraryItem[] {
  return s.zones.flatMap((z) => [...z.papers, ...z.reports, ...z.solutions]);
}

export interface PaperContext {
  sitting: Sitting;
  /** The zone the file is in. */
  zone: SittingZone;
  /** Reports for this zone, then for both zones. */
  reports: LibraryItem[];
  solutions: LibraryItem[];
  /** The other zones' papers of the same sitting. */
  otherPapers: { zone: SittingZone['zone']; item: LibraryItem }[];
}

/** Where a file sits among a module's sittings: its reports, solutions and the other zone's papers. Null when it
 *  isn't in one (no exam year). */
export function paperContext(sittings: Sitting[] | undefined, itemId: string): PaperContext | null {
  for (const sitting of sittings ?? []) {
    const zone = sitting.zones.find((z) => [...z.papers, ...z.reports, ...z.solutions].some((f) => f.id === itemId));
    if (!zone) continue;
    const both = zone.zone ? sitting.zones.filter((z) => z.zone === null) : [];
    const pick = (key: 'reports' | 'solutions') =>
      [zone, ...both].flatMap((z) => z[key]).filter((f) => f.id !== itemId);
    return {
      sitting,
      zone,
      reports: pick('reports'),
      solutions: pick('solutions'),
      otherPapers: sitting.zones
        .filter((z) => z !== zone)
        .flatMap((z) => z.papers.map((item) => ({ zone: z.zone, item }))),
    };
  }
  return null;
}

type Numbered = Pick<PaperQuestion, 'section' | 'question'>;

/** The number as the paper prints it: '3', or 'B1' on a paper that numbers each section from 1. */
export function questionNumber(q: Numbered): string {
  return `${q.section ?? ''}${q.question}`;
}

/** 'Q3', or 'B1' where the paper has sections. */
export function questionName(q: Numbered): string {
  return q.section ? questionNumber(q) : `Q${q.question}`;
}

/** 'Q3' or 'B1', and 'Q3 (p. 4)' when the page is known. */
export function questionLabel(q: Numbered & Pick<PaperQuestion, 'page'>): string {
  return q.page ? `${questionName(q)} (p. ${q.page})` : questionName(q);
}

/** The paper's page, open at the question's page when it is known. */
export function questionHref(q: Pick<PaperQuestion, 'paper' | 'page'>): string {
  const base = `/library/${encodeURIComponent(q.paper.slug)}`;
  return q.page ? `${base}?page=${q.page}` : base;
}

/** Group a module's tags by chapter, keeping the API's order. */
export function byChapter(questions: PaperQuestion[]): Map<string, PaperQuestion[]> {
  const out = new Map<string, PaperQuestion[]>();
  for (const q of questions) out.set(q.chapterId, [...(out.get(q.chapterId) ?? []), q]);
  return out;
}

// ── Time me: the clock ────────────────────────────────────────────────────────

/** A countdown: running (until `endsAt`, a timestamp) or paused (`pausedLeft` ms to go). Timestamps, not ticks, so
 *  it keeps time while the tab is hidden or the phone sleeps. */
export interface ExamClock {
  total: number;
  endsAt: number | null;
  pausedLeft: number | null;
}

export const CLOCK_MIN = 60_000; // 1 minute
export const CLOCK_MAX = 12 * 3600_000; // 12 hours

export const clockStart = (total: number, now: number): ExamClock => ({ total, endsAt: now + total, pausedLeft: null });

export function clockPause(c: ExamClock, now: number): ExamClock {
  return c.endsAt === null ? c : { ...c, endsAt: null, pausedLeft: Math.max(0, c.endsAt - now) };
}

export function clockResume(c: ExamClock, now: number): ExamClock {
  return c.pausedLeft === null ? c : { ...c, endsAt: now + c.pausedLeft, pausedLeft: null };
}

/** What is left, in ms (0 once time is up). */
export function clockLeft(c: ExamClock, now: number): number {
  return c.endsAt !== null ? Math.max(0, c.endsAt - now) : Math.max(0, c.pausedLeft ?? 0);
}

/** A stored clock, or null for anything else (or one whose time ran out more than 6 hours ago). */
export function cleanClock(raw: unknown, now: number): ExamClock | null {
  if (!raw || typeof raw !== 'object') return null;
  const { total, endsAt, pausedLeft } = raw as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!num(total) || (total as number) < CLOCK_MIN || (total as number) > CLOCK_MAX) return null;
  if (num(endsAt) && pausedLeft == null)
    return (endsAt as number) + 6 * 3600_000 < now
      ? null
      : { total: total as number, endsAt: endsAt as number, pausedLeft: null };
  if (num(pausedLeft) && endsAt == null)
    return { total: total as number, endsAt: null, pausedLeft: Math.min(pausedLeft as number, total as number) };
  return null;
}

/** Hours and minutes as typed, in ms; null unless it is from 1 minute to 12 hours. */
export function parseDuration(hours: string, minutes: string): number | null {
  const h = hours.trim() === '' ? 0 : Number(hours);
  const m = minutes.trim() === '' ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return null;
  const ms = (h * 60 + m) * 60_000;
  return ms >= CLOCK_MIN && ms <= CLOCK_MAX ? ms : null;
}

/** '2 hours', '1 hour 30 minutes', '45 minutes'. */
export function durationLabel(ms: number): string {
  const total = Math.round(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hours = h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
  const mins = m ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '';
  return [hours, mins].filter(Boolean).join(' ') || '0 minutes';
}

/** The countdown's text: '2:59:59', '0:04:07'. */
export function clockLabel(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** A file in a sitting's row, with what its link says ('Zone A', 'Paper', 'Report', 'Zone B solutions'). */
export interface SittingLink {
  item: LibraryItem;
  label: string;
}

/** One row of the past papers table: a sitting's papers (one per zone), its reports and solutions, and the paper
 *  Time me opens (the student's zone's, else the first). */
export interface SittingRow {
  papers: (SittingLink & { zone: SittingZone['zone']; yours: boolean })[];
  reports: SittingLink[];
  solutions: SittingLink[];
  timeMe: LibraryItem | null;
}

/** 'Report', or 'Report 2' for a second one; 'Zone A report' when the sitting's reports differ by zone. */
function labelled(zones: readonly SittingZone[], key: 'reports' | 'solutions', word: string): SittingLink[] {
  const byZone = zones.filter((z) => z[key].length);
  const perZone = byZone.length > 1 && byZone.some((z) => z.zone);
  const out: SittingLink[] = [];
  for (const z of byZone) {
    const base = perZone && z.zone ? `${zoneLabel(z.zone)} ${word.toLowerCase()}` : word;
    z[key].forEach((item, i) => out.push({ item, label: i ? `${base} ${i + 1}` : base }));
  }
  if (!perZone && out.length > 1) return out.map((l, i) => ({ ...l, label: i ? `${word} ${i + 1}` : word }));
  return out;
}

/** A sitting as one row of the past papers table, the student's zone first. */
export function sittingRow(sitting: Sitting, yours: SittingZone['zone']): SittingRow {
  const zones = yourZoneFirst(sitting.zones, yours);
  const papers = zones.flatMap((z) =>
    z.papers.map((item, i) => {
      const base = z.zone ? zoneLabel(z.zone) : 'Paper';
      return { item, zone: z.zone, yours: !!yours && z.zone === yours, label: i ? `${base} (${i + 1})` : base };
    }),
  );
  return {
    papers,
    reports: labelled(zones, 'reports', 'Report'),
    solutions: labelled(zones, 'solutions', 'Solutions'),
    timeMe: papers[0]?.item ?? null,
  };
}

/** A sitting's zones with the student's own zone first (null: as they come). */
export function yourZoneFirst(zones: readonly SittingZone[], zone: SittingZone['zone']): SittingZone[] {
  if (!zone) return [...zones];
  return [...zones.filter((z) => z.zone === zone), ...zones.filter((z) => z.zone !== zone)];
}
