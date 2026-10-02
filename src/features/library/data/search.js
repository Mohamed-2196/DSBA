// Search and filtering over the mock catalog.
import { FILES, SORTS, byNewest } from './catalog.js';
import { KIND_BY_ID } from './kinds.js';

/** Lowercase, strip accents and apostrophes, unify dashes. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[–—-]/g, ' ');
}

const tokenize = (s) => normalize(s).split(/[^a-z0-9]+/).filter(Boolean);

// Precomputed search index: words per file, plus the title words for ranking.
const INDEX = new Map(
  FILES.map((f) => {
    const kind = KIND_BY_ID[f.kind];
    const fields = [
      f.title, f.fileName, f.moduleCode, f.moduleName, f.moduleShort, kind.label, kind.plural, kind.short,
      f.author, f.addedBy, f.format, f.ext, f.examYear, f.zone ? `zone ${f.zone}` : '', f.unit?.title,
      `year ${f.year}`, f.isNew ? 'new' : '', f.favourite ? 'student favourite favourites' : '',
    ];
    return [f.id, { words: new Set(tokenize(fields.join(' '))), title: normalize(f.title), titleWords: tokenize(f.title) }];
  }),
);

function matchToken(entry, token) {
  if (token.length === 1) return entry.words.has(token);
  for (const w of entry.words) if (w.startsWith(token)) return true;
  return false;
}

/** Relevance score for one file, or 0 when it doesn't match every token. */
function scoreFile(f, tokens, phrase) {
  const entry = INDEX.get(f.id);
  let score = 0;
  for (const t of tokens) {
    if (!matchToken(entry, t)) return 0;
    score += entry.titleWords.some((w) => w.startsWith(t)) ? 3 : 1;
    if (f.moduleCode && normalize(f.moduleCode) === t) score += 4;
  }
  if (phrase && entry.title.includes(phrase)) score += 6;
  if (phrase && entry.title.startsWith(phrase)) score += 4;
  return score;
}

/** Files matching a query, best match first (ties: newest). Empty query → []. */
export function searchFiles(query, list = FILES) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const phrase = normalize(query).trim();
  return list
    .map((f) => [scoreFile(f, tokens, phrase), f])
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || byNewest(a[1], b[1]))
    .map(([, f]) => f);
}

/**
 * Apply the library filters.
 * @param {{ year: number|null, module: string|null, kind: string|null, q: string, starred: Set<string>|null }} f
 *        `starred` set → only those ids.
 * @param {'newest'|'az'|'downloads'|'relevance'} sort
 */
export function filterFiles({ year = null, module = null, kind = null, q = '', starred = null } = {}, sort = 'newest') {
  let list = FILES.filter(
    (f) => (!year || f.year === year) && (!module || f.moduleId === module) && (!kind || f.kind === kind) && (!starred || starred.has(f.id)),
  );
  if (q && q.trim()) {
    const ranked = searchFiles(q, list);
    if (sort === 'relevance') return ranked;
    list = ranked;
  }
  return list.slice().sort((SORTS[sort] || SORTS.newest).compare);
}

/** Facet counts: files per module and per kind under the other active filters. */
export function facetCounts({ year = null, module = null, kind = null, q = '', starred = null } = {}) {
  const base = q && q.trim() ? searchFiles(q) : FILES;
  const modules = {};
  const kinds = {};
  let all = 0;
  for (const f of base) {
    if (year && f.year !== year) continue;
    if (starred && !starred.has(f.id)) continue;
    if (!kind || f.kind === kind) modules[f.moduleId] = (modules[f.moduleId] || 0) + 1;
    if (!module || f.moduleId === module) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    if ((!kind || f.kind === kind) && (!module || f.moduleId === module)) all++;
  }
  return { modules, kinds, all };
}
