// Subject area ("domain") and numbered units (chapters or blocks) per module. Units come from the
// module's real chapter titles (src/data/modules.js); modules without chapters in v1 get a short,
// generic topic list so their mock guides and notes have believable headings.
import { getModule } from '../../../data/modules.js';

export const DOMAIN_BY_MODULE = {
  economics: 'econ',
  business: 'biz',
  mathematics: 'maths',
  statistics: 'stats',
  'advanced-stats-distribution': 'stats',
  'advanced-stats-inferential': 'stats',
  'programming-data-science': 'prog',
  'business-analytics': 'analytics',
  econometrics: 'metrics',
  'information-systems': 'biz',
  'machine-learning': 'prog',
  'market-research': 'stats',
  microeconomics: 'econ',
  'asset-pricing': 'econ',
  'marketing-management': 'biz',
  'further-maths-economists': 'maths',
};

const FALLBACK_TOPICS = {
  'advanced-stats-inferential': [
    'Data reduction and sufficiency', 'Point estimation', 'Properties of estimators', 'Interval estimation',
    'Hypothesis testing', 'Likelihood ratio tests', 'Bayesian inference',
  ],
  'information-systems': [
    'Information systems in organisations', 'Strategy and information systems', 'Systems development',
    'Data and information management', 'Security and risk', 'Managing IT projects', 'Digital transformation',
  ],
  'machine-learning': [
    'Statistical learning', 'Linear regression', 'Classification', 'Resampling methods',
    'Model selection and regularisation', 'Tree-based methods', 'Unsupervised learning',
  ],
  'market-research': [
    'Survey design', 'Sampling methods', 'Questionnaire design', 'Contingency tables',
    'Factor analysis', 'Cluster analysis', 'Conjoint analysis',
  ],
  microeconomics: [
    'Consumer theory', 'Producer theory', 'Choice under uncertainty', 'Game theory',
    'General equilibrium', 'Welfare economics', 'Asymmetric information',
  ],
  'asset-pricing': [
    'Time value of money', 'Portfolio theory', 'The capital asset pricing model', 'Arbitrage pricing',
    'Market efficiency', 'Bond pricing', 'Derivatives',
  ],
  'marketing-management': [
    'Marketing strategy', 'Consumer behaviour', 'Segmentation and targeting', 'Positioning',
    'Products and brands', 'Pricing', 'Marketing communications',
  ],
  'further-maths-economists': [
    'Linear algebra', 'Eigenvalues and diagonalisation', 'Constrained optimisation', 'The envelope theorem',
    'Difference equations', 'Differential equations', 'Dynamic optimisation',
  ],
};

/** Sentence-case-ish cleanup of a v1 chapter title for use as a document heading. */
export function cleanTopic(title) {
  return String(title)
    .replace(/\s*\((full course|recommended course|playlist)\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNIT_CACHE = new Map();

/**
 * Numbered units for a module: [{ no: '3', noun: 'Chapter'|'Block', title }].
 * Block-structured modules (ST2195, ST2187) keep their real block numbers (e.g. '7-8').
 */
export function unitsFor(moduleId) {
  if (UNIT_CACHE.has(moduleId)) return UNIT_CACHE.get(moduleId);
  const m = getModule(moduleId);
  let units;
  if (!m) {
    units = [{ no: '1', noun: 'Chapter', title: 'Introduction' }];
  } else {
    const blocks = m.chapters
      .map((c) => /^Block (\d+(?:-\d+)?):\s*(.+)$/.exec(cleanTopic(c.title)))
      .filter(Boolean)
      .map(([, no, title]) => ({ no, noun: 'Block', title }));
    if (blocks.length >= 4) {
      units = blocks;
    } else {
      const titles = [...new Set(m.chapters.map((c) => cleanTopic(c.title)).filter(Boolean))];
      const list = titles.length >= 3 ? titles : FALLBACK_TOPICS[moduleId] || titles.concat(['Introduction']);
      units = list.map((title, i) => ({ no: String(i + 1), noun: 'Chapter', title }));
    }
  }
  UNIT_CACHE.set(moduleId, units);
  return units;
}

export function domainFor(moduleId) {
  return DOMAIN_BY_MODULE[moduleId] || 'stats';
}
