// Shapes of the forum feature. API models (ThreadSummary, ThreadDetail, Reply, UserPublic, ...) come from
// src/api/types; these are the forum's own view and filter types around them.
import type { ReportCreate, ReportOut, Reply, ThreadSummary } from '../../api/types';

export type CategoryId = ThreadSummary['category'];
export type CohortYear = 1 | 2 | 3;
export type ThreadSort = 'hot' | 'new' | 'top';
export type ReplyOrder = 'top' | 'oldest';

export type ReportTargetType = ReportCreate['targetType'];
export type ReportReason = ReportCreate['reason'];
export type ReportStatus = ReportOut['status'];

/** The list filters, as they live in the URL (?cohort=year-2&tag=r&sort=new&q=mgf&status=no-replies&module=…). */
export interface ForumFilters {
  /** a category id, or 'all' */
  cohort: CategoryId | 'all';
  tag: string;
  sort: ThreadSort;
  q: string;
  status: '' | 'no-replies';
  /** a module id */
  module: string;
}

/** What GET /forum/threads is asked for (the URL filters, cleaned). */
export interface ThreadListParams {
  q?: string;
  category?: CategoryId;
  moduleId?: string;
  tag?: string;
  year?: CohortYear;
  sort?: ThreadSort;
  /** threads waiting for a first reply */
  unanswered?: boolean;
  mine?: boolean;
}

/** A top-level reply with its nested replies (one level). */
export interface ReplyNode extends Reply {
  children: Reply[];
}

/** A category for display: the API's, or the built-in fallback until /forum/meta has loaded. */
export interface ForumCategory {
  id: CategoryId;
  label: string;
  short: string;
  year: CohortYear | null;
  blurb: string;
}

export interface ForumTag {
  id: string;
  label: string;
}

/** What a reported thing is now: a forum post's status, or a library item's. */
export type ReportTargetStatus = NonNullable<ReportOut['targetStatus']>;
