// The exam session ahead, and the geometry of Home's trace (pure + deterministic).
import { EVENT_TYPES, eventDate, getEventsForYear } from '../../data/calendar.js';
import { getModule } from '../../data/modules.js';
import { daysBetween, startOfDay } from './time.js';

const EXAM_TYPES = new Set(['exam', 'mock']);

/**
 * The next exam (or mock) for a year within `horizon` days, plus the exams that follow it
 * with gaps ≤ `maxGap` days (one "session"). Falls back to the next other event (break,
 * deadline…) so the hero always has something true to say. null when the calendar is empty.
 * -> { today, next, exams: [...], kind: 'exams' | 'event' }
 */
export function getExamSession(year, now = new Date(), { horizon = 120, maxGap = 21 } = {}) {
  const today = startOfDay(now);
  const upcoming = getEventsForYear(year)
    // Home counts down to confirmed dates only: the calendar's sample entries (placeholders modelled on
    // last year's pattern, `sample: true`) and programme events stay on the Calendar page.
    .filter((e) => !e.sample && e.type !== 'event')
    .map((e) => ({ ...e, days: daysBetween(today, eventDate(e)), module: getModule(e.moduleId), when: eventDate(e) }))
    .filter((e) => e.days >= 0 && e.days <= horizon);
  const exams = upcoming.filter((e) => EXAM_TYPES.has(e.type));
  if (exams.length) {
    const session = [exams[0]];
    for (let i = 1; i < exams.length; i++) {
      if (exams[i].days - session[session.length - 1].days > maxGap) break;
      session.push(exams[i]);
    }
    return { today, next: session[0], exams: session, kind: 'exams' };
  }
  const other = upcoming.find((e) => e.days <= 60);
  if (other) return { today, next: other, exams: [other], kind: 'event' };
  return null;
}

/** Label for an event in the trace: unit code, else a short type label. */
export function traceLabel(e) {
  return e.unitCode || e.module?.shortName || EVENT_TYPES[e.type]?.label || 'Event';
}

// ── Trace geometry ────────────────────────────────────────────────────────
// One "beat" per exam, in the proportions of the brand HubMark (x and y are multiples of the
// spike height; the HubMark's spike is at x = 0). Compressed horizontally to fit the spacing.
const BEAT = [
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

/** Deterministic noise in [-1, 1] for an integer (no Math.random: the film needs identical renders). */
function noise(i) {
  let h = (i + 1) * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 2001) / 1000 - 1;
}

const fmt = (n) => Math.round(n * 10) / 10;
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join(' ');

/**
 * Build the trace for a session.
 * @param {object} o
 * @param {number} o.width     px width of the drawing
 * @param {number} o.x0        px where "today" sits (the HubMark's end dot)
 * @param {number} o.y0        baseline y
 * @param {number} o.spike     spike height of the next exam (others are 80%)
 * @param {number} o.span      days shown (today = 0)
 * @param {Array}  o.exams     [{ id, days, ... }] (sorted)
 * @param {number} o.labelW    estimated label width (for collision levels)
 * @param {number} o.compress  horizontal compression of a beat (1 = HubMark proportions)
 * @param {boolean} o.secondaryLabels  label every exam (false: only the next one)
 * -> { head, tail, beats: [{ exam, x, top, h, level, showLabel, isNext }], dayX(d), end }
 *    head = today → end of the next beat (cobalt); tail = the rest (quiet).
 */
export function buildTrace({ width, x0, y0, spike, span, exams, labelW = 64, compress = 0.42, secondaryLabels = true, wiggle = 2.2, step = 13 }) {
  const right = width - 6;
  const dayW = (right - x0) / Math.max(1, span);
  const dayX = (d) => x0 + d * dayW;

  // Beats, compressed so neighbours never overlap.
  const beats = exams.map((exam, i) => {
    const x = dayX(exam.days);
    const h = i === 0 ? spike : spike * 0.8;
    const prev = i > 0 ? dayX(exams[i - 1].days) : x0;
    const next = i < exams.length - 1 ? dayX(exams[i + 1].days) : right;
    const room = Math.min(x - prev, next - x);
    const k = Math.max(0.05, Math.min(compress, (room * 0.92) / ((BEAT_BEFORE + BEAT_AFTER) * h)));
    return { exam, x, h, k, top: y0 - h, isNext: i === 0 };
  });

  // Label levels: greedy, two rows; the next exam always gets a label.
  const lastX = [-Infinity, -Infinity];
  for (const b of beats) {
    if (!secondaryLabels && !b.isNext) {
      b.showLabel = false;
      continue;
    }
    const level = lastX.findIndex((lx) => b.x - lx >= labelW);
    if (level >= 0 || b.isNext) {
      b.level = Math.max(0, level);
      b.showLabel = true;
      lastX[b.level] = b.x;
    } else {
      b.showLabel = false;
    }
  }

  // Points: idle wiggle between beats, beat shapes at exams.
  const occupied = beats.map((b) => [b.x - BEAT_BEFORE * b.h * b.k - 2, b.x + BEAT_AFTER * b.h * b.k + 2]);
  const inBeat = (x) => occupied.some(([a, z]) => x >= a && x <= z);
  const pts = [[x0, y0]];
  let i = 0;
  for (let x = x0 + step; x < right; x += step) {
    i += 1;
    if (!inBeat(x)) pts.push([x, y0 + noise(i) * wiggle]);
  }
  for (const b of beats) for (const [bx, by] of BEAT) pts.push([b.x + bx * b.h * b.k, y0 + by * b.h]);
  pts.push([right, y0]);
  pts.sort((a, z) => a[0] - z[0]);

  // Split after the next exam's beat.
  const split = beats.length ? beats[0].x + BEAT_AFTER * beats[0].h * beats[0].k : null;
  let head = pts;
  let tail = [];
  if (split != null && beats.length > 1) {
    const at = pts.findIndex((p) => p[0] > split + 0.5);
    if (at > 0) {
      head = pts.slice(0, at);
      tail = pts.slice(at - 1);
    }
  }
  return { head: pathOf(head), tail: tail.length > 1 ? pathOf(tail) : null, headEnd: head[head.length - 1][0], beats, dayX, dayW, right };
}
