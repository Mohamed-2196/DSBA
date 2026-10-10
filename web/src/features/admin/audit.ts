// The audit log in plain words: "hid a thread: “Week 3 notes”".
import type { AuditOut } from '../../api/types';
import { roleLabel, type Role } from '../../auth';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const quoted = (v: unknown): string => {
  const s = str(v);
  return s ? ` “${s.length > 80 ? `${s.slice(0, 79)}…` : s}”` : '';
};
const isRole = (v: unknown): v is Role => v === 'student' || v === 'moderator' || v === 'admin';

/** `name` is the target account's name when we know it. */
type Describe = (data: Record<string, unknown>, name: string | null) => string;

const via = (d: Record<string, unknown>) => (d.via === 'bootstrap' ? ' (from the server settings)' : d.via === 'cli' ? ' (from the server)' : '');

const ACTIONS: Record<string, Describe> = {
  'user.role': (d, name) =>
    isRole(d.from) && isRole(d.to)
      ? `changed ${name ? `${name}’s role` : 'a role'} from ${roleLabel(d.from).toLowerCase()} to ${roleLabel(d.to).toLowerCase()}${via(d)}`
      : `changed ${name ? `${name}’s role` : 'a role'}`,
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
  'report.resolve': (d) => (d.status === 'dismissed' ? 'dismissed a report' : 'resolved a report'),
  'library.publish': (d) => `published${quoted(d.title) || ' an upload'}`,
  'library.reject': (d) => `turned down${quoted(d.title) || ' an upload'}`,
  'library.link': (d) => `added a link to the library:${quoted(d.title)}`,
  'library.edit': (d) => `edited${quoted(d.title) || ' a library file'}`,
  'library.remove': (d) => `removed${quoted(d.title) || ' a library file'}`,
  'calendar.create': (d) => `added an event:${quoted(d.title)}`,
  'calendar.update': (d) => `edited an event${quoted(d.title)}`,
  'calendar.delete': (d) => `deleted an event${quoted(d.title)}`,
  'newsletter.create': () => 'started a newsletter issue',
  'newsletter.update': () => 'edited a newsletter issue',
  'newsletter.publish': () => 'published a newsletter issue',
  'newsletter.delete': () => 'deleted a newsletter issue',
  'career.update': () => 'updated the Career Navigator',
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

/** Who did it: the account, the name it had then, or the Hub itself. */
export function auditActor(entry: AuditOut): string {
  return entry.actor?.displayName ?? str(entry.data?.actorName) ?? (entry.action === 'user.role' ? 'The Hub' : 'A deleted user');
}
