// Past papers by sitting (GET /library/papers) and past questions by topic (/library/questions): TanStack Query
// hooks, and the pure helpers the paper page and the chapter lists share.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { LibraryItem, PaperQuestion, PaperQuestionCreate, PaperSittings, Sitting, SittingZone } from '../../api/types';

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
      call(api.GET('/api/v1/library/items/{item_id}/questions', { params: { path: { item_id: itemId ?? '' } }, signal })),
    enabled: enabled && !!itemId,
  });
}

/** A module's tagged questions, chapter by chapter (`flagged`: library managers' list of tags said to be wrong). */
export function useModuleQuestions(moduleId: string | null | undefined, { enabled = true, flagged = false }: { enabled?: boolean; flagged?: boolean } = {}) {
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
    queryFn: ({ signal }): Promise<PaperQuestion[]> => call(api.GET('/api/v1/library/questions', { params: { query: { flagged: true } }, signal })),
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
    mutationFn: ({ id }: { id: string }) => call(api.DELETE('/api/v1/library/questions/{question_id}', { params: { path: { question_id: id } } })),
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
    const pick = (key: 'reports' | 'solutions') => [zone, ...both].flatMap((z) => z[key]).filter((f) => f.id !== itemId);
    return {
      sitting,
      zone,
      reports: pick('reports'),
      solutions: pick('solutions'),
      otherPapers: sitting.zones.filter((z) => z !== zone).flatMap((z) => z.papers.map((item) => ({ zone: z.zone, item }))),
    };
  }
  return null;
}

/** 'Q3', and 'Q3 (p. 4)' when the page is known. */
export function questionLabel(q: Pick<PaperQuestion, 'question' | 'page'>): string {
  return q.page ? `Q${q.question} (p. ${q.page})` : `Q${q.question}`;
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

/** The countdown's text: '2:59:59', '0:04:07'. */
export function clockLabel(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** A sitting's zones with the student's own zone first (null: as they come). */
export function yourZoneFirst(zones: readonly SittingZone[], zone: SittingZone['zone']): SittingZone[] {
  if (!zone) return [...zones];
  return [...zones.filter((z) => z.zone === zone), ...zones.filter((z) => z.zone !== zone)];
}
