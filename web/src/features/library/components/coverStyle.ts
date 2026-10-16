import { useCallback } from 'react';
import { useLocalStorage } from '../../../state';

export type CoverStyle = 'original' | 'styled';

export const COVER_STYLE_KEY = 'dsba:library-cover-style';

/**
 * Controls whether file thumbnails show the original first-page cover image (`'original'`, the default)
 * or the generated cohort-coloured typographic cover (`'styled'`).
 */
export function useCoverStyle(): [CoverStyle, (next: CoverStyle) => void] {
  const [raw, setRaw] = useLocalStorage<CoverStyle>(COVER_STYLE_KEY, 'original');
  const style: CoverStyle = raw === 'styled' ? 'styled' : 'original';
  const setStyle = useCallback(
    (next: CoverStyle) => {
      setRaw(next === 'styled' ? 'styled' : 'original');
    },
    [setRaw],
  );
  return [style, setStyle];
}
