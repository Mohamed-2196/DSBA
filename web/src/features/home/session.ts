// The exam session ahead, and the geometry of Home's trace (pure + deterministic).
import type { ModuleSummary } from '../../api/types';
import { typeLabel, type CalendarEvent } from '../calendar/public';
import { dayFromISO, daysBetween, startOfDay } from './time';

const EXAM_TYPES = new Set(['exam', 'mock']);

/** A calendar date as Home's hero uses it: how far away, which module, which day. */
export interface SessionEvent extends CalendarEvent {
  days: number;
  module: ModuleSummary | null;
  when: Date;
}

export interface ExamSession {
  today: Date;
  next: SessionEvent;
  exams: SessionEvent[];
  kind: 'exams' | 'event';
}

/**
 * The next exam (or mock) for a year within `horizon` days, plus the exams that follow it with gaps ≤ `maxGap`
 * days (one "session"). Falls back to the next other date (break, deadline…) so the hero always has something
 * true to say. null when the calendar has nothing ahead.
 * Home counts down to confirmed dates only: sample dates (placeholders, `sample: true`) and programme events
 * stay on the Calendar page.
 */
export function getExamSession(
  events: readonly CalendarEvent[],
  year: number,
  getModule: (id: string | null | undefined) => ModuleSummary | null,
  now: Date = new Date(),
  { horizon = 120, maxGap = 21 }: { horizon?: number; maxGap?: number } = {},
): ExamSession | null {
  const today = startOfDay(now);
  const upcoming: SessionEvent[] = events
    .filter((e) => (e.year == null || e.year === year) && !e.sample && e.type !== 'event')
    .map((e) => {
      const when = dayFromISO(e.date);
      return { ...e, days: daysBetween(today, when), module: getModule(e.moduleId), when };
    })
    .filter((e) => e.days >= 0 && e.days <= horizon)
    .sort((a, b) => a.days - b.days);
  const exams = upcoming.filter((e) => EXAM_TYPES.has(e.type));
  const first = exams[0];
  if (first) {
    const session = [first];
    for (const e of exams.slice(1)) {
      const last = session[session.length - 1] as SessionEvent;
      if (e.days - last.days > maxGap) break;
      session.push(e);
    }
    return { today, next: first, exams: session, kind: 'exams' };
  }
  const other = upcoming.find((e) => e.days <= 60);
  if (other) return { today, next: other, exams: [other], kind: 'event' };
  return null;
}

/** Label for an event in the trace: unit code, else a short type label. */
export function traceLabel(e: SessionEvent): string {
  return e.unitCode || e.module?.shortName || typeLabel(e.type);
}

// ── Trace geometry ────────────────────────────────────────────────────────
// One "beat" per exam, in the proportions of the brand HubMark (x and y are multiples of the
// spike height; the HubMark's spike is at x = 0). Compressed horizontally to fit the spacing.
const BEAT: readonly (readonly [number, number])[] = [
  [-0.957, 0],
  [-0.741, -0.207],
  [-0.526, 0.069],
  [-0.293, -0.052],
  [0, -1],
  [0.345, 0.483],
  [0.603, -0.224],
  [0.862, 0.034],
  [1.172, -0.121],
  [1.5, 0],
];
const BEAT_BEFORE = 0.957;
const BEAT_AFTER = 1.5;

/** Deterministic noise in [-1, 1] for an integer (no Math.random: identical renders). */
function noise(i: number): number {
  let h = (i + 1) * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 2001) / 1000 - 1;
}

const fmt = (n: number): number => Math.round(n * 10) / 10;
const pathOf = (pts: readonly (readonly [number, number])[]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join(' ');

export interface Beat {
  exam: SessionEvent;
  x: number;
  h: number;
  k: number;
  top: number;
  isNext: boolean;
  level: number;
  showLabel: boolean;
}

export interface Trace {
  /** today → end of the next beat (cobalt) */
  head: string;
  /** the rest (quiet) */
  tail: string | null;
  headEnd: number;
  beats: Beat[];
  dayX: (d: number) => number;
  dayW: number;
  right: number;
}

export interface TraceOptions {
  /** px width of the drawing */
  width: number;
  /** px where "today" sits (the HubMark's end dot) */
  x0: number;
  /** baseline y */
  y0: number;
  /** spike height of the next exam (others are 80%) */
  spike: number;
  /** days shown (today = 0) */
  span: number;
  exams: readonly SessionEvent[];
  /** estimated label width (for collision levels) */
  labelW?: number;
  /** horizontal compression of a beat (1 = HubMark proportions) */
  compress?: number;
  /** label every exam (false: only the next one) */
  secondaryLabels?: boolean;
  wiggle?: number;
  step?: number;
}

/** Build the trace for a session. */
export function buildTrace({ width, x0, y0, spike, span, exams, labelW = 64, compress = 0.42, secondaryLabels = true, wiggle = 2.2, step = 13 }: TraceOptions): Trace {
  const right = width - 6;
  const dayW = (right - x0) / Math.max(1, span);
  const dayX = (d: number) => x0 + d * dayW;

  // Beats, compressed so neighbours never overlap.
  const beats: Beat[] = exams.map((exam, i) => {
    const x = dayX(exam.days);
    const h = i === 0 ? spike : spike * 0.8;
    const before = exams[i - 1];
    const after = exams[i + 1];
    const prev = before ? dayX(before.days) : x0;
    const next = after ? dayX(after.days) : right;
    const room = Math.min(x - prev, next - x);
    const k = Math.max(0.05, Math.min(compress, (room * 0.92) / ((BEAT_BEFORE + BEAT_AFTER) * h)));
    return { exam, x, h, k, top: y0 - h, isNext: i === 0, level: 0, showLabel: false };
  });

  // Label levels: greedy, two rows; the next exam always gets a label.
  const lastX = [-Infinity, -Infinity];
  for (const b of beats) {
    if (!secondaryLabels && !b.isNext) continue;
    const level = lastX.findIndex((lx) => b.x - lx >= labelW);
    if (level >= 0 || b.isNext) {
      b.level = Math.max(0, level);
      b.showLabel = true;
      lastX[b.level] = b.x;
    }
  }

  // Points: idle wiggle between beats, beat shapes at exams.
  const occupied = beats.map((b) => [b.x - BEAT_BEFORE * b.h * b.k - 2, b.x + BEAT_AFTER * b.h * b.k + 2] as const);
  const inBeat = (x: number) => occupied.some(([a, z]) => x >= a && x <= z);
  const pts: [number, number][] = [[x0, y0]];
  let i = 0;
  for (let x = x0 + step; x < right; x += step) {
    i += 1;
    if (!inBeat(x)) pts.push([x, y0 + noise(i) * wiggle]);
  }
  for (const b of beats) for (const [bx, by] of BEAT) pts.push([b.x + bx * b.h * b.k, y0 + by * b.h]);
  pts.push([right, y0]);
  pts.sort((a, z) => a[0] - z[0]);

  // Split after the next exam's beat.
  const first = beats[0];
  const split = first ? first.x + BEAT_AFTER * first.h * first.k : null;
  let head = pts;
  let tail: [number, number][] = [];
  if (split != null && beats.length > 1) {
    const at = pts.findIndex((p) => p[0] > split + 0.5);
    if (at > 0) {
      head = pts.slice(0, at);
      tail = pts.slice(at - 1);
    }
  }
  const headEnd = head[head.length - 1]?.[0] ?? x0;
  return { head: pathOf(head), tail: tail.length > 1 ? pathOf(tail) : null, headEnd, beats, dayX, dayW, right };
}
