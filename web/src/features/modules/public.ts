// Public API of the modules feature: other features import from here only.
//   <ContinueLearning />            Home: the 1–3 lessons to pick up, with each module's progress
//   useModuleProgress(moduleId)     { watched, total, pct } for one module (pct 0–100)
//   lessonHref(moduleId, c, v)      the route to a lesson
//   moduleDetailQuery(id)           a module with its chapters and videos, as query options: the one cache entry
//                                   for GET /modules/{id} (useQuery(moduleDetailQuery(id)), useQueries, prefetchQuery)
export { ContinueLearning } from './ContinueLearning';
export { useModuleProgress } from './progress';
export { lessonHref } from './lessons';
export { moduleDetailQuery } from './api';
