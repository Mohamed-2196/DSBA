// The words of the hub's two guides, in one place to edit. Everything else on those pages comes from the hub's own
// data: modules, the calendar, the library and Career Navigator.
//
//   START_HERE   Year 1's first weeks: the card on Home and the page at /start-here. A rep checks it every September.
//   RESULTS_DAY  What results mean and what to do next: Home's card from each results date, and /results-day.
//                A rep checks it every May and October, and puts the results dates on the calendar.
//   UOL_RULES    Where the University's own rules are, and the line that says the hub's sums aren't official.
//                The links point at this year's editions: update them when the University publishes new ones.
//   ELECTIVES    Choosing your Year 3 electives (/career/electives): the intro and the disclaimer.
//
// Keep each line short and plain. A step's `link` says where its button goes:
//   { kind: 'web', href, label }           another site (https only)
//   { kind: 'page', to, label, feature? }  a page of the hub; `feature` hides it while that feature is switched off
//   { kind: 'date', title, type, label }   the next calendar date of that type whose title contains `title`
//   { kind: 'install' }                    "Install the app", or how to add it on an iPhone
import type { Feature } from '../auth';
import { MYCLASS_URL, UOL_PORTAL_URL } from './people';

export type GuideLink =
  | { kind: 'web'; href: string; label: string }
  | { kind: 'page'; to: string; label: string; feature?: Feature }
  | { kind: 'date'; title: string; type: 'deadline' | 'event'; label: string }
  | { kind: 'install' };

export interface GuideStep {
  /** stable: the ticks kept in the browser are these ids */
  id: string;
  title: string;
  hint: string;
  links: readonly GuideLink[];
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
      links: [{ kind: 'date', title: 'UoL application deadline', type: 'deadline', label: 'Deadline' }],
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

export const UOL_RULES = {
  regulations: {
    href: 'https://www.london.ac.uk/sites/default/files/progregs-emfss-online-and-rtc-taught-2025-26.pdf',
    label: 'Programme regulations 2025–26',
  },
  results: {
    href: 'https://www.london.ac.uk/current-students/examinations-assessment/examination-entry-results',
    label: 'Exam entry and results',
  },
  /** Under every class the hub works out. */
  check: 'Worked out in this browser from the University’s rules, by students. It isn’t your official result: check with the University.',
} as const;

/** The calendar's results dates are `event`s whose title contains this. */
const RESULTS_TITLE = 'UoL results released';

export const RESULTS_DAY = {
  eventTitle: RESULTS_TITLE,
  /** Home's card shows for this many weeks from each results date. */
  weeks: 2,
  title: 'Results day',
  intro: 'What your marks mean and what to do next. Ticks stay in this browser.',
  steps: [
    {
      id: 'read',
      title: 'Read your results on the UoL portal',
      hint: 'Each course has a mark out of 100: 70 and above is first class, 60 to 69 upper second, 50 to 59 lower second, 40 to 49 third, and under 40 a fail.',
      links: [
        { kind: 'web', href: UOL_PORTAL_URL, label: 'Open the UoL portal' },
        { kind: 'date', title: RESULTS_TITLE, type: 'event', label: 'Next results day' },
      ],
    },
    {
      id: 'under40',
      title: 'Under 40 is a fail, not the end',
      hint: 'You get up to three attempts at each course, and the most recent mark counts. The degree needs passes in at least 330 of its 360 credits, including every core course (regulations 5.11, 8.5 and 8.6).',
      links: [
        { kind: 'page', to: '/grades', label: 'Try it in the grades calculator', feature: 'grades' },
        { kind: 'web', href: UOL_RULES.regulations.href, label: 'The regulations' },
      ],
    },
    {
      id: 'resit',
      title: 'Enter for your resit before the exam entry deadline',
      hint: 'You enter a resit on the UoL portal, like any exam. A session where you take a new course must also include any failed course that is compulsory or a prerequisite for it (regulation 5.13).',
      links: [
        { kind: 'date', title: 'exam entry', type: 'deadline', label: 'Exam entry deadline' },
        { kind: 'web', href: UOL_PORTAL_URL, label: 'Open the UoL portal' },
      ],
    },
    {
      id: 'recheck',
      title: 'Think a mark is wrong? Ask for a recheck',
      hint: 'The University can check that every answer was marked and the marks were added up and recorded correctly. It doesn’t re-mark for academic judgement. There’s a fee and a deadline a few weeks after results day: its results page gives both.',
      links: [{ kind: 'web', href: UOL_RULES.results.href, label: 'UoL exam entry and results' }],
    },
    {
      id: 'talk',
      title: 'Talk it through with someone at BIBF',
      hint: 'Your student reps and BIBF’s programme team can help you plan resits and next year’s modules. Bring your marks.',
      links: [],
    },
    {
      id: 'plan',
      title: 'Plan the year ahead',
      hint: 'Put your marks in the grades calculator to see your class so far and what each course still to come needs.',
      links: [{ kind: 'page', to: '/grades', label: 'Open the grades calculator', feature: 'grades' }],
    },
  ] satisfies GuideStep[],
} as const;

export const ELECTIVES = {
  /** How many of the electives a student takes. */
  pick: 2,
  intro: 'What each one covers, the skills it adds and the roles it leads to, side by side.',
  disclaimer: 'A guide written by students, not advice from BIBF or the University. Check the programme regulations before you choose.',
} as const;
