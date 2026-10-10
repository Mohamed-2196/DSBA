// Live data for the issue reader, read through other features' public APIs only.
// Every call is guarded: if a feature returns nothing (or throws), the section shows its fallback.
import { getUpcomingEvents } from '../../calendar/public';
import { getHotThreads } from '../../forum/public';
import { getRecentFiles } from '../../library/public';
import { MODULES } from '../../../data/modules';
import { parseDay } from './text';

/** Exams in a section's window, as of the issue date (never "today"). */
export function getSessionExams(section) {
  const w = section?.window || {};
  try {
    const events = getUpcomingEvents({ from: parseDay(w.from), n: 60 }) || [];
    return events.filter((e) => e && e.type === 'exam' && (!w.to || e.date <= w.to));
  } catch {
    return [];
  }
}

/**
 * The issue's "From the forum": hot threads about a module (study questions and study groups) first,
 * then anything else to fill up. Off-topic chatter only appears if there's nothing else.
 */
export function getForumThreads(n = 4) {
  try {
    const list = getHotThreads(n * 3);
    if (!Array.isArray(list)) return [];
    const valid = list.filter((t) => t && t.id != null && t.title);
    const onTopic = valid.filter((t) => t.moduleId);
    return [...onTopic, ...valid.filter((t) => !t.moduleId)].slice(0, n);
  } catch {
    return [];
  }
}

export function getLibraryFiles(n = 4) {
  try {
    const list = getRecentFiles(n);
    return Array.isArray(list) ? list.filter((f) => f && f.id != null && f.title).slice(0, n) : [];
  } catch {
    return [];
  }
}

/** Fallback for "New in the library": the students' notes already on the hub (module data). */
export function getSharedNotes(n = 6) {
  const notes = [];
  for (const m of MODULES) {
    for (const note of m.notes) notes.push({ moduleId: m.id, year: m.year, unitCode: m.unitCode, moduleName: m.shortName, name: note.name, author: note.author });
  }
  // Newest cohort first, then one note per module before repeating a module.
  notes.sort((a, b) => b.year - a.year);
  const seen = new Set();
  const first = notes.filter((x) => (seen.has(x.moduleId) ? false : seen.add(x.moduleId)));
  const rest = notes.filter((x) => !first.includes(x));
  return [...first, ...rest].slice(0, n);
}

/** A person's display name from whatever shape another feature uses ('Ali H.', { name }, …). */
export function personName(p) {
  if (!p) return null;
  if (typeof p === 'string') return p;
  return p.name || p.displayName || null;
}
