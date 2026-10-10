// Shapes shared inside the library feature. API models come from src/api/types.
import type { LibraryItem } from '../../api/types';
import type { ItemSource, ItemStatus, LibraryKind } from './kinds';

export type { LibraryItem };
export type CohortYear = 1 | 2 | 3;

/** Sort orders the API knows. 'relevance' (best match first) only means something with a search. */
export type LibrarySort = 'new' | 'popular' | 'title' | 'relevance';

/** Filters for GET /library/items (everything optional; `starred` and `mine` need a session). */
export interface LibraryQuery {
  q?: string;
  moduleId?: string | null;
  year?: CohortYear | null;
  kind?: LibraryKind | null;
  source?: ItemSource | null;
  sort?: LibrarySort;
  starred?: boolean;
  mine?: boolean;
  /** Moderators: e.g. 'pending'. */
  status?: ItemStatus | null;
}

export type LibraryView = 'grid' | 'list';
