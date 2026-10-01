// DSBA Pulse library: a deterministic mock file catalog derived from MODULES (src/data/modules.js).
// Every v1 resource link becomes one or more "real" files. Each file keeps the v1 link it came from as
// `sourceUrl` (the viewer's "Open original"). Nothing here uses Math.random(); "new this week" files
// are placed relative to Date.now() (the launch film freezes the clock, so they stay stable).
//
// File: { id, moduleId, year, kind, title, format, pages, sizeKB, author, addedAt (ISO), sourceUrl, isNew,
//         …extras: fileName, ext, url, kindLabel, moduleCode, moduleName, moduleShort, examYear, zone,
//         unit {no, noun, title}, addedBy, downloads, trend[12], seed }
import { MODULES, getModule } from '../../../data/modules.js';
import { FORMATS, KIND_BY_ID, KIND_ORDER } from './kinds.js';
import { cycle, randInt, rngFor } from './random.js';
import { unitsFor } from './topics.js';

const HOUR = 36e5;
const DAY = 24 * HOUR;
const NOW = Date.now();

const UOL = 'University of London';
const COURSE_TEAM = 'Course team';
const CONTRIBUTORS = 'DSBA contributors';
const MAINTAINER = 'Mohamed Alnooh'; // v1: creator and maintainer
const ARCHIVIST = 'Feras Alsadadi'; // v1: historical past exams

const utc = (y, m, d) => Date.UTC(y, m - 1, d, 6); // 09:00 in Bahrain
const HUB_LAUNCH = utc(2024, 2, 5);
const OLD_CUTOFF = Math.min(utc(2026, 9, 12), NOW - 10 * DAY);
const LAST_PAPER_YEAR = 2025;

/** Files that arrived this week, with how many hours ago. Includes the Year 2 notes v1 announced. */
const NEW_THIS_WEEK = {
  'st2133-study-guide-mohamed': 5,
  'st2133-past-paper-2025-zone-a': 7,
  'is2184-chapter-2-notes-mahdi': 9,
  'st2195-block-6-notebook-data-wrangling': 15,
  'st2187-revision-notes-mohamed': 22,
  'st1215-chapter-8-notes-mariam-nasser': 30,
  'is2184-chapter-1-notes-mahdi': 33,
  'st2134-product-and-sigma-notation': 50,
  'ec2020-examiners-report-2025': 74,
  'ec1002-past-paper-2025-zone-a': 97,
  'machine-learning-subject-guide': 118,
  'mt1186-exercise-set-9-difference-equations': 141,
};

/**
 * How each v1 students' note becomes files. Keyed by module id, then the v1 note name.
 * units: chapter/block numbers for a folder of chapter notes; title: a single file.
 */
const NOTE_PLAN = {
  economics: {
    Mahdi: { units: ['2', '3', '4'] },
    'Mohamed Hasan': { units: ['15', '17'], format: 'DOCX' },
  },
  business: {
    'Feras full revision': { title: 'Full revision – Feras', format: 'PPTX', pages: [38, 38] },
    '𓇼🧽🍍 Patrick: Business Edition': { title: 'Patrick: Business Edition' },
  },
  statistics: {
    Nasser: { units: ['1', '2'] },
    'Mariam Nasser': { units: ['4', '5', '8'] },
    'Product and Sigma Notation': { title: 'Product and sigma notation', pages: [3, 4] },
  },
  'advanced-stats-distribution': {
    'Mohamed study guide': { title: 'Study guide – Mohamed', pages: [44, 52] },
  },
  'advanced-stats-inferential': {
    'Product and Sigma Notation': { title: 'Product and sigma notation', pages: [3, 4] },
  },
  'business-analytics': {
    Mohamed: { title: 'Revision notes – Mohamed', pages: [26, 34] },
  },
  'information-systems': {
    Mahdi: { units: ['1', '2'], format: 'DOCX' },
  },
};

/** Study guides from the materials folder. Block modules get walkthrough notebooks, scripts and workbooks. */
const STUDY_PLAN = {
  'programming-data-science': [
    { block: '3', format: 'IPYNB', word: 'notebook' },
    { block: '4', format: 'R', word: 'script' },
    { block: '6', format: 'IPYNB', word: 'notebook' },
  ],
  'business-analytics': [
    { block: '7', format: 'XLSX', word: 'workbook' },
    { block: '13', format: 'XLSX', word: 'workbook' },
    { block: '15', format: 'XLSX', word: 'workbook' },
  ],
  'machine-learning': [{ unit: '3', format: 'IPYNB', word: 'notebook' }],
};

/** Exercise sets (only modules whose v1 entry has an exercises link). */
const EXERCISE_PLAN = {
  economics: { units: ['2', '3', '6', '7', '15', '17'], format: 'PDF' },
  business: { units: ['1', '4', '6', '9', '12'], format: 'DOCX' },
  mathematics: { units: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], format: 'PDF' },
};

/** Download popularity by kind; cohorts differ in size. */
const KIND_DOWNLOADS = {
  'past-paper': 205, 'examiners-report': 120, 'subject-guide': 520, reading: 250,
  'study-guide': 300, exercises: 290, notes: 390, 'cheat-sheet': 640,
};
const YEAR_WEIGHT = { 1: 1.15, 2: 1, 3: 0.5 };

// [min pages, max pages, min KB, max KB] per kind and format.
const SIZE_RULES = {
  'past-paper': { PDF: [6, 9, 140, 520] },
  'examiners-report': { PDF: [10, 18, 380, 1100] },
  'subject-guide': { PDF: [150, 248, 2600, 8200] },
  reading: { PDF: [18, 42, 900, 4200] },
  'study-guide': { PDF: [8, 14, 500, 1800], IPYNB: [9, 14, 140, 880], R: [3, 5, 6, 24], XLSX: [3, 4, 60, 480] },
  exercises: { PDF: [3, 5, 120, 480], DOCX: [3, 5, 60, 220] },
  'cheat-sheet': { DOCX: [2, 2, 90, 160] },
  notes: { PDF: [8, 24, 600, 5200], DOCX: [8, 16, 80, 400], PPTX: [30, 46, 3000, 9000] },
};

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Strip leading symbols/emoji (v1 had '𓇼🧽🍍 Patrick…'); keeps the film free of missing-glyph boxes. */
function cleanName(s) {
  return String(s).replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

const shortUnitTitle = (t) => String(t).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

function between(rng, a, b) {
  return a + Math.floor(rng() * Math.max(0, b - a));
}

function findUnit(moduleId, no) {
  return unitsFor(moduleId).find((u) => u.no === String(no)) || null;
}

// ── Build ────────────────────────────────────────────────────────────────────────────────────────

function buildCatalog() {
  const files = [];
  const ids = new Set();

  const add = (m, spec) => {
    const { kind, title, format = 'PDF', sourceUrl, author, addedAt, addedBy } = spec;
    if (!sourceUrl) return;
    const code = m.unitCode;
    let id = slugify(code && title.startsWith(code) ? title : title.startsWith(m.name) ? title : `${code || m.id} ${title}`);
    let n = 2;
    while (ids.has(id)) id = `${id}-${n++}`;
    ids.add(id);

    const rng = rngFor('file', id);
    const rule = (SIZE_RULES[kind] && (SIZE_RULES[kind][format] || Object.values(SIZE_RULES[kind])[0])) || [4, 12, 100, 900];
    const pages = spec.pages ? randInt(rng, spec.pages[0], spec.pages[1]) : randInt(rng, rule[0], rule[1]);
    const sizeKB = Math.round(rule[2] + (rule[3] - rule[2]) * (0.25 * rng() + 0.75 * Math.min(1, pages / Math.max(rule[1], 1)) * rng() + 0.1 * rng()));
    const fmt = FORMATS[format];

    files.push({
      id,
      moduleId: m.id,
      year: m.year,
      kind,
      title,
      format,
      pages,
      sizeKB,
      author,
      addedAt: new Date(addedAt).toISOString(),
      sourceUrl,
      isNew: false,
      // extras (not part of the cross-feature contract, but handy)
      fileName: `${title}.${fmt.ext}`,
      ext: fmt.ext,
      url: `/library/${id}`,
      kindLabel: KIND_BY_ID[kind].label,
      moduleCode: code || null,
      moduleName: m.name,
      moduleShort: m.shortName,
      examYear: spec.examYear ?? null,
      zone: spec.zone ?? null,
      unit: spec.unit || null,
      addedBy: addedBy || MAINTAINER,
      downloads: 0,
      trend: [],
      seed: hashSeed(id),
    });
  };

  for (const m of MODULES) {
    const r = m.resources;
    const code = m.unitCode;
    const rng = rngFor('module', m.id);
    const units = unitsFor(m.id);
    const named = (lead, rest) => (code ? `${code} ${lead}${rest}` : `${m.name} ${lead.toLowerCase()}${rest}`);
    const y3 = m.year === 3;
    const y3Date = (a = utc(2025, 8, 20), b = utc(2025, 10, 30)) => between(rng, a, b);

    // Materials: subject guide, essential reading, study guides.
    if (r.materials) {
      add(m, {
        kind: 'subject-guide',
        title: named('Subject guide', ''),
        sourceUrl: r.materials,
        author: UOL,
        addedAt: y3 ? y3Date() : between(rng, HUB_LAUNCH, HUB_LAUNCH + 40 * DAY),
      });
      const readingUnits = y3 ? [units[Math.floor(units.length * 0.4)]] : [units[Math.floor(units.length * 0.2)], units[Math.floor(units.length * 0.62)]];
      for (const u of [...new Set(readingUnits)].filter(Boolean)) {
        add(m, {
          kind: 'reading',
          title: named('Essential reading', ` – ${shortUnitTitle(u.title)}`),
          sourceUrl: r.materials,
          author: UOL,
          unit: u,
          addedAt: y3 ? y3Date() : between(rng, utc(2024, 3, 1), utc(2024, 12, 1)),
        });
      }
      const plan = STUDY_PLAN[m.id];
      if (plan) {
        for (const p of plan) {
          const u = p.block ? findUnit(m.id, p.block) : findUnit(m.id, p.unit);
          if (!u) continue;
          add(m, {
            kind: 'study-guide',
            title: named(`${u.noun} ${u.no} ${p.word}`, ` – ${shortUnitTitle(u.title)}`),
            format: p.format,
            sourceUrl: r.materials,
            author: COURSE_TEAM,
            unit: u,
            addedAt: y3 ? y3Date() : between(rng, utc(2024, 4, 1), utc(2025, 6, 30)),
          });
        }
      } else if (!y3) {
        add(m, {
          kind: 'study-guide',
          title: named('Revision study guide', ''),
          sourceUrl: r.materials,
          author: COURSE_TEAM,
          addedAt: between(rng, utc(2024, 4, 1), utc(2025, 6, 30)),
        });
      }
    }

    // Exercises.
    const ex = EXERCISE_PLAN[m.id];
    if (r.exercises && ex) {
      for (const no of ex.units) {
        const u = findUnit(m.id, no);
        if (!u) continue;
        add(m, {
          kind: 'exercises',
          title: named(`Exercise set ${u.no}`, ` – ${shortUnitTitle(u.title)}`),
          format: ex.format,
          sourceUrl: r.exercises,
          author: COURSE_TEAM,
          unit: u,
          addedAt: between(rng, HUB_LAUNCH, utc(2024, 6, 1)),
        });
      }
    }

    // Past papers (VLE: recent years; older exams folder: earlier years) and examiners' reports.
    const recent = r.vle || r.olderExams;
    const older = r.olderExams && r.olderExams !== r.vle ? r.olderExams : recent;
    if (recent) {
      const first = m.year === 1 ? 2019 : m.year === 2 ? 2020 : 2024;
      for (let y = LAST_PAPER_YEAR; y >= first; y--) {
        const src = y >= 2022 ? recent : older;
        const bulk = y <= 2023 && !y3;
        for (const zone of ['A', 'B']) {
          add(m, {
            kind: 'past-paper',
            title: named('Past paper', ` ${y} Zone ${zone}`),
            sourceUrl: src,
            author: UOL,
            examYear: y,
            zone,
            addedBy: bulk ? ARCHIVIST : MAINTAINER,
            addedAt: bulk
              ? between(rng, HUB_LAUNCH, HUB_LAUNCH + 70 * DAY)
              : y3
                ? (y === 2024 ? y3Date() : between(rng, utc(2025, 10, 1), utc(2025, 11, 20)))
                : between(rng, utc(y, 9, 1), utc(y, 11, 15)),
          });
        }
        const reportYears = y <= 2024 || m.id === 'econometrics';
        if (reportYears) {
          add(m, {
            kind: 'examiners-report',
            title: named('Examiners’ report', ` ${y}`),
            sourceUrl: src,
            author: UOL,
            examYear: y,
            addedBy: y <= 2022 && !y3 ? ARCHIVIST : MAINTAINER,
            addedAt: y <= 2022 && !y3
              ? between(rng, HUB_LAUNCH, HUB_LAUNCH + 70 * DAY)
              : y3
                ? y3Date()
                : between(rng, utc(y + 1, 2, 1), utc(y + 1, 4, 30)),
          });
        }
      }
    }

    // Cheat sheet.
    if (r.cheatSheet) {
      add(m, {
        kind: 'cheat-sheet',
        title: named('Cheat sheet', ''),
        format: 'DOCX',
        sourceUrl: r.cheatSheet,
        author: CONTRIBUTORS,
        addedAt: between(rng, utc(2025, 1, 10), utc(2025, 3, 10)),
      });
    }

    // Students' notes: every v1 note, with its real contributor.
    const plan = NOTE_PLAN[m.id] || {};
    m.notes.forEach((note, i) => {
      const p = plan[note.name] || {};
      const author = note.author || CONTRIBUTORS;
      const isFolder = /\/folders\//.test(note.url);
      const base = {
        kind: 'notes',
        format: p.format || 'PDF',
        sourceUrl: note.url,
        author,
        addedBy: note.author || MAINTAINER,
        pages: p.pages,
      };
      if (p.units || (isFolder && note.author && !p.title)) {
        const nos = p.units || [cycle(units, i * 3 + 1).no, cycle(units, i * 3 + 3).no];
        for (const no of nos) {
          const u = findUnit(m.id, no);
          if (!u) continue;
          add(m, { ...base, title: `${u.noun} ${u.no} notes – ${author}`, unit: u, addedAt: between(rng, utc(2024, 5, 1), utc(2026, 6, 30)) });
        }
      } else {
        add(m, { ...base, title: p.title || cleanName(note.name), addedAt: between(rng, utc(2024, 5, 1), utc(2026, 6, 30)) });
      }
    });
  }

  // Dates, "new this week", downloads and a 12-week download trend.
  for (const f of files) {
    const rng = rngFor('stats', f.id);
    const hoursAgo = NEW_THIS_WEEK[f.id];
    if (hoursAgo != null) {
      f.isNew = true;
      f.addedAt = new Date(NOW - hoursAgo * HOUR).toISOString();
      f.addedBy = f.kind === 'notes' && f.author !== CONTRIBUTORS ? f.author : MAINTAINER;
    } else {
      f.addedAt = new Date(Math.min(Date.parse(f.addedAt), OLD_CUTOFF)).toISOString();
    }
    const ageDays = Math.max(1, (NOW - Date.parse(f.addedAt)) / DAY);
    let d = KIND_DOWNLOADS[f.kind] * YEAR_WEIGHT[f.year] * (0.55 + rng() * 0.9);
    if (f.examYear) d *= 0.7 + (f.examYear - 2018) * 0.08;
    d *= 0.55 + Math.min(1.3, ageDays / 380);
    if (f.isNew) d = 4 + rng() * 9 * Math.max(1, 7 - ageDays);
    f.downloads = Math.max(3, Math.round(d));
    // weekly downloads, oldest → newest; exam season (now) lifts the last weeks
    const weekly = Math.max(1, f.downloads / Math.max(8, Math.min(90, ageDays / 7)));
    f.trend = Array.from({ length: 12 }, (_, i) => {
      if (f.isNew) return i < 11 ? 0 : f.downloads;
      const season = 1 + (i / 11) * 0.9;
      return Math.max(0, Math.round(weekly * season * (0.6 + rng() * 0.8)));
    });
  }

  return files.map((f) => Object.freeze(f));
}

function hashSeed(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ── Indexes & queries ────────────────────────────────────────────────────────────────────────────

export const FILES = Object.freeze(buildCatalog());
const BY_ID = new Map(FILES.map((f) => [f.id, f]));
const BY_MODULE = new Map();
for (const f of FILES) {
  if (!BY_MODULE.has(f.moduleId)) BY_MODULE.set(f.moduleId, []);
  BY_MODULE.get(f.moduleId).push(f);
}

export const byNewest = (a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt) || a.title.localeCompare(b.title);
export const byTitle = (a, b) => a.title.localeCompare(b.title, 'en', { numeric: true, sensitivity: 'base' });
export const byDownloads = (a, b) => b.downloads - a.downloads || byNewest(a, b);
export const byKind = (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind];

export const SORTS = {
  downloads: { label: 'Most downloaded', compare: byDownloads },
  newest: { label: 'Newest', compare: byNewest },
  az: { label: 'A to Z', compare: byTitle },
};

export function getFile(id) {
  return BY_ID.get(id) || null;
}

/** Every file for a module (accepts a v1 code too), newest first. */
export function getFilesForModule(moduleId) {
  const m = getModule(moduleId);
  if (!m) return [];
  return (BY_MODULE.get(m.id) || []).slice().sort(byNewest);
}

/** The n newest files, optionally for one cohort year. */
export function getRecentFiles(n = 6, { year } = {}) {
  const y = Number(year) || null;
  const list = y ? FILES.filter((f) => f.year === y) : FILES.slice();
  return list.sort(byNewest).slice(0, Math.max(0, n));
}

/** Files added this week, newest first. */
export function getNewFiles({ year } = {}) {
  const y = Number(year) || null;
  return FILES.filter((f) => f.isNew && (!y || f.year === y)).sort(byNewest);
}

/** Files to suggest next to one being read. */
export function getRelatedFiles(file, n = 5) {
  if (!file) return [];
  const same = (BY_MODULE.get(file.moduleId) || []).filter((f) => f.id !== file.id);
  const score = (f) => {
    let s = 0;
    if (file.examYear && f.examYear === file.examYear) s += f.kind === file.kind ? 9 : 8;
    if (file.examYear && f.examYear && f.kind === file.kind && f.zone === file.zone) s += 6 - Math.min(5, Math.abs(f.examYear - file.examYear));
    if (f.kind === file.kind && !file.examYear) s += 5;
    if (file.kind === 'notes' && f.author === file.author) s += 4;
    if (f.unit && file.unit && f.unit.no === file.unit.no) s += 6;
    if (f.kind === 'subject-guide') s += 2.5;
    if (f.kind === 'notes' && file.kind !== 'notes') s += 1.5;
    if (f.isNew) s += 1;
    return s;
  };
  return same
    .map((f) => [score(f), f])
    .sort((a, b) => b[0] - a[0] || byNewest(a[1], b[1]))
    .slice(0, n)
    .map(([, f]) => f);
}

/** Counts per kind for a module (for module page badges). */
export function countByKind(files) {
  const out = {};
  for (const f of files) out[f.kind] = (out[f.kind] || 0) + 1;
  return out;
}
