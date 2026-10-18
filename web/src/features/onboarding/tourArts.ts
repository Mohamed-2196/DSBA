// The illustration beside each step of the tour, by the name Site settings give it.
import type { ComponentType } from 'react';
import type { TourStep } from '../../api/types';
import { ForumArt, LibraryArt, SearchArt } from './TourArt';

export const TOUR_ARTS: Readonly<Record<TourStep['art'], { Art: ComponentType; label: string }>> = {
  search: { Art: SearchArt, label: 'Search' },
  library: { Art: LibraryArt, label: 'The library' },
  forum: { Art: ForumArt, label: 'The forum' },
};

export const tourArtOf = (art: TourStep['art']): ComponentType => TOUR_ARTS[art].Art;
