// The maths Mini Noora can show, as plain data (Formula.tsx sets it): the reduction formula and integration by
// parts, the definition of a moment generating function, and the MGFs of the common distributions, each with the
// parameters it is written in. The worked Laplace example is the question from the launch film; it is shown only
// when the Laplace distribution is what was asked about (student test ST-3).
import type { FormulaData, MathBig, MathFrac, MathInt, MathPart, MathVar, Step } from './types';

// Strings are set upright, v() is a variable in italics.
const v = (name: string): MathVar => ({ v: name });
const sub = (name: string, ...below: MathPart[]): MathVar => ({ v: name, sub: below });
const pow = (name: string, ...above: MathPart[]): MathVar => ({ v: name, sup: above });
/** A superscript on what comes before it, such as a closing bracket. */
const up = (...above: MathPart[]): MathVar => ({ v: '', sup: above });
const frac = (top: MathPart[], bottom: MathPart[]): MathFrac => ({ top, bottom });
const int = (lower: string, upper: string): MathInt => ({ int: [lower, upper] });
const big = (bracket: string): MathBig => ({ big: bracket });
const n = v('n');
const p = v('p');
const t = v('t');
const x = v('x');
const mgf: MathPart[] = [sub('M', v('X')), '(', t, ')'];

export const REDUCTION_FORMULA: FormulaData = {
  say: 'I n equals n minus 1 over n, times I n minus 2. So I 2 equals pi over 4, and I 3 equals 2 over 3.',
  line: [sub('I', n), ' = ', frac([n, ' − 1'], [n]), ' ', sub('I', n, '−2')],
  note: ['so ', sub('I', '2'), ' = π/4 and ', sub('I', '3'), ' = 2/3'],
};

export const BY_PARTS_FORMULA: FormulaData = {
  say: 'The integral of u d v equals u v, minus the integral of v d u.',
  line: ['∫ ', v('u'), ' d', v('v'), ' = ', v('u'), v('v'), ' − ∫ ', v('v'), ' d', v('u')],
};

/** Where every MGF starts. */
export const MGF_DEFINITION: FormulaData = {
  say: 'M X of t equals the expected value of e to the t X: the sum of e to the t x times p of x for a discrete X, or the integral of e to the t x times f of x for a continuous one.',
  line: [...mgf, ' = E(', pow('e', t, v('X')), ')'],
  note: [
    'Σ ',
    pow('e', t, x),
    ' ',
    p,
    '(',
    x,
    ') for a discrete ',
    v('X'),
    ', ∫ ',
    pow('e', t, x),
    ' ',
    v('f'),
    '(',
    x,
    ') d',
    x,
    ' for a continuous one',
  ],
};

// The moment generating function of the Laplace distribution with density k·e^(−λ|x|), worked in three steps.
const half = frac(['λ'], ['2']);
export const LAPLACE_MGF_STEPS: Step[] = [
  {
    label: ['With ', v('k'), ' = λ/2 from (a), split at ', x, ' = 0'],
    say: 'M X of t equals lambda over 2, times the integral from minus infinity to 0 of e to the lambda plus t, x, plus the integral from 0 to infinity of e to the minus lambda minus t, x.',
    line: [
      ...mgf,
      ' = ',
      half,
      big('['),
      int('−∞', '0'),
      pow('e', '(λ+', t, ')', x),
      ' ',
      v('dx'),
      ' + ',
      int('0', '∞'),
      pow('e', '−(λ−', t, ')', x),
      ' ',
      v('dx'),
      big(']'),
    ],
  },
  {
    label: ['Integrate each piece, for |', t, '| < λ'],
    say: 'That equals lambda over 2, times 1 over lambda plus t, plus 1 over lambda minus t.',
    line: ['= ', half, big('['), frac(['1'], ['λ + ', t]), ' + ', frac(['1'], ['λ − ', t]), big(']')],
  },
  {
    label: ['Add the two fractions'],
    say: 'So M X of t equals lambda squared over lambda squared minus t squared.',
    line: [...mgf, ' = ', frac([pow('λ', '2')], [pow('λ', '2'), ' − ', pow('t', '2')])],
    result: true,
  },
];

/** A distribution students ask about: how to spot it in a question, its lesson, and its MGF when there is one. */
export interface Distribution {
  id: string;
  /** inside a sentence: 'the Poisson distribution' */
  name: string;
  /** on the words of the question (lower case, no punctuation); more specific names come first in the list */
  asked: RegExp;
  /** the lesson on it, by title */
  lesson: RegExp;
  /** its MGF, in the parameters the note names; none when there is no short one worth quoting */
  mgf?: FormulaData;
}

export const DISTRIBUTIONS: Distribution[] = [
  { id: 'laplace', name: 'the Laplace distribution', asked: /\blaplace\b|\bdouble exponential\b/, lesson: /laplace/i },
  {
    id: 'negative-binomial',
    name: 'the negative binomial distribution',
    asked: /\bnegative binomial\b/,
    lesson: /negative binomial/i,
  },
  {
    id: 'hypergeometric',
    name: 'the hypergeometric distribution',
    asked: /\bhypergeometric\b/,
    lesson: /hypergeometric/i,
  },
  {
    id: 'discrete-uniform',
    name: 'the discrete uniform distribution',
    asked: /\bdiscrete uniform\b/,
    lesson: /discrete uniform/i,
  },
  {
    id: 'bernoulli',
    name: 'the Bernoulli distribution',
    asked: /\bbernoulli\b/,
    lesson: /bernoulli/i,
    mgf: {
      say: 'For a Bernoulli variable with P of X equals 1 equal to p: M X of t equals 1 minus p, plus p e to the t, for every t.',
      line: [...mgf, ' = 1 − ', p, ' + ', p, pow('e', t)],
      note: ['with P(', v('X'), ' = 1) = ', p, ', for every ', t],
    },
  },
  {
    id: 'binomial',
    name: 'the binomial distribution',
    asked: /\bbinomial\b/,
    lesson: /\bbinomial distribution/i,
    mgf: {
      say: 'For a binomial variable with n trials and success probability p: M X of t equals 1 minus p plus p e to the t, all to the power n, for every t.',
      line: [...mgf, ' = (1 − ', p, ' + ', p, pow('e', t), ')', up(n)],
      note: [n, ' trials, success probability ', p, ', for every ', t],
    },
  },
  {
    id: 'geometric',
    name: 'the geometric distribution',
    asked: /\bgeometric\b/,
    lesson: /geometric distribution/i,
    mgf: {
      say: 'For a geometric variable counting the trials up to and including the first success, with success probability p: M X of t equals p e to the t, over 1 minus 1 minus p times e to the t, for t less than minus the log of 1 minus p.',
      line: [...mgf, ' = ', frac([p, pow('e', t)], ['1 − (1 − ', p, ')', pow('e', t)])],
      note: ['counting trials to the first success (', x, ' = 1, 2, …), for ', t, ' < −ln(1 − ', p, ')'],
    },
  },
  {
    id: 'poisson',
    name: 'the Poisson distribution',
    asked: /\bpoisson\b/,
    lesson: /poisson distribution/i,
    mgf: {
      say: 'For a Poisson variable with mean lambda: M X of t equals e to the lambda times e to the t minus 1, for every t.',
      line: [...mgf, ' = ', pow('e', 'λ(', pow('e', t), ' − 1)')],
      note: ['mean λ, for every ', t],
    },
  },
  {
    id: 'chi-squared',
    name: 'the chi-squared distribution',
    asked: /\bchi\s?squared?\b|\bchi\s?sq\b/,
    lesson: /chi.?squared?/i,
    mgf: {
      say: 'For a chi-squared variable with k degrees of freedom: M X of t equals 1 minus 2 t, to the power minus k over 2, for t less than one half.',
      line: [...mgf, ' = (1 − 2', t, ')', up('−', v('k'), '/2')],
      note: [v('k'), ' degrees of freedom, for ', t, ' < 1/2'],
    },
  },
  {
    id: 'exponential',
    name: 'the exponential distribution',
    asked: /\bexponential\b/,
    lesson: /exponential distribution/i,
    mgf: {
      say: 'For an exponential variable with rate lambda, density lambda e to the minus lambda x: M X of t equals lambda over lambda minus t, for t less than lambda.',
      line: [...mgf, ' = ', frac(['λ'], ['λ − ', t])],
      note: ['rate λ (density λ', pow('e', '−λ', x), '), for ', t, ' < λ'],
    },
  },
  {
    id: 'gamma',
    name: 'the gamma distribution',
    asked: /\bgamma\b/,
    lesson: /gamma distribution/i,
    mgf: {
      say: 'For a gamma variable with shape alpha and rate beta: M X of t equals beta over beta minus t, to the power alpha, for t less than beta.',
      line: [...mgf, ' = ', big('('), frac(['β'], ['β − ', t]), big(')'), up('α')],
      note: ['shape α, rate β, for ', t, ' < β'],
    },
  },
  // after gamma: 'gamma with shape alpha and rate beta' is about the gamma distribution
  { id: 'beta', name: 'the beta distribution', asked: /\bbeta\b/, lesson: /\bbeta distribution/i },
  {
    id: 'normal',
    name: 'the normal distribution',
    asked: /\bnormal\b|\bgaussian\b/,
    lesson: /normal distribution/i,
    mgf: {
      say: 'For a normal variable with mean mu and variance sigma squared: M X of t equals e to the mu t plus sigma squared t squared over 2, for every t.',
      line: [...mgf, ' = ', pow('e', 'μ', t, ' + ', pow('σ', '2'), pow('t', '2'), '/2')],
      note: ['mean μ, variance ', pow('σ', '2'), ', for every ', t],
    },
  },
  {
    id: 'uniform',
    name: 'the continuous uniform distribution',
    asked: /\buniform\b/,
    lesson: /\buniform\b/i,
    mgf: {
      say: 'For a continuous uniform variable on a to b: M X of t equals e to the t b minus e to the t a, over t times b minus a, for t not 0, and 1 at t equals 0.',
      line: [
        ...mgf,
        ' = ',
        frac([pow('e', t, v('b')), ' − ', pow('e', t, v('a'))], [t, '(', v('b'), ' − ', v('a'), ')']),
      ],
      note: ['continuous, on (', v('a'), ', ', v('b'), '), for ', t, ' ≠ 0; ', sub('M', v('X')), '(0) = 1'],
    },
  },
];

/** The distribution a question is about, if it names one. */
export function distributionAsked(said: string): Distribution | null {
  return DISTRIBUTIONS.find((d) => d.asked.test(said)) ?? null;
}
