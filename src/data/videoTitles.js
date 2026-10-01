// Real titles of the YouTube lessons, keyed by video id. v1 stored ids only, so lessons showed as
// "Video 1", "Video 2"…; a lesson with a title here shows it instead. Add more as `id: 'title'`.
export const VIDEO_TITLES = {
  // ST2133 · Probability Space
  swa1VRYms3Q: 'Measure Theoretic Probability, Lesson 1',
  V3pnr5gmJC8: 'Indicator Functions',
  DqGUwoz4d4M: 'Probability spaces and random variables',
  XJnIdRXUi7A: 'Permutations and Combinations Tutorial',
  // ST2133 · Random variables and univariate distributions
  mlelI1LA9o4: 'Chebyshev’s Inequality… Made Easy!',
  GDJFLfmyb20: 'Jensen’s Inequality',
  'Uks98M-dxqM': 'Discrete Uniform Probability Distribution',
  bT1p5tJwn_0: 'Introduction to the Bernoulli Distribution',
  'qIzC1-9PwQo': 'An Introduction to the Binomial Distribution',
  zq9Oz82iHf0: 'An Introduction to the Geometric Distribution',
  BPlmjp2ymxw: 'Introduction to the Negative Binomial Distribution',
  J3KSjZFVbis: 'Probability Exponential Distribution Problems',
  juF3r12nM5A: 'The Beta distribution in 12 minutes!',
  TwvXhX3bJJM: 'Triangular distribution',
};

/** The lesson's real title, or null when we only know its id. */
export function videoTitle(video) {
  return (video && video.kind === 'youtube' && VIDEO_TITLES[video.id]) || null;
}
