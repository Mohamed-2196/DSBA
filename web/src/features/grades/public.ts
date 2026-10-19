// Public interface of the grades calculator. Other features import from here only.
//
//   <ProjectedClass calculatorLink? />   the class this browser's calculator marks point to, marks under 40, or
//                                        "no marks yet"; with the University's rules linked and the line that it
//                                        isn't official. Reads the marks from this browser and sends nothing.
import { lazy } from 'react';
export { ProjectedClass } from './ProjectedClass';
//   <GradeRulesEditor />                 Manage → Grades calculator (admins): the subjects, bands and classes, with a
//                                        worked example before saving
// Manage's editor loads with Manage (inside its Suspense), so no other page carries it.
export const GradeRulesEditor = lazy(() =>
  import('./editor/GradeRulesEditor').then((m) => ({ default: m.GradeRulesEditor })),
);
