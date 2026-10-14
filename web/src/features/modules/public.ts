// Public API of the modules feature: other features import from here only.
//   <ContinueLearning />            Home: the 1–3 lessons to pick up, with each module's progress
//   useModuleProgress(moduleId)     { watched, total, pct } for one module (pct 0–100)
//   lessonHref(moduleId, lessonId)  a lesson's address
//   findLesson(module, lessonId)    where a lesson is in a module's chapters ({ c, v }), or null
//   moduleDetailQuery(id)           a module with its chapters and videos, as query options: the one cache entry
//                                   for GET /modules/{id} (useQuery(moduleDetailQuery(id)), useQueries, prefetchQuery)
//   <ModulesEditor />               Manage → Modules (content.edit): add, edit, reorder, hide and remove modules,
//                                   chapters and lessons
export { ContinueLearning } from './ContinueLearning';
export { findLesson, useModuleProgress } from './progress';
export { lessonHref } from './lessons';
export { moduleDetailQuery } from './api';
export { ModulesEditor } from './editor/ModulesEditor';
