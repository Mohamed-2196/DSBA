// Career Navigator: credentials students ask about. Only facts that hold in general terms: no prices, no exam
// dates, no pass marks. Every card sends the student to the official site for fees and dates.
//
//   short:  the name in compact lists
//   effort: 1 light, 2 medium, 3 heavy (a rough guide to the study load, not a promise)
//   covers: DSBA modules that already teach part of it (module ids from src/data/modules.js)
//   roles:  role ids from ./roles.js this credential helps with (shown as "Fits <role>" on the card)

export const EFFORT_LABEL = { 1: 'Light', 2: 'Medium', 3: 'Heavy' };

export const CERT_NOTE = 'Check the official site for current fees and dates.';

export const CERTS = [
  {
    id: 'cfa',
    name: 'CFA Program, Level I',
    short: 'CFA Level I',
    issuer: 'CFA Institute',
    url: 'https://www.cfainstitute.org/',
    suits: 'Investment, research and finance roles. A long route, so an early start helps.',
    before: 'Students close to graduating can sit Level I. The CFA charter needs all three levels and relevant work experience.',
    effort: 3,
    effortNote: 'Months of steady study for each level.',
    covers: ['statistics', 'economics', 'asset-pricing'],
    roles: ['financial-analyst', 'risk-analyst'],
  },
  {
    id: 'frm',
    name: 'FRM (Financial Risk Manager)',
    short: 'FRM',
    issuer: 'GARP',
    url: 'https://www.garp.org/frm',
    suits: 'Risk roles in banks, funds and regulators.',
    before: 'Two exam parts. The FRM designation also needs relevant work experience, not only the exams.',
    effort: 3,
    effortNote: 'Months of study for each part.',
    covers: ['advanced-stats-distribution', 'advanced-stats-inferential', 'econometrics', 'asset-pricing'],
    roles: ['risk-analyst'],
  },
  {
    id: 'pl300',
    name: 'Microsoft Power BI Data Analyst (PL-300)',
    short: 'Power BI (PL-300)',
    issuer: 'Microsoft',
    url: 'https://learn.microsoft.com/credentials/certifications/data-analyst-associate/',
    suits: 'Analysts who build reports and dashboards: data analyst, BI developer, business analyst.',
    before: 'A single exam. It helps to be comfortable with Excel and basic SQL first.',
    effort: 2,
    effortNote: 'A few weeks of regular practice.',
    covers: ['business-analytics', 'programming-data-science'],
    roles: ['data-analyst', 'bi-developer', 'business-analyst', 'product-analyst'],
  },
  {
    id: 'google-da',
    name: 'Google Data Analytics certificate',
    short: 'Google Data Analytics',
    issuer: 'Google',
    url: 'https://grow.google/certificates/',
    suits: 'Beginners who want a guided path into data analysis. A good first certificate in Year 1 or 2.',
    before: 'Made for beginners, so no earlier experience is needed. It covers spreadsheets, SQL, Tableau and R.',
    effort: 2,
    effortNote: 'Several months part-time, at your own pace.',
    covers: ['programming-data-science', 'statistics', 'business-analytics'],
    roles: ['data-analyst', 'product-analyst', 'business-analyst'],
  },
  {
    id: 'aws-ccp',
    name: 'AWS Certified Cloud Practitioner',
    short: 'AWS Cloud Practitioner',
    issuer: 'Amazon Web Services',
    url: 'https://aws.amazon.com/certification/certified-cloud-practitioner/',
    suits: 'Anyone heading towards data science or machine learning engineering, or who wants cloud basics on a CV.',
    before: 'A foundation-level exam and a common first step into cloud.',
    effort: 1,
    effortNote: 'A few weeks of part-time study.',
    covers: ['information-systems'],
    coversNote: 'No module teaches cloud hands-on. IS2184 covers information systems in organisations.',
    roles: ['ml-engineer', 'data-scientist'],
  },
  {
    id: 'tableau',
    name: 'Tableau certification',
    short: 'Tableau',
    issuer: 'Tableau',
    url: 'https://www.tableau.com/learn/certification',
    suits: 'Dashboard-focused analyst and BI roles.',
    before: 'Tableau offers several exams, so check which level fits you. Practise on real data before you book.',
    effort: 2,
    effortNote: 'A few weeks of regular practice.',
    covers: ['business-analytics', 'programming-data-science'],
    roles: ['data-analyst', 'bi-developer'],
  },
  {
    id: 'sql-practice',
    name: 'SQL practice',
    short: 'SQL practice',
    issuer: 'Self-study, no exam',
    // Not an exam, so no official site: the card points at the library's SQL notebook instead.
    file: { module: 'programming-data-science', id: 'st2195-block-3-notebook-sql-and-databases' },
    suits: 'Almost every data role on this page, and the quickest win.',
    before: 'Nothing. Start with SELECT, WHERE and GROUP BY, then joins, subqueries and window functions.',
    effort: 1,
    effortNote: 'Little and often over a few weeks.',
    covers: ['programming-data-science'],
    roles: ['data-analyst', 'data-scientist', 'business-analyst', 'bi-developer', 'risk-analyst', 'ml-engineer', 'product-analyst'],
  },
];
