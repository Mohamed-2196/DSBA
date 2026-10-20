// Mini Noora's "brain". It is a script, not a mind: it looks the student's words up in the Hub's own modules
// (every module, chapter and titled lesson, from the API) and calendar, and answers with where to look. What she
// says in her own words (her greeting, who she is, her thanks, refusals and apologies, and the questions she offers)
// is her script from the API, which admins edit in Manage → Mini Noora; the maths she shows stays here.
// Everything here is a pure function of its arguments: no network, no storage, no React. The data comes in as a
// Knowledge object, built by buildKnowledge() from what the API returned (see knowledge.ts).
//
//   answer(question, knowledge, now) → Reply { mood, text, formula?, steps?, refs, suggestions? }
import type { ModuleDetail, ModuleSummary, NooraScript } from '../../api/types';
import { daysBetween, formatLongDay, formatShort, today as bahrainToday } from '../../lib/dates';
import type { Feature } from '../../auth';
import { eventDate, type CalendarEvent } from '../calendar/public';
// The modules feature owns the address of a lesson. Using its helper means these links cannot drift.
import { lessonHref } from '../modules/public';
import {
  BY_PARTS_FORMULA,
  distributionAsked,
  LAPLACE_MGF_STEPS,
  MGF_DEFINITION,
  REDUCTION_FORMULA,
  type Distribution,
} from './formulas';
import type { Question, Ref, Reply } from './types';

// ── The index: every module, chapter and titled lesson, with its link ─────────────────────────────────
interface Lesson {
  n: number;
  title: string;
  to: string;
}
interface Chapter {
  n: number;
  title: string;
  to: string;
  /** lessons we know the real title of (class recordings and playlists have none to search) */
  lessons: Lesson[];
}
interface IndexedModule {
  id: string;
  code: string | null;
  name: string;
  /** what a module is called in full, and inside a sentence: "ST2134 Statistical inference" */
  title: string;
  called: string;
  year: number;
  description: string;
  chapterCount: number;
  lessonCount: number;
  to: string;
  /** every name it goes by, in lower case ("maths", "stats" and "metrics" are what students type) */
  names: string[];
  /** empty until the module's lessons have loaded */
  chapters: Chapter[];
}
interface Topic {
  m: IndexedModule;
  c: Chapter;
  l: Lesson | null;
  title: string;
  around: string;
  size: number;
}
interface FoundTopic extends Topic {
  hits: number;
  score: number;
  order: number;
}

/** What she knows: the modules (with the lessons loaded so far), the dates ahead, and who she is talking to. */
export interface Knowledge {
  modules: IndexedModule[];
  topics: Topic[];
  /** calendar dates from today on (every cohort); null while they are unknown */
  events: CalendarEvent[] | null;
  /** the student's first name; null for a guest */
  name: string | null;
  /** whether a feature is on for the student: answers leave out the calendar and the library while they're off */
  isOn: (feature: Feature) => boolean;
  /** what she says in her own words */
  script: NooraScript;
}

function indexModule(m: ModuleSummary, detail: ModuleDetail | undefined): IndexedModule {
  return {
    id: m.id,
    code: m.unitCode ?? null,
    name: m.name,
    title: m.unitCode ? `${m.unitCode} ${m.name}` : m.name,
    called: m.unitCode ? `${m.unitCode} ${m.shortName}` : m.name,
    year: m.year,
    description: m.description,
    chapterCount: detail ? detail.chapters.length : m.chapterCount,
    lessonCount: m.lessonCount,
    to: `/modules/${m.id}`,
    names: [
      m.name,
      m.shortName,
      /mathemat/i.test(m.name) ? 'maths' : '',
      /statistic/i.test(m.name) ? 'stats' : '',
      /econometric/i.test(m.name) ? 'metrics' : '',
    ]
      .filter(Boolean)
      .map((s) => s.toLowerCase()),
    chapters: (detail?.chapters ?? []).map((c, ci) => ({
      n: ci + 1,
      title: c.title,
      to: c.videos[0] ? lessonHref(m.id, c.videos[0].id) : `/modules/${m.id}?tab=lessons`,
      lessons: c.videos
        .map((video, vi) => ({ n: vi + 1, title: video.title?.trim() ?? '', to: lessonHref(m.id, video.id) }))
        .filter((l) => l.title),
    })),
  };
}

// ── Reading a question ────────────────────────────────────────────────────────────────────────────
// Words that carry no topic: question words, small talk, and the nouns every question shares.
const FILLER = new Set(
  `a about actually again all also am an and answer answers any are as assignment at attached basic basics be been between
   bro but by called can cant chapter chapters cheat check complete could cover covered covers coursework did do does dont
   exactly exam exams explain file files find finish for from get give good had has have hello help here hey hi homework
   how i if im image in intro introduction into is it its ive just know learn lesson lessons like look me mean meaning
   means mini module modules my need noora not note notes of on open or paper papers past pdf photo picture please
   question questions read really see show so solve some something study stuff taught teach tell than thank thanks that
   the them then there these they thing things this those to too topic topics understand up us use video videos vs want
   was way we were what whats when where which who why will with would write yet you your`.split(/\s+/),
);

const ODD_PLURALS: Record<string, string> = { matrix: 'matr', matrices: 'matr', maths: 'math', analyses: 'analys' };
const ENDINGS = [
  'isations',
  'izations',
  'isation',
  'ization',
  'ations',
  'ation',
  'ices',
  'ings',
  'ions',
  'ing',
  'ion',
  'ies',
  'es',
  'ed',
  'al',
  's',
];

/** The start of a word that its other forms share: 'testing' and 'tests' → 'test', 'matrices' → 'matr'. */
function stem(word: string): string {
  const odd = ODD_PLURALS[word];
  if (odd) return odd;
  for (const end of ENDINGS) if (word.endsWith(end) && word.length - end.length >= 4) return word.slice(0, -end.length);
  return word;
}

/** A question as plain lower-case words ("What's in ST2133?" → ['whats', 'in', 'st2133']). */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The words worth looking up: no filler, no bare numbers, no single letters. */
function topicWords(text: string): string[] {
  return wordsOf(text).filter((w) => w.length > 1 && !FILLER.has(w) && !/^\d+$/.test(w));
}

/** How many words a title has once the filler is gone ("Introduction to Macroeconomics" has one). */
const sizeOf = (title: string): number => wordsOf(title).filter((w) => !FILLER.has(w)).length;

/** Everything a topic can be found in: chapters, and lessons (which also answer to their chapter's words). */
function topicsOf(modules: IndexedModule[]): Topic[] {
  return modules.flatMap((m) =>
    m.chapters.flatMap((c) => [
      { m, c, l: null, title: c.title.toLowerCase(), around: '', size: sizeOf(c.title) },
      ...c.lessons.map((l) => ({
        m,
        c,
        l,
        title: l.title.toLowerCase(),
        around: c.title.toLowerCase(),
        size: sizeOf(l.title),
      })),
    ]),
  );
}

/** Put what the API returned together (cheap: a few hundred lessons). */
export function buildKnowledge(
  catalogue: readonly ModuleSummary[],
  details: ReadonlyMap<string, ModuleDetail>,
  events: CalendarEvent[] | null,
  name: string | null,
  isOn: (feature: Feature) => boolean,
  script: NooraScript,
): Knowledge {
  const modules = catalogue.map((m) => indexModule(m, details.get(m.id)));
  return { modules, topics: topicsOf(modules), events, name, isOn, script };
}

// What a title word may add to a short query word and still be the same word: 'test' finds 'testing',
// but 'life' does not find 'lifecycle'. (Longer query words are specific enough to match as they are.)
const SAME_WORD =
  /^(s|es|ed|ing|ings|ion|ions|al|e|y|ies|ix|ices|ity|ic|ics|ical|ation|ations|ate|ated|ating|ator|ators|er|ers|ive|ives)?$/;

/**
 * How well a query word sits in a title: 2 if the title starts with it, 1 if one of its words does,
 * 0 if neither. Here a word must begin a word, so "art" does not find "parts".
 */
function hit(title: string, word: string): 0 | 1 | 2 {
  let i = title.indexOf(word);
  while (i >= 0) {
    const startsWord = i === 0 || !/[a-z0-9]/.test(title[i - 1] ?? '');
    const rest = /^[a-z0-9]*/.exec(title.slice(i + word.length))?.[0] ?? '';
    if (startsWord && (word.length > 4 || SAME_WORD.test(rest))) return i === 0 ? 2 : 1;
    i = title.indexOf(word, i + 1);
  }
  return 0;
}

// ── Finding things ────────────────────────────────────────────────────────────────────────────────
interface Named {
  module: IndexedModule;
  /** the query words that named it */
  used: string[];
  /** it was named outright (its code, or every word of one of its names), not just brushed by a word such as "distribution" */
  sure: boolean;
}

/** The module a question names, if any. */
function findModule(k: Knowledge, text: string, stems: string[], year: number | null): Named | null {
  const code = text.toUpperCase().match(/\b[A-Z]{2}\d{4}\b/)?.[0];
  const byCode = code ? k.modules.find((m) => m.code === code) : undefined;
  if (code && byCode) return { module: byCode, used: [code.toLowerCase()], sure: true };

  let best: (Named & { score: number }) | null = null;
  for (const m of k.modules) {
    const used = stems.filter((w) => m.names.some((name) => hit(name, w)));
    if (!used.length) continue;
    const sure = m.names.some((name) => topicWords(name).every((part) => stems.some((w) => hit(part, w))));
    const score = used.length * 100 + (sure ? 50 : 0) + (m.year === year ? 12 : 0);
    if (!best || score > best.score) best = { module: m, used, sure, score };
  }
  return best;
}

/**
 * Chapters and lessons for some words, best first. A result is kept only if it has (nearly) all the words, so
 * one stray match is not passed off as an answer. Equal matches stay in syllabus order. `inside`: look in this
 * module only.
 */
function findTopics(
  k: Knowledge,
  stems: string[],
  phrase: string,
  year: number | null,
  inside: IndexedModule | null = null,
): FoundTopic[] {
  if (!stems.length) return [];
  const found: FoundTopic[] = [];
  k.topics.forEach((t, order) => {
    if (inside && t.m !== inside) return;
    let score = 0;
    let inTitle = 0;
    let nearby = 0;
    for (const w of stems) {
      const h = hit(t.title, w);
      if (h) {
        score += h === 2 ? 80 : 72;
        inTitle += 1;
      } else if (t.around && hit(t.around, w)) {
        score += 20;
        nearby += 1;
      }
    }
    if (!inTitle) return;
    if (inTitle === stems.length && t.size === stems.length)
      score += 100; // the title is just what was asked, no more
    else if (phrase.includes(' ') && t.title.includes(phrase)) score += 40; // the words appear together
    if (!t.l) score += 20; // a chapter is a better place to send someone than one video in it
    if (year && t.m.year === year) score += 12; // ties go to the student's own year
    found.push({ ...t, hits: inTitle + nearby, score, order });
  });
  const needed = stems.length <= 2 ? stems.length : Math.ceil(stems.length * 0.6);
  return found
    .filter((t) => t.hits >= needed)
    .sort((a, b) => b.hits - a.hits || b.score - a.score || a.order - b.order);
}

// ── References ────────────────────────────────────────────────────────────────────────────────────
// A chapter that brings its own numbering ("Block 10: Hypothesis Testing") keeps it.
const ownNumbering = (c: Chapter): boolean => /^block \d/i.test(c.title);
const chapterRef = (m: IndexedModule, c: Chapter): Ref => ({
  code: m.code ?? m.name,
  label: ownNumbering(c) ? c.title : `Chapter ${c.n} · ${c.title}`,
  to: c.to,
});
const lessonRef = (c: Chapter, l: Lesson, label: string = l.title): Ref => ({ code: `${c.n}.${l.n}`, label, to: l.to });
const moduleRef = (m: IndexedModule, label: string = m.code ? m.name : 'Module page'): Ref => ({
  code: m.code ?? m.name,
  label,
  to: m.to,
});
const isRef = (r: Ref | null | undefined | false): r is Ref => !!r;

/** Up to four references for a ranked list of topics: the best chapter first, then what else matched as well. */
function topicRefs(topics: FoundTopic[]): Ref[] {
  const [best] = topics;
  if (!best) return [];
  const refs = [chapterRef(best.m, best.c)];
  const seen = new Set([`${best.m.id}/${best.c.n}`]);
  for (const t of topics) {
    if (refs.length >= 4 || t.hits < best.hits) break;
    // Lessons are numbered within the best match's module ("4.5"); other modules are named by their chapter.
    const lesson = t.l && t.m === best.m ? t.l : null;
    const key = `${t.m.id}/${t.c.n}${lesson ? `.${lesson.n}` : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(lesson ? lessonRef(t.c, lesson) : chapterRef(t.m, t.c));
  }
  return refs;
}

// ── Answers ───────────────────────────────────────────────────────────────────────────────────────
const MGF_EXAMPLES = ['MGF of a Poisson', 'MGF of the normal', 'MGF of the exponential'];

const hello = (name: string | null): string => (name ? `Hi ${name}!` : 'Hi!');

/** What she says when the chat opens. */
export function greeting(name: string | null, script: NooraScript): Reply {
  return { mood: 'wave', text: `${hello(name)} ${script.greeting}`, refs: [], suggestions: script.greetingChips };
}

/**
 * Where integration by parts is taught: Mathematical Methods, its chapter on integration, and that chapter's two
 * lessons on the method. Looked up by name, so it follows the data if chapters are ever reordered, and it shrinks
 * to whatever is still there if they are removed.
 */
function findIntegration(k: Knowledge): { m: IndexedModule | undefined; chapter: Chapter | undefined; refs: Ref[] } {
  const m = k.modules.find((x) => x.id === 'mathematics');
  const chapter = m?.chapters.find((c) => /integration/i.test(c.title));
  if (!m || !chapter) return { m, chapter, refs: m ? [moduleRef(m)] : [] };
  const di = chapter.lessons.find((l) => /\bdi method/i.test(l.title));
  const byParts = chapter.lessons.find((l) => l !== di && /integration by parts/i.test(l.title));
  const refs = [
    chapterRef(m, chapter),
    byParts && lessonRef(chapter, byParts, 'Integration by parts'),
    di && lessonRef(chapter, di, 'The DI method'),
  ];
  return { m, chapter, refs: refs.filter(isRef) };
}

/** A distribution's own lesson: in `home` (ST2133) if it has one, else in any module. */
function lessonOn(k: Knowledge, d: Distribution, home: IndexedModule | undefined): Ref | null {
  const found = k.topics.filter((t) => t.l && d.lesson.test(t.l.title));
  const best = found.find((t) => t.m === home) ?? found[0];
  if (!best?.l) return null;
  const label = d.name.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase());
  return best.m === home
    ? lessonRef(best.c, best.l, label)
    : { code: best.m.code ?? best.m.name, label: best.l.title, to: best.l.to };
}

/**
 * "How do I find the MGF?" The MGF of the distribution asked about, in the parameters it is written in; the
 * worked Laplace example (the question from the launch film) only when the Laplace distribution is what was
 * asked about; otherwise the definition, and an honest word that there is no worked example.
 * Where to look: the ST2133 chapter on univariate distributions, the lesson on that distribution, the library.
 */
function aboutTheMgf(k: Knowledge, said: string, photo: boolean): Reply {
  const m = k.modules.find((x) => x.id === 'advanced-stats-distribution');
  const chapter = m?.chapters.find((c) => /univariate/i.test(c.title));
  const d = distributionAsked(said);
  const refs = [
    m && chapter ? chapterRef(m, chapter) : m && moduleRef(m),
    d && lessonOn(k, d, m),
    m &&
      k.isOn('library') && {
        code: 'Library',
        label: `${m.code ?? m.name} notes and past papers`,
        to: `/library?module=${encodeURIComponent(m.id)}`,
      },
  ].filter(isRef);
  // She can't see pictures: she says so before anything else.
  const first = photo ? `${k.script.noPhotos} ` : '';
  if (d?.id === 'laplace')
    return {
      mood: 'happy',
      text: `${first}The MGF of the Laplace distribution, density k·e^(−λ|x|), step by step:`,
      steps: LAPLACE_MGF_STEPS,
      refs,
    };
  if (d?.mgf) return { mood: 'happy', text: `${first}The MGF of ${d.name}:`, formula: d.mgf, refs };
  if (d)
    return {
      mood: 'neutral',
      text: `${first}I don’t have a worked MGF for ${d.name}. Start from the definition, with its probability function or density:`,
      formula: MGF_DEFINITION,
      refs,
    };
  return {
    mood: 'happy',
    text: `${first}Start from the definition, with the distribution’s probability function or density. Tell me which distribution and I’ll show you its MGF.`,
    formula: MGF_DEFINITION,
    refs,
    suggestions: MGF_EXAMPLES,
  };
}

/** The forum's question ("What is this, am I cooked?"): a reduction formula. */
function aboutTheReductionFormula(k: Knowledge): Reply {
  return {
    mood: 'laughing',
    text: 'You’re not cooked 😄 It’s a reduction formula. Integrate by parts once and you get:',
    formula: REDUCTION_FORMULA,
    refs: findIntegration(k).refs,
  };
}

/** Asked about the method itself rather than shown a question: the same places, and the rule. */
function aboutIntegrationByParts(k: Knowledge): Reply {
  const { m, chapter, refs } = findIntegration(k);
  const where = m && chapter ? `${m.code ?? m.name}, Chapter ${chapter.n}` : m ? m.called : 'Mathematical Methods';
  return {
    mood: 'happy',
    text: `Integration by parts is in ${where}. It swaps one integral for an easier one:`,
    formula: BY_PARTS_FORMULA,
    refs,
  };
}

function aboutModule(k: Knowledge, m: IndexedModule, year: number | null): Reply {
  const count = m.chapterCount;
  const intro = `${m.title} is a Year ${m.year} module. ${m.description}`.trim();
  if (!count) {
    // No lessons yet: say so, and point at a chapter another module has under the same name, if there is one.
    const related = findTopics(k, topicWords(m.name).map(stem), m.name.toLowerCase(), year).filter((t) => !t.l);
    return {
      mood: 'happy',
      text: `${intro} There are no video lessons for it yet, but its page has everything shared so far.`,
      refs: [moduleRef(m), ...related.slice(0, 2).map((t) => chapterRef(t.m, t.c))],
    };
  }
  const shown = m.chapters.slice(0, 5);
  const more = count > shown.length;
  const lessons = `${m.lessonCount} ${m.lessonCount === 1 ? 'lesson' : 'lessons'}`;
  return {
    mood: 'happy',
    text: `${intro} It has ${count} ${count === 1 ? 'chapter' : 'chapters'} and ${lessons}${more && shown.length ? '; here are the first five.' : '.'}`,
    refs: [
      moduleRef(m, more ? `All ${count} chapters` : 'Module page'),
      ...shown.map((c) => ({ code: String(c.n), label: c.title, to: c.to })),
    ],
  };
}

function aboutTopic(topics: FoundTopic[], stems: string[]): Reply | null {
  const [best] = topics;
  if (!best) return null;
  const chapter = ownNumbering(best.c) ? best.c.title : `Chapter ${best.c.n}: ${best.c.title}`;
  const others = [
    ...new Set(topics.filter((t) => t.hits === best.hits && t.m !== best.m && t.m.code).map((t) => t.m.code ?? '')),
  ].slice(0, 2);
  let text: string;
  if (best.hits < stems.length) text = `The closest I can find is in ${best.m.called}, ${chapter}.`;
  else if (best.l) text = `There’s a lesson on that in ${best.m.called}: ${best.c.n}.${best.l.n}.`;
  else text = `That’s in ${best.m.called}, ${chapter}.`;
  if (others.length) text += ` ${others.join(' and ')} ${others.length === 1 ? 'covers' : 'cover'} it too.`;
  return { mood: 'happy', text, refs: topicRefs(topics) };
}

/** 'on Friday 23 October, in 18 days' · 'tomorrow, Friday 23 October' · 'today, Friday 23 October' */
function onDay(date: Date, today: Date): string {
  const days = daysBetween(today, date);
  if (days <= 0) return `today, ${formatLongDay(date)}`;
  return days === 1 ? `tomorrow, ${formatLongDay(date)}` : `on ${formatLongDay(date)}, in ${days} days`;
}

/** The next exam (or mock) from the calendar. Placeholder dates (sample: true) are never quoted as real. */
function aboutExams(k: Knowledge, said: string, year: number | null, named: IndexedModule | null, now: number): Reply {
  const today = bahrainToday(now); // the calendar's today
  const what = /\bmocks?\b/.test(said) ? 'mock' : 'exam';
  const whose = named ? named.called : year ? `Year ${year}` : 'the programme';
  if (!k.isOn('calendar')) {
    return {
      mood: 'neutral',
      text: `The Hub’s calendar is switched off right now, so I can’t check the ${what} dates for ${whose}.`,
      refs: named ? [moduleRef(named)] : [],
    };
  }
  const calendar: Ref = {
    code: 'Calendar',
    label: !named && year ? `Year ${year} dates` : 'Every date in one place',
    to: '/calendar',
  };
  if (!k.events) {
    return {
      mood: 'neutral',
      text: `I can’t reach the calendar right now, so I can’t check the ${what} dates for ${whose}. The calendar page has them all.`,
      refs: [calendar],
    };
  }
  // A cohort's own dates plus the ones for everyone; a named module's dates whatever its year.
  const ahead = k.events.filter(
    (e) =>
      e.type === what &&
      eventDate(e) >= today &&
      (named ? e.moduleId === named.id : !year || e.year == null || e.year === year),
  );
  const confirmed = ahead.filter((e) => !e.sample);

  const [next, ...later] = confirmed;
  if (!next) {
    const text = ahead.length
      ? `The next ${what} dates for ${whose} are not confirmed yet. The calendar only has placeholders for now, so keep an eye on it.`
      : `There are no upcoming ${what} dates for ${whose} yet. They will be in the calendar as soon as they are announced.`;
    return { mood: 'neutral', text, refs: [calendar, ...(named ? [moduleRef(named)] : [])] };
  }

  const when = eventDate(next);
  const m = k.modules.find((x) => x.id === next.moduleId);
  const name = m ? m.called : next.title;
  let text = named
    ? `The next ${name} ${what} is ${onDay(when, today)}.`
    : `Your next ${what} is ${name} ${onDay(when, today)}.`;
  const last = later[later.length - 1];
  if (!named && last) {
    const lastDay = formatLongDay(eventDate(last));
    text +=
      later.length === 1 ? ` One more follows on ${lastDay}.` : ` ${later.length} more follow, the last on ${lastDay}.`;
  }
  return {
    mood: 'happy',
    text,
    refs: [
      { ...calendar, code: formatShort(when), to: `/calendar?event=${encodeURIComponent(next.id)}` },
      ...(m ? [moduleRef(m)] : []),
    ],
  };
}

/** Past papers, notes and the like live with each module's files. */
function aboutFiles(k: Knowledge, named: IndexedModule | null): Reply {
  if (!k.isOn('library')) {
    return {
      mood: 'neutral',
      text: 'The Hub’s library is switched off right now. Each module’s page still links to its study guide and past papers.',
      refs: named ? [moduleRef(named)] : [],
    };
  }
  if (named) {
    return {
      mood: 'happy',
      text: `Past papers, notes and guides for ${named.called} are on its page, under Files.`,
      refs: [{ code: named.code ?? named.name, label: 'Files and past papers', to: `${named.to}?tab=files` }],
    };
  }
  return {
    mood: 'happy',
    text: 'Past papers, notes and guides are in the library, and on each module’s page under Files. Tell me the module and I’ll take you there.',
    refs: [{ code: 'Library', label: 'Every file in the Hub', to: '/library' }],
  };
}

// What a message is asking for. They are tested in the order answer() lists them.
const ASKS_TO_CHEAT =
  /\b(do|write|finish|complete|solve) (my|our|the|this|me)\b.*\b(homework|coursework|assignment|essay|problem set|exam|mock|paper)\b|\b(exam|mock|test|homework|coursework|assignment) answers\b|\banswers (to|for) (the |my )?(exam|mock|test|homework|coursework|assignment)\b|\bgive me (the )?answers\b|\bcheat(ing)?\b(?! ?sheet)/;
const ABOUT_MGF = /\bmgfs?\b|\bmoment generating\b|\blaplace\b/;
const THE_FORUM_QUESTION = /\bcooked\b|\bwhat\s?i?s this\b|\breduction formula/;
const BY_PARTS = /\bby parts\b|\bdi method\b/;
const ABOUT_FILES =
  /\b(past|previous|old)\s+(exam\s+)?(papers?|exams?)\b|\bcheat\s?sheets?\b|\bstudy guides?\b|\bnotes\b/;
const ABOUT_EXAMS = /\b(exams?|mocks?|finals)\b/;
const SAYS_THANKS = /^(many |ok |okay |great |nice |cool )?(thanks|thank you|thx|cheers|shukran|appreciate)/;
const SAYS_HELLO =
  /^(hi|hello|hey|heya|hiya|salam|marhaba|good (morning|afternoon|evening))( there| noora| mini noora)?$/;
const ASKS_WHO =
  /\bwho are you\b|\bwhat are you\b|\bwhat can you do\b|\bwhat do you do\b|\bhow do (you|i) (work|use)\b|^help( me)?$/;

/** A module by name, a topic inside one, or a topic anywhere; null when nothing in the material matches. */
function lookUp(k: Knowledge, text: string, said: string, year: number | null): Reply | null {
  const stems = topicWords(said).map(stem);
  const named = findModule(k, text, stems, year);
  if (named && named.sure) {
    const rest = stems.filter((w) => !named.used.includes(w));
    if (!rest.length) return aboutModule(k, named.module, year);
    const inside = findTopics(k, rest, '', year, named.module);
    const found = aboutTopic(inside, rest);
    if (found) return found;
  }
  const topics = findTopics(k, stems, topicWords(said).join(' '), year);
  const found = aboutTopic(topics, stems);
  if (found) return found;
  // Nothing more specific: a module whose name is all that was said is still an answer.
  if (named && named.used.length === stems.length) return aboutModule(k, named.module, year);
  // A module and a topic it doesn't list: not the module's summary (that reads as a misunderstanding, ST-69), but
  // that she can't explain it from her script, and the module's page to look in.
  if (named && named.sure) {
    return {
      mood: 'sad',
      text: `${k.script.notFound} ${withoutAi(k)}`,
      refs: [moduleRef(named.module, `${named.module.called} lessons`)],
      suggestions: k.script.tryInstead,
    };
  }
  return null;
}

/** What she says when her script can't answer: that only her AI explains topics, and what she can do instead. */
function withoutAi(k: Knowledge): string {
  return k.name === null
    ? 'From my script I can’t explain topics: sign in for my AI answers. I can still find where a topic is taught, say what’s in a module or check exam dates.'
    : 'My AI answers are off right now, and from my script I can’t explain topics. I can still find where a topic is taught, say what’s in a module or check exam dates.';
}

/** Answer one message. `now` is the time, for exam countdowns. */
export function answer({ text, attachments, year }: Question, k: Knowledge, now: number = Date.now()): Reply {
  const { script } = k;
  // She can't see pictures: a photo is answered by the words that came with it (and its file name), and she says so.
  const photo = attachments.some((a) => a.kind === 'image');
  const said = wordsOf(text).join(' ');
  const withNames = wordsOf([text, ...attachments.map((a) => a.name.replace(/\.[a-z0-9]+$/i, ''))].join(' ')).join(' ');
  const honest = (r: Reply): Reply =>
    photo ? { ...r, text: `${script.noPhotos} Going by your message: ${r.text}` } : r;
  const named = (): IndexedModule | null => {
    const found = findModule(k, text, topicWords(said).map(stem), year);
    return found && found.sure ? found.module : null;
  };

  if (ASKS_TO_CHEAT.test(said)) {
    const found = BY_PARTS.test(said) ? aboutIntegrationByParts(k) : lookUp(k, text, said, year);
    const refs = found ? found.refs.slice(0, 4) : [];
    return { mood: 'angry', text: `${script.refusal}${refs.length ? '' : ' Tell me the topic.'}`, refs };
  }
  if (ABOUT_MGF.test(photo ? withNames : said)) return aboutTheMgf(k, photo ? withNames : said, photo);
  if (THE_FORUM_QUESTION.test(said)) return honest(aboutTheReductionFormula(k));
  if (BY_PARTS.test(said)) return honest(aboutIntegrationByParts(k));
  if (SAYS_THANKS.test(said)) return { mood: 'laughing', text: script.thanks, refs: [] };
  if (ABOUT_FILES.test(said)) return honest(aboutFiles(k, named()));
  if (ABOUT_EXAMS.test(said)) return honest(aboutExams(k, said, year, named(), now));

  const found = lookUp(k, text, said, year);
  if (found) return honest(found);

  if (photo) {
    return {
      mood: 'neutral',
      text: `${script.noPhotos} ${script.photoAsk}`,
      refs: [],
      suggestions: script.tryInstead.slice(0, 2),
    };
  }
  if (SAYS_HELLO.test(said)) {
    return {
      mood: 'wave',
      text: `${hello(k.name)} ${script.greeting}`,
      refs: [],
      suggestions: script.greetingChips.slice(0, 3),
    };
  }
  if (ASKS_WHO.test(said)) {
    return { mood: 'wave', text: script.who, refs: [], suggestions: script.greetingChips.slice(0, 3) };
  }

  if (attachments.length) {
    // A file she cannot open. Its name often says what it is ("ST2133-past-paper.pdf"), so go by that.
    const names = attachments.map((a) => a.name.replace(/\.[a-z0-9]+$/i, '')).join(' ');
    const guess = lookUp(k, names, wordsOf(names).join(' '), year);
    if (guess) return { mood: 'happy', text: script.fileGuess, refs: guess.refs.slice(0, 4) };
    return { mood: 'neutral', text: script.fileUnknown, refs: [], suggestions: script.tryInstead.slice(0, 2) };
  }
  return { mood: 'sad', text: `${script.notFound} ${withoutAi(k)}`, refs: [], suggestions: script.tryInstead };
}
