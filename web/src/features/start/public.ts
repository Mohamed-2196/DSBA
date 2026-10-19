// Public interface of the guides (Start here, Results day, Choosing your electives). Other features import from here
// only.
//
//   <StartHereCard year />   Home: the checklist for Year 1 in the first weeks of the academic year, until hidden.
//                            Renders nothing for other years, outside those weeks or once hidden.
//   <ResultsDayCard />       Home: the results day checklist for a few weeks from each results date on the calendar,
//                            until hidden. Renders nothing at other times or while the calendar is switched off.
//   useGuides()              UseQueryResult<GuidesDoc>: every guide (GET /guides); Electives reads its words here.
//   <GuidesEditor />         Manage → Guides (guides.edit).
//
// The pages are /start-here and /results-day (routes.tsx).
import { lazy } from 'react';
export { useGuides } from './api';
// Manage's editor loads with Manage (inside its Suspense), so no other page carries it.
export const GuidesEditor = lazy(() => import('./editor/GuidesEditor').then((m) => ({ default: m.GuidesEditor })));
export { ResultsDayCard } from './ResultsDayCard';
export { StartHereCard } from './StartHereCard';
