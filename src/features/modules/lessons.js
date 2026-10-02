// Lesson helpers for the modules feature: labels, embed URLs, URL params, exam countdowns and the
// deterministic per-lesson trace drawn on posters.
import { ChalkboardTeacher, Playlist, YoutubeLogo } from '@phosphor-icons/react';
import { VIDEO_KIND_LABEL, videoEmbedUrl } from '../../data/modules.js';
import { videoTitle } from '../../data/videoTitles.js';
import { formatDate } from '../../ui';
import { getNextExamForModule } from '../calendar/public.js';

// ── Video kinds ───────────────────────────────────────────────────────────
export const KIND_ICON = { youtube: YoutubeLogo, 'youtube-playlist': Playlist, bbb: ChalkboardTeacher };
/** Where the player loads from (said on the poster before anything is loaded). */
export const KIND_SOURCE = { youtube: 'YouTube', 'youtube-playlist': 'YouTube', bbb: 'vc.bibf.com' };

export function kindLabel(video) {
  return VIDEO_KIND_LABEL[video?.kind] || 'Video';
}

/** The lesson's real title when we know it, else 'Video 3' — or 'Playlist' for a YouTube playlist. */
export function lessonLabel(video, v) {
  if (video?.kind === 'youtube-playlist') return 'Playlist';
  return videoTitle(video) || `Video ${v + 1}`;
}

/** 'Video 3 of 9' / 'Playlist' / null when the chapter is a single video (nothing to count). */
export function lessonPosition(video, v, count) {
  if (video?.kind === 'youtube-playlist') return 'Playlist';
  return count > 1 ? `Video ${v + 1} of ${count}` : null;
}

/** 'Chapter 2, video 1 of 13' / 'Chapter 13, playlist' / 'Chapter 4' (single video). */
export function chapterPosition(c, video, v, count) {
  const pos = lessonPosition(video, v, count);
  return pos ? `Chapter ${c + 1}, ${pos.toLowerCase()}` : `Chapter ${c + 1}`;
}

/** 'Open on YouTube' / 'Open recording'. */
export function openOriginalLabel(video) {
  return video?.kind === 'bbb' ? 'Open recording' : 'Open on YouTube';
}

/** iframe src: v1's embed URL, plus autoplay for YouTube (the student just pressed play). */
export function embedSrc(video) {
  const base = videoEmbedUrl(video);
  if (!base || video.kind === 'bbb') return base;
  try {
    const u = new URL(base);
    if (!u.hostname.includes('youtube')) return base;
    u.searchParams.set('autoplay', '1');
    u.searchParams.set('rel', '0');
    return u.toString();
  } catch {
    return base;
  }
}

// ── URL ───────────────────────────────────────────────────────────────────
export const MODULE_TABS = ['overview', 'lessons', 'files', 'discussion'];

/** Search string for a module page, e.g. lessonSearch(1, 4) → '?tab=lessons&chapter=1&video=4'. */
export function lessonSearch(c, v) {
  return `?tab=lessons&chapter=${c}&video=${v}`;
}

/** Full route to a lesson. */
export function lessonHref(moduleId, c, v) {
  return `/modules/${moduleId}${lessonSearch(c, v)}`;
}

/** Parse an index URL param ('2' → 2); anything else → null. */
export function indexParam(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// ── Exams ─────────────────────────────────────────────────────────────────
const DAY = 24 * 3600 * 1000;

/** Whole days from today (local) to a 'YYYY-MM-DD' date. */
export function daysUntil(dateStr, now = Date.now()) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / DAY);
}

/**
 * Next exam for a module with display strings, or null.
 * { event, days, date: '30 Oct', weekdayDate: 'Fri 30 Oct', weekday: 'Friday', relative: 'in 24 days', soon }
 */
export function examFor(moduleId, now = Date.now()) {
  let event = null;
  try {
    event = getNextExamForModule(moduleId);
  } catch {
    event = null;
  }
  if (!event) return null;
  const days = daysUntil(event.date, now);
  return {
    event,
    days,
    date: formatDate(event.date, { day: 'numeric', month: 'short' }),
    weekdayDate: `${formatDate(event.date, { weekday: 'short' })} ${formatDate(event.date, { day: 'numeric', month: 'short' })}`,
    weekday: formatDate(event.date, { weekday: 'long' }),
    relative: days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`,
    soon: days <= 14,
  };
}

// ── Time ──────────────────────────────────────────────────────────────────
/** 'just now', '2h ago', 'yesterday', '3 days ago', '12 Sep'. From Date.now() (frozen in the film). */
export function lastOpenedLabel(at, now = Date.now()) {
  if (!at) return null;
  const mins = Math.round((now - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((today.getTime() - at) / DAY);
  if (days <= 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return formatDate(new Date(at), { day: 'numeric', month: 'short' });
}

// ── Trace (poster art) ──────────────────────────────────────────────
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The brand trace, stretched into a lesson's own time series: quiet noise, one spike.
 * Deterministic per seed (no Math.random at render). Coordinates in a width × height box.
 * @returns {{ d: string, end: [number, number], spike: [number, number] }}
 */
export function lessonTrace(seed, { width = 600, height = 120, points = 36, spikeAt = 0.72, noise = 0.07, flat = 0.06 } = {}) {
  const rand = seeded(hashString(String(seed)));
  const base = height * 0.6;
  const si = Math.max(3, Math.min(points - 4, Math.round(spikeAt * (points - 1))));
  const step = width / (points - 1);
  const pts = [];
  let drift = 0;
  for (let i = 0; i < points; i++) {
    const x = i === 0 || i === points - 1 ? i * step : i * step + (rand() - 0.5) * step * 0.5;
    drift = drift * 0.5 + (rand() - 0.5) * noise * height * 2;
    let y = base + drift;
    if (x < width * flat) y = base;
    if (i === si - 1) y = base + noise * height * 0.9;
    if (i === si) y = height * 0.04;
    if (i === si + 1) y = height * 0.96;
    if (i === si + 2) y = base - noise * height * 1.4;
    pts.push([x, y]);
  }
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return { d, end: pts[pts.length - 1], spike: pts[si] };
}
