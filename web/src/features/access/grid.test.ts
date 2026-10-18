import { describe, expect, it } from 'vitest';
import type { AdminUser, BoxOut, RoleOut } from '../../api/types';
import { boxClosed, followOpening, followPerson, groupBoxes, roleChanges, startEditing, ticksOf } from './grid';

const box = (key: BoxOut['key'], area: string): BoxOut => ({ key, area, label: key });
const role: RoleOut = {
  id: 'r1',
  slug: 'newsletter-manager',
  name: 'Newsletter manager',
  badge: 'Newsletter',
  position: 3,
  builtIn: false,
  locked: false,
  version: 4,
  boxes: ['newsletter.manage'],
  holders: 2,
};
const student: RoleOut = {
  ...role,
  id: 'r0',
  slug: 'student',
  name: 'Student',
  badge: null,
  builtIn: true,
  boxes: ['forum.post'],
};

describe('groupBoxes', () => {
  it('keeps the catalogue’s order of areas and of boxes inside them', () => {
    const groups = groupBoxes([
      box('forum.post', 'Forum'),
      box('library.upload', 'Library'),
      box('forum.moderate', 'Forum'),
    ]);
    expect(groups.map((g) => g.area)).toEqual(['Forum', 'Library']);
    expect(groups[0].boxes.map((b) => b.key)).toEqual(['forum.post', 'forum.moderate']);
  });
});

describe('roleChanges', () => {
  it('sends nothing when nothing changed', () => {
    expect(
      roleChanges(role, { name: 'Newsletter manager', badge: 'Newsletter', boxes: new Set(['newsletter.manage']) }),
    ).toBeNull();
  });

  it('sends only what changed, with the version it was loaded at', () => {
    expect(
      roleChanges(role, {
        name: 'Newsletter team',
        badge: 'Newsletter',
        boxes: new Set(['newsletter.manage', 'calendar.manage']),
      }),
    ).toEqual({
      version: 4,
      name: 'Newsletter team',
      boxes: ['calendar.manage', 'newsletter.manage'],
    });
  });

  it('removes the badge when it is emptied', () => {
    expect(
      roleChanges(role, { name: 'Newsletter manager', badge: '  ', boxes: new Set(['newsletter.manage']) }),
    ).toEqual({ version: 4, badge: null });
  });
});

describe('boxClosed', () => {
  it('closes the manager boxes on Student, which every new account gets', () => {
    expect(boxClosed(student, 'forum.moderate')).toBe(true);
    expect(boxClosed(student, 'audit.read')).toBe(true);
    expect(boxClosed(student, 'forum.post')).toBe(false);
    expect(boxClosed(student, 'reports.create')).toBe(false);
  });

  it('leaves every box open on other roles and on a new one', () => {
    expect(boxClosed(role, 'forum.moderate')).toBe(false);
    expect(boxClosed(null, 'forum.moderate')).toBe(false);
  });
});

describe('followOpening', () => {
  it('starts a draft when the dialog opens, and on another role', () => {
    const closed = startEditing(null, null);
    const opened = followOpening(closed, 'r1', role);
    expect([opened.base, opened.draft.name]).toEqual([role, 'Newsletter manager']);
    expect(followOpening(opened, 'r0', student).draft.name).toBe('Student');
    expect(followOpening(opened, null, null).opening).toBeNull();
  });

  it('keeps the unsaved draft when a newer version of the role loads', () => {
    const opened = followOpening(startEditing(null, null), 'r1', role);
    const edited = { ...opened, draft: { ...opened.draft, name: 'Newsletter team' } };
    const newer = { ...role, version: 5, badge: 'News' };
    const after = followOpening(edited, 'r1', newer);
    expect(after).toBe(edited);
    expect(roleChanges(after.base ?? role, after.draft)).toEqual({ version: 4, name: 'Newsletter team' });
  });
});

describe('followPerson', () => {
  const sara: AdminUser = {
    id: 'u1',
    displayName: 'Sara',
    email: null,
    phone: null,
    roles: [{ id: 'r0', slug: 'student', name: 'Student', badge: null }],
    status: 'active',
    year: 2,
    createdAt: '2026-10-01T09:00:00Z',
    lastSeenAt: null,
  };

  it('ticks the person’s roles from the first render', () => {
    expect([...followPerson(ticksOf(null), sara).ticked]).toEqual(['r0']);
    expect([...ticksOf(sara).ticked]).toEqual(['r0']);
  });

  it('keeps the admin’s ticks when the people list reloads the same person', () => {
    const mine = { personId: 'u1', ticked: new Set(['r0', 'r1']) };
    expect(followPerson(mine, { ...sara })).toBe(mine);
    expect(followPerson(mine, null).personId).toBeNull();
  });
});
