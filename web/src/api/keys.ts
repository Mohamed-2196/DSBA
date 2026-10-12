// Query keys that more than one area reads or invalidates (code quality review CQ-5). A key used by one area only
// stays in that area's api.ts.

/** GET /admin/stats: the moderation queue counts. Invalidate it after anything that changes a queue (a report
 *  resolved, an upload published or rejected, a post hidden), so the moderation page and its badges follow. */
export const ADMIN_STATS_KEY = ['admin', 'stats'] as const;
