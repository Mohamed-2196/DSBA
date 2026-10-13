import { describe, expect, it } from 'vitest';
import { badgeOf, canDo, featureIsOn, holdsAdmin, isActiveAdmin, managerBoxes, offForOthers, offerOf, offered, showsUpload, type AccessMe } from './access';

const role = (slug: string, badge: string | null = null) => ({ id: `id-${slug}`, slug, name: slug, badge });
const ALL = ['forum', 'library', 'library.uploads', 'newsletter', 'calendar', 'career', 'grades', 'noora'] as const;

const student: AccessMe = { status: 'active', roles: [role('student')], boxes: ['forum.post', 'library.upload', 'newsletter.react', 'reports.create'], features: [...ALL] };
const rep: AccessMe = { status: 'active', roles: [role('rep', 'Student rep'), role('student')], boxes: ['forum.post', 'forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'stats.view'], features: [...ALL] };
const suspendedRep: AccessMe = { ...rep, status: 'suspended', boxes: [], features: ['forum', 'library'] };
const admin: AccessMe = { status: 'active', roles: [role('admin', 'Admin'), role('student')], boxes: ['forum.post', 'forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'career.edit', 'stats.view', 'people.suspend', 'audit.read', 'library.upload', 'newsletter.react', 'reports.create'], features: [...ALL] };

describe('boxes', () => {
  it('allows exactly the boxes in /me', () => {
    expect(canDo(rep, 'newsletter.manage')).toBe(true);
    expect(canDo(student, 'newsletter.manage')).toBe(false);
    expect(canDo(null, 'forum.post')).toBe(false);
  });

  it('gives a suspended rep nothing, though they still hold the role and its badge', () => {
    expect(canDo(suspendedRep, 'forum.moderate')).toBe(false);
    expect(managerBoxes(suspendedRep)).toEqual([]);
    expect(badgeOf(suspendedRep)).toBe('Student rep');
  });

  it('ignores keys it does not know', () => {
    const odd = { ...student, boxes: [...student.boxes, 'forum.fly'] } as unknown as AccessMe;
    expect(canDo(odd, 'forum.post')).toBe(true);
    expect(managerBoxes(odd)).toEqual([]);
  });

  it('lists the manager boxes a person holds, in a fixed order', () => {
    expect(managerBoxes(rep)).toEqual(['forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'stats.view']);
    expect(managerBoxes(student)).toEqual([]);
  });
});

describe('admins', () => {
  it('knows an admin by the role, and an active one by the status', () => {
    expect(holdsAdmin(admin)).toBe(true);
    expect(isActiveAdmin(admin)).toBe(true);
    expect(isActiveAdmin({ ...admin, status: 'suspended' })).toBe(false);
    expect(holdsAdmin(rep)).toBe(false);
  });

  it('uses the first badge in role order', () => {
    expect(badgeOf(admin)).toBe('Admin');
    expect(badgeOf(student)).toBe(null);
  });
});

describe('switches', () => {
  it('uses /me.features when signed in, and /features for a guest', () => {
    expect(featureIsOn(student, undefined, 'calendar')).toBe(true);
    expect(featureIsOn({ ...student, features: ['forum'] }, undefined, 'calendar')).toBe(false);
    expect(featureIsOn(null, ['forum', 'library'], 'forum')).toBe(true);
    expect(featureIsOn(null, ['forum', 'library'], 'calendar')).toBe(false);
  });

  it('treats a guest whose /features has not loaded as seeing nothing switched', () => {
    expect(featureIsOn(null, undefined, 'forum')).toBe(false);
  });

  it('marks a feature an admin sees but the guest list leaves out as off for others', () => {
    expect(offForOthers(admin, ['forum'], 'calendar')).toBe(true);
    expect(offForOthers(admin, ['forum', 'calendar'], 'calendar')).toBe(false);
    expect(offForOthers(student, ['forum'], 'calendar')).toBe(false);
  });
});

describe('student actions', () => {
  const ready = (m: AccessMe) => ({ ...m, needsProfile: false });
  const readerRole: AccessMe = { ...student, roles: [role('reader')], boxes: ['newsletter.react'] };

  it('offers an action to a person who holds its box', () => {
    expect(offerOf(ready(student), 'forum.post')).toBe('yes');
    expect(offered('yes')).toBe(true);
  });

  it('asks a guest, or an account without a profile, to sign in', () => {
    expect(offerOf(null, 'forum.post')).toBe('sign-in');
    expect(offerOf({ ...student, needsProfile: true }, 'forum.post')).toBe('sign-in');
    expect(offered('sign-in')).toBe(true);
  });

  it('tells a suspended account apart from one whose roles lack the box', () => {
    expect(offerOf(ready(suspendedRep), 'forum.post')).toBe('suspended');
    expect(offerOf(ready(readerRole), 'forum.post')).toBe('no');
    expect(offerOf(ready(readerRole), 'newsletter.react')).toBe('yes');
    expect(offered('suspended')).toBe(false);
    expect(offered('no')).toBe(false);
  });
});

describe('showsUpload', () => {
  const on = (...off: string[]) => (f: string) => !off.includes(f);
  it('shows "Upload a file" while the library and its uploads are on and the person may try', () => {
    expect(showsUpload(on(), () => true)).toBe(true);
    expect(showsUpload(on('library.uploads'), () => true)).toBe(false);
    expect(showsUpload(on('library'), () => true)).toBe(false);
    expect(showsUpload(on(), (b) => b !== 'library.upload')).toBe(false);
  });
});
