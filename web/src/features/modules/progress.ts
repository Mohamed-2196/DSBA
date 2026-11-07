// Lesson progress, kept only while the person tracks it (tracking.ts: opt in). Signed in: kept by the API
// (/me/progress…), with optimistic updates. Guests: kept in this browser (localStorage 'hub.progress'). After
// signing in, the student is asked once whether that progress is theirs (ImportProgressPrompt): computers at BIBF are
// shared, so it may be someone else's.
//   state.watched  { [lessonId]: { m: module id, at: watchedAt (ms) } }
//   state.last     { [moduleId]: { l: lesson id, at (ms) } }  the lesson last opened (played or marked) in each
//                  module; it drives "Pick up where you left off" and Home's Continue learning.
//   state.studied  { [chapterId]: { m: module id, at (ms), l: its lesson ids } }  chapters the student ticked as
//                  studied, however they studied them. Their lessons count as done; the watched marks (and so
//                  Carry on) stay as they are.
// Lessons are known by their id, which never changes: a content manager reordering a module moves nothing here.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { errorMessage } from '../../api/errors';
import type { Chapter, ModuleDetail, Progress, ProgressImport, Video } from '../../api/types';
import { useAuth } from '../../auth';
import { useLocalStorage, useToast } from '../../state';
import { progressKey } from '../../api/keys';
import { deleteModuleProgress, fetchProgress, importProgress, putResume, putStudied, putWatched } from './api';
import { useTracking } from './tracking';

export interface WatchedMark {
  /** the lesson's module */
  m: string;
  at: number;
}

export interface LessonPointer {
  /** the lesson's id */
  l: string;
  at: number;
}

export interface StudiedMark {
  /** the chapter's module */
  m: string;
  at: number;
  /** the chapter's lessons when it was read: they count as done while it's ticked */
  l: readonly string[];
}

export interface ProgressState {
  watched: Readonly<Record<string, WatchedMark>>;
  last: Readonly<Record<string, LessonPointer>>;
  studied: Readonly<Record<string, StudiedMark>>;
}

export const EMPTY_PROGRESS: ProgressState = Object.freeze({
  watched: Object.freeze({}),
  last: Object.freeze({}),
  studied: Object.freeze({}),
});

export function isEmptyProgress(s: ProgressState): boolean {
  return [s.watched, s.last, s.studied].every((part) => Object.keys(part).length === 0);
}

// ── Shapes: the browser's store and the API ───────────────────────────────────

export const GUEST_PROGRESS_KEY = 'hub.progress';
const LESSON_RE = /^[a-z0-9]{1,16}$/;
const MODULE_RE = /^[a-z0-9-]{1,64}$/;
const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const isLesson = (x: unknown): x is string => typeof x === 'string' && LESSON_RE.test(x);
const isModule = (x: unknown): x is string => typeof x === 'string' && MODULE_RE.test(x);

/** What the browser has stored, as progress (malformed entries dropped). */
export function normalizeStored(raw: unknown): ProgressState {
  if (!isRecord(raw)) return EMPTY_PROGRESS;
  const watched: Record<string, WatchedMark> = {};
  if (isRecord(raw.watched)) {
    for (const [l, w] of Object.entries(raw.watched)) {
      if (isLesson(l) && isRecord(w) && isModule(w.m) && isTime(w.at)) watched[l] = { m: w.m, at: w.at };
    }
  }
  const last: Record<string, LessonPointer> = {};
  if (isRecord(raw.last)) {
    for (const [m, p] of Object.entries(raw.last)) {
      if (isModule(m) && isRecord(p) && isLesson(p.l) && isTime(p.at)) last[m] = { l: p.l, at: p.at };
    }
  }
  const studied: Record<string, StudiedMark> = {};
  if (isRecord(raw.studied)) {
    for (const [c, t] of Object.entries(raw.studied)) {
      if (isLesson(c) && isRecord(t) && isModule(t.m) && isTime(t.at) && Array.isArray(t.l)) {
        studied[c] = { m: t.m, at: t.at, l: t.l.filter(isLesson) };
      }
    }
  }
  return { watched, last, studied };
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};
const iso = (t: number) => new Date(Math.min(t, Date.now())).toISOString();

export function fromServer(p: Progress): ProgressState {
  const watched: Record<string, WatchedMark> = {};
  for (const [l, w] of Object.entries(p.watched)) watched[l] = { m: w.moduleId, at: time(w.at) };
  const last: Record<string, LessonPointer> = {};
  for (const [m, l] of Object.entries(p.last)) last[m] = { l: l.lessonId, at: time(l.at) };
  const studied: Record<string, StudiedMark> = {};
  for (const [c, t] of Object.entries(p.studied)) studied[c] = { m: t.moduleId, at: time(t.at), l: t.lessonIds };
  return { watched, last, studied };
}

export function toServer(s: ProgressState): Progress {
  return {
    watched: Object.fromEntries(Object.entries(s.watched).map(([l, w]) => [l, { moduleId: w.m, at: iso(w.at) }])),
    last: Object.fromEntries(Object.entries(s.last).map(([m, p]) => [m, { lessonId: p.l, at: iso(p.at) }])),
    studied: Object.fromEntries(
      Object.entries(s.studied).map(([c, t]) => [c, { moduleId: t.m, at: iso(t.at), lessonIds: [...t.l] }]),
    ),
  };
}

export function toImport(s: ProgressState): ProgressImport {
  const { watched, last, studied } = toServer(s);
  return {
    watched: Object.fromEntries(Object.entries(watched).map(([l, w]) => [l, w.at])),
    last,
    studied: Object.fromEntries(Object.entries(studied).map(([c, t]) => [c, t.at])),
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

/** Where a lesson is in the module as it is now ({ c, v }), or null when the module doesn't show it. */
export function findLesson(
  m: WithChapters | null | undefined,
  lessonId: string | null | undefined,
): { c: number; v: number } | null {
  if (!m || !lessonId) return null;
  for (let c = 0; c < m.chapters.length; c++) {
    const v = m.chapters[c].videos.findIndex((video) => video.id === lessonId);
    if (v >= 0) return { c, v };
  }
  return null;
}

export interface Fraction {
  watched: number;
  total: number;
  /** 0–100, rounded */
  pct: number;
}

const fraction = (watched: number, total: number): Fraction => ({
  watched,
  total,
  pct: total ? Math.round((watched / total) * 100) : 0,
});

/** Lessons done in a module: watched, or in a chapter ticked as studied. `watched` in the fraction counts them. */
export function computeModuleProgress(state: ProgressState, m: WithChapters | null | undefined): Fraction {
  const lessons = flatLessons(m);
  return fraction(
    lessons.filter((l) => state.watched[l.video.id] || state.studied[l.chapter.id]).length,
    lessons.length,
  );
}

export function computeChapterProgress(state: ProgressState, m: WithChapters, c: number): Fraction {
  const ch = m.chapters[c];
  if (!ch) return fraction(0, 0);
  if (state.studied[ch.id]) return fraction(ch.videos.length, ch.videos.length);
  return fraction(ch.videos.filter((video) => state.watched[video.id]).length, ch.videos.length);
}

/** A chapter is done when the student ticked it as studied, or watched every lesson in it. */
export function chapterDone(state: ProgressState, m: WithChapters, c: number): boolean {
  const ch = m.chapters[c];
  if (!ch) return false;
  return !!state.studied[ch.id] || (ch.videos.length > 0 && ch.videos.every((video) => state.watched[video.id]));
}

/** The chapters of a module ticked as studied, by chapter id. */
export function studiedFor(state: ProgressState, moduleId: string): Record<string, StudiedMark> {
  return Object.fromEntries(Object.entries(state.studied).filter(([, t]) => t.m === moduleId));
}

/** Lessons done in a module from the catalogue's count alone (no chapters needed): Home and the module list. */
export function summaryProgress(state: ProgressState, moduleId: string | null | undefined, total: number): Fraction {
  if (!moduleId || !total) return fraction(0, total);
  const done = new Set(
    Object.entries(state.watched)
      .filter(([, w]) => w.m === moduleId)
      .map(([l]) => l),
  );
  for (const t of Object.values(studiedFor(state, moduleId))) t.l.forEach((l) => done.add(l));
  return fraction(Math.min(done.size, total), total);
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
  const seen = (l: FlatLesson) => !!state.watched[l.video.id];
  const last = state.last[m.id];
  const i = last ? lessons.findIndex((l) => l.video.id === last.l) : -1;
  if (last && i >= 0) {
    const at = lessons[i];
    if (!seen(at)) return { c: at.c, v: at.v, at: last.at, kind: 'resume' };
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
  watched: Record<string, WatchedMark>;
  last: LessonPointer | null;
  studied: Record<string, StudiedMark>;
}

/** A chapter to tick: its id and the lessons it has now. */
export interface StudiedChapter {
  id: string;
  lessonIds: readonly string[];
}

function withWatched(s: ProgressState, moduleId: string, lessonId: string, on: boolean, now: number): ProgressState {
  const watched = { ...s.watched };
  if (on) watched[lessonId] = watched[lessonId] ?? { m: moduleId, at: now };
  else delete watched[lessonId];
  return { ...s, watched, last: { ...s.last, [moduleId]: { l: lessonId, at: now } } };
}

function withOpened(s: ProgressState, moduleId: string, lessonId: string, now: number): ProgressState {
  return { ...s, last: { ...s.last, [moduleId]: { l: lessonId, at: now } } };
}

/** Ticks a chapter (keeping the first time) or unticks it; the watched marks and the lesson to resume stay. */
function withStudied(
  s: ProgressState,
  moduleId: string,
  chapter: StudiedChapter,
  on: boolean,
  now: number,
): ProgressState {
  const studied = { ...s.studied };
  if (on) studied[chapter.id] = studied[chapter.id] ?? { m: moduleId, at: now, l: [...chapter.lessonIds] };
  else delete studied[chapter.id];
  return { ...s, studied };
}

function withoutModule(s: ProgressState, moduleId: string): ProgressState {
  const last = { ...s.last };
  delete last[moduleId];
  return {
    watched: Object.fromEntries(Object.entries(s.watched).filter(([, w]) => w.m !== moduleId)),
    last,
    studied: Object.fromEntries(Object.entries(s.studied).filter(([, t]) => t.m !== moduleId)),
  };
}

function snapshotOf(s: ProgressState, moduleId: string): ProgressSnapshot {
  return {
    moduleId,
    watched: Object.fromEntries(Object.entries(s.watched).filter(([, w]) => w.m === moduleId)),
    last: s.last[moduleId] ?? null,
    studied: studiedFor(s, moduleId),
  };
}

function withSnapshot(s: ProgressState, snap: ProgressSnapshot): ProgressState {
  return {
    watched: { ...s.watched, ...snap.watched },
    last: snap.last ? { ...s.last, [snap.moduleId]: snap.last } : s.last,
    studied: { ...s.studied, ...snap.studied },
  };
}

// The same changes on the API's shape (ISO timestamps), for optimistic updates of the cached query.
const toServerShape = toServer;

// ── Hooks ─────────────────────────────────────────────────────────────────────

export interface ProgressApi {
  state: ProgressState;
  /** False while an account's progress is loading (show placeholders, not zeros). */
  ready: boolean;
  mode: 'guest' | 'account';
  /** The person keeps their progress. Off: the state is empty, writes do nothing, and no progress is shown. */
  tracking: boolean;
  isWatched: (lessonId: string) => boolean;
  setWatched: (moduleId: string, lessonId: string, on: boolean) => void;
  isStudied: (chapterId: string) => boolean;
  /** Ticks a chapter as studied, or undoes it. */
  setStudied: (moduleId: string, chapter: StudiedChapter, on: boolean) => void;
  /** The student pressed play on a lesson. */
  markOpened: (moduleId: string, lessonId: string) => void;
  /** Clears a module and returns what it held, for Undo. */
  resetModule: (moduleId: string) => ProgressSnapshot;
  restore: (snapshot: ProgressSnapshot) => void;
}

export function useGuestProgress(): ProgressApi & { clear: () => void } {
  const [raw, setRaw] = useLocalStorage<unknown>(GUEST_PROGRESS_KEY, null);
  const state = useMemo(() => normalizeStored(raw), [raw]);

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
      tracking: true,
      isWatched: (lessonId: string) => !!state.watched[lessonId],
      setWatched: (moduleId: string, lessonId: string, on: boolean) =>
        write((s) => withWatched(s, moduleId, lessonId, on, Date.now())),
      isStudied: (chapterId: string) => !!state.studied[chapterId],
      setStudied: (moduleId: string, chapter: StudiedChapter, on: boolean) =>
        write((s) => withStudied(s, moduleId, chapter, on, Date.now())),
      markOpened: (moduleId: string, lessonId: string) => write((s) => withOpened(s, moduleId, lessonId, Date.now())),
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
  | { type: 'watched'; moduleId: string; lessonId: string; on: boolean }
  | { type: 'opened'; moduleId: string; lessonId: string }
  | { type: 'studied'; moduleId: string; chapter: StudiedChapter; on: boolean }
  | { type: 'reset'; moduleId: string }
  | { type: 'restore'; snapshot: ProgressSnapshot };

const WRITE_KEY = ['progress', 'write'] as const;

function applyOp(s: ProgressState, op: Op): ProgressState {
  const now = Date.now();
  switch (op.type) {
    case 'watched':
      return withWatched(s, op.moduleId, op.lessonId, op.on, now);
    case 'opened':
      return withOpened(s, op.moduleId, op.lessonId, now);
    case 'studied':
      return withStudied(s, op.moduleId, op.chapter, op.on, now);
    case 'reset':
      return withoutModule(s, op.moduleId);
    case 'restore':
      return withSnapshot(s, op.snapshot);
  }
}

async function send(op: Op): Promise<Progress | null> {
  switch (op.type) {
    case 'watched':
      await putWatched(op.lessonId, op.on);
      return putResume(op.lessonId);
    case 'opened':
      return putResume(op.lessonId);
    case 'studied':
      return putStudied(op.chapter.id, op.on);
    case 'reset':
      await deleteModuleProgress(op.moduleId);
      return null;
    case 'restore':
      return importProgress(toImport(withSnapshot(EMPTY_PROGRESS, op.snapshot)));
  }
}

function useAccountProgress(userId: string | null): Omit<ProgressApi, 'tracking'> {
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
      push({ title: 'Your progress wasn’t saved', body: errorMessage(e, 'Try again in a moment.'), tone: 'alert' });
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
      isWatched: (lessonId: string) => !!state.watched[lessonId],
      setWatched: (moduleId: string, lessonId: string, on: boolean) =>
        mutate({ type: 'watched', moduleId, lessonId, on }),
      isStudied: (chapterId: string) => !!state.studied[chapterId],
      setStudied: (moduleId: string, chapter: StudiedChapter, on: boolean) =>
        mutate({ type: 'studied', moduleId, chapter, on }),
      markOpened: (moduleId: string, lessonId: string) => mutate({ type: 'opened', moduleId, lessonId }),
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

const nothing = () => undefined;

/** Progress while the person doesn't track it: nothing to show, nothing recorded. */
function untracked(mode: ProgressApi['mode'], ready: boolean): ProgressApi {
  return {
    state: EMPTY_PROGRESS,
    ready,
    mode,
    tracking: false,
    isWatched: () => false,
    setWatched: nothing,
    isStudied: () => false,
    setStudied: nothing,
    markOpened: nothing,
    resetModule: (moduleId: string) => ({ moduleId, watched: {}, last: null, studied: {} }),
    restore: nothing,
  };
}

/**
 * Lesson progress for the person using the app: their account's when signed in, this browser's otherwise; empty
 * while they don't track it. While sign-in status is loading, `ready` is false.
 */
export function useProgress(): ProgressApi {
  const { me, status } = useAuth();
  const tracking = useTracking();
  const userId = status === 'signed-in' && me ? me.id : null;
  const guest = useGuestProgress();
  const account = useAccountProgress(tracking.on ? userId : null);
  const loading = status === 'loading';
  return useMemo(() => {
    if (loading) return untracked('guest', false);
    if (!tracking.on) return untracked(userId ? 'account' : 'guest', true);
    return userId ? { ...account, tracking: true } : guest;
  }, [loading, tracking.on, userId, account, guest]);
}
