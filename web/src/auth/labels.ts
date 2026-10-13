import { COHORTS } from '../state/cohort';

/** The line under a person's name: their badge when they have one ('Student rep', 'Admin'), else their cohort. */
export function accountLine(person: { badge: string | null; year: 1 | 2 | 3 | null }): string {
  if (person.badge) return person.badge;
  return person.year ? COHORTS[person.year].label : '';
}
