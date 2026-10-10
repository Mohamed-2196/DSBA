// What goes on each page of a mock document. Pure data (no JSX): getLayout(file) returns one light
// spec per page; content for long documents is generated per page on demand (pageBlocks etc.), always
// from seeded randomness so a page renders identically in the grid, the rail and the viewer.
import { getModule } from '../../../data/modules';
import { FILES } from '../data/catalog';
import { BANKS, CHEAT_SHEET, COMMENTARY, MARGIN_NOTES, SPECIAL } from '../data/content';
import { domainFor, unitsFor } from '../data/topics';
import { cycle, gauss, randInt, rngFor } from '../data/random';

export const CHART_CAPTIONS = {
  density: 'The standard normal density, with the upper 5% tail shaded.',
  exp: 'An exponential density with rate λ = 1. The shaded area is P(X ≤ 1).',
  bars: 'Histogram of a simulated sample of 500 observations.',
  scatter: 'Scatter plot with the fitted least squares line.',
  series: 'A simulated monthly series with trend and noise.',
  'supply-demand': 'Market equilibrium where supply meets demand.',
  function: 'The graph of f(x) = x³ − 6x² + 9x + 1 and its turning points.',
  roc: 'ROC curve of a fitted classifier against a random guess.',
};

// ── Context ──────────────────────────────────────────────────────────────────────────────────────

export function docContext(file) {
  const m = getModule(file.moduleId);
  const domain = domainFor(file.moduleId);
  return {
    file,
    m,
    domain,
    bank: BANKS[domain],
    units: unitsFor(file.moduleId),
    code: file.moduleCode,
    name: file.moduleName,
    special: /sigma notation/i.test(file.title) ? SPECIAL.sigma : null,
  };
}

/** "ST2133 Advanced Statistics: Distribution Theory" or just the name for Year 3. */
export function moduleLine(ctx) {
  return ctx.code ? `${ctx.code} ${ctx.name}` : ctx.name;
}

// ── Text helpers ─────────────────────────────────────────────────────────────────────────────────

export const sentences = (p) => String(p).split(/(?<=[.!?])\s+(?=[A-Z(])/).filter(Boolean);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function paragraphPicker(list, rng) {
  let i = randInt(rng, 0, list.length - 1);
  return () => list[i++ % list.length];
}

/** Section headings for body pages: definition terms, example titles and outcomes. */
function headingPool(ctx) {
  const b = ctx.bank;
  return [
    ...b.definitions.map(([t]) => t),
    ...b.examples.map((e) => e.title),
    ...b.outcomes.map((o) => cap(o.replace(/^(define|compute|use|derive|construct|carry out and interpret|explain|calculate|compare|analyse|differentiate|find and classify|evaluate|solve|write|store and query|reshape, join and summarise|produce|train and evaluate|state|estimate and interpret|test|detect and correct for|recognise|identify|apply|structure|summarise and visualise|fit and interpret|build|design and interpret) /i, ''))),
  ];
}

/** Find the unit a question is about (by tag overlap with unit titles). */
export function topicForQuestion(ctx, q) {
  let best = null;
  let bestScore = 0;
  for (const u of ctx.units) {
    const words = u.title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
    const s = q.tags.filter((t) => words.some((w) => w.startsWith(t) || t.startsWith(w))).length;
    if (s > bestScore) {
      best = u;
      bestScore = s;
    }
  }
  return best ? best.title : cap(q.tags[0]);
}

// ── Questions ────────────────────────────────────────────────────────────────────────────────────

function paperQuestionsFor(ctx, examYear, zone, pages) {
  const qs = ctx.bank.questions;
  const n = Math.max(3, Math.min(qs.length, pages - 2));
  const offset = ((examYear || 2024) * 3 + (zone === 'B' ? 2 : 0) + ctx.file.moduleId.length) % qs.length;
  return Array.from({ length: n }, (_, i) => qs[(offset + i) % qs.length]);
}

/** Questions most relevant to a unit first, then the rest of the bank. */
function unitQuestions(ctx, unit, n) {
  const words = (unit?.title || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  const scored = ctx.bank.questions.map((q, i) => [q.tags.filter((t) => words.some((w) => w.startsWith(t) || t.startsWith(w))).length, i, q]);
  scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return scored.slice(0, n).map((s) => s[2]);
}

// ── Layouts ──────────────────────────────────────────────────────────────────────────────────────

const LAYOUTS = new Map();

/** { ctx, pages: spec[] } with exactly file.pages entries. Cached per file. */
export function getLayout(file) {
  if (LAYOUTS.has(file.id)) return LAYOUTS.get(file.id);
  const ctx = docContext(file);
  let pages;
  if (file.format === 'PPTX') pages = slideLayout(ctx);
  else if (file.format === 'XLSX') pages = sheetLayout(ctx);
  else if (file.format === 'IPYNB') pages = notebookLayout(ctx);
  else if (file.format === 'R') pages = scriptLayout(ctx);
  else if (file.kind === 'past-paper') pages = paperLayout(ctx);
  else if (file.kind === 'examiners-report') pages = reportLayout(ctx);
  else if (file.kind === 'subject-guide') pages = guideLayout(ctx);
  else if (file.kind === 'reading') pages = readingLayout(ctx);
  else if (file.kind === 'study-guide') pages = studyLayout(ctx);
  else if (file.kind === 'exercises') pages = exerciseLayout(ctx);
  else if (file.kind === 'cheat-sheet') pages = cheatLayout(ctx);
  else pages = notesLayout(ctx);
  const P = file.pages;
  const out = pages.slice(0, P);
  while (out.length < P) out.push({ type: 'blank' });
  const layout = { ctx, pages: out };
  LAYOUTS.set(file.id, layout);
  return layout;
}

function paperLayout(ctx) {
  const { file } = ctx;
  const qs = paperQuestionsFor(ctx, file.examYear, file.zone, file.pages);
  const pages = [{ type: 'paper-cover', nQ: qs.length }];
  qs.forEach((q, i) => pages.push({ type: 'paper-q', q, n: i + 1, last: i === qs.length - 1 }));
  let rest = file.pages - pages.length;
  if (ctx.domain === 'stats' && rest >= 2) {
    pages.push({ type: 'paper-table' });
    rest -= 1;
  }
  while (rest > 1) {
    pages.push({ type: 'paper-blank' });
    rest -= 1;
  }
  if (rest === 1) pages.push({ type: 'paper-end' });
  return pages;
}

function reportLayout(ctx) {
  const { file } = ctx;
  const paper = FILES.find((f) => f.moduleId === file.moduleId && f.kind === 'past-paper' && f.examYear === file.examYear && f.zone === 'A');
  const qs = paperQuestionsFor(ctx, file.examYear, 'A', paper ? paper.pages : 8);
  const pages = [{ type: 'report-cover' }];
  const room = file.pages - 2;
  const per = Math.max(1, Math.floor(room / qs.length));
  let extra = room - per * qs.length;
  qs.forEach((q, i) => {
    const count = per + (extra-- > 0 ? 1 : 0);
    for (let k = 0; k < count; k++) pages.push({ type: 'report-q', q, n: i + 1, k, of: count });
  });
  pages.push({ type: 'report-summary', qs });
  return pages;
}

function guideLayout(ctx) {
  const { file, units } = ctx;
  const P = file.pages;
  const sampleQs = paperQuestionsFor(ctx, 2024, 'A', 6).slice(0, 4);
  const tail = 1 + Math.ceil(sampleQs.length / 2) + 1; // sample title, sample pages, notes page
  const start = 3;
  const end = P - tail; // exclusive
  const len = Math.max(units.length, end - start);
  const per = Math.max(1, Math.floor(len / units.length));
  let extra = len - per * units.length;
  const chapterPages = [];
  const contents = [{ label: 'Introduction', page: 3 }];
  units.forEach((u) => {
    const count = per + (extra-- > 0 ? 1 : 0);
    contents.push({ label: u.title, no: u.no, noun: u.noun, page: start + chapterPages.length + 1 });
    chapterPages.push({ type: 'guide-opener', unit: u });
    for (let k = 1; k < count; k++) chapterPages.push({ type: 'guide-body', unit: u, k });
  });
  const samplePage = start + chapterPages.length + 1;
  contents.push({ label: 'Sample examination paper', page: samplePage });
  const pages = [{ type: 'guide-cover' }, { type: 'guide-contents', entries: contents }, { type: 'guide-intro' }, ...chapterPages];
  pages.push({ type: 'guide-sample-title', nQ: sampleQs.length });
  for (let i = 0; i < sampleQs.length; i += 2) pages.push({ type: 'guide-sample', qs: sampleQs.slice(i, i + 2), n: i + 1 });
  pages.push({ type: 'guide-notes' });
  return pages;
}

function readingLayout(ctx) {
  const unit = ctx.file.unit || ctx.units[0];
  const pages = [{ type: 'reading-opener', unit }];
  for (let k = 1; k < ctx.file.pages; k++) pages.push({ type: 'reading-body', unit, k });
  return pages;
}

function studyLayout(ctx) {
  const pages = [{ type: 'study-title' }];
  for (let k = 1; k < ctx.file.pages; k++) pages.push({ type: 'study-unit', unit: cycle(ctx.units, k - 1), k });
  return pages;
}

function exerciseLayout(ctx) {
  const P = ctx.file.pages;
  const unit = ctx.file.unit || ctx.units[0];
  const slots = 2 + (P - 2) * 2;
  const qs = unitQuestions(ctx, unit, Math.min(slots, ctx.bank.questions.length));
  const pages = [{ type: 'ex-title', unit, qs: qs.slice(0, 2), start: 1 }];
  for (let i = 2, k = 1; k < P - 1; k++, i += 2) {
    const chunk = qs.slice(i, i + 2);
    pages.push(chunk.length ? { type: 'ex-body', unit, qs: chunk, start: i + 1 } : { type: 'ex-practice', unit, k });
  }
  pages.push({ type: 'ex-answers', unit, qs });
  return pages;
}

function notesLayout(ctx) {
  const { file, units, special } = ctx;
  const P = file.pages;
  if (special) {
    const pages = [{ type: 'notes-title', special: true, sections: [0] }];
    if (P > 1) pages.push({ type: 'notes-body', special: true, sections: [1, 2], k: 1 });
    for (let k = 2; k < P; k++) pages.push({ type: 'notes-practice', k });
    return pages;
  }
  // chapter notes stay on their unit; multi-topic notes walk through the units in order
  const list = file.unit ? [file.unit] : units;
  const per = Math.max(1, Math.ceil(P / list.length));
  const pages = [];
  for (let i = 0; i < P; i++) {
    const unit = list[Math.min(list.length - 1, Math.floor(i / per))];
    const first = i === 0;
    const newUnit = !first && unit !== list[Math.min(list.length - 1, Math.floor((i - 1) / per))];
    pages.push({ type: first ? 'notes-title' : 'notes-body', unit, k: i, newUnit });
  }
  return pages;
}

function cheatLayout() {
  return [
    { type: 'cheat', sections: CHEAT_SHEET.slice(0, 4), first: true },
    { type: 'cheat', sections: CHEAT_SHEET.slice(4) },
  ];
}

function slideLayout(ctx) {
  const { file, units, bank } = ctx;
  const P = file.pages;
  const pages = [{ type: 'slide-title' }, { type: 'slide-agenda' }];
  let u = 0;
  let k = 0;
  while (pages.length < P - 1) {
    const unit = units[u % units.length];
    if (k === 0) pages.push({ type: 'slide-section', unit, n: (u % units.length) + 1 });
    else pages.push({ type: 'slide-content', unit, k, variant: (u + k) % 3 });
    k += 1;
    if (k > 1) {
      k = 0;
      u += 1;
      if (u % 4 === 0 && pages.length < P - 2) pages.push({ type: 'slide-check', q: bank.questions[(u / 4) % bank.questions.length] });
    }
  }
  pages.push({ type: 'slide-summary' });
  return pages;
}

function sheetLayout(ctx) {
  const block = ctx.file.unit?.no;
  const sets = {
    7: ['payoffs', 'tree', 'sensitivity'],
    13: ['sales', 'forecast-chart', 'errors', 'seasonality'],
    15: ['inputs', 'trials', 'histogram', 'summary'],
  };
  const names = {
    payoffs: 'Payoffs', tree: 'Tree', sensitivity: 'Sensitivity', sales: 'Sales', 'forecast-chart': 'Chart',
    errors: 'Errors', seasonality: 'Seasonality', inputs: 'Inputs', trials: 'Trials', histogram: 'Histogram', summary: 'Summary',
  };
  const list = (sets[block] || sets[13]).slice(0, ctx.file.pages);
  const tabs = list.map((s) => names[s]);
  return list.map((sheet, i) => ({ type: 'sheet', sheet, tabs, active: i }));
}

function notebookLayout(ctx) {
  const cells = notebookCells(ctx);
  const P = ctx.file.pages;
  const per = Math.ceil(cells.length / P);
  return Array.from({ length: P }, (_, i) => ({ type: 'nb', cells: cells.slice(i * per, (i + 1) * per), first: i === 0 }));
}

export const SCRIPT_LINES_PER_PAGE = 48;

function scriptLayout(ctx) {
  const lines = scriptLines(ctx);
  return Array.from({ length: ctx.file.pages }, (_, i) => ({
    type: 'script',
    start: i * SCRIPT_LINES_PER_PAGE,
    lines: lines.slice(i * SCRIPT_LINES_PER_PAGE, (i + 1) * SCRIPT_LINES_PER_PAGE),
  }));
}

// ── Page content generators ──────────────────────────────────────────────────────────────────────

/**
 * Flowing body blocks for guides, readings and notes. Over-generates; the page's fitter hides
 * whatever doesn't fit. style: 'guide' | 'reading' | 'notes'.
 */
export function bodyBlocks(ctx, spec, style) {
  const { bank, file } = ctx;
  const rng = rngFor(file.id, 'blocks', spec.k ?? 0, spec.unit?.no ?? '');
  const nextP = paragraphPicker(bank.paragraphs, rng);
  const heads = headingPool(ctx);
  let h = randInt(rng, 0, heads.length - 1);
  const unitNo = spec.unit?.no ?? '1';
  let section = 1 + ((spec.k ?? 0) - 1) * 2;
  const charts = bank.charts;
  const blocks = [];
  const extras = (i) => {
    const kinds = style === 'reading' ? ['figure', 'formula', 'quote', 'figure'] : style === 'notes' ? ['def', 'formula', 'example', 'figure', 'list'] : ['def', 'example', 'figure', 'activity', 'formula'];
    const kind = kinds[(i + randInt(rng, 0, kinds.length - 1)) % kinds.length];
    if (kind === 'def') {
      const [term, text] = cycle(bank.definitions, randInt(rng, 0, 99));
      return { t: 'def', term, text };
    }
    if (kind === 'example') return { t: 'example', ...cycle(bank.examples, randInt(rng, 0, 99)) };
    if (kind === 'activity') return { t: 'activity', text: cycle(bank.activities, randInt(rng, 0, 99)) };
    if (kind === 'formula') return { t: 'formula', tex: cycle(bank.formulas, randInt(rng, 0, 99)) };
    if (kind === 'quote') return { t: 'quote', text: sentences(nextP())[0] };
    if (kind === 'list') return { t: 'list', items: sentences(nextP()).slice(0, 3) };
    const chart = cycle(charts, randInt(rng, 0, 99));
    return { t: 'figure', chart, seed: `${file.id}-${spec.k}-${chart}`, caption: CHART_CAPTIONS[chart] };
  };
  const heading = () => {
    const text = heads[h++ % heads.length];
    const label = style === 'notes' ? text : `${unitNo}.${section++} ${text}`;
    return { t: style === 'reading' ? 'h3' : 'h2', text: label };
  };

  if (style === 'notes') {
    const notes = MARGIN_NOTES;
    let n = randInt(rng, 0, notes.length - 1);
    for (let i = 0; i < 4; i++) {
      blocks.push({ t: 'h3', text: heads[h++ % heads.length], mark: i === 0 });
      blocks.push({ t: 'list', items: sentences(nextP()).slice(0, 3), margin: i % 2 === 0 ? notes[n++ % notes.length] : null });
      blocks.push(extras(i));
      if (i % 2 === 1) blocks.push({ t: 'p', text: sentences(nextP())[0], margin: notes[n++ % notes.length] });
    }
    return blocks;
  }

  if (!spec.continues) blocks.push(heading());
  blocks.push({ t: 'p', text: nextP() }, { t: 'p', text: nextP() });
  blocks.push(extras(0));
  blocks.push({ t: 'p', text: nextP() });
  if (style === 'reading') blocks.push({ t: 'p', text: nextP() });
  blocks.push(heading());
  blocks.push({ t: 'p', text: nextP() });
  blocks.push(extras(1));
  blocks.push({ t: 'p', text: nextP() }, { t: 'p', text: nextP() });
  blocks.push(extras(2));
  blocks.push({ t: 'p', text: nextP() }, { t: 'p', text: nextP() });
  return blocks;
}

/** Report commentary blocks for one page of one question. */
export function reportBlocks(ctx, spec) {
  const rng = rngFor(ctx.file.id, 'report', spec.n, spec.k);
  const nextC = paragraphPicker(COMMENTARY.perQuestion, rng);
  const nextP = paragraphPicker(ctx.bank.paragraphs, rng);
  const q = spec.q;
  const parts = q.parts || [];
  const blocks = [];
  if (spec.k === 0) {
    blocks.push({ t: 'h3', text: 'Approaching the question' });
    blocks.push({ t: 'p', text: nextC() });
    blocks.push({ t: 'p', text: nextP() });
    if (parts[0]) blocks.push({ t: 'part', label: '(a)', text: nextC() });
    if (parts[1]) blocks.push({ t: 'part', label: '(b)', text: nextC() });
  } else {
    const startPart = Math.min(parts.length - 1, 1 + spec.k);
    blocks.push({ t: 'h3', text: spec.k === spec.of - 1 ? 'Common errors' : 'Comments on the parts' });
    if (spec.k === spec.of - 1) {
      blocks.push({ t: 'list', items: COMMENTARY.steps.slice(spec.n % 2, (spec.n % 2) + 3) });
      blocks.push({ t: 'p', text: nextC() });
    } else if (parts[startPart]) {
      blocks.push({ t: 'part', label: `(${String.fromCharCode(97 + startPart)})`, text: nextC() });
    }
    if (q.chart || ctx.bank.charts.length) {
      const chart = q.chart || cycle(ctx.bank.charts, spec.n + spec.k);
      blocks.push({ t: 'figure', chart, seed: `${ctx.file.id}-r${spec.n}-${spec.k}`, caption: `A sketch of the diagram expected in a strong answer. ${CHART_CAPTIONS[chart]}` });
    }
    blocks.push({ t: 'p', text: nextP() });
    blocks.push({ t: 'formula', tex: cycle(ctx.bank.formulas, spec.n + spec.k) });
    blocks.push({ t: 'p', text: nextC() });
  }
  blocks.push({ t: 'p', text: nextP() });
  return blocks;
}

/** A random-looking but seeded series. */
export function seededSeries(seed, n, { start = 50, drift = 0.6, noise = 3 } = {}) {
  const rng = rngFor('series', seed);
  let v = start;
  return Array.from({ length: n }, () => {
    v += drift + gauss(rng) * noise;
    return v;
  });
}

// ── Standard normal table ────────────────────────────────────────────────────────────────────────

function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
export const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

export function normalTable() {
  const rows = [];
  for (let r = 0; r <= 30; r++) {
    const z = r / 10;
    rows.push([z.toFixed(1), ...Array.from({ length: 10 }, (_, c) => phi(z + c / 100).toFixed(4).slice(1))]);
  }
  return rows;
}

// ── Notebooks ────────────────────────────────────────────────────────────────────────────────────

const CARRIERS = ['WN', 'AA', 'DL', 'UA', 'US', 'NW', 'CO', 'MQ'];
const AIRPORTS = ['ATL', 'ORD', 'DFW', 'LAX', 'DEN', 'PHX', 'IAH', 'LAS'];

function nbTable(rng, kind) {
  if (kind === 'monthly') {
    return {
      head: ['', 'month', 'flights', 'avg_delay'],
      rows: Array.from({ length: 5 }, (_, i) => [String(i), String(i + 1), String(Math.round(575000 + rng() * 37000)), (4 + rng() * 8).toFixed(2)]),
    };
  }
  if (kind === 'age') {
    return { head: ['built', 'arr_delay'], rows: ['2003', '2004', '2005', '2006', '2007'].map((y) => [y, (5 + rng() * 4).toFixed(4)]) };
  }
  if (kind === 'describe') {
    const stats = ['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max'];
    return {
      head: ['', 'mean', 'count'],
      rows: stats.map((s, i) => [s, s === 'count' ? '4912.00' : (i * 3.1 + rng() * 4 - 2).toFixed(2), s === 'count' ? '4912.00' : String(Math.round(200 + i * 160 + rng() * 90)) + '.00']),
    };
  }
  if (kind === 'carriers') {
    return { head: ['carrier', 'mean_delay', 'flights'], rows: CARRIERS.slice(0, 6).map((c) => [c, (3 + rng() * 9).toFixed(2), String(Math.round(40000 + rng() * 90000))]) };
  }
  if (kind === 'airports') {
    return { head: ['origin', 'avg', 'n'], rows: AIRPORTS.slice(0, 5).map((a) => [a, (6 + rng() * 8).toFixed(2), String(Math.round(90000 + rng() * 300000))]) };
  }
  if (kind === 'confusion') {
    return { head: ['', 'predicted 0', 'predicted 1'], rows: [['actual 0', '412', '38'], ['actual 1', '72', '278']] };
  }
  if (kind === 'report') {
    return { head: ['', 'precision', 'recall', 'f1-score', 'support'], rows: [['0', '0.85', '0.92', '0.88', '450'], ['1', '0.88', '0.79', '0.83', '350'], ['accuracy', '', '', '0.86', '800']] };
  }
  return { head: ['', 'value'], rows: [['0', '1.00']] };
}

function notebookCells(ctx) {
  const { file, m } = ctx;
  const rng = rngFor(file.id, 'nb');
  const isML = m?.id === 'machine-learning';
  const unitTitle = file.unit?.title || 'Notebook';
  const cells = [{ md: true, title: `${file.unit ? `${file.unit.noun} ${file.unit.no}: ` : ''}${unitTitle}`, text: isML ? 'A worked classification example: split the data, fit models, and compare them on data they have not seen.' : 'Work through the cells in order. Each one builds on the result of the cell before it.' }];
  const base = isML ? BANKS.prog.code.mlCells : BANKS.prog.code.cells;
  const resolve = (c) => {
    if (c.md) return { md: true, text: c.md };
    const out = c.out ? { ...c.out } : null;
    if (out && typeof out.table === 'string') out.table = nbTable(rng, out.table);
    return { lang: c.lang, src: c.src, out };
  };
  base.forEach((c) => cells.push(resolve(c)));
  // Procedural follow-up cells so longer notebooks keep going without repeating.
  const metrics = isML ? ['max_depth', 'n_neighbors', 'C'] : ['arr_delay', 'dep_delay', 'distance'];
  const groups = ['carrier', 'origin', 'month', 'dest'];
  for (let i = 0; cells.length < file.pages * 4 + 2; i++) {
    if (isML) {
      const param = metrics[i % metrics.length];
      const model = { max_depth: 'DecisionTreeClassifier', n_neighbors: 'KNeighborsClassifier', C: 'LogisticRegression' }[param];
      const values = param === 'C' ? '[0.01, 0.1, 1, 10]' : '[1, 3, 5, 7, 9]';
      cells.push({ md: true, text: `Tune ${param} for the ${model.replace('Classifier', ' classifier').replace('LogisticRegression', 'logistic regression')} with five-fold cross-validation.` });
      cells.push({
        lang: 'python',
        src: `for v in ${values}:\n    clf = ${model}(${param}=v)\n    s = cross_val_score(clf, X_train, y_train, cv=5)\n    print(v, s.mean().round(4))`,
        out: { text: (param === 'C' ? ['0.01', '0.1', '1', '10'] : ['1', '3', '5', '7', '9']).map((v) => `${v} ${(0.78 + rng() * 0.09).toFixed(4)}`).join('\n') },
      });
      cells.push(i % 2 === 0 ? { lang: 'python', src: 'confusion_matrix(y_test, model.predict(X_test))', out: { table: nbTable(rng, 'confusion') } } : { lang: 'python', src: 'print(classification_report(y_test, model.predict(X_test)))', out: { table: nbTable(rng, 'report') } });
    } else {
      const g = groups[i % groups.length];
      const metric = metrics[i % metrics.length];
      cells.push({ md: true, text: `Average ${metric.replace('_', ' ')} by ${g}, largest first.` });
      cells.push({
        lang: 'python',
        src: `(df.dropna(subset=["${metric}"])\n   .groupby("${g}")["${metric}"]\n   .agg(["mean", "count"])\n   .sort_values("mean", ascending=False)\n   .head())`,
        out: { table: nbTable(rng, g === 'origin' || g === 'dest' ? 'airports' : 'carriers') },
      });
      if (i % 2 === 1) cells.push({ lang: 'python', src: `ax = df.groupby("month")["${metric}"].mean().plot(marker="o")\nax.set_ylabel("${metric}")`, out: { chart: i % 4 === 1 ? 'series' : 'bars' } });
    }
  }
  let count = 0;
  return cells.map((c) => (c.md ? c : { ...c, n: ++count }));
}

// ── R scripts ────────────────────────────────────────────────────────────────────────────────────

function scriptLines(ctx) {
  const { file } = ctx;
  const head = [
    `# ${file.title}`,
    `# ${moduleLine(ctx)}`,
    '# Run top to bottom. Needs the flights data from Block 3.',
    '',
  ];
  const lines = head.concat(BANKS.prog.code.r);
  const groups = ['carrier', 'origin', 'dest', 'month', 'dayofweek'];
  const stats = [['mean', 'mean_delay'], ['median', 'median_delay'], ['max', 'worst_delay'], ['sd', 'sd_delay']];
  for (let i = 0; lines.length < file.pages * SCRIPT_LINES_PER_PAGE; i++) {
    const g = groups[i % groups.length];
    const [fn, col] = stats[i % stats.length];
    lines.push(
      '',
      `# ── Section ${i + 2}: ${col.replace('_', ' ')} by ${g} ──────────────────`,
      `by_${g} <- flights |>`,
      '  filter(!is.na(arr_delay)) |>',
      `  group_by(${g}) |>`,
      `  summarise(${col} = ${fn}(arr_delay), n = n()) |>`,
      `  arrange(desc(${col}))`,
      '',
      `head(by_${g}, 10)`,
      '',
      `if (nrow(by_${g}) > ${5 + i}) {`,
      `  top_${g} <- by_${g}$${g}[1:${5 + i}]`,
      '} else {',
      `  top_${g} <- by_${g}$${g}`,
      '}',
      '',
      `ggplot(by_${g}, aes(reorder(${g}, ${col}), ${col})) +`,
      '  geom_col() +',
      '  coord_flip() +',
      `  labs(x = NULL, y = "${cap(col.replace('_', ' '))} (min)")`,
    );
  }
  return lines;
}

// ── Spreadsheets ─────────────────────────────────────────────────────────────────────────────────

const COLS = 'ABCDEFGHIJ'.split('');

/** Cell grid for a sheet: { cols, rows: cell[][], ref, formula, chart? }. cell: { v, f?, b?, fill?, num?, sel? } */
export function sheetData(ctx, sheet) {
  const rng = rngFor(ctx.file.id, 'sheet', sheet);
  const c = (v, o = {}) => ({ v, ...o });
  const n = (v, dp = 0, o = {}) => ({ v: Number(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }), num: true, ...o });
  const header = (labels) => labels.map((l) => c(l, { b: true, fill: 'head' }));
  switch (sheet) {
    case 'payoffs': {
      const rows = [
        [c('Launch decision', { b: true, big: true })],
        [],
        header(['Decision', 'High', 'Medium', 'Low', 'EMV']),
        [c('Probability', { i: true }), n(0.4, 2), n(0.35, 2), n(0.25, 2), c('')],
        [c('Launch'), n(120), n(40), n(-60), n(47, 1, { b: true, fill: 'good', f: '=SUMPRODUCT($B$4:$D$4,B5:D5)' })],
        [c('Small launch'), n(70), n(30), n(-10), n(36, 1, { f: '=SUMPRODUCT($B$4:$D$4,B6:D6)' })],
        [c('Do not launch'), n(0), n(0), n(0), n(0, 1, { f: '=SUMPRODUCT($B$4:$D$4,B7:D7)' })],
        [],
        [c('Best EMV', { b: true }), c(''), c(''), c(''), n(47, 1, { b: true, f: '=MAX(E5:E7)' })],
        [c('EV with perfect information', { b: true }), c(''), c(''), c(''), n(62, 1, { f: '=B4*MAX(B5:B7)+C4*MAX(C5:C7)+D4*MAX(D5:D7)' })],
        [c('EVPI', { b: true }), c(''), c(''), c(''), n(15, 1, { b: true, fill: 'key', sel: true, f: '=E10-E9' })],
        [],
        [c('Payoffs in BHD thousands.', { i: true })],
      ];
      return { cols: COLS.slice(0, 6), rows, ref: 'E11', formula: '=E10-E9' };
    }
    case 'tree':
      return { cols: COLS.slice(0, 8), rows: [[c('Decision tree', { b: true, big: true })]], ref: 'A1', formula: 'Decision tree', drawing: 'tree' };
    case 'sensitivity': {
      const rows = [[c('EMV as P(high demand) changes', { b: true, big: true })], [], header(['P(high)', 'Launch', 'Small launch', 'Best'])];
      for (let p = 0.2; p <= 0.61; p += 0.05) {
        const pm = 0.35;
        const pl = 1 - p - pm;
        const a = 120 * p + 40 * pm - 60 * pl;
        const b = 70 * p + 30 * pm - 10 * pl;
        rows.push([n(p, 2), n(a, 1), n(b, 1), c(a >= b ? 'Launch' : 'Small launch', { b: a >= b })]);
      }
      return { cols: COLS.slice(0, 6), rows, ref: 'B4', formula: '=120*A4+40*0.35-60*(1-A4-0.35)', chart: { kind: 'series', title: 'EMV by probability of high demand' } };
    }
    case 'sales': {
      const sales = [42, 45, 44, 48, 51, 50, 53, 55, 54, 58, 60, 61];
      const rows = [header(['Month', 'Sales', '3-month MA', 'Trend', 'Error', '|Error|'])];
      sales.forEach((s, i) => {
        const ma = i >= 3 ? (sales[i - 1] + sales[i - 2] + sales[i - 3]) / 3 : null;
        const trend = 40.68 + 1.703 * (i + 1);
        rows.push([n(i + 1), n(s), ma == null ? c('') : n(ma, 1), n(trend, 1), ma == null ? c('') : n(s - ma, 1), ma == null ? c('') : n(Math.abs(s - ma), 1)]);
      });
      rows.push([c('Forecast', { b: true }), c(''), n((58 + 60 + 61) / 3, 1, { b: true, fill: 'key', sel: true }), n(40.68 + 1.703 * 13, 1, { b: true }), c(''), c('')]);
      return { cols: COLS.slice(0, 7), rows, ref: 'C14', formula: '=AVERAGE(B11:B13)' };
    }
    case 'forecast-chart':
      return { cols: COLS.slice(0, 8), rows: [[c('Actual and forecast sales', { b: true, big: true })]], ref: 'A1', formula: 'Actual and forecast sales', chart: { kind: 'series', title: 'Sales, thousands of units', full: true } };
    case 'errors': {
      const rows = [header(['Measure', '3-month MA', 'Linear trend']), [c('MAD'), n(3.59, 2), n(0.87, 2)], [c('MSE'), n(14.13, 2), n(1.13, 2)], [c('MAPE'), c('6.6%'), c('1.7%')], [], [c('Lower is better on every measure.', { i: true })]];
      return { cols: COLS.slice(0, 5), rows, ref: 'B2', formula: '=AVERAGE(F5:F13)' };
    }
    case 'seasonality': {
      const rows = [header(['Quarter', 'Index', 'Adjusted'])];
      ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q) => rows.push([c(q), n(0.9 + rng() * 0.2, 3), n(50 + rng() * 8, 1)]));
      return { cols: COLS.slice(0, 5), rows, ref: 'B2', formula: '=AVERAGEIF($A$2:$A$13,A2,$C$2:$C$13)' };
    }
    case 'inputs': {
      const rows = [
        [c('Profit model inputs', { b: true, big: true })],
        [],
        header(['Input', 'Value', 'Note']),
        [c('Unit price'), n(25, 2), c('BHD')],
        [c('Unit cost'), n(14.5, 2), c('BHD')],
        [c('Fixed cost'), n(4200, 0), c('BHD per year')],
        [c('Demand mean'), n(500, 0), c('units')],
        [c('Demand sd'), n(80, 0), c('units')],
        [c('Trials'), n(1000, 0), c('')],
        [],
        [c('Change an input and press F9 to re-run the trials.', { i: true })],
      ];
      return { cols: COLS.slice(0, 5), rows, ref: 'B7', formula: '500' };
    }
    case 'trials': {
      const rows = [header(['Trial', 'Demand', 'Revenue', 'Cost', 'Profit'])];
      for (let i = 1; i <= 24; i++) {
        const d = Math.round(500 + gauss(rng) * 80);
        const rev = d * 25;
        const cost = 4200 + d * 14.5;
        rows.push([n(i), n(d, 0, i === 3 ? { sel: true } : {}), n(rev, 0), n(cost, 0), n(rev - cost, 0, rev - cost < 0 ? { neg: true } : {})]);
      }
      return { cols: COLS.slice(0, 6), rows, ref: 'B4', formula: '=ROUND(NORM.INV(RAND(),Inputs!$B$7,Inputs!$B$8),0)' };
    }
    case 'histogram':
      return { cols: COLS.slice(0, 8), rows: [[c('Simulated annual profit', { b: true, big: true })]], ref: 'A1', formula: 'Simulated annual profit', chart: { kind: 'bars', title: 'Profit, BHD (1,000 trials)', full: true } };
    case 'summary': {
      const rows = [header(['Statistic', 'Profit']), [c('Mean'), n(1047, 0)], [c('Standard deviation'), n(836, 0)], [c('5th percentile'), n(-329, 0, { neg: true })], [c('95th percentile'), n(2421, 0)], [c('P(loss)'), c('10.4%', { b: true, fill: 'key', sel: true })]];
      return { cols: COLS.slice(0, 4), rows, ref: 'B6', formula: '=COUNTIF(Trials!E2:E1001,"<0")/1000' };
    }
    default:
      return { cols: COLS.slice(0, 6), rows: [], ref: 'A1', formula: '' };
  }
}
