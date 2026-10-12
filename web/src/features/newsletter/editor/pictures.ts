// The pictures an issue may use for now: files of the app itself (web/public). An image uploaded for an issue would
// be invisible to readers (the API serves uploaded images only with a forum post) and swept after a day, so the editor
// offers these only. Width and height are the files' own, so a picture reserves its space while it loads.
import type { FigureDraft } from '../lib/draft';

export interface AppPicture {
  src: string;
  label: string;
  width: number;
  height: number;
  /** portrait 3:4, made to fill a cover */
  cover?: boolean;
}

export const APP_PICTURES: readonly AppPicture[] = [
  { src: 'brand/newsletter-cover.jpg', label: 'Newsletter cover illustration', width: 1086, height: 1448, cover: true },
  { src: 'demo/news/cfa-research-challenge.jpg', label: 'CFA Research Challenge poster', width: 986, height: 701 },
  { src: 'demo/news/speech-day.jpg', label: 'Speech Day poster', width: 1080, height: 1350 },
];

const sameSrc = (a: string, b: string): boolean => a.replace(/^\//, '') === b.replace(/^\//, '');

/** The catalogue entry for a picture, if it is one of the app's own. */
export const appPicture = (src: string | null | undefined): AppPicture | undefined => (src ? APP_PICTURES.find((p) => sameSrc(p.src, src)) : undefined);

/**
 * The pictures to choose from: the app's own (only covers, for a cover), plus the one the issue already uses when it
 * isn't among them (an uploaded image from before), so opening the editor never drops it.
 */
export function pictureChoices(current: Pick<FigureDraft, 'src' | 'width' | 'height'> | null, { cover = false }: { cover?: boolean } = {}): AppPicture[] {
  const list = APP_PICTURES.filter((p) => !cover || p.cover);
  if (current?.src && !appPicture(current.src)) list.unshift({ src: current.src, label: 'The picture this issue uses now', width: current.width, height: current.height });
  return list;
}
