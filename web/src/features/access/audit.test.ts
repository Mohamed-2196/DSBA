// Every Activity line says what happened, and to what, in plain words.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuditOut } from '../../api/types';
import { auditActor, describeAudit } from './audit';

const entry = (action: string, data: Record<string, unknown>, targetType: string | null = null): AuditOut =>
  ({
    id: '1',
    action,
    targetType,
    targetId: 't1',
    data,
    createdAt: '2026-10-12T10:00:00Z',
    actor: { id: 'a1', displayName: 'Hassan A.' },
  }) as unknown as AuditOut;

/** The actions the API's code records: the first dotted string after `record(` or `audit(`, and each document's
 *  `action="…"`. Actions made in f-strings (a thread pinned or unpinned) are named in full elsewhere in this file. */
function recordedActions(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.py')) {
        const code = readFileSync(path, 'utf8');
        for (const call of code.matchAll(/(?<!def )\b(?:record|audit)\(/g)) {
          const action = code.slice(call.index, call.index + 300).match(/(?<!f)"([a-z_]+(?:\.[a-z_]+)+)"/);
          if (action?.[1]) found.add(action[1]);
        }
        for (const kind of code.matchAll(/\baction="([a-z_]+(?:\.[a-z_]+)+)"/g)) if (kind[1]) found.add(kind[1]);
      }
    }
  };
  walk(fileURLToPath(new URL('../../../../api/app', import.meta.url)));
  return found;
}

describe('describeAudit', () => {
  it('describes the Daily puzzles editor’s changes', () => {
    expect(describeAudit(entry('daily.item.retire', { title: 'The word: TREND' }))).toBe(
      'retired the Daily puzzle “The word: TREND”',
    );
    expect(describeAudit(entry('daily.schedule.update', { title: 'the week of 25 Oct 2026' }))).toBe(
      'changed the Daily theme for the week of 25 Oct 2026',
    );
    expect(describeAudit(entry('daily.guesses.add', { title: '3 words', count: 3 }))).toBe(
      'added 3 words to the Daily guess list',
    );
    expect(describeAudit(entry('daily.content.import', { via: 'cli' }))).toBe(
      'loaded the Daily puzzles’ content from a file (from the server)',
    );
  });

  it('says what a fix to today’s Daily puzzle changed, and whose games started again', () => {
    const fix = { title: 'The Word: PLANT', changes: ['The answer is PLANT, not BLUNT.'], restarted: 2 };
    expect(describeAudit(entry('daily.today.fix', fix))).toBe(
      'fixed today’s Daily puzzle “The Word: PLANT”. The answer is PLANT, not BLUNT. 2 games partway through started again.',
    );
    const many = { title: 'Correlations: Pets', changes: ['A.', 'B.', 'C.', 'D.'], restarted: 0 };
    expect(describeAudit(entry('daily.today.fix', many))).toBe(
      'fixed today’s Daily puzzle “Correlations: Pets”. A. B. And 2 more.',
    );
  });

  it('names the newsletter issue', () => {
    expect(describeAudit(entry('newsletter.publish', { title: 'The pilot' }))).toBe(
      'published the newsletter issue “The pilot”',
    );
    expect(describeAudit(entry('newsletter.update', { title: 'Week 3' }))).toBe('edited the newsletter issue “Week 3”');
    expect(describeAudit(entry('newsletter.create', { title: 'Draft' }))).toBe('started the newsletter issue “Draft”');
  });

  it('says what a report was about and how it ended', () => {
    expect(
      describeAudit(entry('report.resolve', { status: 'resolved', targetType: 'thread', title: 'Resit dates' })),
    ).toBe('acted on a report about the thread “Resit dates”');
    expect(
      describeAudit(entry('report.resolve', { status: 'dismissed', targetType: 'reply', title: 'MGF help' })),
    ).toBe('dismissed a report about a reply in “MGF help”');
    expect(describeAudit(entry('report.resolve', { status: 'dismissed' }))).toBe('dismissed a report about a post');
  });

  it('uses the staff word for a rejected upload', () => {
    expect(describeAudit(entry('library.reject', { title: 'Week 3 notes' }))).toBe(
      'rejected the library file “Week 3 notes”',
    );
    expect(describeAudit(entry('library.publish', {}))).toBe('published a library file');
  });

  it('describes an admin’s change to an account’s sign-in address', () => {
    expect(
      describeAudit(
        entry(
          'user.identifier',
          { kind: 'email', from: 's•••@example.com', to: 'm•••@example.com', targetName: 'Sara M.' },
          'user',
        ),
      ),
    ).toBe('changed Sara M.’s email address from s•••@example.com to m•••@example.com');
    expect(
      describeAudit(
        entry('user.identifier', { kind: 'phone', from: null, to: '+973 •••• ••56', targetName: 'Sara M.' }, 'user'),
      ),
    ).toBe('added +973 •••• ••56 as Sara M.’s phone number');
  });

  it('names the account from the snapshot, else from loaded accounts', () => {
    expect(describeAudit(entry('user.status', { to: 'suspended', targetName: 'Ali H.' }, 'user'))).toBe(
      'suspended Ali H.',
    );
    expect(describeAudit(entry('user.status', { to: 'suspended' }, 'user'), () => 'Zainab K.')).toBe(
      'suspended Zainab K.',
    );
  });

  it('describes role and switch changes', () => {
    expect(describeAudit(entry('user.roles', { from: ['Student'], to: ['Rep', 'Student'] }, 'user'), () => 'Ali')).toBe(
      'changed Ali’s roles from Student to Rep, Student',
    );
    expect(describeAudit(entry('role.create', { name: 'Events team', boxes: [] }))).toBe(
      'created the role “Events team”',
    );
    expect(describeAudit(entry('role.update', { before: { name: 'A' }, after: { name: 'B' } }))).toBe(
      'changed the role “B”',
    );
    expect(describeAudit(entry('role.delete', { name: 'Events team', holders: 2 }))).toBe(
      'deleted the role “Events team”',
    );
    expect(
      describeAudit(
        entry('feature.switch', { feature: 'video_suggestions', label: 'Suggested videos', to: 'off', roles: [] }),
      ),
    ).toBe('switched Suggested videos off');
  });

  it('sums up a run of the Drive import', () => {
    const run = (data: Record<string, unknown>) =>
      describeAudit({
        ...entry('library.import', { via: 'cli', from: 'google-drive', ...data }),
        actor: null,
      } as AuditOut);
    expect(run({ imported: 12, skipped: 0, failed: 0, refusedFolders: [], stopped: null })).toBe(
      'imported 12 files from Google Drive',
    );
    expect(
      run({
        imported: 1,
        skipped: 3,
        failed: 1,
        refusedFolders: [{ module: 'ST2133', link: 'x', folder: 'y' }],
        stopped: null,
      }),
    ).toBe('imported 1 file from Google Drive (3 skipped, 1 failed, a folder it couldn’t open)');
    expect(run({ imported: 1234, skipped: 0, failed: 0, refusedFolders: [{}, {}], stopped: 'interrupted' })).toBe(
      'imported 1,234 files from Google Drive (2 folders it couldn’t open, stopped early)',
    );
    expect(run({})).toBe('imported 0 files from Google Drive');
  });

  it('says what happened to modules, requests and bug reports, without the action’s name', () => {
    expect(describeAudit(entry('module.update', { title: 'Introduction to Economics' }))).toBe(
      'edited the module “Introduction to Economics”',
    );
    expect(describeAudit(entry('module.reorder', { title: 'Year 2', year: 2 }))).toBe(
      'changed the order of Year 2’s modules',
    );
    expect(describeAudit(entry('request.status', { title: 'ST2133 2019 paper', from: 'open', to: 'done' }))).toBe(
      'marked the request “ST2133 2019 paper” done',
    );
    expect(
      describeAudit(entry('request.status', { title: 'Mock dates', from: 'open', to: 'done', via: 'calendar' })),
    ).toBe('marked the request “Mock dates” done, as its date was confirmed on the calendar');
    expect(describeAudit(entry('request.found', { title: 'ST2133 2019 paper', item: 'ST2133 2019 Zone A' }))).toBe(
      'answered the request “ST2133 2019 paper” with “ST2133 2019 Zone A”',
    );
    expect(describeAudit(entry('bug_report.status', { status: 'wont_fix', page: '/library' }))).toBe(
      'closed a bug report without a fix',
    );
    expect(describeAudit(entry('noora.limits', { after: { dailyQuestions: 30, monthlyBudgetCents: 2500 } }))).toBe(
      'set Mini Noora’s limits to 30 questions a day and $25 a month',
    );
    expect(describeAudit(entry('notebook.limits', { after: { uploadsPerHour: 60 } }))).toBe(
      'set the notebook’s uploads to 60 an hour per student',
    );
    expect(describeAudit(entry('site.update', { title: 'Site settings', parts: ['links'] }))).toBe(
      'edited Site settings',
    );
    expect(describeAudit(entry('suggestion.accept', { title: 'MGFs explained' }))).toBe(
      'added the suggested video “MGFs explained” as a lesson',
    );
  });

  it('has words for every action the API records', () => {
    const actions = recordedActions();
    expect(actions.size).toBeGreaterThan(40);
    for (const action of actions) {
      expect(describeAudit(entry(action, {})), action).not.toBe(action.replace(/[._]+/g, ' '));
    }
  });

  it('still says something for an action it doesn’t know', () => {
    expect(describeAudit(entry('library.archive', { title: 'Old notes' }))).toBe('library archive “Old notes”');
  });
});

describe('auditActor', () => {
  it('is the account, or the name it had then', () => {
    expect(auditActor(entry('forum.thread.hide', {}))).toBe('Hassan A.');
    expect(auditActor({ ...entry('forum.thread.hide', { actorName: 'Old name' }), actor: null } as AuditOut)).toBe(
      'Old name',
    );
  });

  it('is the Hub for what ran on the server, and a deleted user otherwise', () => {
    expect(auditActor({ ...entry('library.import', { via: 'cli', imported: 3 }), actor: null } as AuditOut)).toBe(
      'The Hub',
    );
    expect(auditActor({ ...entry('user.roles', { via: 'bootstrap', to: ['Admin'] }), actor: null } as AuditOut)).toBe(
      'The Hub',
    );
    expect(auditActor({ ...entry('forum.thread.hide', {}), actor: null } as AuditOut)).toBe('A deleted user');
    expect(auditActor({ ...entry('user.roles', { from: ['Student'], to: ['Rep'] }), actor: null } as AuditOut)).toBe(
      'A deleted user',
    );
  });
});
