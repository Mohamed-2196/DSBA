// Cohort (year) helpers. Colours are CSS variables so they follow light/dark automatically.
export const YEARS = [1, 2, 3];

export const COHORTS = {
  1: { year: 1, label: 'Year 1', short: 'Y1', name: 'Lagoon', color: 'var(--y1)', strong: 'var(--y1-strong)', on: 'var(--on-y1)' },
  2: { year: 2, label: 'Year 2', short: 'Y2', name: 'Iris', color: 'var(--y2)', strong: 'var(--y2-strong)', on: 'var(--on-y2)' },
  3: { year: 3, label: 'Year 3', short: 'Y3', name: 'Amber', color: 'var(--y3)', strong: 'var(--y3-strong)', on: 'var(--on-y3)' },
};

/** 1|2|3 or null from anything ('2', 2, null, 'x'). */
export function normalizeYear(raw) {
  const n = Number.parseInt(raw, 10);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

/** Solid cohort colour: `var(--y1|2|3)`; neutral ink-3 for null/unknown. */
export function cohortColor(year) {
  const y = normalizeYear(year);
  return y ? `var(--y${y})` : 'var(--ink-3)';
}

/** Cohort colour safe for small text on paper/surface (AA). */
export function cohortTextColor(year) {
  const y = normalizeYear(year);
  return y ? `var(--y${y}-strong)` : 'var(--ink-2)';
}

/** Text colour to use ON a solid cohort fill (AA). */
export function cohortOnColor(year) {
  const y = normalizeYear(year);
  return y ? `var(--on-y${y})` : 'var(--surface)';
}

/** 'Year 2' (or 'All years' for null). */
export function cohortLabel(year) {
  const y = normalizeYear(year);
  return y ? COHORTS[y].label : 'All years';
}
