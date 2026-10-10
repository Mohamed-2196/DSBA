// Public interface of the forum feature. Other features import from here only.
//
//   <HotThreads n={5} />                 Home widget: the n hottest threads for the student's year (plus forum-wide ones).
//                                         Has its own loading, empty and error states.
//   <ModuleThreads moduleId="…" />       the module page's Discussion tab: the module's threads, "Ask about this module".
//   useHotThreads({ n, year })            UseQueryResult<ThreadSummary[]>: the hottest threads (pinned ones left out) for a
//                                         cohort plus forum-wide ones; year null → every cohort. Links: /forum/<slug>.
//   <ReportButton targetType targetId />  "Report" + its dialog for a thread, a reply or a library item ('library_item').
//   <ReportsQueue />                      the moderators' list of reports (resolve, dismiss, open the post).
//
// Thread links are /forum/<slug>. Searching the forum is GET /api/v1/search (the ⌘K palette).
export { HotThreads } from './HotThreads';
export type { HotThreadsProps } from './HotThreads';
export { ModuleThreads } from './ModuleThreads';
export type { ModuleThreadsProps } from './ModuleThreads';
export { useHotThreads } from './api';
export { ReportButton } from './ReportButton';
export type { ReportButtonProps } from './ReportButton';
export { ReportsQueue } from './ReportsQueue';
