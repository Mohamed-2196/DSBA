// The audit log in plain words: "hid the thread “Week 3 notes”". Every action the API records has its words here
// (audit.test.ts checks the API's code for them).
import type { AuditOut } from '../../api/types';
import { formatCount } from '../../ui';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const quoted = (v: unknown): string => {
  const s = str(v);
  return s ? ` “${s.length > 80 ? `${s.slice(0, 79)}…` : s}”` : '';
};
/** "the library file “X”", so a library line never reads like a newsletter one; "a library file" untitled. */
const libraryFile = (title: unknown): string => {
  const q = quoted(title);
  return q ? `the library file${q}` : 'a library file';
};
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const list = (v: string[]): string => (v.length ? v.join(', ') : 'no roles');
const MODES: Record<string, string> = { off: 'off', roles: 'on for some roles', everyone: 'on for everyone' };

/** `name` is the target account's name when we know it. */
type Describe = (data: Record<string, unknown>, name: string | null) => string;

const via = (d: Record<string, unknown>) =>
  d.via === 'bootstrap' ? ' (from the server settings)' : d.via === 'cli' ? ' (from the server)' : '';

/** What a report was about: "the thread “X”", "a reply in “X”", "the library file “X”". */
const REPORTED: Record<string, string> = {
  thread: 'the thread',
  reply: 'a reply in',
  library_item: 'the library file',
  request: 'the request',
  shared_note: 'the shared note',
};
const reported = (d: Record<string, unknown>): string => {
  const title = quoted(d.title);
  if (!title) return 'a post';
  return `${REPORTED[str(d.targetType) ?? ''] ?? 'the post'}${title}`;
};

/** One run of the Drive import (python -m app.cli import-drive): what it brought in, and what it couldn't. */
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const driveImport = (d: Record<string, unknown>): string => {
  const n = count(d.imported);
  const folders = Array.isArray(d.refusedFolders) ? d.refusedFolders.length : 0;
  const notes = [
    count(d.skipped) ? `${formatCount(count(d.skipped))} skipped` : null,
    count(d.failed) ? `${formatCount(count(d.failed))} failed` : null,
    folders ? `${folders === 1 ? 'a folder' : `${formatCount(folders)} folders`} it couldn’t open` : null,
    str(d.stopped) ? 'stopped early' : null,
  ].filter((note): note is string => note !== null);
  return `imported ${formatCount(n)} ${n === 1 ? 'file' : 'files'} from Google Drive${notes.length ? ` (${notes.join(', ')})` : ''}`;
};

/** Career Navigator's parts, as its editor names them. */
const CAREER_PARTS: Record<string, string> = {
  employers: 'employers',
  tracks: 'tracks',
  roles: 'roles',
  defaultRoleId: 'the first role',
  skills: 'skills',
  chosen: 'electives',
  certs: 'certificates',
  certNote: 'certificates',
  featured: 'the featured competition',
  checklist: 'the checklist',
  furtherStudy: 'further study',
  checkedOn: 'the date links were checked',
  initialCount: 'page text',
  offerTypes: 'page text',
  ctaLabel: 'page text',
  effortLabel: 'page text',
  depthLabel: 'page text',
  yearHints: 'page text',
};

/** A bug report's new status. */
const BUG_STATUS: Record<string, string> = {
  open: 'reopened a bug report',
  fixed: 'marked a bug report fixed',
  wont_fix: 'closed a bug report without a fix',
};

/** '$25', or '$2.50'. */
const dollars = (cents: number): string => `$${cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)}`;

/** Mini Noora's limits as set: "30 questions a day and $25 a month". */
const nooraLimits = (d: Record<string, unknown>): string => {
  const after = typeof d.after === 'object' && d.after !== null ? (d.after as Record<string, unknown>) : {};
  const day = count(after.dailyQuestions);
  const month = count(after.monthlyBudgetCents);
  const parts = [
    day ? `${formatCount(day)} ${day === 1 ? 'question' : 'questions'} a day` : null,
    month ? `${dollars(month)} a month` : null,
  ].filter((p): p is string => p !== null);
  return parts.length ? `set Mini Noora’s limits to ${parts.join(' and ')}` : 'changed Mini Noora’s limits';
};

const notebookLimits = (d: Record<string, unknown>): string => {
  const after = typeof d.after === 'object' && d.after !== null ? (d.after as Record<string, unknown>) : {};
  const n = count(after.uploadsPerHour);
  return n
    ? `set the notebook’s uploads to ${formatCount(n)} an hour per student`
    : 'changed the notebook’s upload limit';
};

/** Megabytes in words: '512 MB', '1 GB', '1.5 GB'. */
const megabytes = (mb: number): string => {
  if (mb < 1024) return `${formatCount(mb)} MB`;
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? formatCount(gb) : gb.toFixed(1)} GB`;
};

const uploadLimits = (d: Record<string, unknown>): string => {
  const after = typeof d.after === 'object' && d.after !== null ? (d.after as Record<string, unknown>) : {};
  const hub = count(after.hubMbPerDay);
  const account = count(after.accountMbPerDay);
  return hub && account
    ? `set the upload budgets to ${megabytes(hub)} a day for the hub and ${megabytes(account)} per account`
    : 'changed the upload budgets';
};

const ACTIONS: Record<string, Describe> = {
  'user.roles': (d, name) =>
    `changed ${name ? `${name}’s roles` : 'someone’s roles'} from ${list(names(d.from))} to ${list(names(d.to))}${via(d)}`,
  'role.create': (d) => `created the role${quoted(d.name)}`,
  'role.update': (d) => {
    const after = typeof d.after === 'object' && d.after !== null ? (d.after as Record<string, unknown>) : {};
    return `changed the role${quoted(after.name)}`;
  },
  'role.delete': (d) => `deleted the role${quoted(d.name)}`,
  'feature.switch': (d) =>
    `switched ${str(d.label) ?? str(d.feature) ?? 'a feature'} ${MODES[str(d.to) ?? ''] ?? 'to a new setting'}`,
  'user.status': (d, name) =>
    d.to === 'suspended'
      ? `suspended ${name ?? 'an account'}`
      : d.to === 'active'
        ? `lifted ${name ? `${name}’s suspension` : 'a suspension'}`
        : `changed ${name ? `${name}’s` : 'an account’s'} status`,
  'forum.thread.hide': (d) => `hid the thread${quoted(d.title)}`,
  'forum.thread.unhide': (d) => `brought back the thread${quoted(d.title)}`,
  'forum.thread.pin': (d) => `pinned the thread${quoted(d.title)}`,
  'forum.thread.unpin': (d) => `unpinned the thread${quoted(d.title)}`,
  'forum.thread.lock': (d) => `locked the thread${quoted(d.title)}`,
  'forum.thread.unlock': (d) => `unlocked the thread${quoted(d.title)}`,
  'forum.thread.edit': (d) => `edited the thread${quoted(d.title)}`,
  'forum.thread.delete': (d) => `deleted the thread${quoted(d.title)}`,
  'forum.thread.anonymous': (d) => `posted the thread${quoted(d.title)} without their name`,
  'forum.settings': () => 'edited the forum’s settings',
  'forum.thread.accept': (d) =>
    d.replyId ? `accepted an answer in${quoted(d.title)}` : `cleared the accepted answer in${quoted(d.title)}`,
  'forum.reply.hide': (d) => `hid a reply in${quoted(d.title)}`,
  'forum.reply.unhide': (d) => `brought back a reply in${quoted(d.title)}`,
  'forum.reply.edit': (d) => `edited a reply in${quoted(d.title)}`,
  'forum.reply.delete': (d) => `deleted a reply in${quoted(d.title)}`,
  'user.reset_link': (_d, name) => `made a password reset link for ${name ?? 'an account'}`,
  'user.password_reset': () => 'set a new password with a reset link',
  'user.takeover': (_d, name) =>
    `signed in with Google and took over ${name ? `${name}’s` : 'an'} unconfirmed account with that address`,
  'report.resolve': (d) =>
    d.status === 'dismissed' ? `dismissed a report about ${reported(d)}` : `acted on a report about ${reported(d)}`,
  'library.publish': (d) => `published ${libraryFile(d.title)}`,
  'library.reject': (d) => `rejected ${libraryFile(d.title)}`,
  'library.link': (d) => `added the link${quoted(d.title)} to the library`,
  'library.edit': (d) => `edited ${libraryFile(d.title)}`,
  'library.remove': (d) => `removed ${libraryFile(d.title)}`,
  'library.import': driveImport,
  'library.question_keep': (d) => `confirmed the topic of${quoted(d.title) || ' a question'}`,
  'library.question_remove': (d) => `removed the topic of${quoted(d.title) || ' a question'}`,
  'library.tagging_run': (d) => `asked Claude to tag${quoted(d.title) || ' a past paper'} again`,
  'calendar.create': (d) => `added the event${quoted(d.title)}`,
  'calendar.update': (d) => `edited the event${quoted(d.title)}`,
  'calendar.delete': (d) => `deleted the event${quoted(d.title)}`,
  'newsletter.create': (d) => `started the newsletter issue${quoted(d.title) || ' (untitled)'}`,
  'newsletter.update': (d) => `edited the newsletter issue${quoted(d.title) || ' (untitled)'}`,
  'newsletter.publish': (d) => `published the newsletter issue${quoted(d.title) || ' (untitled)'}`,
  'newsletter.delete': (d) => `deleted the newsletter issue${quoted(d.title) || ' (untitled)'}`,
  'newsletter.settings': () => 'edited the newsletter’s settings',
  'career.update': (d) => {
    const parts = [...new Set(names(d.parts).map((p) => CAREER_PARTS[p] ?? p))];
    return parts.length ? `edited Career Navigator: ${parts.join(', ')}` : 'edited Career Navigator';
  },
  'suggestion.accept': (d) => `added the suggested video${quoted(d.title)} as a lesson`,
  'suggestion.decline': (d) => `declined the suggested video${quoted(d.title)}`,
  'topic.accept': (d) => `put the time stamp${quoted(d.title)} beside${quoted(d.lesson) || ' a lesson'}`,
  'topic.decline': (d) => `declined the time stamp${quoted(d.title)}`,
  'topic.remove': (d) => `took the time stamp${quoted(d.title)} off${quoted(d.lesson) || ' a lesson'}`,
  'shared_note.hide': (d) => `hid the shared note${quoted(d.title)} from its module`,
  'shared_note.show': (d) => `showed the shared note${quoted(d.title)} in its module again`,
  'module.create': (d) => `added the module${quoted(d.title)}`,
  'module.update': (d) => `edited the module${quoted(d.title)}`,
  'module.delete': (d) => `removed the module${quoted(d.title)}`,
  'module.reorder': (d) => `changed the order of ${str(d.title) ?? 'a year'}’s modules`,
  'request.status': (d) => {
    const title = quoted(d.title);
    const to = str(d.to);
    const what =
      to === 'done'
        ? `marked the request${title} done`
        : to === 'planned'
          ? `marked the request${title} planned`
          : to === 'declined'
            ? `declined the request${title}`
            : to === 'open'
              ? `reopened the request${title}`
              : `changed the request${title}`;
    return d.via === 'calendar' ? `${what}, as its date was confirmed on the calendar` : what;
  },
  'request.remove': (d) => `removed the request${quoted(d.title)}`,
  'request.found': (d) => `answered the request${quoted(d.title)} with${quoted(d.item) || ' a library file'}`,
  'bug_report.status': (d) => BUG_STATUS[str(d.status) ?? ''] ?? 'changed a bug report',
  'noora.limits': nooraLimits,
  'notebook.limits': notebookLimits,
  'uploads.limits': uploadLimits,
  'noora.update': () => 'edited Mini Noora’s instructions and script',
  'site.update': () => 'edited Site settings',
  'guides.update': () => 'edited the guides',
  'grades.rules': () => 'edited the grades calculator’s rules',
  'summary.words': () => 'edited the Sunday summary’s words',
  'daily.item.create': (d) => `added the Daily puzzle${quoted(d.title)}`,
  'daily.item.update': (d) => `edited the Daily puzzle${quoted(d.title)}`,
  'daily.item.retire': (d) => `retired the Daily puzzle${quoted(d.title)}`,
  'daily.item.restore': (d) => `brought back the Daily puzzle${quoted(d.title)}`,
  'daily.item.delete': (d) => `deleted the Daily puzzle${quoted(d.title)}`,
  'daily.item.import': (d) => `imported Daily puzzles${quoted(d.title)}`,
  'daily.today.fix': (d) => {
    const changes = names(d.changes);
    const shown = changes.slice(0, 2).join(' ');
    const more = changes.length > 2 ? ` And ${changes.length - 2} more.` : '';
    const again = count(d.restarted);
    const restarted = again
      ? ` ${formatCount(again)} ${again === 1 ? 'game' : 'games'} partway through started again.`
      : '';
    return `fixed today’s Daily puzzle${quoted(d.title)}.${shown ? ` ${shown}` : ''}${more}${restarted}`;
  },
  'daily.content.import': (d) => `loaded the Daily puzzles’ content from a file${via(d)}`,
  'daily.theme.create': (d) => `added the Daily theme${quoted(d.title)}`,
  'daily.theme.update': (d) => `edited the Daily theme${quoted(d.title)}`,
  'daily.theme.delete': (d) => `deleted the Daily theme${quoted(d.title)}`,
  'daily.theme.order': () => 'changed the order of the Daily themes',
  'daily.schedule.update': (d) => `changed the Daily theme for ${str(d.title) ?? 'a week'}`,
  'daily.guesses.add': (d) =>
    `added ${formatCount(count(d.count))} ${count(d.count) === 1 ? 'word' : 'words'} to the Daily guess list`,
  'daily.guesses.remove': (d) => `took${quoted(d.title)} off the Daily guess list`,
  'daily.vocabulary.create': (d) => `added${quoted(d.title)} to Nearest Neighbour’s vocabulary`,
  'daily.vocabulary.update': (d) => `edited${quoted(d.title)} in Nearest Neighbour’s vocabulary`,
  'daily.vocabulary.delete': (d) => `deleted${quoted(d.title)} from Nearest Neighbour’s vocabulary`,
};

/** What happened, as the end of a sentence that starts with who did it. */
export function describeAudit(entry: AuditOut, nameOf: (userId: string) => string | null = () => null): string {
  const known = ACTIONS[entry.action];
  // The target's name: from a snapshot in the entry when the API records one, else from accounts we have loaded.
  const snapshot = str(entry.data?.targetName) ?? str(entry.data?.name);
  const name = entry.targetType === 'user' ? (snapshot ?? (entry.targetId ? nameOf(entry.targetId) : null)) : null;
  if (known) return known(entry.data ?? {}, name);
  // Something new: say it plainly from its name ('library.archive' → 'library archive').
  return `${entry.action.replace(/[._]+/g, ' ')}${quoted(entry.data?.title)}`;
}

/** Who did it: the account, the name it had then, or the Hub itself for what ran on the server: a command
 *  (`via: 'cli'`) or the server's own settings (`via: 'bootstrap'`). */
export function auditActor(entry: AuditOut): string {
  const byTheHub = entry.data?.via === 'cli' || entry.data?.via === 'bootstrap';
  return entry.actor?.displayName ?? str(entry.data?.actorName) ?? (byTheHub ? 'The Hub' : 'A deleted user');
}
