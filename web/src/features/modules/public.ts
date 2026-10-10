// Public API of the modules feature: other features import from here only.
//   <ContinueLearning />            Home: the 1–3 lessons to pick up, with each module's progress
//   useProgress()                   lesson progress: { state, ready, mode, isWatched, setWatched, markOpened,
//                                   resetModule, restore } (the account's when signed in, this browser's otherwise)
//   useModuleProgress(moduleId)     { watched, total, pct } for one module (pct 0–100)
//   lessonHref(moduleId, c, v)      the route to a lesson
export { ContinueLearning } from './ContinueLearning';
export { useModuleProgress, useProgress } from './progress';
export type { Fraction as ModuleProgress, ProgressApi, ProgressState } from './progress';
export { lessonHref } from './lessons';
