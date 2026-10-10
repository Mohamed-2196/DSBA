// One-off export of the prototype's reference content to the API's seed files (api/app/seed/data/*.json).
// Loads the prototype's ES modules through Vite (they use extensionless imports). Run from web/:
//   node scripts/export-seed.mjs
// Fictional content is left out or marked: the "Ask a senior" mentors (made-up people) are dropped, and the
// newsletter issues (written around made-up editors) are exported to be imported as drafts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../api/app/seed/data');
mkdirSync(out, { recursive: true });

const server = await createServer({
  configFile: false,
  root: resolve(here, '..'),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
const load = (p) => server.ssrLoadModule(p);
const write = (name, data) => {
  writeFileSync(resolve(out, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${name}.json`);
};

try {
  const { MODULES } = await load('/src/data/modules.js');
  const { VIDEO_META, UNAVAILABLE_VIDEOS } = await load('/src/data/videoTitles.js');
  const unavailable = new Set(UNAVAILABLE_VIDEOS);
  write(
    'modules',
    MODULES.map((m, position) => ({
      id: m.id,
      unitCode: m.unitCode,
      name: m.name,
      shortName: m.shortName,
      year: m.year,
      description: m.description,
      icon: m.icon,
      position,
      resources: m.resources,
      notes: m.notes.map((n) => ({ name: n.name, author: n.author, url: n.url })),
      chapters: m.chapters.map((c) => ({
        title: c.title,
        ...(c.audioUrl ? { audioUrl: c.audioUrl } : {}),
        videos: c.videos.map((v) => {
          const key = v.kind === 'bbb' ? null : v.id;
          const meta = key ? VIDEO_META[key] : null;
          return {
            kind: v.kind,
            ...(v.id ? { id: v.id } : {}),
            ...(v.url ? { url: v.url } : {}),
            ...(meta ? { title: meta[0], channel: meta[1] } : {}),
            ...(key && unavailable.has(key) ? { unavailable: true } : {}),
          };
        }),
      })),
    })),
  );

  const { EVENTS } = await load('/src/data/calendar.js');
  write(
    'calendar',
    EVENTS.map((e) => ({
      id: e.id,
      date: e.date,
      ...(e.endDate ? { endDate: e.endDate } : {}),
      title: e.title,
      type: e.type,
      year: e.year ?? null,
      moduleId: e.moduleId ?? null,
      unitCode: e.unitCode ?? null,
      time: e.time ?? null,
      place: e.place ?? null,
      sample: !!e.sample,
    })),
  );

  const { ISSUES } = await load('/src/features/newsletter/data/issues.js');
  const { DUMMY_STUDENTS } = await load('/src/data/people.js');
  const nameOf = (id) => DUMMY_STUDENTS.find((s) => s.id === id)?.name ?? id;
  write(
    'newsletter',
    ISSUES.map((i) => ({ ...i, editors: (i.editors || []).map(nameOf), importAs: 'draft' })),
  );

  const employers = await load('/src/features/career/data/employers.js');
  const certs = await load('/src/features/career/data/certificates.js');
  const roles = await load('/src/features/career/data/roles.js');
  const skills = await load('/src/features/career/data/skills.js');
  const after = await load('/src/features/career/data/afterDsba.js');
  write('career', {
    checkedOn: employers.CHECKED_ON,
    initialCount: employers.INITIAL_COUNT,
    tracks: employers.TRACKS,
    offerTypes: employers.OFFER_TYPES,
    ctaLabel: employers.CTA_LABEL,
    employers: employers.EMPLOYERS,
    featured: employers.FEATURED,
    effortLabel: certs.EFFORT_LABEL,
    certNote: certs.CERT_NOTE,
    certs: certs.CERTS,
    defaultRoleId: roles.DEFAULT_ROLE_ID,
    roles: roles.ROLES,
    depthLabel: skills.DEPTH_LABEL,
    chosen: skills.CHOSEN,
    skills: skills.SKILLS,
    checklist: after.CHECKLIST,
    furtherStudy: after.FURTHER_STUDY,
    yearHints: after.YEAR_HINTS,
    seniors: [],
  });
} finally {
  await server.close();
}
