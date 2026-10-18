// Public API of the onboarding feature.
//   <Onboarding />   mounted by the shell. While no year is chosen, a small prompt asks for one (or "I'm not a
//                    student", or "Sign in"); it never blocks the page (decision D7). The tour opens on request.
//   <TourStepCard step n of />   a step of the tour as its dialog shows it (Site settings' preview)
//   TOUR_ARTS          the illustrations a step can have, by name
export { Onboarding } from './Onboarding';
export { TourStepCard } from './TourStepCard';
export { TOUR_ARTS } from './tourArts';
