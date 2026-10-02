// Career Navigator: "After DSBA". Three ways forward, and the readiness checklist.

export const CHECKLIST_KEY = 'hub.career.checklist';

/** Ticks are stored as a JSON array of the ids below, e.g. ["cv","linkedin"]. */
export const CHECKLIST = [
  {
    id: 'cv',
    title: 'A one-page CV',
    hint: 'Lead with skills and projects, then modules. One page is enough.',
  },
  {
    id: 'linkedin',
    title: 'A LinkedIn profile',
    hint: 'A clear photo, a headline that names the role you want, and your modules listed.',
  },
  {
    id: 'github',
    title: 'A GitHub portfolio with two projects',
    hint: 'Each one with a README that says the question, the data and what you found.',
    link: { kind: 'lesson', module: 'programming-data-science', chapter: 'Git', label: 'Git course' },
  },
  {
    id: 'sql',
    title: 'SQL practice',
    hint: 'Keep going until joins and GROUP BY feel easy.',
    link: { kind: 'cert', cert: 'sql-practice', label: 'SQL practice card' },
  },
  {
    id: 'mock',
    title: 'One mock interview',
    hint: 'Ask a senior to run one. You learn most from the first.',
    link: { kind: 'forum', to: '/forum/new?title=Can%20a%20senior%20run%20a%20mock%20interview%20with%20me%3F', label: 'Ask in the forum' },
  },
];

export const PATHS = [
  {
    id: 'work',
    title: 'Work',
    lede: 'Read a job ad against your skills.',
    steps: [
      'Split the ad into must-haves and nice-to-haves.',
      'Match each must-have to a module, a project or a certificate. What you cannot match is your gap.',
      'Apply when most of the must-haves are covered. Ads are wish lists.',
    ],
    action: { kind: 'roles', label: 'Check a role’s skills' },
  },
  {
    id: 'study',
    title: 'Further study',
    lede: 'MSc routes that follow naturally from DSBA.',
    steps: [
      'Data science, business analytics, statistics, machine learning, finance and economics are the usual directions.',
      'Most courses publish a minimum degree class and may ask about your maths and statistics modules. Check the entry rules early.',
      'Your marks shape your options, so keep an eye on your projected class.',
    ],
    action: { kind: 'link', to: '/grades', label: 'Open the grade calculator' },
  },
  {
    id: 'exams',
    title: 'Professional exams',
    lede: 'Credentials you can start while you study.',
    steps: [
      'The CFA and the FRM are the two long routes in finance and risk. Both are taken in stages and both need work experience.',
      'Shorter credentials, such as Power BI, Google Data Analytics and AWS, fit alongside your degree.',
      'Start with one that matches the role you picked above.',
    ],
    action: { kind: 'certs', label: 'See the certificates' },
  },
];

/** The one-line hint under the page title, by cohort. */
export const YEAR_HINTS = {
  1: 'Counting Year 1 modules only. Programming starts in Year 2, so a head start on SQL and Git pays off.',
  2: 'Counting modules up to Year 2. A good year to start a portfolio and look for a first internship.',
  3: 'Counting every module through Year 3. Graduate applications and MSc courses come first.',
};
