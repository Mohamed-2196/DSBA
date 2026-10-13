import { describe, expect, it } from 'vitest';
import { canAdminister, canModerate, holdsRole } from './roles';

const student = { role: 'student', status: 'active' } as const;
const rep = { role: 'moderator', status: 'active' } as const;
const admin = { role: 'admin', status: 'active' } as const;
const suspendedRep = { role: 'moderator', status: 'suspended' } as const;
const suspendedAdmin = { role: 'admin', status: 'suspended' } as const;

describe('powers, as the API decides them', () => {
  it('gives reps and admins on active accounts their powers', () => {
    expect(canModerate(rep)).toBe(true);
    expect(canModerate(admin)).toBe(true);
    expect(canAdminister(admin)).toBe(true);
    expect(canAdminister(rep)).toBe(false);
  });

  it('gives a suspended rep or admin none (security review SEC-1)', () => {
    expect(canModerate(suspendedRep)).toBe(false);
    expect(canModerate(suspendedAdmin)).toBe(false);
    expect(canAdminister(suspendedAdmin)).toBe(false);
  });

  it('gives students and guests none', () => {
    expect(canModerate(student)).toBe(false);
    expect(canAdminister(student)).toBe(false);
    expect(canModerate(null)).toBe(false);
    expect(canAdminister(undefined)).toBe(false);
  });

  it('still knows who holds a role while suspended', () => {
    expect(holdsRole(suspendedRep, 'moderator')).toBe(true);
    expect(holdsRole(suspendedAdmin, 'moderator')).toBe(true);
    expect(holdsRole(suspendedAdmin, 'admin')).toBe(true);
    expect(holdsRole(suspendedRep, 'admin')).toBe(false);
    expect(holdsRole(student, 'moderator')).toBe(false);
    expect(holdsRole(null, 'moderator')).toBe(false);
  });
});
