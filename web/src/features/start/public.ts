// Public interface of the guides (Start here and Results day). Other features import from here only.
//
//   <StartHereCard year />   Home: the checklist for Year 1 in the first weeks of the academic year, until hidden.
//                            Renders nothing for other years, outside those weeks or once hidden.
//   <ResultsDayCard />       Home: the results day checklist for two weeks from each results date on the calendar,
//                            until hidden. Renders nothing at other times or while the calendar is switched off.
//
// The pages are /start-here and /results-day (routes.tsx). Their words are in data/guides.ts.
export { ResultsDayCard } from './ResultsDayCard';
export { StartHereCard } from './StartHereCard';
