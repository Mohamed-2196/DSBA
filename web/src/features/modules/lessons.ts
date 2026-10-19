// Lesson helpers for the modules feature: labels, embed URLs, URL params and dates. Titles and channels come with the module's videos from the API.
import { ChalkboardTeacher, Playlist, YoutubeLogo, type Icon } from '@phosphor-icons/react';
import type { Chapter, Video } from '../../api/types';
import type { Feature } from '../../auth';
import { VIDEO_KIND_LABEL, videoEmbedUrl, videoSourceUrl } from '../../lib/modules';
import { formatDate } from '../../ui';

type VideoKind = Video['kind'];

// ── Video kinds ───────────────────────────────────────────────────────────
export const KIND_ICON: Record<VideoKind, Icon> = {
  youtube: YoutubeLogo,
  'youtube-playlist': Playlist,
  bbb: ChalkboardTeacher,
};
/** Where the player loads from (said on the poster before anything is loaded). */
export const KIND_SOURCE: Record<VideoKind, string> = {
  youtube: 'YouTube',
  'youtube-playlist': 'YouTube',
  bbb: 'vc.bibf.com',
};

export function kindLabel(video: Video | null | undefined): string {
  return video ? VIDEO_KIND_LABEL[video.kind] : 'Video';
}

// ── What a lesson says about itself ───────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BAHRAIN_OFFSET = 3 * 3600 * 1000; // where the classes were held: UTC+3, no daylight saving
const two = (n: number) => String(n).padStart(2, '0');

/** When a class recording was made, read from the 13-digit millisecond timestamp its URL ends with. */
export function recordingDate(video: Video | null | undefined): Date | null {
  const m = video?.kind === 'bbb' ? /-(\d{13})$/.exec(String(video.url ?? '')) : null;
  return m ? new Date(Number(m[1])) : null;
}

/**
 * '30 Sep 2025' (or '20 Oct 2025, 10:18' with `time`) in Bahrain time, whatever the viewer's time zone is.
 * Built by hand rather than with Intl so the month is always 'Sep' (en-GB says 'Sept') and never shifts.
 */
export function recordingDateLabel(
  video: Video | null | undefined,
  { time = false }: { time?: boolean } = {},
): string | null {
  const date = recordingDate(video);
  if (!date || Number.isNaN(date.getTime())) return null;
  const t = new Date(date.getTime() + BAHRAIN_OFFSET);
  const day = `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
  return time ? `${day}, ${two(t.getUTCHours())}:${two(t.getUTCMinutes())}` : day;
}

export interface LessonInfo {
  title: string;
  /** The title is the lesson's own (so headings and posters can use it instead of the chapter's). */
  real: boolean;
  by: string | null;
  byKind: 'channel' | 'date' | 'source' | 'unavailable' | null;
  unavailable: boolean;
}

/**
 * What a lesson is called and what to say beneath it.
 *   YouTube video     its title, and its channel                  'An Introduction to the Binomial Distribution' · 'jbstatistics'
 *   class recording   'Class recording', and the day it ran        '30 Sep 2025'
 *   YouTube playlist  'Playlist'                                   'Several videos on YouTube'
 *   anything else     'Video 3' (a title we don't know)
 * Videos YouTube removed are flagged `unavailable` by the API: they keep their place with a quiet note, and can
 * still be tried.
 */
export function lessonInfo(video: Video, v: number, { time = false }: { time?: boolean } = {}): LessonInfo {
  if (video.kind === 'bbb') {
    const when = recordingDateLabel(video, { time });
    return { title: 'Class recording', real: true, by: when, byKind: when ? 'date' : null, unavailable: false };
  }
  if (video.kind === 'youtube-playlist') {
    return { title: 'Playlist', real: false, by: 'Several videos on YouTube', byKind: 'source', unavailable: false };
  }
  const unavailable = !!video.unavailable;
  const title = video.title?.trim() || null;
  const channel = video.channel?.trim() || null;
  return {
    title: title ?? `Video ${v + 1}`,
    real: !!title,
    by: unavailable ? 'Unavailable on YouTube' : channel,
    byKind: unavailable ? 'unavailable' : channel ? 'channel' : null,
    unavailable,
  };
}

/**
 * lessonInfo() for every video of a chapter. Two class recordings on the same day (it happens: a morning and a
 * catch-up session) show the time as well, so the list never has two identical rows.
 */
export function chapterLessons(chapter: Chapter): LessonInfo[] {
  const perDay: Record<string, number> = {};
  chapter.videos.forEach((vid) => {
    const day = recordingDateLabel(vid);
    if (day) perDay[day] = (perDay[day] ?? 0) + 1;
  });
  return chapter.videos.map((vid, v) => {
    const day = recordingDateLabel(vid);
    return lessonInfo(vid, v, { time: !!day && (perDay[day] ?? 0) > 1 });
  });
}

/**
 * A lesson's name outside its chapter (Home's "Carry on", a board card): the video's own title; 'Point estimation:
 * class of 17 Sep 2025' for a class recording; 'Point estimation, video 3' for a video without a title.
 */
export function lessonName(chapter: Chapter, v: number): string {
  const video = chapter.videos[v];
  if (!video) return chapter.title;
  const info = chapterLessons(chapter)[v];
  if (video.kind === 'bbb') return info.by ? `${chapter.title}: class of ${info.by}` : `${chapter.title}: class`;
  return info.real ? info.title : `${chapter.title}, ${info.title.toLowerCase()}`;
}

/** 'Video 3 of 9' / 'Playlist' / null when the chapter is a single video (nothing to count). */
export function lessonPosition(video: Video, v: number, count: number): string | null {
  if (video.kind === 'youtube-playlist') return 'Playlist';
  return count > 1 ? `Video ${v + 1} of ${count}` : null;
}

/** 'Chapter 2, video 1 of 13' / 'Chapter 13, playlist' / 'Chapter 4' (single video). */
export function chapterPosition(c: number, video: Video, v: number, count: number): string {
  const pos = lessonPosition(video, v, count);
  return pos ? `Chapter ${c + 1}, ${pos.toLowerCase()}` : `Chapter ${c + 1}`;
}

/** Only https addresses from the content reach an iframe, a link or the audio player. */
export function httpsOnly(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Where to open a lesson at its source ("Open on YouTube"), or null. */
export function sourceHref(video: Video): string | null {
  return httpsOnly(videoSourceUrl(video));
}

/** 'Open on YouTube' / 'Open recording'. */
export function openOriginalLabel(video: Video): string {
  return video.kind === 'bbb' ? 'Open recording' : 'Open on YouTube';
}

/** iframe src: the embed URL, plus autoplay for YouTube (the student just pressed play). */
export function embedSrc(video: Video): string | null {
  const base = httpsOnly(videoEmbedUrl(video));
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
export const MODULE_TABS = ['overview', 'lessons', 'files', 'discussion'] as const;
export type ModuleTab = (typeof MODULE_TABS)[number];

export function isModuleTab(value: string | null): value is ModuleTab {
  return !!value && (MODULE_TABS as readonly string[]).includes(value);
}

/** Files belongs to the library and Discussion to the forum: each shows only while its feature is on. */
export function moduleTabOn(tab: ModuleTab, isOn: (feature: Feature) => boolean): boolean {
  if (tab === 'files') return isOn('library');
  if (tab === 'discussion') return isOn('forum');
  return true;
}

/** A lesson's address: the module page's Lessons tab with that lesson on screen. */
export function lessonHref(moduleId: string, lessonId: string): string {
  return `/modules/${moduleId}/lessons/${lessonId}`;
}

// ── Time ──────────────────────────────────────────────────────────────────
const DAY = 24 * 3600 * 1000;

/** 'just now', '2h ago', 'yesterday', '3 days ago', '12 Sep'. */
export function lastOpenedLabel(at: number | null | undefined, now = Date.now()): string | null {
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
