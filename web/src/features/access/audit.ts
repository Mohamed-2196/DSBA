// The audit log in plain words: "hid a thread: “Week 3 notes”".
import type { AuditOut } from '../../api/types';
import { formatCount } from '../../ui';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const quoted = (v: unknown): string => {
  const s = str(v);
  return s ? ` “${s.length > 80 ? `${s.slice(0, 79)}…` : s}”` : '';
};
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const list = (v: string[]): string => (v.length ? v.join(', ') : 'no roles');
const MODES: Record<string, string> = { off: 'off', roles: 'on for some roles', everyone: 'on for everyone' };

/** `name` is the target account's name when we know it. */
type Describe = (data: Record<string, unknown>, name: string | null) => string;

const via = (d: Record<string, unknown>) => (d.via === 'bootstrap' ? ' (from the server settings)' : d.via === 'cli' ? ' (from the server)' : '');

/** What a report was about: "the thread “X”", "a reply in “X”", "the library file “X”". */
const REPORTED: Record<string, string> = { thread: 'the thread', reply: 'a reply in', library_item: 'the library file' };
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

/** An admin's identifier change (account recovery): data.from and data.to are masked ("s•••@example.com"). */
const IDENTIFIER_NOUN: Record<string, string> = { email: 'email address', phone: 'phone number' };

const ACTIONS: Record<string, Describe> = {
  'user.roles': (d, name) => `changed ${name ? `${name}’s roles` : 'someone’s roles'} from ${list(names(d.from))} to ${list(names(d.to))}${via(d)}`,
  'role.create': (d) => `created the role${quoted(d.name)}`,
  'role.update': (d) => {
    const after = typeof d.after === 'object' && d.after !== null ? (d.after as Record<string, unknown>) : {};
    return `changed the role${quoted(after.name)}`;
  },
  'role.delete': (d) => `deleted the role${quoted(d.name)}`,
  'feature.switch': (d) => `switched ${str(d.feature) ?? 'a feature'} ${MODES[str(d.to) ?? ''] ?? 'to a new setting'}`,
  'user.status': (d, name) =>
    d.to === 'suspended'
      ? `suspended ${name ?? 'an account'}`
      : d.to === 'active'
        ? `lifted ${name ? `${name}’s suspension` : 'a suspension'}`
        : `changed ${name ? `${name}’s` : 'an account’s'} status`,
  'forum.thread.hide': (d) => `hid a thread:${quoted(d.title)}`,
  'forum.thread.unhide': (d) => `brought back a thread:${quoted(d.title)}`,
  'forum.thread.pin': (d) => `pinned a thread:${quoted(d.title)}`,
  'forum.thread.unpin': (d) => `unpinned a thread:${quoted(d.title)}`,
  'forum.thread.lock': (d) => `locked a thread:${quoted(d.title)}`,
  'forum.thread.unlock': (d) => `unlocked a thread:${quoted(d.title)}`,
  'forum.thread.edit': (d) => `edited a thread:${quoted(d.title)}`,
  'forum.thread.delete': (d) => `deleted a thread:${quoted(d.title)}`,
  'forum.thread.accept': (d) => (d.replyId ? `accepted an answer in${quoted(d.title)}` : `cleared the accepted answer in${quoted(d.title)}`),
  'forum.reply.hide': (d) => `hid a reply in${quoted(d.title)}`,
  'forum.reply.unhide': (d) => `brought back a reply in${quoted(d.title)}`,
  'forum.reply.edit': (d) => `edited a reply in${quoted(d.title)}`,
  'forum.reply.delete': (d) => `deleted a reply in${quoted(d.title)}`,
  'user.identifier': (d, name) => {
    const noun = IDENTIFIER_NOUN[str(d.kind) ?? ''] ?? 'sign-in address';
    const whose = name ? `${name}’s` : 'an account’s';
    const from = str(d.from);
    const to = str(d.to);
    if (from && to) return `changed ${whose} ${noun} from ${from} to ${to}`;
    if (to) return `added ${to} as ${whose} ${noun}`;
    if (from) return `removed ${whose} ${noun}, ${from}`;
    return `changed ${whose} ${noun}`;
  },
  'report.resolve': (d) => (d.status === 'dismissed' ? `dismissed a report about ${reported(d)}` : `acted on a report about ${reported(d)}`),
  'library.publish': (d) => `published${quoted(d.title) || ' an upload'}`,
  'library.reject': (d) => `rejected${quoted(d.title) || ' an upload'}`,
  'library.link': (d) => `added a link to the library:${quoted(d.title)}`,
  'library.edit': (d) => `edited${quoted(d.title) || ' a library file'}`,
  'library.remove': (d) => `removed${quoted(d.title) || ' a library file'}`,
  'library.import': driveImport,
  'calendar.create': (d) => `added an event:${quoted(d.title)}`,
  'calendar.update': (d) => `edited an event${quoted(d.title)}`,
  'calendar.delete': (d) => `deleted an event${quoted(d.title)}`,
  'newsletter.create': (d) => `started a newsletter issue${quoted(d.title) ? `:${quoted(d.title)}` : ''}`,
  'newsletter.update': (d) => `edited the newsletter issue${quoted(d.title) || ' (untitled)'}`,
  'newsletter.publish': (d) => `published the newsletter issue${quoted(d.title) || ' (untitled)'}`,
  'newsletter.delete': (d) => `deleted the newsletter issue${quoted(d.title) || ' (untitled)'}`,
  'career.update': () => 'updated the Career Navigator',
  'suggestion.accept': (d) => `added a suggested video as a lesson:${quoted(d.title)}`,
  'suggestion.decline': (d) => `declined a suggested video:${quoted(d.title)}`,
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
