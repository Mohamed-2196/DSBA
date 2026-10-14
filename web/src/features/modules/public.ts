// Public API of the modules feature: other features import from here only.
//   <ContinueLearning />            Home: the 1–3 lessons to pick up, with each module's progress
//   useModuleProgress(moduleId)     { watched, total, pct } for one module (pct 0–100); nothing watched while untracked
//   useTracking()                   { on, ready, mode, set(on) }: whether lesson progress is kept (opt in; the
//                                   account's trackProgress, or this browser's choice for a guest)
//   lessonHref(moduleId, lessonId)  a lesson's address
//   findLesson(module, lessonId)    where a lesson is in a module's chapters ({ c, v }), or null
//   moduleDetailQuery(id)           a module with its chapters and videos, as query options: the one cache entry
//                                   for GET /modules/{id} (useQuery(moduleDetailQuery(id)), useQueries, prefetchQuery)
//   <ModulesEditor />               Manage → Modules (content.edit): add, edit, reorder, hide and remove modules,
//                                   chapters and lessons
//   <SuggestionsQueue />            Manage → Suggested videos (content.edit): accept students' suggestions as
//                                   lessons, or decline them
export { ContinueLearning } from './ContinueLearning';
export { findLesson, useModuleProgress } from './progress';
export { useTracking } from './tracking';
export { lessonHref } from './lessons';
export { moduleDetailQuery } from './api';
export { ModulesEditor } from './editor/ModulesEditor';
export { SuggestionsQueue } from './suggestions/SuggestionsQueue';
