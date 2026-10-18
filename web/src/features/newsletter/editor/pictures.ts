// The pictures the editor offers: the newsletter's settings (GET /newsletter/settings), which people who manage the
// newsletter edit in Manage → Newsletter: pictures of the app (web/public) and uploaded newsletter pictures. Width and
// height are the files' own, so a picture reserves its space while it loads. An issue can also upload its own.
import type { NewsletterPicture } from '../../../api/types';
import type { FigureDraft } from '../lib/draft';

export interface AppPicture {
  src: string;
  label: string;
  width: number;
  height: number;
  /** portrait 3:4, made to fill a cover */
  cover?: boolean;
}

const sameSrc = (a: string, b: string): boolean => a.replace(/^\//, '') === b.replace(/^\//, '');

/**
 * The pictures to choose from: those the settings offer (only covers, for a cover), plus the one the issue already
 * uses when it isn't among them (a picture uploaded for the issue), so opening the editor never drops it.
 */
export function pictureChoices(offered: readonly NewsletterPicture[], current: Pick<FigureDraft, 'src' | 'width' | 'height'> | null, { cover = false }: { cover?: boolean } = {}): AppPicture[] {
  const list: AppPicture[] = offered.filter((p) => !cover || p.cover).map(({ src, label, width, height, cover: isCover }) => ({ src, label, width, height, cover: isCover }));
  if (current?.src && !offered.some((p) => sameSrc(p.src, current.src))) list.unshift({ src: current.src, label: 'The picture this issue uses now', width: current.width, height: current.height });
  return list;
}

/** A picture file's own width and height, read in the browser before it's uploaded. */
export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1200, height: 900 });
    };
    img.src = url;
  });
}
