// Pure helpers for modules and their lessons. The catalogue itself comes from the API (state/modules.tsx).
import type { ModuleSummary, Video } from '../api/types';

export const YEARS = [1, 2, 3] as const;
export type CohortYear = (typeof YEARS)[number];

/** Display label: unit code + name when a code exists. */
export function moduleLabel(m: Pick<ModuleSummary, 'unitCode' | 'name'> | null | undefined): string {
  return m ? (m.unitCode ? `${m.unitCode} ${m.name}` : m.name) : '';
}

const isYoutubeUrl = (s: string) => s.includes('youtube.com') || s.includes('youtu.be');

/** iframe src for a video: a YouTube embed, or the recording's own URL. */
export function videoEmbedUrl(v: Video | null | undefined): string | null {
  if (!v) return null;
  if (v.kind === 'bbb') return v.url ?? null;
  if (!v.videoId) return null;
  if (v.kind === 'youtube-playlist') return `https://www.youtube.com/embed/videoseries?list=${v.videoId}`;
  if (isYoutubeUrl(v.videoId)) return v.videoId;
  return `https://www.youtube.com/embed/${v.videoId}`;
}

/** Link to open the video at its source ("Open original"). */
export function videoSourceUrl(v: Video | null | undefined): string | null {
  if (!v) return null;
  if (v.kind === 'bbb') return v.url ?? null;
  if (!v.videoId) return null;
  if (v.kind === 'youtube-playlist') return `https://www.youtube.com/playlist?list=${v.videoId}`;
  if (isYoutubeUrl(v.videoId)) return v.videoId;
  return `https://www.youtube.com/watch?v=${v.videoId}`;
}

/** YouTube thumbnail (null for playlists and class recordings). External: always provide a fallback. */
export function videoThumbnailUrl(v: Video | null | undefined): string | null {
  return v && v.kind === 'youtube' && v.videoId && !v.videoId.includes('/')
    ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
    : null;
}

export const VIDEO_KIND_LABEL: Record<Video['kind'], string> = {
  youtube: 'YouTube',
  'youtube-playlist': 'YouTube playlist',
  bbb: 'Class recording',
};
