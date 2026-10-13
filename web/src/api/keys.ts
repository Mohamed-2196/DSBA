// Query keys that more than one area reads or invalidates (code quality review CQ-5). A key used by one area only
// stays in that area's api.ts.

/** GET /admin/stats: the hub's numbers and the queue counts. Invalidate it after anything that changes a queue (a report
 *  resolved, an upload published or rejected, a post hidden), so Manage and its tab counts follow. */
export const ADMIN_STATS_KEY = ['admin', 'stats'] as const;

/** GET /features: the features switched on for whoever asks. Signed in, /me carries the same list. */
export const FEATURES_KEY = ['features'] as const;

/** The Access screen: the roles catalogue and the feature switches (admins). */
export const ACCESS_ROLES_KEY = ['admin', 'roles'] as const;
export const ACCESS_FEATURES_KEY = ['admin', 'features'] as const;
