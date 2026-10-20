// Public interface of the guides (Results day, Choosing your electives). Other features import from here only.
//
//   <ResultsDayCard eventId />  Home: the results day checklist for a few weeks from each results date on the calendar
//                            (`eventId`, from GET /home), until hidden.
//   useGuides()              UseQueryResult<GuidesDoc>: every guide (GET /guides); Electives reads its words here.
//   <GuidesEditor />         Manage → Guides (guides.edit).
//
// The page is /results-day (routes.tsx).
import { lazy } from 'react';
export { useGuides } from './api';
// Manage's editor loads with Manage (inside its Suspense), so no other page carries it.
export const GuidesEditor = lazy(() => import('./editor/GuidesEditor').then((m) => ({ default: m.GuidesEditor })));
export { ResultsDayCard } from './ResultsDayCard';
