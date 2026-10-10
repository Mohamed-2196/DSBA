// Pure helpers for modules and their lessons. The catalogue itself comes from the API (state/modules.tsx).
import type { ModuleSummary, Video } from '../api/types';

export const YEARS = [1, 2, 3] as const;
export type CohortYear = (typeof YEARS)[number];

/** Display label: unit code + name when a code exists. */
export function moduleLabel(m: Pick<ModuleSummary, 'unitCode' | 'name'> | null | undefined): string {
  return m ? (m.unitCode ? `${m.unitCode} ${m.name}` : m.name) : '';
}

/** Stable key for a lesson (progress): '<module id>:<chapter index>:<video index>'. */
export function lessonKey(moduleId: string, chapterIndex: number, videoIndex: number): string {
  return `${moduleId}:${chapterIndex}:${videoIndex}`;
}

const isYoutubeUrl = (s: string) => s.includes('youtube.com') || s.includes('youtu.be');

/** iframe src for a video (the URLs v1 embedded). */
export function videoEmbedUrl(v: Video | null | undefined): string | null {
  if (!v) return null;
  if (v.kind === 'bbb') return v.url ?? null;
  if (!v.id) return null;
  if (v.kind === 'youtube-playlist') return `https://www.youtube.com/embed/videoseries?list=${v.id}`;
  if (isYoutubeUrl(v.id)) return v.id;
  return `https://www.youtube.com/embed/${v.id}`;
}

/** Link to open the video at its source ("Open original"). */
export function videoSourceUrl(v: Video | null | undefined): string | null {
  if (!v) return null;
  if (v.kind === 'bbb') return v.url ?? null;
  if (!v.id) return null;
  if (v.kind === 'youtube-playlist') return `https://www.youtube.com/playlist?list=${v.id}`;
  if (isYoutubeUrl(v.id)) return v.id;
  return `https://www.youtube.com/watch?v=${v.id}`;
}

/** YouTube thumbnail (null for playlists and class recordings). External: always provide a fallback. */
export function videoThumbnailUrl(v: Video | null | undefined): string | null {
  return v && v.kind === 'youtube' && v.id && !v.id.includes('/') ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : null;
}

export const VIDEO_KIND_LABEL: Record<Video['kind'], string> = {
  youtube: 'YouTube',
  'youtube-playlist': 'YouTube playlist',
  bbb: 'Class recording',
};
