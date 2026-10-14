// The module editor's working copy: the module as loaded (ModuleEdit), changed in the browser, then saved whole
// (ModuleSave). Chapters and lessons keep their `id` (null for new ones): students' progress, notes and study-board
// cards point at lessons by id, so moving one changes nothing for them. `key` is only for React and drag and drop.
import type { ModuleEdit, ModuleSave } from '../../../api/types';

export interface DraftLesson {
  key: string;
  id: string | null;
  url: string;
  title: string;
  channel: string;
  hidden: boolean;
}

export interface DraftChapter {
  key: string;
  id: string | null;
  title: string;
  hidden: boolean;
  lessons: DraftLesson[];
}

export interface Draft {
  unitCode: string;
  name: string;
  shortName: string;
  year: 1 | 2 | 3;
  description: string;
  icon: string;
  hidden: boolean;
  resources: Record<ResourceKey, string>;
  chapters: DraftChapter[];
}

export const RESOURCE_FIELDS = [
  ['materials', 'Course materials'],
  ['exercises', 'Exercises'],
  ['vle', 'VLE materials'],
  ['olderExams', 'Older exams'],
  ['cheatSheet', 'Cheat sheet'],
] as const;
export type ResourceKey = (typeof RESOURCE_FIELDS)[number][0] | 'exercisesNote';

export const MODULE_ICONS = [
  'BookOpenText', 'Brain', 'Briefcase', 'ChartBar', 'ChartLineUp', 'ChartScatter', 'Coins', 'Database', 'Function',
  'ListChecks', 'Megaphone', 'PresentationChart', 'Scales', 'Sigma', 'Storefront', 'TerminalWindow', 'WaveSine',
] as const satisfies readonly NonNullable<ModuleSave['icon']>[];
type IconName = (typeof MODULE_ICONS)[number];

let made = 0;
export const newKey = (prefix: string) => `${prefix}-${++made}`;

export function toDraft(m: ModuleEdit): Draft {
  const r = m.resources;
  return {
    unitCode: m.unitCode ?? '',
    name: m.name,
    shortName: m.shortName,
    year: m.year,
    description: m.description,
    icon: m.icon ?? '',
    hidden: m.hidden,
    resources: {
      materials: r.materials ?? '',
      exercises: r.exercises ?? '',
      exercisesNote: r.exercisesNote ?? '',
      vle: r.vle ?? '',
      olderExams: r.olderExams ?? '',
      cheatSheet: r.cheatSheet ?? '',
    },
    chapters: m.chapters.map((ch) => ({
      key: `c-${ch.id}`,
      id: ch.id,
      title: ch.title,
      hidden: ch.hidden,
      lessons: ch.lessons.map((l) => ({
        key: `l-${l.id}`,
        id: l.id,
        url: l.url,
        title: l.title ?? '',
        channel: l.channel ?? '',
        hidden: l.hidden,
      })),
    })),
  };
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);
const isIcon = (s: string): s is IconName => (MODULE_ICONS as readonly string[]).includes(s);

export function toSave(d: Draft, version: number): ModuleSave {
  const r = d.resources;
  return {
    version,
    unitCode: orNull(d.unitCode),
    name: d.name.trim(),
    shortName: d.shortName.trim(),
    year: d.year,
    description: d.description.trim(),
    icon: isIcon(d.icon) ? d.icon : null,
    hidden: d.hidden,
    resources: {
      materials: orNull(r.materials),
      exercises: orNull(r.exercises),
      exercisesNote: orNull(r.exercisesNote),
      vle: orNull(r.vle),
      olderExams: orNull(r.olderExams),
      cheatSheet: orNull(r.cheatSheet),
    },
    chapters: d.chapters.map((ch) => ({
      title: ch.title.trim(),
      hidden: ch.hidden,
      id: ch.id,
      lessons: ch.lessons.map((l) => ({ url: l.url.trim(), title: orNull(l.title), channel: orNull(l.channel), hidden: l.hidden, id: l.id })),
    })),
  };
}

/** Whether the draft differs from what was loaded (keys aside). */
export function isDirty(d: Draft, loaded: ModuleEdit): boolean {
  return JSON.stringify(toSave(d, 0)) !== JSON.stringify(toSave(toDraft(loaded), 0));
}

// ── changes (each returns a new draft) ──────────────────────────────────────────────────────

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

export function moveChapter(d: Draft, from: number, to: number): Draft {
  if (to < 0 || to >= d.chapters.length || from === to) return d;
  return { ...d, chapters: move(d.chapters, from, to) };
}

export interface LessonPlace {
  chapter: number;
  lesson: number;
}

/** Moves a lesson to `to` (its index there counts without the lesson itself, as after taking it out). */
export function moveLesson(d: Draft, from: LessonPlace, to: LessonPlace): Draft {
  const source = d.chapters[from.chapter];
  const lesson = source?.lessons[from.lesson];
  if (!lesson || !d.chapters[to.chapter]) return d;
  const chapters = d.chapters.map((ch) => ({ ...ch, lessons: ch.lessons.slice() }));
  chapters[from.chapter].lessons.splice(from.lesson, 1);
  const target = chapters[to.chapter].lessons;
  target.splice(Math.max(0, Math.min(to.lesson, target.length)), 0, lesson);
  return { ...d, chapters };
}

/** One step up or down: past the first or last lesson of a chapter, into the end or start of the next one. */
export function stepLesson(d: Draft, at: LessonPlace, step: -1 | 1): Draft {
  const count = d.chapters[at.chapter]?.lessons.length ?? 0;
  const inside = at.lesson + step;
  if (inside >= 0 && inside < count) return moveLesson(d, at, { chapter: at.chapter, lesson: inside });
  const next = at.chapter + step;
  if (next < 0 || next >= d.chapters.length) return d;
  return moveLesson(d, at, { chapter: next, lesson: step < 0 ? d.chapters[next].lessons.length : 0 });
}

export function canStepLesson(d: Draft, at: LessonPlace, step: -1 | 1): boolean {
  return stepLesson(d, at, step) !== d;
}

export function updateChapter(d: Draft, index: number, patch: Partial<Omit<DraftChapter, 'key' | 'id' | 'lessons'>>): Draft {
  return { ...d, chapters: d.chapters.map((ch, i) => (i === index ? { ...ch, ...patch } : ch)) };
}

export function updateLesson(d: Draft, at: LessonPlace, patch: Partial<Omit<DraftLesson, 'key' | 'id'>>): Draft {
  return {
    ...d,
    chapters: d.chapters.map((ch, i) => (i === at.chapter ? { ...ch, lessons: ch.lessons.map((l, j) => (j === at.lesson ? { ...l, ...patch } : l)) } : ch)),
  };
}

export function addChapter(d: Draft): Draft {
  return { ...d, chapters: [...d.chapters, { key: newKey('c'), id: null, title: '', hidden: false, lessons: [] }] };
}

export function addLesson(d: Draft, chapter: number): Draft {
  const lesson: DraftLesson = { key: newKey('l'), id: null, url: '', title: '', channel: '', hidden: false };
  return { ...d, chapters: d.chapters.map((ch, i) => (i === chapter ? { ...ch, lessons: [...ch.lessons, lesson] } : ch)) };
}

export function removeChapter(d: Draft, index: number): Draft {
  return { ...d, chapters: d.chapters.filter((_, i) => i !== index) };
}

export function removeLesson(d: Draft, at: LessonPlace): Draft {
  return { ...d, chapters: d.chapters.map((ch, i) => (i === at.chapter ? { ...ch, lessons: ch.lessons.filter((_, j) => j !== at.lesson) } : ch)) };
}

// ── video links (the API has the final say: api/app/services/module_editor.py parse_video) ─────

const YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
export const VIDEO_RULE = 'Paste a YouTube video or playlist link, or a class recording link from vc.bibf.com.';

/** What a pasted link is, or null when the app can't embed it. */
export function videoKind(url: string): 'youtube' | 'youtube-playlist' | 'bbb' | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'vc.bibf.com') return 'bbb';
  if (!YOUTUBE.has(host)) return null;
  if (u.pathname === '/playlist' || u.pathname === '/embed/videoseries') return u.searchParams.get('list') ? 'youtube-playlist' : null;
  return 'youtube';
}

/** Problems the editor can see before saving, by the API's field names ('chapters.0.lessons.1.url'). */
export function draftProblems(d: Draft): Record<string, string> {
  const out: Record<string, string> = {};
  if (d.name.trim().length < 3) out.name = 'Give the module a name of at least 3 characters.';
  if (d.shortName.trim().length < 2) out.shortName = 'Give it a short name of at least 2 characters.';
  if (d.unitCode.trim() && !/^[A-Za-z]{2}\d{4}$/.test(d.unitCode.trim())) out.unitCode = 'A unit code is two letters and four digits, like ST2133.';
  d.chapters.forEach((ch, c) => {
    if (!ch.title.trim()) out[`chapters.${c}.title`] = 'Give the chapter a title.';
    ch.lessons.forEach((l, v) => {
      if (!videoKind(l.url)) out[`chapters.${c}.lessons.${v}.url`] = VIDEO_RULE;
    });
  });
  return out;
}
