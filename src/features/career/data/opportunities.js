// Career Navigator: the opportunities board.
// ONE listing is real: the CFA Institute Research Challenge 2027, which BIBF is taking participants for.
// Everything else is an example of how the board will look once students and the programme office post:
// generic organisers only, never a named company, and dates are offsets from the day you open the page
// (so an example never goes stale and the film's frozen clock stays consistent).
//
//   type:   internship | graduate | competition | course | event
//   years:  the cohorts it suits (1|2|3), or null when we don't say
//   inDays: days from today to the deadline (or the date, for an event); null = no deadline posted

export const OPP_TYPES = [
  { id: 'internship', label: 'Internships', single: 'Internship' },
  { id: 'graduate', label: 'Graduate programmes', single: 'Graduate programme' },
  { id: 'competition', label: 'Competitions', single: 'Competition' },
  { id: 'course', label: 'Scholarships & courses', single: 'Scholarship or course' },
  { id: 'event', label: 'Events', single: 'Event' },
];

export const OPPORTUNITIES = [
  {
    id: 'cfa-research-challenge',
    real: true,
    type: 'competition',
    title: 'CFA Institute Research Challenge 2027',
    organiser: 'CFA Institute',
    badge: 'BIBF is taking participants',
    years: null,
    suits: 'Teams of students',
    inDays: null,
    blurb: 'Teams research a listed company, write an equity research report and present it to a panel of professionals.',
    // No deadline is invented: the card says none is posted and sends students to the programme office.
    note: 'Ask the programme office how to join.',
    ask: 'CFA Institute Research Challenge 2027: how do we join a team?',
  },
  {
    id: 'careers-talk-first-year',
    type: 'event',
    title: 'Careers talk: a first year as a data analyst',
    organiser: 'Seniors and recent graduates',
    years: [1, 2, 3],
    inDays: 9,
    blurb: 'Graduates talk about their first year at work and answer your questions.',
  },
  {
    id: 'summer-analytics-internship',
    type: 'internship',
    title: 'Summer analytics internship',
    organiser: 'A retail bank in Manama',
    years: [2, 3],
    inDays: 12,
    blurb: 'Reporting, SQL and one small project of your own with the analytics team.',
  },
  {
    id: 'cv-linkedin-clinic',
    type: 'event',
    title: 'CV and LinkedIn clinic',
    organiser: 'Seniors and recent graduates',
    years: [2, 3],
    inDays: 16,
    blurb: 'Bring your CV and get it reviewed by seniors and recent graduates.',
  },
  {
    id: 'risk-analytics-internship',
    type: 'internship',
    title: 'Risk analytics internship',
    organiser: 'A Big Four firm',
    years: [3],
    inDays: 19,
    blurb: 'Support the risk team with data checks and monthly reporting.',
  },
  {
    id: 'datathon-demand-forecasting',
    type: 'competition',
    title: 'Datathon: forecasting demand',
    organiser: 'A telecom’s analytics team',
    years: [1, 2, 3],
    inDays: 23,
    blurb: 'Teams get a dataset, build a forecast and pitch it to judges.',
  },
  {
    id: 'cloud-skills-scholarship',
    type: 'course',
    title: 'Cloud skills scholarship',
    organiser: 'A cloud provider’s skills programme',
    years: [1, 2, 3],
    inDays: 30,
    blurb: 'Free cloud training with an exam attempt at the end.',
  },
  {
    id: 'product-analytics-internship',
    type: 'internship',
    title: 'Product analytics internship',
    organiser: 'A fintech in Bahrain Bay',
    years: [2, 3],
    inDays: 33,
    blurb: 'Dashboards, funnels and a first A/B test with the product team.',
  },
  {
    id: 'graduate-analyst-programme',
    type: 'graduate',
    title: 'Graduate analyst programme',
    organiser: 'A retail bank in Manama',
    years: [3],
    inDays: 41,
    blurb: 'A rotation through reporting, risk and customer analytics.',
  },
  {
    id: 'graduate-data-programme',
    type: 'graduate',
    title: 'Graduate data and analytics programme',
    organiser: 'A Big Four firm',
    years: [3],
    inDays: 55,
    blurb: 'Join a data team and rotate between projects in your first two years.',
  },
  {
    id: 'msc-data-science-scholarship',
    type: 'course',
    title: 'MSc scholarship, data science',
    organiser: 'A UK university',
    years: [3],
    inDays: 75,
    blurb: 'Partial funding for international students on a data science MSc.',
  },
];
