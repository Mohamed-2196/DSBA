import type { Me } from '../api/types';
import { COHORTS } from '../state/cohort';

export type Role = Me['role'];

const ROLE_LABELS: Record<Role, string> = { student: 'Student', moderator: 'Student rep', admin: 'Admin' };

/** 'Student', 'Student rep' (moderators) or 'Admin'. */
export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? 'Student';
}

/** The line under a person's name: their role when they have one ('Student rep', 'Admin'), else their cohort ('Year 2'). */
export function accountLine(person: { role: Role; year: 1 | 2 | 3 | null }): string {
  if (person.role !== 'student') return roleLabel(person.role);
  return person.year ? COHORTS[person.year].label : '';
}
