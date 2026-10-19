// Times in a lesson's video, as notes keep them (whole seconds) and show them (4:05), and the lesson's page that
// starts the video at one (?t=245). Kept apart from the editor's node (videoTime.tsx) so the lesson page reads a
// start time without the editor.
import { createContext } from 'react';
import { lessonHref } from '../../modules/public';

/** The longest a lesson's video may be, in seconds (the API's VIDEO_TIME_MAX). */
export const VIDEO_TIME_MAX = 24 * 3600;

/** A time in a video as it is read: 4:05, or 1:02:05. */
export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** The second a lesson's video starts at, from its page's address (?t=245), or null. */
export function lessonVideoStart(search: string): number | null {
  const t = Number(new URLSearchParams(search).get('t'));
  return Number.isFinite(t) && t > 0 ? Math.min(VIDEO_TIME_MAX, Math.floor(t)) : null;
}

/** The lesson's page with its video starting at `seconds`. */
export const lessonAt = (moduleId: string, lessonId: string, seconds: number): string =>
  `${lessonHref(moduleId, lessonId)}?t=${Math.floor(seconds)}`;

/** What a time in the text does: go there in the video beside it, or open the note's lesson there. */
export interface VideoTimes {
  /** the video beside the note (the lesson panel) */
  seek: ((seconds: number) => void) | null;
  /** the note's lesson, to open at a time */
  lesson: { moduleId: string; lessonId: string } | null;
}

export const VideoTimesContext = createContext<VideoTimes>({ seek: null, lesson: null });
