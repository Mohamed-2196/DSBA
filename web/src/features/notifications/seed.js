// Seeded notifications for the prototype (no backend). Deterministic: everything is derived from
// shared data and Date.now() (the launch film freezes the clock at 2026-10-06 10:00, Bahrain).
import { EVENTS, eventDate } from '../../data/calendar';
import { getModule, getModulesForYear } from '../../data/modules';

const HOUR = 3600000;
const DAY = 24 * HOUR;

/** v1's "new Year 2 notes" announcement key; v2 shows it as a notification with the same id. */
export const V1_ANNOUNCEMENT_KEY = 'year2_new_notes_announcement_v1';

/** A seeded moment that is never in the future: the anchor, or `fallbackAgo` before now. */
function at(anchorISO, now, fallbackAgo) {
  const t = Date.parse(anchorISO);
  return Number.isFinite(t) && t <= now ? t : now - fallbackAgo;
}

/** 'Tuesday 3 November'. */
function longDay(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

const MILESTONES = [
  { days: 28, phrase: 'in 4 weeks' },
  { days: 14, phrase: 'in 2 weeks' },
  { days: 7, phrase: 'in a week' },
  { days: 1, phrase: 'tomorrow' },
];

/** Exam reminders sent at 08:00 on each milestone day, kept for 3 days. */
function examReminders(year, now) {
  const out = [];
  for (const e of EVENTS) {
    if (e.type !== 'exam' || e.year !== year) continue;
    const day = eventDate(e);
    for (const m of MILESTONES) {
      const sent = new Date(day.getFullYear(), day.getMonth(), day.getDate() - m.days, 8, 0, 0).getTime();
      if (sent > now || now - sent > 3 * DAY) continue;
      const mod = getModule(e.moduleId);
      const label = e.unitCode || mod?.shortName || 'Your';
      out.push({
        id: `exam:${e.id}:${m.days}`,
        kind: 'exam',
        title: `${label} exam ${m.phrase}`,
        body: `${mod ? mod.name : e.title}, ${longDay(day)}. Past papers and lessons are on the module page.`,
        to: e.moduleId ? `/modules/${e.moduleId}` : '/calendar',
        at: sent,
        code: e.unitCode || null,
      });
    }
  }
  return out;
}

/** Names list: 'A, B and C'. */
function listOf(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Build the notification list for a year.
 * @param {{ year: 1|2|3, now?: number, issue?: object|null, thread?: object|null, hot?: object[] }} o
 *   issue  from newsletter getLatestIssue(); thread  the signed-in user's own forum thread, if any;
 *   hot    forum getHotThreads() (a busy thread in your year stands in for "a thread you follow").
 * -> [{ id, kind, title, body, to, at, defaultRead? }] newest first
 */
export function buildNotifications({ year, now = Date.now(), issue = null, thread = null, hot = [] }) {
  const list = [];

  // A busy module thread from your own year (not forum-wide chatter).
  const followed = thread ? null : hot.find((t) => t && t.moduleId && t.year === year && (t.replies ?? 0) >= 3) || null;
  const target = thread || followed;
  list.push({
    id: 'forum:thread-replies',
    kind: 'forum',
    title: thread ? '3 new replies on your thread' : '3 new replies in a thread you follow',
    body: target?.title ? `“${target.title}”` : 'Classmates answered a question you follow.',
    to: target?.id ? `/forum/${encodeURIComponent(target.id)}` : '/forum',
    at: at('2026-10-06T09:15:00+03:00', now, 45 * 60000),
  });

  list.push(...examReminders(year, now));

  const n = issue?.number ?? 1;
  list.push({
    id: `newsletter:issue-${n}`,
    kind: 'newsletter',
    number: n,
    title: `The DSBA Newsletter #${String(n).padStart(2, '0')} is out`,
    // The menu shows two lines of this, so the issue's summary opens with its first story.
    body: issue ? issue.summary || issue.title : 'There is a new issue of The DSBA Newsletter to read.',
    to: issue?.slug ? `/newsletter/${encodeURIComponent(issue.slug)}` : '/newsletter',
    at: issue?.date ? at(`${issue.date}T07:00:00+03:00`, now, 3 * HOUR) : at('2026-10-06T07:00:00+03:00', now, 3 * HOUR),
  });

  list.push({
    id: 'welcome:dsba-hub',
    kind: 'welcome',
    title: 'Welcome to DSBA Hub',
    body: 'Everything from the old hub is here, plus a forum, Career Navigator and The DSBA Newsletter.',
    to: '/about',
    at: at('2026-10-06T06:00:00+03:00', now, 4 * HOUR),
    defaultRead: true,
  });

  if (year === 2) {
    const withNotes = getModulesForYear(2).filter((m) => m.notes.length > 0).map((m) => m.shortName);
    list.push({
      id: V1_ANNOUNCEMENT_KEY,
      kind: 'notes',
      title: 'New Year 2 study notes added',
      body: withNotes.length ? `Students’ notes for ${listOf(withNotes)}.` : 'New students’ notes are in the library.',
      to: '/library?type=notes&year=2',
      at: at('2026-10-05T19:30:00+03:00', now, 15 * HOUR),
    });
  }

  return list.sort((a, b) => b.at - a.at);
}
