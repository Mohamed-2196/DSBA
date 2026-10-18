// Public interface of the forum feature. Other features import from here only.
//
//   <HelpBelow />                         Home section: for a signed-in Year 2 or 3 student, up to three unanswered questions
//                                         from the years below. Renders nothing while off (forum.help-below), empty or loading.
//   <ModuleThreads moduleId="…" />       the module page's Discussion tab: the module's threads, "Ask about this module".
//   useHotThreads({ n, year, enabled })   UseQueryResult<ThreadSummary[]>: the hottest threads (pinned ones left out) for a
//                                         cohort plus forum-wide ones; year null → every cohort. Links: /forum/<slug>.
//   <ReportButton targetType targetId />  "Report" + its dialog for a thread, a reply, a library item ('library_item') or a request.
//   <ReportsQueue />                      the moderators' list of reports (resolve, dismiss, open the post).
//   <MarkdownEditor … />                  the forum's Markdown textarea: toolbar, ⌘B / ⌘I, an optional Write / Preview toggle.
//   <Prose text="…" />                    renders the forum's Markdown (lib/markdown.ts) as React elements, never HTML.
//   useStartsThreads()                    true when a "Start a thread" link belongs on the page (the forum is on and the
//                                         person may post; a guest signs in when they post).
//   <ForumSettingsEditor />               Manage → Forum (forum.moderate): categories, tags, guidelines and tips.
//
// Thread links are /forum/<slug>. Searching the forum is GET /api/v1/search (the ⌘K palette).
import { lazy } from 'react';
export { HelpBelow } from './HelpBelow';
export { ModuleThreads } from './ModuleThreads';
export { useHotThreads } from './api';
export { ReportButton } from './ReportButton';
export { ReportsQueue } from './ReportsQueue';
export { useStartsThreads } from './lib/posting';
export { MarkdownEditor } from './components/MarkdownEditor';
export { Prose } from './components/Prose';
// Manage's editor loads with Manage (inside its Suspense), so no other page carries it.
export const ForumSettingsEditor = lazy(() =>
  import('./settings/ForumSettingsEditor').then((m) => ({ default: m.ForumSettingsEditor })),
);
