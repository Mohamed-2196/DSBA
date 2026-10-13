// UX review UX-15: every Activity line says what happened, and to what.
import { describe, expect, it } from 'vitest';
import type { AuditOut } from '../../api/types';
import { auditActor, describeAudit } from './audit';

const entry = (action: string, data: Record<string, unknown>, targetType: string | null = null): AuditOut =>
  ({ id: '1', action, targetType, targetId: 't1', data, createdAt: '2026-10-12T10:00:00Z', actor: { id: 'a1', displayName: 'Hassan A.' } }) as unknown as AuditOut;

describe('describeAudit', () => {
  it('names the newsletter issue', () => {
    expect(describeAudit(entry('newsletter.publish', { title: 'The pilot' }))).toBe('published the newsletter issue “The pilot”');
    expect(describeAudit(entry('newsletter.update', { title: 'Week 3' }))).toBe('edited the newsletter issue “Week 3”');
    expect(describeAudit(entry('newsletter.create', { title: 'Draft' }))).toBe('started a newsletter issue: “Draft”');
  });

  it('says what a report was about and how it ended', () => {
    expect(describeAudit(entry('report.resolve', { status: 'resolved', targetType: 'thread', title: 'Resit dates' }))).toBe(
      'acted on a report about the thread “Resit dates”',
    );
    expect(describeAudit(entry('report.resolve', { status: 'dismissed', targetType: 'reply', title: 'MGF help' }))).toBe(
      'dismissed a report about a reply in “MGF help”',
    );
    expect(describeAudit(entry('report.resolve', { status: 'dismissed' }))).toBe('dismissed a report about a post');
  });

  it('uses the staff word for a rejected upload (UX-17)', () => {
    expect(describeAudit(entry('library.reject', { title: 'Week 3 notes' }))).toBe('rejected “Week 3 notes”');
  });

  it('describes an admin’s change to an account’s sign-in address', () => {
    expect(describeAudit(entry('user.identifier', { kind: 'email', from: 's•••@example.com', to: 'm•••@example.com', targetName: 'Sara M.' }, 'user'))).toBe(
      'changed Sara M.’s email address from s•••@example.com to m•••@example.com',
    );
    expect(describeAudit(entry('user.identifier', { kind: 'phone', from: null, to: '+973 •••• ••56', targetName: 'Sara M.' }, 'user'))).toBe(
      'added +973 •••• ••56 as Sara M.’s phone number',
    );
  });

  it('names the account from the snapshot, else from loaded accounts', () => {
    expect(describeAudit(entry('user.status', { to: 'suspended', targetName: 'Ali H.' }, 'user'))).toBe('suspended Ali H.');
    expect(describeAudit(entry('user.status', { to: 'suspended' }, 'user'), () => 'Zainab K.')).toBe('suspended Zainab K.');
  });

  it('describes role and switch changes', () => {
    expect(describeAudit(entry('user.roles', { from: ['Student'], to: ['Rep', 'Student'] }, 'user'), () => 'Ali')).toBe('changed Ali’s roles from Student to Rep, Student');
    expect(describeAudit(entry('role.create', { name: 'Events team', boxes: [] }))).toBe('created the role “Events team”');
    expect(describeAudit(entry('role.update', { before: { name: 'A' }, after: { name: 'B' } }))).toBe('changed the role “B”');
    expect(describeAudit(entry('role.delete', { name: 'Events team', holders: 2 }))).toBe('deleted the role “Events team”');
    expect(describeAudit(entry('feature.switch', { feature: 'calendar', from: 'everyone', to: 'off', roles: [] }))).toBe('switched calendar off');
  });

  it('sums up a run of the Drive import', () => {
    const run = (data: Record<string, unknown>) => describeAudit({ ...entry('library.import', { via: 'cli', from: 'google-drive', ...data }), actor: null } as AuditOut);
    expect(run({ imported: 12, skipped: 0, failed: 0, refusedFolders: [], stopped: null })).toBe('imported 12 files from Google Drive');
    expect(run({ imported: 1, skipped: 3, failed: 1, refusedFolders: [{ module: 'ST2133', link: 'x', folder: 'y' }], stopped: null })).toBe(
      'imported 1 file from Google Drive (3 skipped, 1 failed, a folder it couldn’t open)',
    );
    expect(run({ imported: 1234, skipped: 0, failed: 0, refusedFolders: [{}, {}], stopped: 'interrupted' })).toBe(
      'imported 1,234 files from Google Drive (2 folders it couldn’t open, stopped early)',
    );
    expect(run({})).toBe('imported 0 files from Google Drive');
  });

  it('still says something for an action it doesn’t know', () => {
    expect(describeAudit(entry('library.archive', { title: 'Old notes' }))).toBe('library archive “Old notes”');
  });
});

describe('auditActor', () => {
  it('is the account, or the name it had then', () => {
    expect(auditActor(entry('forum.thread.hide', {}))).toBe('Hassan A.');
    expect(auditActor({ ...entry('forum.thread.hide', { actorName: 'Old name' }), actor: null } as AuditOut)).toBe('Old name');
  });

  it('is the Hub for what ran on the server, and a deleted user otherwise', () => {
    expect(auditActor({ ...entry('library.import', { via: 'cli', imported: 3 }), actor: null } as AuditOut)).toBe('The Hub');
    expect(auditActor({ ...entry('user.roles', { via: 'bootstrap', to: ['Admin'] }), actor: null } as AuditOut)).toBe('The Hub');
    expect(auditActor({ ...entry('forum.thread.hide', {}), actor: null } as AuditOut)).toBe('A deleted user');
    expect(auditActor({ ...entry('user.roles', { from: ['Student'], to: ['Rep'] }), actor: null } as AuditOut)).toBe('A deleted user');
  });
});
