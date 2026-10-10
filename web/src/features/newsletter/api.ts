// The DSBA Newsletter from the API.
//   GET  /api/v1/newsletter/issues[?include_drafts=true]        summaries, newest first (drafts: moderators)
//   GET  /api/v1/newsletter/issues/{slug}                        one issue with its sections and reactions
//   POST/PATCH/DELETE …/issues[/{id}], POST …/{id}/publish       moderators
//   PUT/DELETE …/{id}/sections/{section}/reactions/{reaction}    signed in (optimistic)
// The newsletter email preference lives on the account: PATCH /api/v1/me { preferences: { newsletterEmails } }.
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { IssueCreate, IssueDetail, IssueSummary, IssueUpdate, Me, ReactionCounts } from '../../api/types';
import { ME_KEY } from '../../auth';
import { readCover, readSections } from './lib/schema';
import { readMinutes } from './lib/text';
import type { Issue, IssueCard, Reaction } from './types';

export const NEWSLETTER_KEY = ['newsletter'] as const;

export const newsletterKeys = {
  all: NEWSLETTER_KEY,
  lists: [...NEWSLETTER_KEY, 'list'] as const,
  list: (drafts: boolean) => [...NEWSLETTER_KEY, 'list', { drafts }] as const,
  issues: [...NEWSLETTER_KEY, 'issue'] as const,
  issue: (slug: string) => [...NEWSLETTER_KEY, 'issue', slug] as const,
};

const STALE = 60_000;

const byNewest = (a: IssueSummary, b: IssueSummary): number => b.number - a.number || b.date.localeCompare(a.date);

// ── Reading the JSON (stable functions, so TanStack Query memoises what they select) ───────────────

/** An issue as the reader uses it: cover and sections read from their JSON, plus the read time. */
export function toIssue(detail: IssueDetail): Issue {
  const { sections } = readSections(detail.sections);
  const { cover } = readCover(detail.cover);
  return { ...detail, cover, sections, readMinutes: readMinutes({ title: detail.title, dek: detail.dek, sections }) };
}

/** An issue in a list; its detail (when it has been read) adds the section labels and the read time. */
export function toCard(summary: IssueSummary, detail?: IssueDetail): IssueCard {
  const { cover } = readCover(summary.cover);
  if (!detail) return { ...summary, cover, sections: null, readMinutes: null };
  const issue = toIssue(detail);
  return { ...summary, cover, sections: issue.sections.map((s) => ({ id: s.id, label: s.label })), readMinutes: issue.readMinutes };
}

async function fetchIssue(slug: string): Promise<IssueDetail> {
  return call(api.GET('/api/v1/newsletter/issues/{slug}', { params: { path: { slug } } }));
}

// ── Queries ──────────────────────────────────────────────────────────────────────────────────────

/** Issues, newest first. With includeDrafts (moderators), drafts too; others only ever get published ones. */
async function fetchIssues(includeDrafts: boolean): Promise<IssueSummary[]> {
  const list = await call(api.GET('/api/v1/newsletter/issues', { params: { query: includeDrafts ? { include_drafts: true } : {} } }));
  return [...list].sort(byNewest);
}

export function useIssues({ includeDrafts = false }: { includeDrafts?: boolean } = {}) {
  return useQuery({
    queryKey: newsletterKeys.list(includeDrafts),
    queryFn: () => fetchIssues(includeDrafts),
    staleTime: STALE,
  });
}

const latestOf = (list: IssueSummary[]): IssueSummary | null => list.find((i) => i.status === 'published') ?? null;

/** The newest published issue (null when there is none yet). */
export function useLatestIssue() {
  return useQuery({
    queryKey: newsletterKeys.list(false),
    queryFn: () => fetchIssues(false),
    staleTime: STALE,
    select: latestOf,
  });
}

/** One issue, read into types (404 for a draft unless you are a moderator). */
export function useIssue(slug: string | undefined) {
  return useQuery({
    queryKey: newsletterKeys.issue(slug ?? ''),
    queryFn: () => fetchIssue(slug ?? ''),
    enabled: !!slug,
    staleTime: STALE,
    select: toIssue,
  });
}

/** The raw detail (the editor works on the JSON as stored). */
export function useIssueDetail(slug: string | undefined) {
  return useQuery({
    queryKey: newsletterKeys.issue(slug ?? ''),
    queryFn: () => fetchIssue(slug ?? ''),
    enabled: !!slug,
    staleTime: STALE,
  });
}

/** The details of several issues at once (covers and read times on the archive shelf). */
export function useIssueDetails(slugs: readonly string[]) {
  return useQueries({
    queries: slugs.map((slug) => ({ queryKey: newsletterKeys.issue(slug), queryFn: () => fetchIssue(slug), staleTime: STALE })),
  });
}

// ── Moderators ─────────────────────────────────────────────────────────────────────────────────

function remember(qc: QueryClient, detail: IssueDetail, oldSlug?: string): void {
  if (oldSlug && oldSlug !== detail.slug) qc.removeQueries({ queryKey: newsletterKeys.issue(oldSlug), exact: true });
  qc.setQueryData(newsletterKeys.issue(detail.slug), detail);
  void qc.invalidateQueries({ queryKey: newsletterKeys.lists });
}

/** A new draft. Errors: slug_taken (409). */
export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IssueCreate) => call(api.POST('/api/v1/newsletter/issues', { body })),
    onSuccess: (detail) => remember(qc, detail),
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; slug: string; patch: IssueUpdate }) =>
      call(api.PATCH('/api/v1/newsletter/issues/{issue_id}', { params: { path: { issue_id: id } }, body: patch })),
    onSuccess: (detail, { slug }) => remember(qc, detail, slug),
  });
}

/** Publishes the issue: everyone who wants newsletter notifications hears about it. */
export function usePublishIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; slug: string }) => call(api.POST('/api/v1/newsletter/issues/{issue_id}/publish', { params: { path: { issue_id: id } } })),
    onSuccess: (detail, { slug }) => remember(qc, detail, slug),
  });
}

export function useDeleteIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; slug: string }) => call(api.DELETE('/api/v1/newsletter/issues/{issue_id}', { params: { path: { issue_id: id } } })),
    onSuccess: (_data, { slug }) => {
      qc.removeQueries({ queryKey: newsletterKeys.issue(slug), exact: true });
      void qc.invalidateQueries({ queryKey: newsletterKeys.lists });
    },
  });
}

// ── Reactions (optimistic) ─────────────────────────────────────────────────────────────────────

export interface ReactVars {
  issueId: string;
  slug: string;
  sectionId: string;
  reaction: Reaction;
  /** true: add your reaction; false: take it back. */
  on: boolean;
}

const EMPTY: ReactionCounts = { useful: 0, love: 0, laugh: 0, mine: [] };

/** The counts after adding or removing your reaction (never below zero, never twice). */
export function applyReaction(counts: ReactionCounts | undefined, reaction: Reaction, on: boolean): ReactionCounts {
  const cur = counts ?? EMPTY;
  const mine = new Set(cur.mine ?? []);
  if (on === mine.has(reaction)) return cur;
  if (on) mine.add(reaction);
  else mine.delete(reaction);
  return { ...cur, [reaction]: Math.max(0, cur[reaction] + (on ? 1 : -1)), mine: [...mine] };
}

export function useReact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, sectionId, reaction, on }: ReactVars) => {
      const params = { path: { issue_id: issueId, section_id: sectionId, reaction } };
      const path = '/api/v1/newsletter/issues/{issue_id}/sections/{section_id}/reactions/{reaction}' as const;
      return on ? call(api.PUT(path, { params })) : call(api.DELETE(path, { params }));
    },
    onMutate: async ({ slug, sectionId, reaction, on }) => {
      const key = newsletterKeys.issue(slug);
      await qc.cancelQueries({ queryKey: key, exact: true });
      const prev = qc.getQueryData<IssueDetail>(key);
      if (prev) qc.setQueryData<IssueDetail>(key, { ...prev, reactions: { ...prev.reactions, [sectionId]: applyReaction(prev.reactions[sectionId], reaction, on) } });
      return { prev };
    },
    onError: (_err, { slug }, ctx) => {
      if (ctx?.prev) qc.setQueryData(newsletterKeys.issue(slug), ctx.prev);
    },
    onSuccess: (counts, { slug, sectionId }) => {
      qc.setQueryData<IssueDetail>(newsletterKeys.issue(slug), (d) => (d ? { ...d, reactions: { ...d.reactions, [sectionId]: counts } } : d));
    },
  });
}

// ── The email preference ───────────────────────────────────────────────────────────────────────

/** Turn newsletter emails on or off for the signed-in account (optimistic on /me). */
export function useNewsletterEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => call(api.PATCH('/api/v1/me', { body: { preferences: { newsletterEmails: on } } })),
    onMutate: async (on) => {
      await qc.cancelQueries({ queryKey: ME_KEY });
      const prev = qc.getQueryData<Me | null>(ME_KEY);
      if (prev) qc.setQueryData<Me>(ME_KEY, { ...prev, preferences: { ...prev.preferences, newsletterEmails: on } });
      return { prev };
    },
    onError: (_err, _on, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(ME_KEY, ctx.prev);
    },
    onSuccess: (me) => qc.setQueryData(ME_KEY, me),
  });
}
