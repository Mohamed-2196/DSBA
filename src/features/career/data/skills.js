// Career Navigator: the skills catalogue.
// Every skill lists the DSBA modules that teach it and how far. Module ids come from src/data/modules.js and
// the wording follows that catalogue (descriptions and chapter titles); where a module's content is not
// spelled out there, the text stays general rather than guessing.
//
//   depth: 1 = introduced (a chapter, a recommended course), 2 = solid grounding, 3 = taught in depth.
//   what:  one line on what that module covers for this skill (shown in the skill row).
//   close: for skills DSBA never takes past an intro (best depth < 2): the one thing to do about it.
//          kind 'lesson' (a chapter in a module's lessons), 'file' (a library file), 'cert' (a card in the
//          certificates section), 'forum' (a forum view), 'opps' (the opportunities section).

/** Short labels for how far a module takes a skill. */
export const DEPTH_LABEL = { 0: 'Not taught', 1: 'Intro only', 2: 'Solid', 3: 'In depth' };

/**
 * Modules a student chooses rather than is assigned (Year 2 option, Year 3 electives).
 * They count towards a skill as if taken, and carry a tag in the row.
 */
export const CHOSEN = {
  econometrics: 'option',
  'information-systems': 'option',
  microeconomics: 'elective',
  'asset-pricing': 'elective',
  'marketing-management': 'elective',
  'further-maths-economists': 'elective',
};

export const SKILLS = {
  // ── Tools and programming ───────────────────────────────────────────────────────────────────────
  sql: {
    name: 'SQL and databases',
    taught: [{ module: 'programming-data-science', depth: 3, what: 'The SQL course, then Block 3: SQLite from R and Python.' }],
  },
  programming: {
    name: 'Python and R',
    taught: [{ module: 'programming-data-science', depth: 3, what: 'Full R and Python courses, then data structures and control flow.' }],
  },
  wrangling: {
    name: 'Cleaning and reshaping data',
    taught: [{ module: 'programming-data-science', depth: 3, what: 'Block 6 is data wrangling in R and Python; Block 2 covers file formats.' }],
  },
  git: {
    name: 'Version control with Git',
    taught: [{ module: 'programming-data-science', depth: 3, what: 'Block 1 introduces Git, and there is a full Git course in the lessons.' }],
  },
  'software-eng': {
    name: 'Writing code others can run',
    taught: [{ module: 'programming-data-science', depth: 2, what: 'Block 5 on object-oriented Python, Block 10 on software development.' }],
  },
  excel: {
    name: 'Excel modelling',
    taught: [{ module: 'business-analytics', depth: 3, what: 'The Excel course, then workbooks on decision trees, forecasting and simulation.' }],
  },
  dataviz: {
    name: 'Data visualisation',
    taught: [
      { module: 'programming-data-science', depth: 2, what: 'Blocks 7 to 8 cover data visualisation in code, plus web data and APIs.' },
      { module: 'business-analytics', depth: 1, what: 'A Tableau course is recommended in the lessons.' },
    ],
  },
  bi: {
    name: 'Dashboards in Power BI or Tableau',
    taught: [{ module: 'business-analytics', depth: 1, what: 'Only an intro: ST2187 recommends a Tableau course in its lessons.' }],
    gapNote: 'Only an intro: ST2187 recommends a Tableau course in its lessons.',
    close: { kind: 'lesson', module: 'business-analytics', chapter: 'Tableau', text: 'Do the ST2187 Tableau lessons, then rebuild a dashboard in Power BI.' },
  },
  'bi-modelling': {
    name: 'Data models and measures for BI',
    taught: [],
    gapNote: 'Data models for BI tools are not a module topic.',
    close: { kind: 'cert', cert: 'pl300', text: 'PL-300 covers data models and DAX measures: use it as a study plan.' },
  },
  cloud: {
    name: 'Cloud basics',
    taught: [],
    gapNote: 'Cloud platforms are not taught hands-on in the modules.',
    close: { kind: 'cert', cert: 'aws-ccp', text: 'AWS Certified Cloud Practitioner is the usual first step.' },
  },
  deployment: {
    name: 'Putting a model into use',
    taught: [{ module: 'programming-data-science', depth: 1, what: 'Block 10 on software development is the nearest thing.' }],
    gapNote: 'Block 10 on software development is the nearest thing.',
    close: { kind: 'lesson', module: 'programming-data-science', chapter: 'Block 10', text: 'Read ST2195 Block 10, then put one model in a script on GitHub.' },
  },

  // ── Statistics and modelling ────────────────────────────────────────────────────────────────────
  inference: {
    name: 'Statistics and hypothesis testing',
    taught: [
      { module: 'advanced-stats-inferential', depth: 3, what: 'Point estimation and hypothesis testing in depth.' },
      { module: 'statistics', depth: 2, what: 'Estimation, confidence intervals, hypothesis tests and ANOVA.' },
      { module: 'business-analytics', depth: 2, what: 'Confidence intervals and hypothesis tests on business data.' },
    ],
  },
  probability: {
    name: 'Probability and distributions',
    taught: [
      { module: 'advanced-stats-distribution', depth: 3, what: 'Probability spaces, random variables and distributions in depth.' },
      { module: 'statistics', depth: 2, what: 'Probability, random variables and the common distributions.' },
    ],
  },
  regression: {
    name: 'Regression analysis',
    taught: [
      { module: 'econometrics', depth: 3, what: 'OLS, inference, heteroskedasticity and instrumental variables.' },
      { module: 'business-analytics', depth: 2, what: 'Simple and multiple regression on business data.' },
      { module: 'statistics', depth: 1, what: 'Linear regression is the last chapter.' },
    ],
  },
  forecasting: {
    name: 'Time series and forecasting',
    taught: [
      { module: 'business-analytics', depth: 3, what: 'Block 13 is time series analysis and forecasting.' },
      { module: 'econometrics', depth: 2, what: 'A time series chapter in the econometrics course.' },
    ],
  },
  ml: {
    name: 'Machine learning',
    taught: [
      { module: 'machine-learning', depth: 3, what: 'Supervised and unsupervised methods, and how models are trained and evaluated.' },
      { module: 'programming-data-science', depth: 1, what: 'Block 9 introduces machine learning frameworks.' },
    ],
  },
  decision: {
    name: 'Decision analysis and optimisation',
    taught: [{ module: 'business-analytics', depth: 3, what: 'Decision trees, optimisation models and Monte Carlo simulation.' }],
  },
  maths: {
    name: 'Calculus and linear algebra',
    taught: [
      { module: 'mathematics', depth: 3, what: 'Differentiation, optimisation, matrices and linear equations.' },
      { module: 'further-maths-economists', depth: 2, what: 'More advanced tools for economic analysis and optimisation.' },
    ],
  },
  experiments: {
    name: 'A/B tests and experiments',
    taught: [{ module: 'business-analytics', depth: 2, what: 'Sampling and hypothesis testing, the maths behind an A/B test.' }],
  },
  survey: {
    name: 'Survey and customer analysis',
    taught: [
      { module: 'market-research', depth: 3, what: 'Statistical techniques for survey and consumer data.' },
      { module: 'marketing-management', depth: 2, what: 'Segmentation through to the marketing mix.' },
    ],
  },

  // ── Business, economics and finance ─────────────────────────────────────────────────────────────
  business: {
    name: 'Business and strategy',
    taught: [{ module: 'business', depth: 3, what: 'Strategy, international markets, operations, people and digital management.' }],
  },
  economics: {
    name: 'Economics for decisions',
    taught: [
      { module: 'economics', depth: 3, what: 'Markets, firms, labour, money and banking, inflation and exchange rates.' },
      { module: 'microeconomics', depth: 3, what: 'Consumers, firms, market structures and welfare in depth.' },
    ],
  },
  systems: {
    name: 'Systems and process analysis',
    taught: [
      { module: 'information-systems', depth: 2, what: 'Designing, implementing and managing information systems in organisations.' },
      { module: 'business', depth: 1, what: 'One chapter on global information systems management.' },
    ],
  },
  project: {
    name: 'Project management',
    taught: [{ module: 'business', depth: 1, what: 'International project management is one chapter.' }],
    gapNote: 'International project management is one chapter.',
    close: { kind: 'lesson', module: 'business', chapter: 'International Project Management', text: 'Watch the MN1178 project lessons, then plan a small project.' },
  },
  valuation: {
    name: 'Valuing assets',
    taught: [
      { module: 'asset-pricing', depth: 3, what: 'How financial assets are valued and how risk and return relate.' },
      { module: 'economics', depth: 1, what: 'Money, banking and interest rates in the macro chapters.' },
    ],
  },
  accounting: {
    name: 'Financial statements and accounting',
    taught: [],
    gapNote: 'Accounting is not a module topic.',
    close: { kind: 'cert', cert: 'cfa', text: 'Learn to read accounts: CFA Level I covers financial statements.' },
  },
  'credit-risk': {
    name: 'Credit and market risk',
    taught: [{ module: 'asset-pricing', depth: 1, what: 'Risk and return is one part of asset pricing.' }],
    gapNote: 'Risk and return is one part of asset pricing, nothing more.',
    close: { kind: 'cert', cert: 'frm', text: 'The FRM covers market and credit risk in depth across its two parts.' },
  },

  // ── Working with people ─────────────────────────────────────────────────────────────────────────
  presenting: {
    name: 'Presenting your findings',
    taught: [],
    gapNote: 'A skill you build by doing it, not a module topic.',
    close: { kind: 'forum', to: '/forum?cohort=study-groups', text: 'Present one project to a study group, then ask for feedback.' },
  },
  structuring: {
    name: 'Structuring a business problem',
    taught: [],
    gapNote: 'Case-style problem solving is not a module topic.',
    close: { kind: 'forum', to: '/forum?cohort=study-groups', text: 'Practise cases in a study group: one sets it, the rest structure it.' },
  },
  'product-metrics': {
    name: 'Product metrics',
    taught: [],
    gapNote: 'Funnels and retention are not module topics.',
    close: { kind: 'file', module: 'programming-data-science', file: 'st2195-block-3-notebook-sql-and-databases', text: 'Use the SQL notebook, then write funnel and retention queries.' },
  },
};
