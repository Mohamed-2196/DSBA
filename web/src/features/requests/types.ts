// Request shapes the UI names, taken from the generated API types.
import type { RequestOut } from '../../api/types';

export type RequestKind = RequestOut['kind'];
export type RequestStatus = RequestOut['status'];
export type RequestSort = 'me_too' | 'newest';

/** The list's filters, as the URL holds them. */
export interface RequestFilters {
  kind: RequestKind | null;
  status: RequestStatus | null;
  sort: RequestSort;
  mine: boolean;
}
