// Reading an issue's JSON (cover and sections, as stored by the API) into the types in ../types.ts.
// The reader keeps what it understands and drops the rest; every drop is reported as a Problem, which
// the editor shows next to the JSON ("sections[2].blocks[0]: a paragraph needs text").
import type { CohortYear } from '../../../lib/modules';
import type { Aside, Block, Chart, CohortUpdate, Cover, CoverLine, Figure, Problem, Section, SectionKind } from '../types';
import { linkProblem, safeImageSrc } from './links';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const SECTION_KINDS: readonly SectionKind[] = ['deadlines', 'forum', 'library', 'cohorts', 'chart'];
const BLOCK_TYPES = ['p', 'list', 'steps', 'qa', 'signoff', 'cta', 'figure'] as const;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MARKUP_LINK_RE = /\[[^\]]*\]\(([^)\s]*)\)/g;

/** What the API accepts (services/newsletter.py): 40 sections, 256 KB of sections, 16 KB of cover, ids up to 64. */
export const LIMITS = { sections: 40, sectionsBytes: 256 * 1024, coverBytes: 16 * 1024, idLength: 64 } as const;

/**
 * Bytes of the JSON as the API measures it (Python's json.dumps: UTF-8, with ', ' and ': ' between items),
 * so a size warning here matches the API's 422.
 */
export function jsonBytes(value: unknown): number {
  let separators = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      separators += Math.max(0, v.length - 1);
      v.forEach(walk);
    } else if (isRec(v)) {
      const values = Object.values(v);
      separators += values.length + Math.max(0, values.length - 1);
      values.forEach(walk);
    }
  };
  walk(value);
  return new TextEncoder().encode(JSON.stringify(value) ?? '').length + separators;
}

const kb = (bytes: number): string => `${Math.ceil(bytes / 1024)} KB`;

/** Links in a piece of copy that the API would refuse: [{ href, problem }]. */
export function markupLinkProblems(text: string): { href: string; problem: string }[] {
  const out: { href: string; problem: string }[] = [];
  for (const m of text.matchAll(MARKUP_LINK_RE)) {
    const href = m[1] ?? '';
    const problem = linkProblem(href);
    if (problem) out.push({ href, problem });
  }
  return out;
}

class Reader {
  readonly problems: Problem[] = [];

  report(path: string, message: string): void {
    this.problems.push({ path, message });
  }

  warn(path: string, message: string): void {
    this.problems.push({ path, message, warning: true });
  }

  /** A string field (trimmed of nothing: copy keeps its spaces). Reports and returns null when missing. */
  text(o: Rec, key: string, path: string, { required = true }: { required?: boolean } = {}): string | null {
    const v = o[key];
    if (isStr(v) && v.trim()) {
      this.links(v, `${path}.${key}`);
      return v;
    }
    if (v === undefined || v === null || (isStr(v) && !v.trim())) {
      if (required) this.report(`${path}.${key}`, 'is missing.');
      return null;
    }
    this.report(`${path}.${key}`, 'should be text.');
    return null;
  }

  /** Every [label](href) in a piece of copy must be a page of the Hub, an https:// address or a mailto: link. */
  links(text: string, path: string): void {
    for (const { href, problem } of markupLinkProblems(text)) this.report(path, `the link “${href}” ${problem}`);
  }

  strings(o: Rec, key: string, path: string): string[] | null {
    const v = o[key];
    if (!Array.isArray(v)) {
      this.report(`${path}.${key}`, 'should be a list of text.');
      return null;
    }
    const out: string[] = [];
    v.forEach((item, i) => {
      if (isStr(item) && item.trim()) {
        this.links(item, `${path}.${key}[${i}]`);
        out.push(item);
      } else this.report(`${path}.${key}[${i}]`, 'should be text.');
    });
    return out;
  }
}

function readFigure(r: Reader, raw: unknown, path: string): Figure | null {
  if (!isRec(raw)) {
    r.report(path, 'should be an object: { "src", "width", "height", "alt", "caption" }.');
    return null;
  }
  const src = isStr(raw.src) ? raw.src : null;
  if (!src) {
    r.report(`${path}.src`, 'is missing.');
    return null;
  }
  if (!safeImageSrc(src)) {
    r.report(`${path}.src`, 'must be a file of the app (like demo/news/photo.jpg) or an uploaded image (/api/v1/media/…).');
    return null;
  }
  const width = isNum(raw.width) && raw.width > 0 ? raw.width : null;
  const height = isNum(raw.height) && raw.height > 0 ? raw.height : null;
  if (!width || !height) {
    r.report(path, 'needs the picture’s width and height in pixels.');
    return null;
  }
  const alt = isStr(raw.alt) ? raw.alt : '';
  if (!alt.trim()) r.warn(`${path}.alt`, 'describe the picture for people who can’t see it.');
  const caption = isStr(raw.caption) && raw.caption.trim() ? raw.caption : undefined;
  return { src, width, height, alt, ...(caption ? { caption } : {}) };
}

function readBlock(r: Reader, raw: unknown, path: string): Block | null {
  if (!isRec(raw)) {
    r.report(path, 'should be an object with a "type".');
    return null;
  }
  const type = raw.type;
  switch (type) {
    case 'p': {
      const text = r.text(raw, 'text', path);
      return text ? { type, text, ...(raw.lead === true ? { lead: true } : {}) } : null;
    }
    case 'signoff': {
      const text = r.text(raw, 'text', path);
      return text ? { type, text } : null;
    }
    case 'list': {
      const items = r.strings(raw, 'items', path);
      return items && items.length ? { type, items } : null;
    }
    case 'steps': {
      if (!Array.isArray(raw.items)) {
        r.report(`${path}.items`, 'should be a list of { "title", "text" }.');
        return null;
      }
      const items: { title: string; text: string }[] = [];
      raw.items.forEach((it, i) => {
        const p = `${path}.items[${i}]`;
        if (!isRec(it)) return r.report(p, 'should be { "title", "text" }.');
        const title = r.text(it, 'title', p);
        const text = r.text(it, 'text', p);
        if (title && text) items.push({ title, text });
      });
      return items.length ? { type, items } : null;
    }
    case 'qa': {
      if (!Array.isArray(raw.items)) {
        r.report(`${path}.items`, 'should be a list of { "q", "a" }.');
        return null;
      }
      const items: { q: string; a: string }[] = [];
      raw.items.forEach((it, i) => {
        const p = `${path}.items[${i}]`;
        if (!isRec(it)) return r.report(p, 'should be { "q", "a" }.');
        const q = r.text(it, 'q', p);
        const a = r.text(it, 'a', p);
        if (q && a) items.push({ q, a });
      });
      return items.length ? { type, items } : null;
    }
    case 'cta': {
      const to = r.text(raw, 'to', path);
      const label = r.text(raw, 'label', path);
      if (!to || !label) return null;
      const problem = linkProblem(to);
      if (problem) {
        r.report(`${path}.to`, problem);
        return null;
      }
      return { type, to, label };
    }
    case 'figure': {
      const figure = readFigure(r, raw, path);
      return figure ? { type, ...figure } : null;
    }
    default:
      r.report(`${path}.type`, `should be one of ${BLOCK_TYPES.map((t) => `"${t}"`).join(', ')}.`);
      return null;
  }
}

function readBlocks(r: Reader, raw: unknown, path: string): Block[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    r.report(path, 'should be a list of blocks.');
    return [];
  }
  return raw.map((b, i) => readBlock(r, b, `${path}[${i}]`)).filter((b): b is Block => b !== null);
}

function readAside(r: Reader, raw: unknown, path: string): Aside | null {
  if (!isRec(raw)) {
    r.report(path, 'should be an object with a "type".');
    return null;
  }
  const wide = raw.wide === true ? { wide: true } : {};
  switch (raw.type) {
    case 'note': {
      const title = r.text(raw, 'title', path);
      const text = r.text(raw, 'text', path);
      return title && text ? { type: 'note', title, text, ...wide } : null;
    }
    case 'quote': {
      const text = r.text(raw, 'text', path);
      const cite = r.text(raw, 'cite', path, { required: false });
      return text ? { type: 'quote', text, ...(cite ? { cite } : {}), ...wide } : null;
    }
    case 'card': {
      const kicker = r.text(raw, 'kicker', path);
      const title = r.text(raw, 'title', path);
      const text = r.text(raw, 'text', path);
      return kicker && title && text ? { type: 'card', kicker, title, text, ...wide } : null;
    }
    case 'stats': {
      const title = r.text(raw, 'title', path);
      const foot = r.text(raw, 'foot', path, { required: false });
      if (!Array.isArray(raw.items)) {
        r.report(`${path}.items`, 'should be a list of { "value", "label" }.');
        return null;
      }
      const items: { value: string; label: string }[] = [];
      raw.items.forEach((it, i) => {
        const p = `${path}.items[${i}]`;
        if (!isRec(it)) return r.report(p, 'should be { "value", "label" }.');
        const value = isNum(it.value) ? String(it.value) : r.text(it, 'value', p);
        const label = r.text(it, 'label', p);
        if (value && label) items.push({ value, label });
      });
      return title && items.length ? { type: 'stats', title, items, ...(foot ? { foot } : {}), ...wide } : null;
    }
    default:
      r.report(`${path}.type`, 'should be "note", "stats", "quote" or "card".');
      return null;
  }
}

const toYear = (v: unknown): CohortYear | null => (v === 1 || v === 2 || v === 3 ? v : null);

function readCohorts(r: Reader, raw: unknown, path: string): CohortUpdate[] {
  if (!Array.isArray(raw)) {
    r.report(path, 'should be a list of { "year", "title", "moduleIds", "paragraphs" }.');
    return [];
  }
  const out: CohortUpdate[] = [];
  raw.forEach((c, i) => {
    const p = `${path}[${i}]`;
    if (!isRec(c)) return r.report(p, 'should be an object.');
    const year = toYear(c.year);
    if (!year) r.report(`${p}.year`, 'should be 1, 2 or 3.');
    const title = r.text(c, 'title', p);
    const moduleIds = c.moduleIds === undefined ? [] : r.strings(c, 'moduleIds', p);
    const paragraphs = r.strings(c, 'paragraphs', p);
    if (year && title && moduleIds && paragraphs) out.push({ year, title, moduleIds, paragraphs });
  });
  return out;
}

function readChart(r: Reader, raw: unknown, path: string): Chart | null {
  if (!isRec(raw)) {
    r.report(path, 'should be an object.');
    return null;
  }
  const title = r.text(raw, 'title', path);
  const caption = r.text(raw, 'caption', path);
  const xLabel = r.text(raw, 'xLabel', path);
  const yLabel = r.text(raw, 'yLabel', path);
  const points = Array.isArray(raw.points)
    ? raw.points.filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length === 2 && isNum(pt[0]) && isNum(pt[1]))
    : [];
  if (points.length < 2) r.report(`${path}.points`, 'needs at least two [day, value] pairs, the first one the furthest from the exam.');
  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((n): n is { day: number; text: string } => isRec(n) && isNum(n.day) && isStr(n.text))
    : [];
  return title && caption && xLabel && yLabel && points.length >= 2 ? { title, caption, xLabel, yLabel, points, notes } : null;
}

function readSection(r: Reader, raw: unknown, path: string, seen: Set<string>): Section | null {
  if (!isRec(raw)) {
    r.report(path, 'should be an object.');
    return null;
  }
  const id = isStr(raw.id) ? raw.id : null;
  if (!id || !ID_RE.test(id) || id.length > LIMITS.idLength) {
    r.report(`${path}.id`, `should be lowercase words joined by hyphens, like "editors-note" (${LIMITS.idLength} characters at most).`);
    return null;
  }
  if (seen.has(id)) {
    r.report(`${path}.id`, `“${id}” is used by another section: every section needs its own.`);
    return null;
  }
  seen.add(id);
  const title = r.text(raw, 'title', path);
  const label = r.text(raw, 'label', path) ?? title;
  if (!title || !label) return null;
  const kind = raw.kind === undefined ? undefined : SECTION_KINDS.find((k) => k === raw.kind);
  if (raw.kind !== undefined && !kind) r.report(`${path}.kind`, `should be one of ${SECTION_KINDS.map((k) => `"${k}"`).join(', ')}, or left out.`);
  const section: Section = { id, label, title, blocks: readBlocks(r, raw.blocks, `${path}.blocks`) };
  if (isStr(raw.icon) && raw.icon.trim()) section.icon = raw.icon;
  if (kind) section.kind = kind;
  if (raw.after !== undefined) section.after = readBlocks(r, raw.after, `${path}.after`);
  if (raw.figure !== undefined) {
    const figure = readFigure(r, raw.figure, `${path}.figure`);
    if (figure) section.figure = figure;
  }
  if (raw.aside !== undefined) {
    const aside = readAside(r, raw.aside, `${path}.aside`);
    if (aside) section.aside = aside;
  }
  if (raw.profile !== undefined) {
    if (isRec(raw.profile) && isStr(raw.profile.name) && raw.profile.name.trim()) {
      const year = toYear(raw.profile.year);
      section.profile = { name: raw.profile.name, ...(isStr(raw.profile.line) ? { line: raw.profile.line } : {}), ...(year ? { year } : {}) };
    } else r.report(`${path}.profile`, 'should be { "name", "line", "year" }.');
  }
  if (raw.window !== undefined) {
    const w = isRec(raw.window) ? raw.window : null;
    const from = w && isStr(w.from) && DAY_RE.test(w.from) ? w.from : undefined;
    const to = w && isStr(w.to) && DAY_RE.test(w.to) ? w.to : undefined;
    if (!w || (w.from !== undefined && !from) || (w.to !== undefined && !to)) r.report(`${path}.window`, 'should be { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }.');
    section.window = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }
  if (raw.fallback !== undefined) {
    if (isRec(raw.fallback)) {
      const title2 = r.text(raw.fallback, 'title', `${path}.fallback`);
      const text = r.text(raw.fallback, 'text', `${path}.fallback`);
      if (title2 && text) section.fallback = { title: title2, text };
    } else r.report(`${path}.fallback`, 'should be { "title", "text" }.');
  }
  if (isNum(raw.estWords) && raw.estWords >= 0) section.estWords = raw.estWords;
  if (kind === 'cohorts') section.cohorts = readCohorts(r, raw.cohorts, `${path}.cohorts`);
  if (kind === 'chart') {
    const chart = readChart(r, raw.chart, `${path}.chart`);
    if (chart) section.chart = chart;
  }
  if (!section.blocks.length && !kind) r.warn(`${path}.blocks`, 'is empty: add at least one paragraph.');
  return section;
}

/** An issue's sections, and what had to be left out. */
export function readSections(raw: unknown): { sections: Section[]; problems: Problem[] } {
  const r = new Reader();
  if (!Array.isArray(raw)) {
    r.report('sections', 'should be a list of sections: [ { "id", "label", "title", "blocks": [ … ] }, … ].');
    return { sections: [], problems: r.problems };
  }
  if (raw.length > LIMITS.sections) r.report('sections', `has ${raw.length} sections: an issue holds ${LIMITS.sections} at most.`);
  const bytes = jsonBytes(raw);
  if (bytes > LIMITS.sectionsBytes) r.report('sections', `come to ${kb(bytes)}: an issue holds ${kb(LIMITS.sectionsBytes)} at most. Shorten it or split it into two issues.`);
  const seen = new Set<string>();
  const sections = raw.map((s, i) => readSection(r, s, `sections[${i}]`, seen)).filter((s): s is Section => s !== null);
  return { sections, problems: r.problems };
}

/** An issue's cover, and what had to be left out. */
export function readCover(raw: unknown): { cover: Cover; problems: Problem[] } {
  const r = new Reader();
  const cover: Cover = { tone: 'navy', art: null, lines: [] };
  if (!isRec(raw)) {
    if (raw !== undefined && raw !== null) r.report('cover', 'should be an object: { "tone", "art", "lines" }.');
    return { cover, problems: r.problems };
  }
  const bytes = jsonBytes(raw);
  if (bytes > LIMITS.coverBytes) r.report('cover', `comes to ${kb(bytes)}: a cover holds ${kb(LIMITS.coverBytes)} at most.`);
  if (raw.tone === 'paper' || raw.tone === 'navy') cover.tone = raw.tone;
  else if (raw.tone !== undefined) r.report('cover.tone', 'should be "navy" or "paper".');
  if (isStr(raw.art) && raw.art.trim()) {
    if (safeImageSrc(raw.art)) cover.art = raw.art;
    else r.report('cover.art', 'must be a file of the app (like brand/newsletter-cover.jpg) or an uploaded image (/api/v1/media/…).');
  } else if (raw.art !== undefined && raw.art !== null) r.report('cover.art', 'should be a picture’s path, or null.');
  if (raw.lines !== undefined) {
    if (!Array.isArray(raw.lines)) r.report('cover.lines', 'should be a list of { "section", "text" }.');
    else
      raw.lines.forEach((l, i) => {
        const p = `cover.lines[${i}]`;
        if (!isRec(l) || !isStr(l.section) || !isStr(l.text)) return r.report(p, 'should be { "section": "<section id>", "text" }.');
        r.links(l.text, `${p}.text`);
        const line: CoverLine = { section: l.section, text: l.text };
        cover.lines.push(line);
      });
    if (cover.lines.length > 5) r.warn('cover.lines', 'a cover shows five lines at most (three with a picture).');
  }
  return { cover, problems: r.problems };
}

/** Cover lines that name a section the issue doesn't have (the editor warns about them). */
export function strayCoverLines(cover: Cover, sections: readonly Pick<Section, 'id'>[]): Problem[] {
  const ids = new Set(sections.map((s) => s.id));
  return cover.lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !ids.has(l.section))
    .map(({ l, i }) => ({ path: `cover.lines[${i}].section`, message: `there is no section “${l.section}”, so this line isn’t shown.`, warning: true }));
}
