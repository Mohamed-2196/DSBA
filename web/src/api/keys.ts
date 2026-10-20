// Query keys that more than one area reads or invalidates. A key used by one area only
// stays in that area's api.ts.

/** GET /admin/stats: the hub's numbers and the queue counts. Invalidate it after anything that changes a queue (a report
 *  resolved, an upload published or rejected, a post hidden), so Manage and its tab counts follow. */
export const ADMIN_STATS_KEY = ['admin', 'stats'] as const;

/** Everything on Your account (its sessions, …): refreshed after signing in again or stepping up. */
export const ACCOUNT_KEY = ['account'] as const;

/** GET /features: the features switched on for whoever asks. Signed in, /me carries the same list. */
export const FEATURES_KEY = ['features'] as const;

/** The Access screen: the roles catalogue and the feature switches (admins). */
export const ACCESS_ROLES_KEY = ['admin', 'roles'] as const;
export const ACCESS_FEATURES_KEY = ['admin', 'features'] as const;

/** GET /me/progress, per account. Refetched when lesson tracking is turned on or off: the API hides what was saved
 *  while it is off. */
export const PROGRESS_KEY = ['progress'] as const;
/** Per account, so one person's progress is never shown to the next one on this browser. */
export const progressKey = (userId: string) => [...PROGRESS_KEY, userId] as const;

/** GET /notifications: the bell. The forum reads it again after a thread's notifications are marked read. */
export const NOTIFICATIONS_KEY = ['notifications'] as const;

/** GET /site, GET /guides and GET /modules/choices: Home's first answer (GET /home) carries them too and fills these, so
 *  Home's blocks don't ask again. */
export const SITE_KEY = ['site'] as const;
export const GUIDES_KEY = ['guides'] as const;
export const PAPER_CHOICES_KEY = ['papers', 'choices'] as const;

/** GET /home: Home's first screen, by the year shown and a guest's papers. Read again after anything that changes the
 *  student's dates on it (their papers, the dates they hide). */
export const HOME_KEY = ['home'] as const;
