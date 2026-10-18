// Shapes of the forum feature. API models (ThreadSummary, ThreadDetail, Reply, UserPublic, ...) come from
// src/api/types; these are the forum's own view and filter types around them.
import type { ForumGuideline, ReportCreate, ReportOut, Reply, ThreadSummary, paths } from '../../api/types';

export type CategoryId = ThreadSummary['category'];
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

/** What GET /forum/threads is asked for, without the paging: its query, as the API states it. */
export type ThreadListParams = Omit<
  NonNullable<paths['/api/v1/forum/threads']['get']['parameters']['query']>,
  'limit' | 'offset'
>;

/** A top-level reply with its nested replies (one level). */
export interface ReplyNode extends Reply {
  children: Reply[];
}

/** The pictures a guideline, or a category for every year, can have beside it. */
export type ForumIcon = ForumGuideline['icon'];

/** What a reported thing is now: a forum post's status, or a library item's. */
export type ReportTargetStatus = NonNullable<ReportOut['targetStatus']>;
