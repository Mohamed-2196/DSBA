// Public interface of the Career Navigator feature. Other features import from here only.
//
//   <SeniorListing />   Your account: a Year 3 student lists themselves as a senior who answers questions
//                       (career.seniors). The caller shows it only while the feature is on and the person is in Year 3.
import { lazy } from 'react';
export { SeniorListing } from './SeniorListing';

//   useEmployers()      the Career Navigator's employers as { id, name }, for the calendar's careers dates
export { useEmployers } from './api';

//   <CareerEditor />    Manage's Career Navigator section (holders of career.edit): every part of the page, saved as
//                       one versioned document, with previews and uploaded logos.
// Manage's editor loads with Manage (inside its Suspense), so no other page carries it.
export const CareerEditor = lazy(() => import('./editor/CareerEditor').then((m) => ({ default: m.CareerEditor })));
