// Lesson progress. Signed in: kept by the API (/me/progress…), with optimistic updates. Guests: kept in this
// browser (localStorage 'hub.lessons.v1'). After signing in, the student is asked once whether that progress is
// theirs (ImportProgressPrompt): computers at BIBF are shared, so it may be someone else's.
//   state.watched  { '<module id>:<chapter>:<video>': watchedAt (ms) }
//   state.last     { [moduleId]: { c, v, at (ms) } }  the lesson last opened (played or marked) in each module;
//                  it drives "Pick up where you left off" and Home's Continue learning.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { errorMessage } from '../../api/errors';
import type { Chapter, ModuleDetail, Progress, ProgressImport, Video } from '../../api/types';
import { useAuth } from '../../auth';
import { lessonKey } from '../../lib/modules';
import { useLocalStorage, useToast } from '../../state';
import { useModules } from '../../state/modules';
import { deleteModuleProgress, fetchProgress, importProgress, progressKey, putResume, putWatched } from './api';

export interface LessonPointer {
  c: number;
  v: number;
  at: number;
}

export interface ProgressState {
  watched: Readonly<Record<string, number>>;
  last: Readonly<Record<string, LessonPointer>>;
}

export const EMPTY_PROGRESS: ProgressState = Object.freeze({ watched: Object.freeze({}), last: Object.freeze({}) });

export function isEmptyProgress(s: ProgressState): boolean {
  return Object.keys(s.watched).length === 0 && Object.keys(s.last).length === 0;
}

// ── Shapes: the browser's store and the API ───────────────────────────────────

export const GUEST_PROGRESS_KEY = 'hub.lessons.v1';
const KEY_RE = /^[a-z0-9-]{1,64}:\d{1,3}:\d{1,3}$/;
const MODULE_RE = /^[a-z0-9-]{1,64}$/;
const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isIndex = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 1000;
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

/**
 * What the browser has stored, as progress (malformed entries dropped). The prototype wrote a made-up history
 * for its demo (marked `demo: true`): that isn't anyone's progress, so it reads as empty.
 */
export function normalizeStored(raw: unknown): ProgressState {
  if (!isRecord(raw) || raw.demo === true) return EMPTY_PROGRESS;
  const watched: Record<string, number> = {};
  if (isRecord(raw.watched)) {
    for (const [k, t] of Object.entries(raw.watched)) if (KEY_RE.test(k) && isTime(t)) watched[k] = t;
  }
  const last: Record<string, LessonPointer> = {};
  if (isRecord(raw.last)) {
    for (const [m, p] of Object.entries(raw.last)) {
      if (MODULE_RE.test(m) && isRecord(p) && isIndex(p.c) && isIndex(p.v) && isTime(p.at)) last[m] = { c: p.c, v: p.v, at: p.at };
    }
  }
  return { watched, last };
}

export function fromServer(p: Progress): ProgressState {
  const watched: Record<string, number> = {};
  for (const [k, iso] of Object.entries(p.watched)) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) watched[k] = t;
  }
  const last: Record<string, LessonPointer> = {};
  for (const [m, l] of Object.entries(p.last)) {
    const t = Date.parse(l.at);
    last[m] = { c: l.chapter, v: l.video, at: Number.isFinite(t) ? t : 0 };
  }
  return { watched, last };
}

export function toImport(s: ProgressState): ProgressImport {
  const iso = (t: number) => new Date(Math.min(t, Date.now())).toISOString();
  return {
    watched: Object.fromEntries(Object.entries(s.watched).map(([k, t]) => [k, iso(t)])),
    last: Object.fromEntries(Object.entries(s.last).map(([m, l]) => [m, { chapter: l.c, video: l.v, at: iso(l.at) }])),
  };
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

type WithChapters = Pick<ModuleDetail, 'id' | 'chapters'>;

export interface FlatLesson {
  c: number;
  v: number;
  video: Video;
  chapter: Chapter;
}

/** Every lesson of a module, in order. */
export function flatLessons(m: WithChapters | null | undefined): FlatLesson[] {
  const out: FlatLesson[] = [];
  m?.chapters.forEach((chapter, c) => chapter.videos.forEach((video, v) => out.push({ c, v, video, chapter })));
  return out;
}

export function isValidLesson(m: WithChapters | null | undefined, c: number | null, v: number | null): boolean {
  return !!m && c != null && v != null && Number.isInteger(c) && Number.isInteger(v) && !!m.chapters[c]?.videos[v];
}

export interface Fraction {
  watched: number;
  total: number;
  /** 0–100, rounded */
  pct: number;
}

const fraction = (watched: number, total: number): Fraction => ({ watched, total, pct: total ? Math.round((watched / total) * 100) : 0 });

export function computeModuleProgress(state: ProgressState, m: WithChapters | null | undefined): Fraction {
  let watched = 0;
  let total = 0;
  m?.chapters.forEach((ch, c) =>
    ch.videos.forEach((_, v) => {
      total += 1;
      if (state.watched[lessonKey(m.id, c, v)]) watched += 1;
    }),
  );
  return fraction(watched, total);
}

export function computeChapterProgress(state: ProgressState, m: WithChapters, c: number): Fraction {
  const ch = m.chapters[c];
  if (!ch) return fraction(0, 0);
  const watched = ch.videos.reduce((n, _, v) => n + (state.watched[lessonKey(m.id, c, v)] ? 1 : 0), 0);
  return fraction(watched, ch.videos.length);
}

/** Watched lessons of a module from the catalogue's count alone (no chapters needed): Home and the module list. */
export function summaryProgress(state: ProgressState, moduleId: string | null | undefined, total: number): Fraction {
  if (!moduleId || !total) return fraction(0, total);
  const prefix = `${moduleId}:`;
  const watched = Object.keys(state.watched).filter((k) => k.startsWith(prefix)).length;
  return fraction(Math.min(watched, total), total);
}

export type ResumeKind = 'resume' | 'next' | 'start' | 'done';

export interface ResumePoint {
  c: number;
  v: number;
  at: number | null;
  kind: ResumeKind;
}

/**
 * Where to pick up in a module, or null when it has no lessons.
 * resume = the last opened lesson, not watched yet · next = the first unwatched lesson after it ·
 * start = nothing opened yet · done = everything watched.
 */
export function computeResumePoint(state: ProgressState, m: WithChapters | null | undefined): ResumePoint | null {
  const lessons = flatLessons(m);
  if (!m || !lessons.length) return null;
  const seen = (l: FlatLesson) => !!state.watched[lessonKey(m.id, l.c, l.v)];
  const last = state.last[m.id];
  if (last && isValidLesson(m, last.c, last.v)) {
    const i = lessons.findIndex((l) => l.c === last.c && l.v === last.v);
    if (!seen(lessons[i])) return { c: last.c, v: last.v, at: last.at, kind: 'resume' };
    const after = lessons.slice(i + 1).find((l) => !seen(l)) ?? lessons.slice(0, i).find((l) => !seen(l));
    if (after) return { c: after.c, v: after.v, at: last.at, kind: 'next' };
    return { c: lessons[0].c, v: lessons[0].v, at: last.at, kind: 'done' };
  }
  const first = lessons.find((l) => !seen(l));
  if (first) return { c: first.c, v: first.v, at: null, kind: lessons.some(seen) ? 'next' : 'start' };
  return { c: lessons[0].c, v: lessons[0].v, at: null, kind: 'done' };
}

// ── Changes (the same rules for both stores) ──────────────────────────────────

export interface ProgressSnapshot {
  moduleId: string;
  watched: Record<string, number>;
  last: LessonPointer | null;
}

function withWatched(s: ProgressState, moduleId: string, c: number, v: number, on: boolean, now: number): ProgressState {
  const key = lessonKey(moduleId, c, v);
  const watched = { ...s.watched };
  if (on) watched[key] = watched[key] ?? now;
  else delete watched[key];
  return { watched, last: { ...s.last, [moduleId]: { c, v, at: now } } };
}

function withOpened(s: ProgressState, moduleId: string, c: number, v: number, now: number): ProgressState {
  return { watched: s.watched, last: { ...s.last, [moduleId]: { c, v, at: now } } };
}

function withoutModule(s: ProgressState, moduleId: string): ProgressState {
  const prefix = `${moduleId}:`;
  const last = { ...s.last };
  delete last[moduleId];
  return { watched: Object.fromEntries(Object.entries(s.watched).filter(([k]) => !k.startsWith(prefix))), last };
}

function snapshotOf(s: ProgressState, moduleId: string): ProgressSnapshot {
  const prefix = `${moduleId}:`;
  return {
    moduleId,
    watched: Object.fromEntries(Object.entries(s.watched).filter(([k]) => k.startsWith(prefix))),
    last: s.last[moduleId] ?? null,
  };
}

function withSnapshot(s: ProgressState, snap: ProgressSnapshot): ProgressState {
  return {
    watched: { ...s.watched, ...snap.watched },
    last: snap.last ? { ...s.last, [snap.moduleId]: snap.last } : s.last,
  };
}

// The same changes on the API's shape (ISO timestamps), for optimistic updates of the cached query.
const toServerShape = (s: ProgressState): Progress => toImport(s);

// ── Hooks ─────────────────────────────────────────────────────────────────────

export interface ProgressApi {
  state: ProgressState;
  /** False while an account's progress is loading (show placeholders, not zeros). */
  ready: boolean;
  mode: 'guest' | 'account';
  isWatched: (key: string) => boolean;
  setWatched: (moduleId: string, c: number, v: number, on: boolean) => void;
  /** The student pressed play on a lesson. */
  markOpened: (moduleId: string, c: number, v: number) => void;
  /** Clears a module and returns what it held, for Undo. */
  resetModule: (moduleId: string) => ProgressSnapshot;
  restore: (snapshot: ProgressSnapshot) => void;
}

export function useGuestProgress(): ProgressApi & { clear: () => void } {
  const [raw, setRaw] = useLocalStorage<unknown>(GUEST_PROGRESS_KEY, null);
  const state = useMemo(() => normalizeStored(raw), [raw]);

  // The prototype's demo history isn't anyone's progress: drop it.
  const isDemo = isRecord(raw) && raw.demo === true;
  useEffect(() => {
    if (isDemo) setRaw(undefined);
  }, [isDemo, setRaw]);

  const write = useCallback(
    (fn: (s: ProgressState) => ProgressState) =>
      setRaw((prev: unknown) => {
        const next = fn(normalizeStored(prev));
        return isEmptyProgress(next) ? undefined : next;
      }),
    [setRaw],
  );

  return useMemo(
    () => ({
      state,
      ready: true,
      mode: 'guest' as const,
      isWatched: (key: string) => !!state.watched[key],
      setWatched: (moduleId: string, c: number, v: number, on: boolean) => write((s) => withWatched(s, moduleId, c, v, on, Date.now())),
      markOpened: (moduleId: string, c: number, v: number) => write((s) => withOpened(s, moduleId, c, v, Date.now())),
      resetModule: (moduleId: string) => {
        const snap = snapshotOf(state, moduleId);
        write((s) => withoutModule(s, moduleId));
        return snap;
      },
      restore: (snap: ProgressSnapshot) => write((s) => withSnapshot(s, snap)),
      clear: () => setRaw(undefined),
    }),
    [state, write, setRaw],
  );
}

type Op =
  | { type: 'watched'; moduleId: string; c: number; v: number; on: boolean }
  | { type: 'opened'; moduleId: string; c: number; v: number }
  | { type: 'reset'; moduleId: string }
  | { type: 'restore'; snapshot: ProgressSnapshot };

const WRITE_KEY = ['progress', 'write'] as const;

function applyOp(s: ProgressState, op: Op): ProgressState {
  const now = Date.now();
  switch (op.type) {
    case 'watched':
      return withWatched(s, op.moduleId, op.c, op.v, op.on, now);
    case 'opened':
      return withOpened(s, op.moduleId, op.c, op.v, now);
    case 'reset':
      return withoutModule(s, op.moduleId);
    case 'restore':
      return withSnapshot(s, op.snapshot);
  }
}

async function send(op: Op): Promise<Progress | null> {
  switch (op.type) {
    case 'watched':
      await putWatched(lessonKey(op.moduleId, op.c, op.v), op.on);
      return putResume(op.moduleId, op.c, op.v);
    case 'opened':
      return putResume(op.moduleId, op.c, op.v);
    case 'reset':
      await deleteModuleProgress(op.moduleId);
      return null;
    case 'restore':
      return importProgress(toImport(withSnapshot(EMPTY_PROGRESS, op.snapshot)));
  }
}

function useAccountProgress(userId: string | null): ProgressApi {
  const qc = useQueryClient();
  const { push } = useToast();
  const key = progressKey(userId ?? '');
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchProgress(signal),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const state = useMemo(() => (q.data ? fromServer(q.data) : EMPTY_PROGRESS), [q.data]);

  const { mutate } = useMutation({
    mutationKey: WRITE_KEY,
    mutationFn: send,
    onMutate: async (op: Op) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Progress>(key);
      if (prev) qc.setQueryData<Progress>(key, toServerShape(applyOp(fromServer(prev), op)));
      return { prev };
    },
    onError: (e, _op, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      push({ title: 'Your progress wasn’t saved', body: errorMessage(e, 'Check your connection and try again.'), tone: 'alert' });
    },
    onSettled: (data, error) => {
      // Only the last write in flight speaks for the server: earlier answers may already be out of date.
      if (qc.isMutating({ mutationKey: WRITE_KEY }) > 1) return;
      if (data && !error) qc.setQueryData(key, data);
      else void qc.invalidateQueries({ queryKey: key });
    },
  });

  return useMemo(
    () => ({
      state,
      ready: !userId || q.data !== undefined || q.isError,
      mode: 'account' as const,
      isWatched: (k: string) => !!state.watched[k],
      setWatched: (moduleId: string, c: number, v: number, on: boolean) => mutate({ type: 'watched', moduleId, c, v, on }),
      markOpened: (moduleId: string, c: number, v: number) => mutate({ type: 'opened', moduleId, c, v }),
      resetModule: (moduleId: string) => {
        const snap = snapshotOf(state, moduleId);
        mutate({ type: 'reset', moduleId });
        return snap;
      },
      restore: (snapshot: ProgressSnapshot) => mutate({ type: 'restore', snapshot }),
    }),
    [state, userId, q.data, q.isError, mutate],
  );
}

/**
 * Lesson progress for the person using the app: their account's when signed in, this browser's otherwise.
 * While sign-in status is loading, `ready` is false.
 */
export function useProgress(): ProgressApi {
  const { me, status } = useAuth();
  const userId = status === 'signed-in' && me ? me.id : null;
  const guest = useGuestProgress();
  const account = useAccountProgress(userId);
  const loading = status === 'loading';
  return useMemo(() => {
    if (loading) return { ...guest, state: EMPTY_PROGRESS, ready: false };
    return userId ? account : guest;
  }, [loading, userId, account, guest]);
}

/** { watched, total, pct } for one module, from the catalogue's lesson count (no chapters needed). */
export function useModuleProgress(moduleId: string | null | undefined): Fraction {
  const { getModule } = useModules();
  const { state } = useProgress();
  const m = getModule(moduleId);
  return useMemo(() => summaryProgress(state, m?.id, m?.lessonCount ?? 0), [state, m]);
}
