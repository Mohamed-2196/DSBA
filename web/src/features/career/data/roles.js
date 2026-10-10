// Career Navigator: the roles on the fit panel. `skills` are skill ids from ./skills.js, most important first.
// Descriptions stay general on purpose: what the job is, not what it pays or how many people get it.

export const DEFAULT_ROLE_ID = 'data-analyst';

export const ROLES = [
  {
    id: 'data-analyst',
    label: 'Data analyst',
    title: 'Data analyst',
    about: 'Turns messy business data into answers. Pulls it with SQL, cleans it, summarises it and explains what it means to the people who decide.',
    tools: ['SQL', 'Excel', 'Power BI or Tableau', 'Python or R'],
    skills: ['sql', 'excel', 'programming', 'wrangling', 'inference', 'dataviz', 'regression', 'bi', 'ml', 'presenting'],
    ask: 'What should I learn first to become a data analyst?',
  },
  {
    id: 'data-scientist',
    label: 'Data scientist',
    title: 'Data scientist',
    about: 'Builds models that predict or classify, then tests whether they hold up. Part statistician, part programmer, and has to explain the result in plain words.',
    tools: ['Python', 'R', 'SQL', 'Notebooks', 'Git'],
    skills: ['programming', 'sql', 'wrangling', 'probability', 'inference', 'regression', 'ml', 'maths', 'cloud', 'presenting'],
    ask: 'What should I learn first to become a data scientist?',
  },
  {
    id: 'business-analyst',
    label: 'Business analyst',
    title: 'Business analyst',
    about: 'Works out what a team needs, maps how the process runs today and checks the numbers before a decision is made. Sits between the business and the technical team.',
    tools: ['Excel', 'SQL', 'Power BI', 'Process maps', 'Jira'],
    skills: ['excel', 'sql', 'business', 'systems', 'decision', 'inference', 'bi', 'project', 'presenting'],
    ask: 'What does a business analyst actually do day to day?',
  },
  {
    id: 'bi-developer',
    label: 'BI developer',
    title: 'BI developer',
    about: 'Builds and looks after the dashboards and data models the rest of the company reads every morning, and fixes the numbers when they do not match.',
    tools: ['Power BI', 'Tableau', 'SQL', 'Excel'],
    skills: ['sql', 'bi', 'bi-modelling', 'dataviz', 'excel', 'wrangling', 'business', 'presenting'],
    ask: 'How do I get started as a BI developer?',
  },
  {
    id: 'risk-analyst',
    label: 'Risk analyst',
    title: 'Risk analyst',
    about: 'Measures how likely a loss is and how large it could be, then checks it stays inside the limits. Found in banks, insurers and regulators.',
    tools: ['Excel', 'SQL', 'Python or R', 'Reporting tools'],
    skills: ['probability', 'inference', 'regression', 'forecasting', 'excel', 'programming', 'economics', 'valuation', 'credit-risk', 'accounting'],
    ask: 'How do I get into risk analysis after DSBA?',
  },
  {
    id: 'financial-analyst',
    label: 'Financial analyst',
    title: 'Financial / investment analyst',
    about: 'Reads company accounts, values companies and assets, builds financial models and writes up a recommendation.',
    tools: ['Excel models', 'Company reports', 'PowerPoint', 'Python'],
    skills: ['excel', 'accounting', 'valuation', 'economics', 'business', 'regression', 'forecasting', 'programming', 'presenting'],
    ask: 'How do I get into financial or investment analysis?',
    // Presenting is exactly what the CFA Institute Research Challenge asks for, so point there instead of a study group.
    close: { presenting: { kind: 'opps', text: 'Join the CFA Institute Research Challenge and present to a panel.' } },
  },
  {
    id: 'ml-engineer',
    label: 'ML engineer',
    title: 'Machine learning engineer',
    about: 'Takes a model from a notebook to something that runs reliably: data pipelines, training, deployment and monitoring.',
    tools: ['Python', 'Git', 'SQL', 'Cloud platforms', 'Docker'],
    skills: ['programming', 'software-eng', 'git', 'sql', 'maths', 'probability', 'ml', 'cloud', 'deployment'],
    ask: 'What do I need to become a machine learning engineer?',
  },
  {
    id: 'product-analyst',
    label: 'Product analyst',
    title: 'Product analyst',
    about: 'Studies how people use a product, runs experiments and tells the product team what to build or fix next.',
    tools: ['SQL', 'A/B testing tools', 'A dashboard tool', 'Python or R'],
    skills: ['sql', 'experiments', 'dataviz', 'programming', 'regression', 'business', 'product-metrics', 'survey', 'bi', 'presenting'],
    ask: 'How do I get into product analytics?',
  },
  {
    id: 'consultant',
    label: 'Consultant',
    title: 'Consultant',
    about: 'Joins a team for a few months to solve one problem for a client: analyses the situation, structures the answer and presents it.',
    tools: ['Excel', 'PowerPoint', 'A BI tool', 'Interviews and surveys'],
    skills: ['excel', 'decision', 'business', 'economics', 'inference', 'dataviz', 'survey', 'structuring', 'presenting'],
    ask: 'How do I prepare for consulting applications?',
  },
];

const BY_ID = new Map(ROLES.map((r) => [r.id, r]));

/** Role by id, or null. */
export function getRole(id) {
  return BY_ID.get(id) || null;
}
