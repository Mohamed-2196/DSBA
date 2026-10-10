// Mini Noora's "brain". It is a script, not a mind: it looks the student's words up in the Hub's own
// module list (src/data/modules.js: every module, chapter and lesson) and calendar, and answers with
// where to look. Everything here is a pure function of its arguments: no network, no storage, no React.
//
//   answer({ text, attachments, year, now }) → { mood, text, formula?, steps?, refs, suggestions? }
//     mood         how she says it: 'happy' | 'laughing' | 'angry' | 'sad' | 'wave' | 'neutral'
//     text         one or two short sentences
//     formula      { say, line, note? }: a formula as plain data, set as real maths by Formula.jsx
//     steps        [{ label, line, say, result? }]: a worked solution, one numbered card per step
//     refs         [{ code, label, to }]: the "Where to look" links (`to` is a route in the app)
//     suggestions  questions to offer as chips
import { MODULES, getModuleStats } from '../../data/modules';
import { videoTitle } from '../../data/videoTitles';
import { eventDate, getEventsForYear } from '../../data/calendar';
import { CURRENT_USER } from '../../data/people';
// The modules feature owns the address of a lesson. Using its helper means these links cannot drift.
import { lessonHref } from '../modules/lessons';

// ── The index: every module, chapter and titled lesson, with its link (built once) ────────────────
const INDEX = MODULES.map((m) => ({
  id: m.id,
  code: m.unitCode || null,
  name: m.name,
  // What a module is called in full, and inside a sentence: "ST2134 Statistical inference".
  title: m.unitCode ? `${m.unitCode} ${m.name}` : m.name,
  called: m.unitCode ? `${m.unitCode} ${m.shortName}` : m.name,
  year: m.year,
  description: m.description,
  lessonCount: getModuleStats(m).videos,
  to: `/modules/${m.id}`,
  // Every name it goes by, in lower case ("maths", "stats" and "metrics" are what students type).
  names: [m.name, m.shortName, /mathemat/i.test(m.name) ? 'maths' : '', /statistic/i.test(m.name) ? 'stats' : '', /econometric/i.test(m.name) ? 'metrics' : '']
    .filter(Boolean)
    .map((s) => s.toLowerCase()),
  chapters: m.chapters.map((c, ci) => ({
    n: ci + 1,
    title: c.title,
    to: lessonHref(m.id, ci, 0),
    // Lessons we know the real title of (class recordings and playlists have none to search).
    lessons: c.videos.map((video, vi) => ({ n: vi + 1, title: videoTitle(video), to: lessonHref(m.id, ci, vi) })).filter((l) => l.title),
  })),
}));


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

const ODD_PLURALS = { matrix: 'matr', matrices: 'matr', maths: 'math', analyses: 'analys' };
const ENDINGS = ['isations', 'izations', 'isation', 'ization', 'ations', 'ation', 'ices', 'ings', 'ions', 'ing', 'ion', 'ies', 'es', 'ed', 'al', 's'];

/** The start of a word that its other forms share: 'testing' and 'tests' → 'test', 'matrices' → 'matr'. */
function stem(word) {
  if (ODD_PLURALS[word]) return ODD_PLURALS[word];
  for (const end of ENDINGS) if (word.endsWith(end) && word.length - end.length >= 4) return word.slice(0, -end.length);
  return word;
}

/** A question as plain lower-case words ("What's in ST2133?" → ['whats', 'in', 'st2133']). */
function wordsOf(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The words worth looking up: no filler, no bare numbers, no single letters. */
function topicWords(text) {
  return wordsOf(text).filter((w) => w.length > 1 && !FILLER.has(w) && !/^\d+$/.test(w));
}

/** How many words a title has once the filler is gone ("Introduction to Macroeconomics" has one). */
const sizeOf = (title) => wordsOf(title).filter((w) => !FILLER.has(w)).length;

/** Everything a topic can be found in: chapters, and lessons (which also answer to their chapter's words). */
const TOPICS = INDEX.flatMap((m) =>
  m.chapters.flatMap((c) => [
    { m, c, l: null, title: c.title.toLowerCase(), around: '', size: sizeOf(c.title) },
    ...c.lessons.map((l) => ({ m, c, l, title: l.title.toLowerCase(), around: c.title.toLowerCase(), size: sizeOf(l.title) })),
  ]),
);

// What a title word may add to a short query word and still be the same word: 'test' finds 'testing',
// but 'life' does not find 'lifecycle'. (Longer query words are specific enough to match as they are.)
const SAME_WORD = /^(s|es|ed|ing|ings|ion|ions|al|e|y|ies|ix|ices|ity|ic|ics|ical|ation|ations|ate|ated|ating|ator|ators|er|ers|ive|ives)?$/;

/**
 * How well a query word sits in a title: 2 if the title starts with it, 1 if one of its words does,
 * 0 if neither. The command palette ranks the same way (src/features/search/match.js); here a word
 * must begin a word, so "art" does not find "parts".
 */
function hit(title, word) {
  let i = title.indexOf(word);
  while (i >= 0) {
    const startsWord = i === 0 || !/[a-z0-9]/.test(title[i - 1]);
    if (startsWord && (word.length > 4 || SAME_WORD.test(/^[a-z0-9]*/.exec(title.slice(i + word.length))[0]))) return i === 0 ? 2 : 1;
    i = title.indexOf(word, i + 1);
  }
  return 0;
}

// ── Finding things ────────────────────────────────────────────────────────────────────────────────
/**
 * The module a question names, if any: { module, used, sure }.
 * used: the query words that named it. sure: it was named outright (its code, or every word of one of
 * its names), not just brushed by a word such as "distribution".
 */
function findModule(text, stems, year) {
  const code = String(text).toUpperCase().match(/\b[A-Z]{2}\d{4}\b/);
  const byCode = code && INDEX.find((m) => m.code === code[0]);
  if (byCode) return { module: byCode, used: [code[0].toLowerCase()], sure: true };

  let best = null;
  for (const m of INDEX) {
    const used = stems.filter((w) => m.names.some((name) => hit(name, w)));
    if (!used.length) continue;
    const sure = m.names.some((name) => topicWords(name).every((part) => stems.some((w) => hit(part, w))));
    const score = used.length * 100 + (sure ? 50 : 0) + (m.year === year ? 12 : 0);
    if (!best || score > best.score) best = { module: m, used, sure, score };
  }
  return best;
}

/**
 * Chapters and lessons for some words, best first: [{ m, c, l, hits }]. A result is kept only if it
 * has (nearly) all the words, so one stray match is not passed off as an answer. Equal matches stay
 * in syllabus order. `inside`: look in this module only.
 */
function findTopics(stems, phrase, year, inside = null) {
  if (!stems.length) return [];
  const found = [];
  TOPICS.forEach((t, order) => {
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
    if (inTitle === stems.length && t.size === stems.length) score += 100; // the title is just what was asked, no more
    else if (phrase.includes(' ') && t.title.includes(phrase)) score += 40; // the words appear together
    if (!t.l) score += 20; // a chapter is a better place to send someone than one video in it
    if (year && t.m.year === year) score += 12; // ties go to the student's own year
    found.push({ ...t, hits: inTitle + nearby, score, order });
  });
  const needed = stems.length <= 2 ? stems.length : Math.ceil(stems.length * 0.6);
  return found.filter((t) => t.hits >= needed).sort((a, b) => b.hits - a.hits || b.score - a.score || a.order - b.order);
}

// ── References ────────────────────────────────────────────────────────────────────────────────────
// A chapter that brings its own numbering ("Block 10: Hypothesis Testing") keeps it.
const ownNumbering = (c) => /^block \d/i.test(c.title);
const chapterRef = (m, c) => ({ code: m.code || m.name, label: ownNumbering(c) ? c.title : `Chapter ${c.n} · ${c.title}`, to: c.to });
const lessonRef = (c, l, label = l.title) => ({ code: `${c.n}.${l.n}`, label, to: l.to });
const moduleRef = (m, label = m.code ? m.name : 'Module page') => ({ code: m.code || m.name, label, to: m.to });

/** Up to four references for a ranked list of topics: the best chapter first, then what else matched as well. */
function topicRefs(topics) {
  const [best] = topics;
  const refs = [chapterRef(best.m, best.c)];
  const seen = new Set([`${best.m.id}/${best.c.n}`]);
  for (const t of topics) {
    if (refs.length >= 4 || t.hits < best.hits) break;
    // Lessons are numbered within the best match's module ("4.5"); other modules are named by their chapter.
    const asLesson = t.l && t.m === best.m;
    const key = `${t.m.id}/${t.c.n}${asLesson ? `.${t.l.n}` : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(asLesson ? lessonRef(t.c, t.l) : chapterRef(t.m, t.c));
  }
  return refs;
}

// ── Formulas (plain data: strings are set upright, v() is a variable in italics) ──────────────────
const v = (name) => ({ v: name });
const sub = (name, ...below) => ({ v: name, sub: below });
const pow = (name, ...above) => ({ v: name, sup: above });
const frac = (top, bottom) => ({ top, bottom });
const n = v('n');

const REDUCTION_FORMULA = {
  say: 'I n equals n minus 1 over n, times I n minus 2. So I 2 equals pi over 4, and I 3 equals 2 over 3.',
  line: [sub('I', n), ' = ', frac([n, ' − 1'], [n]), ' ', sub('I', n, '−2')],
  note: ['so ', sub('I', '2'), ' = π/4 and ', sub('I', '3'), ' = 2/3'],
};

// The moment generating function of the Laplace distribution with density k·e^(−λ|x|), worked in three steps.
// (int(lower, upper) is an integral sign with its limits, big() a tall bracket.)
const int = (lower, upper) => ({ int: [lower, upper] });
const big = (bracket) => ({ big: bracket });
const half = frac(['λ'], ['2']);
const mgf = [sub('M', v('X')), '(', v('t'), ')'];
const LAPLACE_MGF_STEPS = [
  {
    label: ['With ', v('k'), ' = λ/2 from (a), split at ', v('x'), ' = 0'],
    say: 'M X of t equals lambda over 2, times the integral from minus infinity to 0 of e to the lambda plus t, x, plus the integral from 0 to infinity of e to the minus lambda minus t, x.',
    line: [...mgf, ' = ', half, big('['), int('−∞', '0'), pow('e', '(λ+', v('t'), ')', v('x')), ' ', v('dx'), ' + ', int('0', '∞'), pow('e', '−(λ−', v('t'), ')', v('x')), ' ', v('dx'), big(']')],
  },
  {
    label: ['Integrate each piece, for |', v('t'), '| < λ'],
    say: 'That equals lambda over 2, times 1 over lambda plus t, plus 1 over lambda minus t.',
    line: ['= ', half, big('['), frac(['1'], ['λ + ', v('t')]), ' + ', frac(['1'], ['λ − ', v('t')]), big(']')],
  },
  {
    label: ['Add the two fractions'],
    say: 'So M X of t equals lambda squared over lambda squared minus t squared.',
    line: [...mgf, ' = ', frac([pow('λ', '2')], [pow('λ', '2'), ' − ', pow('t', '2')])],
    result: true,
  },
];

const BY_PARTS_FORMULA = {
  say: 'The integral of u d v equals u v, minus the integral of v d u.',
  line: ['∫ ', v('u'), ' d', v('v'), ' = ', v('u'), v('v'), ' − ∫ ', v('v'), ' d', v('u')],
};

// ── Answers ───────────────────────────────────────────────────────────────────────────────────────
const SUGGESTIONS = ['How do I find the MGF?', 'Where is integration by parts?', 'What’s in ST2133?', 'When is my next exam?'];
const TRY_INSTEAD = ['Where is hypothesis testing?', 'What’s in ST2133?', 'When is my next exam?'];

const firstName = () => String(CURRENT_USER.name || '').split(' ')[0] || 'there';

/** What she says when the chat opens. */
export function greeting() {
  return { mood: 'wave', text: `Hi ${firstName()}! Ask me about any module, or drop in a photo of a question.`, refs: [], suggestions: SUGGESTIONS };
}

/**
 * Where integration by parts is taught: Mathematical Methods, its chapter on integration, and that
 * chapter's two lessons on the method. Looked up by name, so it follows the data if chapters are
 * ever reordered, and it shrinks to whatever is still there if they are removed.
 * @returns {{ m, chapter, refs }}  m and chapter are undefined when the data no longer has them
 */
function findIntegration() {
  const m = INDEX.find((x) => x.id === 'mathematics');
  const chapter = m && m.chapters.find((c) => /integration/i.test(c.title));
  if (!chapter) return { m, chapter, refs: m ? [moduleRef(m)] : [] };
  const di = chapter.lessons.find((l) => /\bdi method/i.test(l.title));
  const byParts = chapter.lessons.find((l) => l !== di && /integration by parts/i.test(l.title));
  const refs = [
    chapterRef(m, chapter),
    byParts && lessonRef(chapter, byParts, 'Integration by parts'),
    di && lessonRef(chapter, di, 'The DI method'),
  ];
  return { m, chapter, refs: refs.filter(Boolean) };
}

/**
 * The question from the launch film: a photo of a problem on the Laplace distribution, and "How do I find
 * the MGF?". The places are looked up by name (the chapter on univariate distributions in ST2133 and its
 * lesson on the exponential distribution), plus the table of continuous distributions in the library.
 */
function aboutTheMgf() {
  const m = INDEX.find((x) => x.id === 'advanced-stats-distribution');
  const chapter = m && m.chapters.find((c) => /univariate/i.test(c.title));
  const exponential = chapter && chapter.lessons.find((l) => /exponential distribution/i.test(l.title));
  const refs = [
    chapter ? chapterRef(m, chapter) : m && moduleRef(m),
    exponential && lessonRef(chapter, exponential, 'The exponential distribution'),
    { code: 'Library', label: 'Common continuous distributions', to: '/library/st2133-common-continuous-distributions' },
  ];
  return {
    mood: 'happy',
    text: 'Here’s how, step by step:',
    steps: LAPLACE_MGF_STEPS,
    refs: refs.filter(Boolean),
  };
}

/** The forum's question ("What is this, am I cooked?"): a reduction formula. */
function aboutTheReductionFormula() {
  return {
    mood: 'laughing',
    text: 'You’re not cooked 😄 It’s a reduction formula. Integrate by parts once and you get:',
    formula: REDUCTION_FORMULA,
    refs: findIntegration().refs,
  };
}

/** Asked about the method itself rather than shown a question: the same places, and the rule. */
function aboutIntegrationByParts() {
  const { m, chapter, refs } = findIntegration();
  const where = chapter ? `${m.code}, Chapter ${chapter.n}` : m ? m.called : 'Mathematical Methods';
  return { mood: 'happy', text: `Integration by parts is in ${where}. It swaps one integral for an easier one:`, formula: BY_PARTS_FORMULA, refs };
}

function aboutModule(m, year) {
  const count = m.chapters.length;
  const intro = `${m.title} is a Year ${m.year} module. ${m.description}`;
  if (!count) {
    // No lessons yet: say so, and point at a chapter another module has under the same name, if there is one.
    const related = findTopics(topicWords(m.name).map(stem), m.name.toLowerCase(), year).filter((t) => !t.l);
    return {
      mood: 'happy',
      text: `${intro} There are no video lessons for it yet, but its page has everything shared so far.`,
      refs: [moduleRef(m), ...related.slice(0, 2).map((t) => chapterRef(t.m, t.c))],
    };
  }
  const shown = m.chapters.slice(0, 5);
  const more = count > shown.length;
  return {
    mood: 'happy',
    text: `${intro} It has ${count} ${count === 1 ? 'chapter' : 'chapters'} and ${m.lessonCount} lessons${more ? '; here are the first five.' : '.'}`,
    refs: [moduleRef(m, more ? `All ${count} chapters` : 'Module page'), ...shown.map((c) => ({ code: String(c.n), label: c.title, to: c.to }))],
  };
}

function aboutTopic(topics, stems) {
  const [best] = topics;
  const chapter = ownNumbering(best.c) ? best.c.title : `Chapter ${best.c.n}: ${best.c.title}`;
  const others = [...new Set(topics.filter((t) => t.hits === best.hits && t.m !== best.m && t.m.code).map((t) => t.m.code))].slice(0, 2);
  let text;
  if (best.hits < stems.length) text = `The closest I can find is in ${best.m.called}, ${chapter}.`;
  else if (best.l) text = `There’s a lesson on that in ${best.m.called}: ${best.c.n}.${best.l.n}.`;
  else text = `That’s in ${best.m.called}, ${chapter}.`;
  if (others.length) text += ` ${others.join(' and ')} ${others.length === 1 ? 'covers' : 'cover'} it too.`;
  return { mood: 'happy', text, refs: topicRefs(topics) };
}

// Dates, written the way the calendar writes them: always with the weekday, and built by hand so
// that no locale turns September into 'Sept'.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const shortDay = (d) => `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;

/** 'on Friday 23 October, in 18 days' · 'tomorrow, Friday 23 October' · 'today, Friday 23 October' */
function onDay(date, today) {
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return `today, ${longDay(date)}`;
  return days === 1 ? `tomorrow, ${longDay(date)}` : `on ${longDay(date)}, in ${days} days`;
}

/** The next exam (or mock) from the calendar. Placeholder dates (sample: true) are never quoted as real. */
function aboutExams(said, year, named, now) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const what = /\bmocks?\b/.test(said) ? 'mock' : 'exam';
  const ahead = getEventsForYear(named ? null : year).filter((e) => e.type === what && eventDate(e) >= today && (!named || e.moduleId === named.id));
  const confirmed = ahead.filter((e) => !e.sample);
  const whose = named ? named.called : year ? `Year ${year}` : 'the programme';
  const calendar = { code: 'Calendar', label: !named && year ? `Year ${year} dates` : 'Every date in one place', to: '/calendar' };

  if (!confirmed.length) {
    const text = ahead.length
      ? `The next ${what} dates for ${whose} are not confirmed yet. The calendar only has placeholders for now, so keep an eye on it.`
      : `There are no upcoming ${what} dates for ${whose} yet. They will be in the calendar as soon as they are announced.`;
    return { mood: 'neutral', text, refs: [calendar, ...(named ? [moduleRef(named)] : [])] };
  }

  const [next, ...later] = confirmed;
  const when = eventDate(next);
  const m = INDEX.find((x) => x.id === next.moduleId);
  const name = m ? m.called : next.title;
  let text = named ? `The next ${name} ${what} is ${onDay(when, today)}.` : `Your next ${what} is ${name} ${onDay(when, today)}.`;
  if (!named && later.length) {
    const last = longDay(eventDate(later[later.length - 1]));
    text += later.length === 1 ? ` One more follows on ${last}.` : ` ${later.length} more follow, the last on ${last}.`;
  }
  return { mood: 'happy', text, refs: [{ ...calendar, code: shortDay(when) }, ...(m ? [moduleRef(m)] : [])] };
}

/** Past papers, notes and the like live with each module's files. */
function aboutFiles(named) {
  if (named) {
    return {
      mood: 'happy',
      text: `Past papers, notes and guides for ${named.called} are on its page, under Files.`,
      refs: [{ code: named.code || named.name, label: 'Files and past papers', to: `${named.to}?tab=files` }],
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
const THE_FILM_QUESTION = /\bmgfs?\b|\bmoment generating\b|\blaplace\b/;
const THE_FORUM_QUESTION = /\bcooked\b|\bwhat\s?i?s this\b|\breduction formula/;
const BY_PARTS = /\bby parts\b|\bdi method\b/;
const ABOUT_FILES = /\b(past|previous|old)\s+(exam\s+)?(papers?|exams?)\b|\bcheat\s?sheets?\b|\bstudy guides?\b|\bnotes\b/;
const ABOUT_EXAMS = /\b(exams?|mocks?|finals)\b/;
const SAYS_THANKS = /^(many |ok |okay |great |nice |cool )?(thanks|thank you|thx|cheers|shukran|appreciate)/;
const SAYS_HELLO = /^(hi|hello|hey|heya|hiya|salam|marhaba|good (morning|afternoon|evening))( there| noora| mini noora)?$/;
const ASKS_WHO = /\bwho are you\b|\bwhat are you\b|\bwhat can you do\b|\bwhat do you do\b|\bhow do (you|i) (work|use)\b|^help( me)?$/;

/** A module by name, a topic inside one, or a topic anywhere; null when nothing in the material matches. */
function lookUp(text, said, year) {
  const stems = topicWords(said).map(stem);
  const named = findModule(text, stems, year);
  if (named && named.sure) {
    const rest = stems.filter((w) => !named.used.includes(w));
    if (!rest.length) return aboutModule(named.module, year);
    const inside = findTopics(rest, '', year, named.module);
    if (inside.length) return aboutTopic(inside, rest);
  }
  const topics = findTopics(stems, topicWords(said).join(' '), year);
  if (topics.length) return aboutTopic(topics, stems);
  // Nothing more specific: a module that was named, or whose name is all that was said, is still an answer.
  if (named && (named.sure || named.used.length === stems.length)) return aboutModule(named.module, year);
  return null;
}

/**
 * Answer one message.
 * @param {string} text         what the student typed
 * @param {Array<{ kind: 'image'|'file', name: string }>} attachments
 * @param {1|2|3|null} year     the year they are browsing (breaks ties, picks the exam calendar)
 * @param {number} now          the time, for exam countdowns (defaults to Date.now())
 */
export function answer({ text = '', attachments = [], year = null, now = Date.now() } = {}) {
  // A photo of a question: the one from the launch film.
  if (attachments.some((a) => a.kind === 'image')) return aboutTheMgf();

  const said = wordsOf(text).join(' ');
  const named = () => {
    const found = findModule(text, topicWords(said).map(stem), year);
    return found && found.sure ? found.module : null;
  };

  if (ASKS_TO_CHEAT.test(said)) {
    const found = BY_PARTS.test(said) ? aboutIntegrationByParts() : lookUp(text, said, year);
    const refs = found ? found.refs.slice(0, 4) : [];
    return { mood: 'angry', text: `Nice try 😤 I won’t do it for you, but I’ll show you where it’s taught.${refs.length ? '' : ' Tell me the topic.'}`, refs };
  }
  if (THE_FILM_QUESTION.test(said)) return aboutTheMgf();
  if (THE_FORUM_QUESTION.test(said)) return aboutTheReductionFormula();
  if (BY_PARTS.test(said)) return aboutIntegrationByParts();
  if (SAYS_THANKS.test(said)) return { mood: 'laughing', text: 'Any time 😄 Good luck with the revision!', refs: [] };
  if (ABOUT_FILES.test(said)) return aboutFiles(named());
  if (ABOUT_EXAMS.test(said)) return aboutExams(said, year, named(), now);

  const found = lookUp(text, said, year);
  if (found) return found;

  if (SAYS_HELLO.test(said)) {
    return { mood: 'wave', text: `Hi ${firstName()}! Ask me where a topic is taught, what’s in a module, or when your next exam is.`, refs: [], suggestions: SUGGESTIONS.slice(0, 3) };
  }
  if (ASKS_WHO.test(said)) {
    return {
      mood: 'wave',
      text: 'I’m Mini Noora, the Hub’s study helper. I can find the chapter or lesson for a topic, tell you what’s in a module, check your exam dates, and read a photo of a question.',
      refs: [],
      suggestions: SUGGESTIONS.slice(0, 3),
    };
  }

  if (attachments.length) {
    // A file she cannot open. Its name often says what it is ("ST2133-past-paper.pdf"), so go by that.
    const names = attachments.map((a) => String(a.name || '').replace(/\.[a-z0-9]+$/i, '')).join(' ');
    const guess = lookUp(names, wordsOf(names).join(' '), year);
    if (guess) return { mood: 'happy', text: 'I can’t open files in this preview, but going by the name, this is where I’d look.', refs: guess.refs.slice(0, 4) };
    return { mood: 'neutral', text: 'I can only read photos of questions in this preview, not whole files. Tell me the topic and I’ll find the chapter.', refs: [], suggestions: TRY_INSTEAD.slice(0, 2) };
  }
  return { mood: 'sad', text: 'I couldn’t find that in the DSBA material yet.', refs: [], suggestions: TRY_INSTEAD };
}
