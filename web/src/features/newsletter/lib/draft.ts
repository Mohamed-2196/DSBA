// The newsletter editor's model (decision D5: student reps edit an issue with fields, not JSON). Pure functions over
// a draft: built from the API's IssueDetail, turned back into the IssueUpdate the API takes, checked against the
// API's own limits (api/app/schemas/newsletter.py), edited by small immutable operations the form calls, and the
// API's 422 field paths ('sections.2.blocks.0.cta.to') mapped back onto the field that caused them.
//
// Every list item in a draft carries a `key`, so React keeps focus and state while items move and errors stay on
// the right field. Keys never reach the API.
import type { IssueCover, IssueDetail, IssueSection, IssueUpdate } from '../../../api/types';
import { addDaysToKey, isDayKey } from '../../../lib/dates';
import type { Aside, Block, SectionIcon, SectionKind } from '../types';
import { isPicture } from '../../../api/pictures';
import { linkProblem, markupProblem } from './links';
import { slugify } from './text';

/** What the API accepts (api/app/schemas/newsletter.py and services/newsletter.py). */
export const LIMITS = {
  title: 160,
  slug: 80,
  number: 100_000,
  standfirst: 2000,
  editors: 12,
  editor: 80,
  sections: 40,
  sectionId: 64,
  heading: 160,
  label: 40,
  coverText: 60,
  coverLines: 5,
  coverLinesWithArt: 3,
  paragraph: 4000,
  item: 1000,
  items: 30,
  line: 120,
  short: 300,
  blocks: 40,
  after: 10,
  statValue: 24,
  pollAnswer: 80,
  pollAnswers: 5,
  stats: 8,
  alt: 500,
  artAlt: 300,
  issueBytes: 256 * 1024,
} as const;

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ── The draft ────────────────────────────────────────────────────────────────────────────────────

export interface ItemDraft {
  key: string;
  text: string;
}

export type BlockDraft =
  | { key: string; type: 'p'; text: string; lead: boolean }
  | { key: string; type: 'list'; items: ItemDraft[] }
  | { key: string; type: 'signoff'; text: string }
  | { key: string; type: 'cta'; label: string; to: string }
  /** `id` keeps the poll's votes: it never changes once the block exists */
  | { key: string; type: 'poll'; id: string; question: string; answers: ItemDraft[]; closed: boolean };

export type BlockKind = BlockDraft['type'];

/** What sits beside a section's copy: nothing, a picture, a card or a few numbers (one at a time). */
export type Beside = 'none' | 'figure' | 'card' | 'stats';

export interface FigureDraft {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
}

export interface CardDraft {
  kicker: string;
  title: string;
  text: string;
  wide: boolean;
}

export interface StatDraft {
  key: string;
  value: string;
  label: string;
}

export interface StatsDraft {
  title: string;
  items: StatDraft[];
  foot: string;
  wide: boolean;
}

export interface SectionDraft {
  key: string;
  /** the ?section= link and the key of the section's reactions */
  id: string;
  /** added in this session: its id follows its headline until the rep sets one */
  isNew: boolean;
  idTouched: boolean;
  title: string;
  /** '' = none (the reader shows the headline beside the icon) */
  label: string;
  icon: SectionIcon | null;
  /** null: a story */
  kind: SectionKind | null;
  blocks: BlockDraft[];
  /** after a live section's list (and at the end of a story) */
  after: BlockDraft[];
  beside: Beside;
  // Kept while another choice is shown, so switching back loses nothing.
  figure: FigureDraft;
  card: CardDraft;
  stats: StatsDraft;
  /** deadlines: the dates listed ('' = open) */
  window: { from: string; to: string };
  /** forum, library and requests: what they say when there is nothing to list */
  fallback: { title: string; text: string };
  /** words the live list adds to the read time */
  estWords: number | null;
}

export interface CoverLineDraft {
  key: string;
  /** the id of the section it points to */
  section: string;
  text: string;
}

export interface IssueDraft {
  title: string;
  number: string;
  date: string;
  slug: string;
  dek: string;
  summary: string;
  /** names separated by commas */
  editors: string;
  /** artAlt: the illustration described for people who can't see it */
  cover: { tone: IssueCover['tone']; art: string | null; artAlt: string; lines: CoverLineDraft[] };
  sections: SectionDraft[];
}

let made = 0;
/** A key for a new item in a draft (unique for the life of the page). */
export const newKey = (prefix = 'k'): string => `${prefix}${(made += 1)}`;

const emptyFigure = (): FigureDraft => ({ src: '', width: 0, height: 0, alt: '', caption: '' });
const emptyCard = (): CardDraft => ({ kicker: '', title: '', text: '', wide: false });
const emptyStats = (): StatsDraft => ({
  title: '',
  items: [{ key: newKey('st'), value: '', label: '' }],
  foot: '',
  wide: false,
});

function blockDraft(b: Block): BlockDraft {
  switch (b.type) {
    case 'p':
      return { key: newKey('b'), type: 'p', text: b.text, lead: b.lead };
    case 'list':
      return { key: newKey('b'), type: 'list', items: b.items.map((text) => ({ key: newKey('i'), text })) };
    case 'signoff':
      return { key: newKey('b'), type: 'signoff', text: b.text };
    case 'cta':
      return { key: newKey('b'), type: 'cta', label: b.label, to: b.to };
    case 'poll':
      return {
        key: newKey('b'),
        type: 'poll',
        id: b.id,
        question: b.question,
        answers: b.answers.map((text) => ({ key: newKey('i'), text })),
        closed: b.closed,
      };
  }
}

function besideOf(s: IssueSection): Beside {
  if (s.figure) return 'figure';
  return s.aside?.type ?? 'none';
}

function sectionDraft(s: IssueSection): SectionDraft {
  const aside: Aside | null | undefined = s.aside;
  return {
    key: newKey('s'),
    id: s.id,
    isNew: false,
    idTouched: false,
    title: s.title,
    label: s.label ?? '',
    icon: s.icon ?? null,
    kind: s.kind ?? null,
    blocks: s.blocks.map(blockDraft),
    after: s.after.map(blockDraft),
    beside: besideOf(s),
    figure: s.figure
      ? {
          src: s.figure.src,
          width: s.figure.width,
          height: s.figure.height,
          alt: s.figure.alt,
          caption: s.figure.caption ?? '',
        }
      : emptyFigure(),
    card:
      aside?.type === 'card'
        ? { kicker: aside.kicker, title: aside.title, text: aside.text, wide: aside.wide }
        : emptyCard(),
    stats:
      aside?.type === 'stats'
        ? {
            title: aside.title,
            items: aside.items.map((i) => ({ key: newKey('st'), value: i.value, label: i.label })),
            foot: aside.foot ?? '',
            wide: aside.wide,
          }
        : emptyStats(),
    window: { from: s.window?.from ?? '', to: s.window?.to ?? '' },
    fallback: { title: s.fallback?.title ?? '', text: s.fallback?.text ?? '' },
    estWords: s.estWords ?? null,
  };
}

export type IssueContent = Pick<
  IssueDetail,
  'title' | 'number' | 'date' | 'slug' | 'dek' | 'summary' | 'editors' | 'cover' | 'sections'
>;

/** A draft of an issue as the API has it. */
export function draftFrom(issue: IssueContent): IssueDraft {
  return {
    title: issue.title,
    number: String(issue.number),
    date: issue.date,
    slug: issue.slug,
    dek: issue.dek,
    summary: issue.summary,
    editors: issue.editors.join(', '),
    cover: {
      tone: issue.cover.tone,
      art: issue.cover.art ?? null,
      artAlt: issue.cover.artAlt ?? '',
      lines: issue.cover.lines.map((l) => ({ key: newKey('c'), section: l.section, text: l.text })),
    },
    sections: issue.sections.map(sectionDraft),
  };
}

// ── Back to the API ──────────────────────────────────────────────────────────────────────────────

/** The editors' names: the comma-separated field, without empty entries. */
export const editorNames = (text: string): string[] =>
  text
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

function blockPayload(b: BlockDraft): Block {
  switch (b.type) {
    case 'p':
      return { type: 'p', text: b.text.trim(), lead: b.lead };
    case 'list':
      return { type: 'list', items: b.items.map((i) => i.text.trim()) };
    case 'signoff':
      return { type: 'signoff', text: b.text.trim() };
    case 'cta':
      return { type: 'cta', label: b.label.trim(), to: b.to.trim() };
    case 'poll':
      return {
        type: 'poll',
        id: b.id,
        question: b.question.trim(),
        answers: b.answers.map((a) => a.text.trim()),
        closed: b.closed,
      };
  }
}

function asidePayload(s: SectionDraft): Aside | null {
  if (s.beside === 'card') {
    const c = s.card;
    return { type: 'card', kicker: c.kicker.trim(), title: c.title.trim(), text: c.text.trim(), wide: c.wide };
  }
  if (s.beside === 'stats') {
    const st = s.stats;
    return {
      type: 'stats',
      title: st.title.trim(),
      items: st.items.map((i) => ({ value: i.value.trim(), label: i.label.trim() })),
      foot: st.foot.trim() || null,
      wide: st.wide,
    };
  }
  return null;
}

const isLiveList = (kind: SectionKind | null): boolean => kind === 'forum' || kind === 'library' || kind === 'requests';

/** A section as the API takes it. Nothing is left out, so the API's error paths line up with the draft. */
export function sectionPayload(s: SectionDraft): IssueSection {
  const f = s.figure;
  const fallbackSet = Boolean(s.fallback.title.trim() || s.fallback.text.trim());
  return {
    id: s.id.trim(),
    title: s.title.trim(),
    label: s.label.trim() || null,
    icon: s.icon,
    kind: s.kind,
    blocks: s.blocks.map(blockPayload),
    after: s.after.map(blockPayload),
    figure:
      s.beside === 'figure'
        ? { src: f.src.trim(), width: f.width, height: f.height, alt: f.alt.trim(), caption: f.caption.trim() || null }
        : null,
    aside: asidePayload(s),
    window:
      s.kind === 'deadlines' && (s.window.from || s.window.to)
        ? { from: s.window.from || null, to: s.window.to || null }
        : null,
    fallback:
      isLiveList(s.kind) && fallbackSet ? { title: s.fallback.title.trim(), text: s.fallback.text.trim() } : null,
    estWords: s.estWords,
  };
}

/** The issue's cover as the API takes it. */
export function coverPayload(d: IssueDraft): IssueCover {
  return {
    tone: d.cover.tone,
    art: d.cover.art,
    artAlt: d.cover.art ? d.cover.artAlt.trim() || null : null,
    lines: d.cover.lines.map((l) => ({ section: l.section, text: l.text.trim() })),
  };
}

/** Everything the editor saves (PATCH /newsletter/issues/{id}). */
export function toUpdate(d: IssueDraft): IssueUpdate {
  const n = d.number.trim();
  return {
    title: d.title.trim(),
    number: /^\d+$/.test(n) ? Number(n) : null,
    date: d.date,
    slug: d.slug.trim(),
    dek: d.dek.trim(),
    summary: d.summary.trim(),
    editors: editorNames(d.editors),
    cover: coverPayload(d),
    sections: d.sections.map(sectionPayload),
  };
}

/** True when two drafts would save the same issue (keys and the editor's own flags don't count). */
export function sameContent(a: IssueDraft, b: IssueDraft): boolean {
  return JSON.stringify(toUpdate(a)) === JSON.stringify(toUpdate(b));
}

// ── Reading sizes as the API measures them ───────────────────────────────────────────────────────

const length = (s: string): number => Array.from(s).length; // code points, as Python counts them

/** Bytes of a value as JSON, the way the API measures its 256 KB cap (Python's ', ' and ': ', no null fields). */
export function jsonBytes(value: unknown): number {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => x !== null && x !== undefined)
          .map(([k, x]) => [k, strip(x)]),
      );
    return v;
  };
  const json = JSON.stringify(strip(value)) ?? '';
  let separators = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      separators += Math.max(0, v.length - 1);
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      const values = Object.values(v);
      separators += values.length + Math.max(0, values.length - 1);
      values.forEach(walk);
    }
  };
  walk(strip(value));
  return new TextEncoder().encode(json).length + separators;
}

// ── Field paths: where an error shows ────────────────────────────────────────────────────────────

/** Errors by field path; a path names a field of the draft by keys, so it survives reordering. */
export type FieldErrors = Record<string, string>;

export const fieldPath = {
  section: (s: string, field: string): string => `s:${s}:${field}`,
  block: (s: string, b: string, field: string): string => `s:${s}:b:${b}:${field}`,
  item: (s: string, b: string, i: string): string => `s:${s}:b:${b}:i:${i}`,
  stat: (s: string, st: string, field: 'value' | 'label'): string => `s:${s}:st:${st}:${field}`,
  line: (l: string, field: 'section' | 'text'): string => `c:${l}:${field}`,
};

/** The section a path belongs to, or null for the issue's own fields and the cover. */
export const sectionOfPath = (path: string): string | null =>
  path.startsWith('s:') ? (path.split(':')[1] ?? null) : null;

/** An HTML id for the control of a field path, so the editor can focus the first problem. */
export const controlId = (path: string): string => `nl-ed-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

// ── Checking a draft against the API's limits ────────────────────────────────────────────────────

const thousands = (n: number): string => n.toLocaleString('en-GB');

/** '' when fine; else what to do. `what` names the thing in a sentence ('the title'). */
function textProblem(
  value: string,
  max: number,
  { required, empty, markup = true }: { required: boolean; empty: string; markup?: boolean },
): string {
  const v = value.trim();
  if (!v) return required ? empty : '';
  const n = length(v);
  if (n > max) return `Keep it to ${thousands(max)} characters (it has ${thousands(n)}).`;
  return (markup && markupProblem(v)) || '';
}

function checkBlocks(
  errors: FieldErrors,
  s: SectionDraft,
  blocks: BlockDraft[],
  max: number,
  listName: 'blocks' | 'after',
): void {
  if (blocks.length > max)
    errors[fieldPath.section(s.key, listName)] =
      `A section holds ${max} blocks here at most: remove ${blocks.length - max}.`;
  for (const b of blocks) {
    const put = (field: string, message: string) => {
      if (message) errors[fieldPath.block(s.key, b.key, field)] = message;
    };
    switch (b.type) {
      case 'p':
        put(
          'text',
          textProblem(b.text, LIMITS.paragraph, { required: true, empty: 'Write the paragraph, or remove it.' }),
        );
        break;
      case 'signoff':
        put('text', textProblem(b.text, LIMITS.line, { required: true, empty: 'Write the sign-off, or remove it.' }));
        break;
      case 'cta':
        put('label', textProblem(b.label, LIMITS.label, { required: true, empty: 'Write what the button says.' }));
        put('to', linkProblem(b.to) ?? '');
        break;
      case 'poll':
        put(
          'question',
          textProblem(b.question, LIMITS.heading, { required: true, empty: 'Write the question, or remove the poll.' }),
        );
        if (b.answers.length < 2) put('answers', 'A poll needs at least two answers.');
        else if (b.answers.length > LIMITS.pollAnswers)
          put('answers', `A poll holds ${LIMITS.pollAnswers} answers at most.`);
        for (const a of b.answers) {
          const message = textProblem(a.text, LIMITS.pollAnswer, {
            required: true,
            empty: 'Write the answer, or remove it.',
          });
          if (message) errors[fieldPath.item(s.key, b.key, a.key)] = message;
        }
        break;
      case 'list':
        if (!b.items.length) put('items', 'Add at least one item, or remove the list.');
        else if (b.items.length > LIMITS.items) put('items', `A list holds ${LIMITS.items} items at most.`);
        for (const i of b.items) {
          const message = textProblem(i.text, LIMITS.item, { required: true, empty: 'Write the item, or remove it.' });
          if (message) errors[fieldPath.item(s.key, b.key, i.key)] = message;
        }
        break;
    }
  }
}

function checkBeside(errors: FieldErrors, s: SectionDraft): void {
  const put = (field: string, message: string) => {
    if (message) errors[fieldPath.section(s.key, field)] = message;
  };
  if (s.beside === 'figure') {
    const f = s.figure;
    if (!f.src.trim()) put('figure.src', 'Choose a picture.');
    else if (!isPicture(f.src) || f.width < 1 || f.height < 1) put('figure.src', 'Choose one of the pictures.');
    if (!f.alt.trim()) put('figure.alt', 'Describe the picture for people who can’t see it.');
    else if (length(f.alt.trim()) > LIMITS.alt)
      put('figure.alt', `Keep the description to ${LIMITS.alt} characters (it has ${length(f.alt.trim())}).`);
    put('figure.caption', textProblem(f.caption, LIMITS.short, { required: false, empty: '' }));
  } else if (s.beside === 'card') {
    const c = s.card;
    put(
      'card.kicker',
      textProblem(c.kicker, LIMITS.label, { required: true, empty: 'Write the line above the title.' }),
    );
    put('card.title', textProblem(c.title, LIMITS.line, { required: true, empty: 'Write the card’s title.' }));
    put(
      'card.text',
      textProblem(c.text, LIMITS.short, { required: true, empty: 'Write a line of text under the title.' }),
    );
  } else if (s.beside === 'stats') {
    const st = s.stats;
    put('stats.title', textProblem(st.title, LIMITS.line, { required: true, empty: 'Give the numbers a title.' }));
    if (!st.items.length) put('stats.items', 'Add at least one number.');
    else if (st.items.length > LIMITS.stats) put('stats.items', `Show ${LIMITS.stats} numbers at most.`);
    for (const i of st.items) {
      const value = i.value.trim();
      if (!value) errors[fieldPath.stat(s.key, i.key, 'value')] = 'Write the number.';
      else if (length(value) > LIMITS.statValue)
        errors[fieldPath.stat(s.key, i.key, 'value')] = `Keep it to ${LIMITS.statValue} characters.`;
      const label = textProblem(i.label, LIMITS.line, { required: true, empty: 'Say what the number counts.' });
      if (label) errors[fieldPath.stat(s.key, i.key, 'label')] = label;
    }
    put('stats.foot', textProblem(st.foot, LIMITS.short, { required: false, empty: '' }));
  }
}

function checkSection(errors: FieldErrors, s: SectionDraft, idCount: Map<string, number>): void {
  const put = (field: string, message: string) => {
    if (message) errors[fieldPath.section(s.key, field)] = message;
  };
  const id = s.id.trim();
  if (!id) put('id', 'Give the section a link name, like editors-note.');
  else if (length(id) > LIMITS.sectionId) put('id', `Keep the link name to ${LIMITS.sectionId} characters.`);
  else if (!ID_RE.test(id)) put('id', 'Use lowercase letters, numbers and hyphens, like editors-note.');
  else if ((idCount.get(id) ?? 0) > 1) put('id', 'Another section already uses this link name. Choose another.');
  put('title', textProblem(s.title, LIMITS.heading, { required: true, empty: 'Give the section a headline.' }));
  put('label', textProblem(s.label, LIMITS.label, { required: false, empty: '' }));
  checkBlocks(errors, s, s.blocks, LIMITS.blocks, 'blocks');
  checkBlocks(errors, s, s.after, LIMITS.after, 'after');
  checkBeside(errors, s);
  if (s.kind === 'deadlines') {
    const { from, to } = s.window;
    if (from && !isDayKey(from)) put('window.from', 'Choose the first day, or leave it empty.');
    if (to && !isDayKey(to)) put('window.to', 'Choose the last day, or leave it empty.');
    else if (from && to && isDayKey(from) && to < from) put('window.to', 'The last day can’t be before the first.');
  }
  if (isLiveList(s.kind) && (s.fallback.title.trim() || s.fallback.text.trim())) {
    put(
      'fallback.title',
      textProblem(s.fallback.title, LIMITS.line, {
        required: true,
        empty: 'Add a headline for when there is nothing to list.',
      }),
    );
    put(
      'fallback.text',
      textProblem(s.fallback.text, LIMITS.item, {
        required: true,
        empty: 'Add a line for when there is nothing to list.',
      }),
    );
  }
}

/** Everything the API would refuse in a draft, by field path. Empty when the draft can be saved. */
export function validate(d: IssueDraft): FieldErrors {
  const errors: FieldErrors = {};
  const put = (field: string, message: string) => {
    if (message) errors[field] = message;
  };
  put('title', textProblem(d.title, LIMITS.title, { required: true, empty: 'Give the issue a title.', markup: false }));
  const n = d.number.trim();
  if (!/^\d+$/.test(n) || Number(n) > LIMITS.number) put('number', 'Use a whole number, like 2.');
  if (!isDayKey(d.date)) put('date', 'Choose the date it comes out.');
  const slug = d.slug.trim();
  if (!slug) put('slug', 'Give the issue an address, like launch-edition.');
  else if (slug.length > LIMITS.slug) put('slug', `Keep the address to ${LIMITS.slug} characters.`);
  else if (!ID_RE.test(slug)) put('slug', 'Use lowercase letters, numbers and hyphens, like launch-edition.');
  put('dek', textProblem(d.dek, LIMITS.standfirst, { required: false, empty: '' }));
  put('summary', textProblem(d.summary, LIMITS.standfirst, { required: false, empty: '' }));
  const names = editorNames(d.editors);
  const long = names.find((name) => length(name) > LIMITS.editor);
  if (names.length > LIMITS.editors)
    put('editors', `List ${LIMITS.editors} editors at most (there are ${names.length}).`);
  else if (long) put('editors', `Keep each name to ${LIMITS.editor} characters: “${long.slice(0, 24)}…” is longer.`);

  // The cover
  if (d.cover.art && !isPicture(d.cover.art)) put('cover.art', 'Choose one of the pictures.');
  if (d.cover.art && !d.cover.artAlt.trim())
    put('cover.artAlt', 'Describe the illustration for people who can’t see it.');
  else if (length(d.cover.artAlt.trim()) > LIMITS.artAlt)
    put(
      'cover.artAlt',
      `Keep the description to ${LIMITS.artAlt} characters (it has ${length(d.cover.artAlt.trim())}).`,
    );
  if (d.cover.lines.length > LIMITS.coverLines)
    put(
      'cover.lines',
      `A cover has ${LIMITS.coverLines} lines at most: remove ${d.cover.lines.length - LIMITS.coverLines}.`,
    );
  const ids = new Set(d.sections.map((s) => s.id.trim()));
  for (const l of d.cover.lines) {
    if (!l.section || !ids.has(l.section))
      put(fieldPath.line(l.key, 'section'), 'Choose the story this line points to.');
    put(
      fieldPath.line(l.key, 'text'),
      textProblem(l.text, LIMITS.coverText, { required: true, empty: 'Write the cover line, or remove it.' }),
    );
  }

  // The sections
  if (d.sections.length > LIMITS.sections)
    put(
      'sections',
      `An issue holds ${LIMITS.sections} sections at most: remove ${d.sections.length - LIMITS.sections}.`,
    );
  const idCount = new Map<string, number>();
  for (const s of d.sections) idCount.set(s.id.trim(), (idCount.get(s.id.trim()) ?? 0) + 1);
  for (const s of d.sections) checkSection(errors, s, idCount);

  // The whole issue, as the API measures it
  const u = toUpdate(d);
  const bytes = jsonBytes({
    title: u.title,
    dek: u.dek,
    summary: u.summary,
    editors: u.editors,
    cover: u.cover,
    sections: u.sections,
  });
  if (bytes > LIMITS.issueBytes) put('sections', 'This issue is too long: shorten it or split it into two issues.');
  return errors;
}

// ── The API's 422 paths → field paths ────────────────────────────────────────────────────────────

const BLOCK_FIELDS: Record<string, string> = {
  text: 'text',
  lead: 'text',
  label: 'label',
  to: 'to',
  items: 'items',
  question: 'question',
  answers: 'answers',
  id: 'question',
};
const ISSUE_FIELDS = new Set(['title', 'number', 'date', 'slug', 'dek', 'summary', 'editors']);

/** One error path of the API, for the draft that was saved, as a field path (or null when it names no field). */
export function fieldOfApiPath(apiPath: string, d: IssueDraft): string | null {
  const [head, ...rest] = apiPath.split('.');
  if (!head) return null;
  if (ISSUE_FIELDS.has(head)) return head;
  if (head === 'cover') {
    const [what, index, field] = rest;
    if (what === 'lines' && index !== undefined) {
      const line = d.cover.lines[Number(index)];
      if (line) return fieldPath.line(line.key, field === 'section' ? 'section' : 'text');
      return 'cover.lines';
    }
    if (what === 'artAlt') return 'cover.artAlt';
    return what === 'lines' ? 'cover.lines' : 'cover.art';
  }
  if (head !== 'sections') return null;
  const [index, part, ...more] = rest;
  const s = index === undefined ? undefined : d.sections[Number(index)];
  if (!s) return 'sections';
  if (!part) return fieldPath.section(s.key, 'title');
  if (part === 'blocks' || part === 'after') {
    const [bIndex, , field, itemIndex] = more; // '0', 'cta', 'to' (the API names the block's type)
    const list = part === 'blocks' ? s.blocks : s.after;
    const b = bIndex === undefined ? undefined : list[Number(bIndex)];
    if (!b) return fieldPath.section(s.key, part);
    if (b.type === 'list' && field === 'items' && itemIndex !== undefined) {
      const item = b.items[Number(itemIndex)];
      if (item) return fieldPath.item(s.key, b.key, item.key);
    }
    if (b.type === 'poll' && field === 'answers' && itemIndex !== undefined) {
      const answer = b.answers[Number(itemIndex)];
      if (answer) return fieldPath.item(s.key, b.key, answer.key);
    }
    const blockField = BLOCK_FIELDS[field ?? ''] ?? firstField(b);
    return fieldPath.block(s.key, b.key, blockField);
  }
  if (part === 'aside') {
    const [tag, field, statIndex, statField] = more; // 'stats', 'items', '2', 'value'
    if (tag === 'stats' && field === 'items' && statIndex !== undefined) {
      const stat = s.stats.items[Number(statIndex)];
      if (stat) return fieldPath.stat(s.key, stat.key, statField === 'value' ? 'value' : 'label');
    }
    if (tag === 'card' || tag === 'stats')
      return fieldPath.section(s.key, `${tag}.${field === 'items' ? 'items' : (field ?? 'title')}`);
    return fieldPath.section(s.key, s.beside === 'stats' ? 'stats.title' : 'card.title');
  }
  if (part === 'figure')
    return fieldPath.section(s.key, `figure.${more[0] === 'alt' || more[0] === 'caption' ? more[0] : 'src'}`);
  if (part === 'window') return fieldPath.section(s.key, more[0] === 'from' ? 'window.from' : 'window.to');
  if (part === 'fallback') return fieldPath.section(s.key, more[0] === 'text' ? 'fallback.text' : 'fallback.title');
  if (part === 'id' || part === 'title' || part === 'label') return fieldPath.section(s.key, part);
  return fieldPath.section(s.key, 'title');
}

/** The API's field errors on the draft that was saved: those placed on a field, and the rest. */
export function mapApiErrors(fields: Record<string, string>, d: IssueDraft): { placed: FieldErrors; other: string[] } {
  const placed: FieldErrors = {};
  const other: string[] = [];
  for (const [apiPath, message] of Object.entries(fields)) {
    const path = fieldOfApiPath(apiPath, d);
    if (path && !placed[path]) placed[path] = message;
    else if (!path) other.push(message);
  }
  return { placed, other };
}

// ── Editing ──────────────────────────────────────────────────────────────────────────────────────

/** Move the item with `key` one place up (-1) or down (1). */
export function moveByKey<T extends { key: string }>(list: readonly T[], key: string, dir: -1 | 1): T[] {
  const i = list.findIndex((x) => x.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j] as T, next[i] as T];
  return next;
}

export function updateByKey<T extends { key: string }>(list: readonly T[], key: string, fn: (item: T) => T): T[] {
  return list.map((x) => (x.key === key ? fn(x) : x));
}

export function removeByKey<T extends { key: string }>(list: readonly T[], key: string): T[] {
  return list.filter((x) => x.key !== key);
}

/** An id no other section has: 'deadlines', then 'deadlines-2'. */
export function uniqueSectionId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = slugify(base, LIMITS.sectionId - 3) || 'section';
  if (!used.has(root)) return root;
  for (let n = 2; ; n += 1) if (!used.has(`${root}-${n}`)) return `${root}-${n}`;
}

const otherIds = (d: IssueDraft, key: string): string[] => d.sections.filter((s) => s.key !== key).map((s) => s.id);

/** Change one section; `fn` gets the section and returns its new state. */
export function updateSection(d: IssueDraft, key: string, fn: (s: SectionDraft) => SectionDraft): IssueDraft {
  const before = d.sections.find((s) => s.key === key);
  if (!before) return d;
  const after = fn(before);
  const sections = updateByKey(d.sections, key, () => after);
  // A new section's link name follows its headline until the rep sets one.
  if (after.isNew && !after.idTouched && after.title !== before.title) {
    const id = uniqueSectionId(after.title, otherIds(d, key));
    return renameSection({ ...d, sections }, key, id, false);
  }
  return after.id === before.id ? { ...d, sections } : renameCoverLines({ ...d, sections }, before.id, after.id);
}

function renameCoverLines(d: IssueDraft, from: string, to: string): IssueDraft {
  if (from === to || !d.cover.lines.some((l) => l.section === from)) return d;
  return {
    ...d,
    cover: { ...d.cover, lines: d.cover.lines.map((l) => (l.section === from ? { ...l, section: to } : l)) },
  };
}

/** Give a section another link name; its cover lines follow. `touched`: the rep typed it. */
export function renameSection(d: IssueDraft, key: string, id: string, touched = true): IssueDraft {
  const before = d.sections.find((s) => s.key === key);
  if (!before) return d;
  const sections = updateByKey(d.sections, key, (s) => ({ ...s, id, idTouched: s.idTouched || touched }));
  return renameCoverLines({ ...d, sections }, before.id, id);
}

export function moveSection(d: IssueDraft, key: string, dir: -1 | 1): IssueDraft {
  return { ...d, sections: moveByKey(d.sections, key, dir) };
}

/** Remove a section, and the cover lines that pointed to it. */
export function removeSection(d: IssueDraft, key: string): IssueDraft {
  const gone = d.sections.find((s) => s.key === key);
  if (!gone) return d;
  return {
    ...d,
    sections: removeByKey(d.sections, key),
    cover: {
      ...d.cover,
      lines: d.cover.lines.filter(
        (l) => l.section !== gone.id || d.sections.some((s) => s.key !== key && s.id === gone.id),
      ),
    },
  };
}

export type NewSection = 'story' | SectionKind;

/** The words a live list adds to the read time (as the launch edition counts them). */
const LIVE_WORDS: Record<SectionKind, number> = { deadlines: 90, forum: 60, library: 50, requests: 50 };

const TEMPLATES: Record<
  NewSection,
  Pick<SectionDraft, 'label' | 'icon' | 'title'> & { fallback?: SectionDraft['fallback'] }
> = {
  story: { label: '', icon: 'NotePencil', title: '' },
  deadlines: { label: 'Deadlines and dates', icon: 'CalendarCheck', title: 'What’s coming up' },
  forum: {
    label: 'From the forum',
    icon: 'ChatsCircle',
    title: 'What your cohort is asking',
    fallback: {
      title: 'The forum is waiting for your question',
      text: 'Ask the question you have been saving: your cohort can reply, and vote up the answers that help.',
    },
  },
  library: {
    label: 'New in the library',
    icon: 'Books',
    title: 'Fresh in the library',
    fallback: {
      title: 'Share your notes',
      text: 'The library gathers every module’s study guides, past papers and the notes students share. Yours could be next.',
    },
  },
  requests: {
    label: 'You asked, we did',
    icon: 'Megaphone',
    title: 'What you asked for, done',
    fallback: {
      title: 'Ask the reps for what you need',
      text: 'Missing a past paper, a fix or a date? [Ask for it](/requests), and say “me too” to what others asked.',
    },
  },
};

/** A new section of a kind, with sensible first words. `issueDate`: a deadlines section lists from that day. */
export function blankSection(kind: NewSection, d: IssueDraft): SectionDraft {
  const t = TEMPLATES[kind];
  const live = kind === 'story' ? null : kind;
  const base = kind === 'story' ? 'section' : kind;
  return {
    key: newKey('s'),
    id: uniqueSectionId(
      t.title || base,
      d.sections.map((s) => s.id),
    ),
    isNew: true,
    idTouched: false,
    title: t.title,
    label: t.label,
    icon: t.icon,
    kind: live,
    blocks: kind === 'story' ? [{ key: newKey('b'), type: 'p', text: '', lead: true }] : [],
    after: [],
    beside: 'none',
    figure: emptyFigure(),
    card: emptyCard(),
    stats: emptyStats(),
    window:
      kind === 'deadlines' && isDayKey(d.date) ? { from: d.date, to: addDaysToKey(d.date, 55) } : { from: '', to: '' },
    fallback: t.fallback ?? { title: '', text: '' },
    estWords: live ? LIVE_WORDS[live] : null,
  };
}

/** After a save: every section is on the API now, so a new section's link name stops following its headline. */
export function markSaved(d: IssueDraft): IssueDraft {
  return d.sections.some((s) => s.isNew)
    ? { ...d, sections: d.sections.map((s) => (s.isNew ? { ...s, isNew: false } : s)) }
    : d;
}

/** Add a section at the end (or after `afterKey`); returns the draft and the new section's key. */
export function addSection(d: IssueDraft, kind: NewSection, afterKey?: string): { draft: IssueDraft; key: string } {
  const s = blankSection(kind, d);
  const at = afterKey ? d.sections.findIndex((x) => x.key === afterKey) + 1 : d.sections.length;
  const sections = [...d.sections];
  sections.splice(at > 0 ? at : sections.length, 0, s);
  return { draft: { ...d, sections }, key: s.key };
}

/** Make a section a story or a live section; a live one gets its usual read-time estimate. */
export function setKind(s: SectionDraft, kind: SectionKind | null, issueDate: string): SectionDraft {
  if (kind === s.kind) return s;
  const window =
    kind === 'deadlines' && !s.window.from && !s.window.to && isDayKey(issueDate)
      ? { from: issueDate, to: addDaysToKey(issueDate, 55) }
      : s.window;
  const fallback =
    kind && isLiveList(kind) && !s.fallback.title && !s.fallback.text
      ? (TEMPLATES[kind].fallback ?? s.fallback)
      : s.fallback;
  return { ...s, kind, window, fallback, estWords: kind ? (s.kind ? s.estWords : LIVE_WORDS[kind]) : null };
}

/** The field a block's form starts with. */
export function firstField(b: BlockDraft): string {
  return b.type === 'cta' ? 'label' : b.type === 'list' ? 'items' : b.type === 'poll' ? 'question' : 'text';
}

/** A poll's id: unique in the issue, and kept for good (it holds the votes). */
const pollId = (): string => `poll-${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36)}`;

/** A new, empty block of a kind. */
export function blankBlock(type: BlockKind): BlockDraft {
  switch (type) {
    case 'p':
      return { key: newKey('b'), type: 'p', text: '', lead: false };
    case 'list':
      return { key: newKey('b'), type: 'list', items: [{ key: newKey('i'), text: '' }] };
    case 'signoff':
      return { key: newKey('b'), type: 'signoff', text: '' };
    case 'cta':
      return { key: newKey('b'), type: 'cta', label: '', to: '' };
    case 'poll':
      return {
        key: newKey('b'),
        type: 'poll',
        id: pollId(),
        question: '',
        answers: [blankItem(), blankItem()],
        closed: false,
      };
  }
}

export const blankItem = (): ItemDraft => ({ key: newKey('i'), text: '' });
export const blankStat = (): StatDraft => ({ key: newKey('st'), value: '', label: '' });

/** A cover line for the first story that has none yet (or the first story). */
export function blankCoverLine(d: IssueDraft): CoverLineDraft {
  const used = new Set(d.cover.lines.map((l) => l.section));
  const story = d.sections.find((s) => !used.has(s.id)) ?? d.sections[0];
  return { key: newKey('c'), section: story?.id ?? '', text: '' };
}

// ── The preview ──────────────────────────────────────────────────────────────────────────────────

/** The draft as the reader shows it, whatever is still missing (the preview never waits for a valid draft). */
export function previewOf(d: IssueDraft): { cover: IssueCover; sections: IssueSection[] } {
  const ids = new Set<string>();
  const sections = d.sections.map((s) => {
    const p = sectionPayload(s);
    // The reader keys sections by id: give a duplicate or empty one a stand-in while it is being written.
    let id = p.id || 'section';
    while (ids.has(id)) id = `${id}-x`;
    ids.add(id);
    return {
      ...p,
      id,
      title: p.title || 'Untitled section',
      figure: p.figure && isPicture(p.figure.src) && p.figure.width > 0 && p.figure.height > 0 ? p.figure : null,
      blocks: p.blocks.filter(hasWords),
      after: p.after.filter(hasWords),
    };
  });
  return { cover: { ...coverPayload(d), art: d.cover.art && isPicture(d.cover.art) ? d.cover.art : null }, sections };
}

function hasWords(b: Block): boolean {
  switch (b.type) {
    case 'p':
    case 'signoff':
      return Boolean(b.text);
    case 'list':
      return b.items.some(Boolean);
    case 'cta':
      return Boolean(b.label && b.to);
    case 'poll':
      return Boolean(b.question);
  }
}
