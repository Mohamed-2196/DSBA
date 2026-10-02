// Career Navigator: "Before you apply". The readiness checklist, the pointer for further study and the
// one-line hint for each cohort.

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

/** The other way forward, kept to one line: marks decide the options, so it points at the grade calculator. */
export const FURTHER_STUDY = {
  title: 'Thinking about an MSc instead?',
  body: 'Most courses publish a minimum degree class and may ask about your maths and statistics modules. Check the entry rules early, and keep an eye on your projected class.',
  action: { to: '/grades', label: 'Open the grade calculator' },
};

/** The one-line hint under the role panel, by cohort. */
export const YEAR_HINTS = {
  1: 'Counting Year 1 modules only. Programming starts in Year 2, so a head start on SQL and Git pays off.',
  2: 'Counting modules up to Year 2. A good year to start a portfolio and look for a first internship.',
  3: 'Counting every module through Year 3. Graduate applications and MSc courses come first.',
};
