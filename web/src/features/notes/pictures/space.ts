// What a picture in the text needs from the page around it to become free where it is (the note's page provides it,
// around the text: pictures in the text are drawn by the editor).
import { createContext, useContext } from 'react';
import type { PictureAttrs } from '../text/picture';

export interface PictureSpace {
  /** the picture in the text at `pos`, shown at `shown` on screen, made free where it is */
  makeFree: (pos: number, attrs: PictureAttrs, shown: DOMRect) => void;
}

export const PictureSpaceContext = createContext<PictureSpace | null>(null);

export const usePictureSpace = (): PictureSpace | null => useContext(PictureSpaceContext);
