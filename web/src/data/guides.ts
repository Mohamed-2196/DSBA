// The words of the hub's two guides, in one place to edit. Everything else on those pages comes from the hub's own
// data: modules, the calendar, the library and Career Navigator.
//
//   START_HERE   Year 1's first weeks: the card on Home and the page at /start-here. A rep checks it every September.
//   ELECTIVES    Choosing your Year 3 electives (/career/electives): the intro and the disclaimer.
//
// Keep each line short and plain. A step's `link` says where its button goes:
//   { kind: 'web', href, label }           another site (https only)
//   { kind: 'page', to, label, feature? }  a page of the hub; `feature` hides it while that feature is switched off
//   { kind: 'deadline' }                   the calendar date named by START_HERE.deadlineTitle
//   { kind: 'install' }                    "Install the app", or how to add it on an iPhone
import type { Feature } from '../auth';
import { MYCLASS_URL, UOL_PORTAL_URL } from './people';

export type GuideLink =
  | { kind: 'web'; href: string; label: string }
  | { kind: 'page'; to: string; label: string; feature?: Feature }
  | { kind: 'deadline' }
  | { kind: 'install' };

export interface GuideStep {
  /** stable: the ticks kept in the browser are these ids */
  id: string;
  title: string;
  hint: string;
  links: GuideLink[];
}

export interface GuidePlace {
  name: string;
  whose: string;
  what: string;
  href?: string;
}

export const START_HERE = {
  /** The first day of the academic year (month 1-12). The card shows on Year 1's Home for `weeks` weeks from it. */
  termStart: { month: 9, day: 14 },
  weeks: 6,
  /** The calendar date the "Register" step shows: the next one whose title contains this. */
  deadlineTitle: 'UoL application deadline',
  title: 'Start here',
  intro: 'Your first weeks on DSBA, one step at a time. Ticks stay in this browser.',
  steps: [
    {
      id: 'portal',
      title: 'Get your University of London login',
      hint: 'The UoL student portal is where you register, enter exams and see results.',
      links: [{ kind: 'web', href: UOL_PORTAL_URL, label: 'Open the UoL portal' }],
    },
    {
      id: 'register',
      title: 'Register with the University before the deadline',
      hint: 'Do it early. Ask a rep if the portal turns you away.',
      links: [{ kind: 'deadline' }],
    },
    {
      id: 'modules',
      title: 'Find each module’s study guide and VLE page',
      hint: 'Every module page here links its study guide, VLE folder and past papers.',
      links: [{ kind: 'page', to: '/modules?year=1', label: 'Your modules' }],
    },
    {
      id: 'myclass',
      title: 'Sign in to MyClass',
      hint: 'BIBF’s own site for your classes. Use your BIBF login.',
      links: [{ kind: 'web', href: MYCLASS_URL, label: 'Open MyClass' }],
    },
    {
      id: 'whatsapp',
      title: 'Join your year’s WhatsApp group',
      hint: 'Ask one of your student reps in class to add you.',
      links: [],
    },
    {
      id: 'exams',
      title: 'Learn how exams work',
      hint: 'Papers come in zones A and B, examiners’ reports say what markers wanted, and your marks decide your degree class.',
      links: [
        { kind: 'page', to: '/library?type=examiners-report&year=1', label: 'Examiners’ reports', feature: 'library' },
        { kind: 'page', to: '/grades', label: 'How your degree is classified', feature: 'grades' },
      ],
    },
    {
      id: 'install',
      title: 'Put the hub on your home screen',
      hint: 'It opens full screen, like any other app.',
      links: [{ kind: 'install' }],
    },
  ] satisfies GuideStep[],
  /** Three sites with similar jobs, told apart. */
  places: [
    { name: 'MyClass', whose: 'BIBF', what: 'Your classes and what your lecturers post.', href: MYCLASS_URL },
    { name: 'The VLE', whose: 'University of London', what: 'Study guides, readings and each module’s page.' },
    { name: 'The student portal', whose: 'University of London', what: 'Registration, exam entry and results.', href: UOL_PORTAL_URL },
  ] satisfies GuidePlace[],
} as const;

export const ELECTIVES = {
  /** How many of the electives a student takes. */
  pick: 2,
  intro: 'What each one covers, the skills it adds and the roles it leads to, side by side.',
  disclaimer: 'A guide written by students, not advice from BIBF or the University. Check the programme regulations before you choose.',
} as const;
