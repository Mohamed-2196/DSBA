// Public API of the modules feature: other features import from here only.
//   <ContinueLearning />            Home: the 1–3 lessons to pick up, with each module's progress
//   useModuleProgress(moduleId)     { watched, total, pct } for one module (pct 0–100); nothing watched while untracked
//   useTracking()                   { on, ready, mode, set(on) }: whether lesson progress is kept (opt in; the
//                                   account's trackProgress, or this browser's choice for a guest)
//   lessonHref(moduleId, lessonId)  a lesson's address
//   lessonName(chapter, v)          a lesson's name outside its chapter ('Point estimation: class of 17 Sep 2025')
//   findLesson(module, lessonId)    where a lesson is in a module's chapters ({ c, v }), or null
//   useModuleExam(moduleId)         { next, otherResit, loaded }: the exam that counts down for the student (the main
//                                   sitting, or a resit that is theirs) and a resit that isn't, as ExamInfo
//   moduleDetailQuery(id)           a module with its chapters and videos, as query options: the one cache entry
//                                   for GET /modules/{id} (useQuery(moduleDetailQuery(id)), useQueries, prefetchQuery)
//   <ModulesEditor />               Manage → Modules (content.edit): add, edit, reorder, hide and remove modules,
//                                   chapters and lessons
//   <SuggestionsQueue />            Manage → Suggested videos (content.edit): accept students' suggestions as
//                                   lessons, or decline them
import { lazy } from 'react';
export { ContinueLearning } from './ContinueLearning';
export { findLesson, useModuleProgress } from './progress';
export { useTracking } from './tracking';
export { lessonHref, lessonName } from './lessons';
export { moduleDetailQuery } from './api';
export { useModuleExam } from './exams';
// Manage's editor loads with Manage (inside its Suspense), so no other page carries it.
export const ModulesEditor = lazy(() => import('./editor/ModulesEditor').then((m) => ({ default: m.ModulesEditor })));
export { SuggestionsQueue } from './suggestions/SuggestionsQueue';
