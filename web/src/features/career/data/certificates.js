// Career Navigator: certificates and courses students ask about. Only facts that hold in general terms: no
// prices, no exam dates, no pass marks. Every card sends the student to the official page for fees and dates.
// The official URLs and what each credential covers were checked on 2 October 2026 (see ./SOURCES.md).
//
//   id:      lowercase kebab-case. Also the logo file name: public/logos/certs/<id>.png
//   mono:    the initials shown on the neutral tile until the logo file is supplied (plain text, never a mark)
//   short:   the name in compact lists
//   goodFor: who it helps and what it involves, in one or two sentences
//   effort:  1 light, 2 medium, 3 heavy (a rough guide to the study load, not a promise)
//   covers:  DSBA modules that already teach part of it (module ids from src/data/modules.js)
//   roles:   role ids from ./roles.js this credential helps with (listed under the role in "Build the skills")

export const EFFORT_LABEL = { 1: 'Light', 2: 'Medium', 3: 'Heavy' };

export const CERT_NOTE = 'Fees, exam dates and entry rules change, so check each official page before you plan around one.';

export const CERTS = [
  {
    id: 'cfa',
    name: 'CFA Program, Level I',
    short: 'CFA Level I',
    issuer: 'CFA Institute',
    mono: 'CFA',
    url: 'https://www.cfainstitute.org/programs/cfa-program',
    goodFor: 'Investment, research and finance roles. Three exam levels, and the charter also asks for work experience, so an early start helps.',
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
    mono: 'FRM',
    url: 'https://www.garp.org/frm',
    goodFor: 'Risk roles in banks, funds and regulators. Two exam parts, and the certification also asks for work experience.',
    effort: 3,
    effortNote: 'Months of study for each part.',
    covers: ['advanced-stats-distribution', 'advanced-stats-inferential', 'econometrics', 'asset-pricing'],
    roles: ['risk-analyst'],
  },
  {
    id: 'pl300',
    name: 'Power BI Data Analyst (PL-300)',
    short: 'Power BI (PL-300)',
    issuer: 'Microsoft',
    mono: 'PBI',
    url: 'https://learn.microsoft.com/en-us/credentials/certifications/data-analyst-associate/',
    goodFor: 'Analysts who build reports and dashboards. One exam on preparing, modelling and visualising data in Power BI.',
    effort: 2,
    effortNote: 'A few weeks of regular practice.',
    covers: ['business-analytics', 'programming-data-science'],
    roles: ['data-analyst', 'bi-developer', 'business-analyst', 'product-analyst'],
  },
  {
    id: 'aws-ccp',
    name: 'AWS Certified Cloud Practitioner',
    short: 'AWS Cloud Practitioner',
    issuer: 'Amazon Web Services',
    mono: 'AWS',
    url: 'https://aws.amazon.com/certification/certified-cloud-practitioner/',
    goodFor: 'A foundation-level exam on cloud basics. A common first step towards data science or machine learning engineering.',
    effort: 1,
    effortNote: 'A few weeks of part-time study.',
    covers: ['information-systems'],
    coversNote: 'No module teaches cloud hands-on. IS2184 covers information systems in organisations.',
    roles: ['ml-engineer', 'data-scientist'],
  },
  {
    id: 'google-da',
    name: 'Google Data Analytics Certificate',
    short: 'Google Data Analytics',
    issuer: 'Google',
    mono: 'GDA',
    url: 'https://grow.google/certificates/data-analytics/',
    goodFor: 'A guided first step into data analysis, made for beginners. It covers spreadsheets, SQL, Python and Tableau.',
    effort: 2,
    effortNote: 'A few months part-time, at your own pace.',
    covers: ['programming-data-science', 'statistics', 'business-analytics'],
    roles: ['data-analyst', 'product-analyst', 'business-analyst'],
  },
  {
    id: 'tableau',
    name: 'Tableau certification',
    short: 'Tableau',
    issuer: 'Tableau, part of Salesforce',
    mono: 'Tab',
    url: 'https://www.tableau.com/learn/certification',
    goodFor: 'Dashboard-focused analyst and BI roles. Desktop Foundations is the entry exam and Data Analyst is the next level.',
    effort: 2,
    effortNote: 'A few weeks of regular practice.',
    covers: ['business-analytics', 'programming-data-science'],
    roles: ['data-analyst', 'bi-developer'],
  },
  {
    id: 'bmc',
    name: 'Bloomberg Market Concepts (BMC)',
    short: 'Bloomberg Market Concepts',
    issuer: 'Bloomberg',
    mono: 'BMC',
    url: 'https://professional.bloomberg.com/products/bloomberg-terminal/education/certificate-courses/',
    goodFor: 'Treasury, markets and investment roles. A self-paced online course that introduces the financial markets through the Bloomberg Terminal.',
    effort: 1,
    effortNote: 'Self-paced, so it fits around lectures.',
    covers: ['economics', 'asset-pricing'],
    roles: ['financial-analyst', 'risk-analyst'],
  },
  {
    id: 'sql-practice',
    name: 'SQL practice',
    short: 'SQL practice',
    issuer: 'Self-study, no exam',
    // Not a credential, so there is no logo and no official site: the card shows an icon and opens the library's SQL notebook.
    file: { module: 'programming-data-science', id: 'st2195-block-3-notebook-sql-and-databases' },
    goodFor: 'Almost every data role on this page, and the quickest win. Start with SELECT, WHERE and GROUP BY, then joins and window functions.',
    effort: 1,
    effortNote: 'Little and often over a few weeks.',
    covers: ['programming-data-science'],
    roles: ['data-analyst', 'data-scientist', 'business-analyst', 'bi-developer', 'risk-analyst', 'ml-engineer', 'product-analyst'],
  },
];
