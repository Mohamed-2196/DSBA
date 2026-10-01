# DSBA v2 — "DSBA Pulse" — product + engineering spec

Read this whole file before you touch code. It is the contract between the **foundation** agent and
the five **feature** agents who work in parallel in the same working tree.

## 0. What we're building and why
`/home/claude/dsba` (branch `feature/dsba-pulse`) is the **DSBA Resource Hub** — a student-run site for the
DSBA program (Data Science & Business Analytics, BIBF Bahrain, University of London degree). Live v1:
https://mohamed-2196.github.io/DSBA/ (React 18 + Vite 5, deployed to GitHub Pages under base `/DSBA/`).

We are building **v2, a ground-up rebuild named "DSBA Pulse"**: everything v1 does, redesigned, plus new
features. It will be "launched" in front of ~160 students and 17 tutors, and a launch film will show it in
close-up at 1920×1080 — it must look premium, coherent and real. It is a **front-end prototype**: no backend;
dummy data where needed; everything clickable.

**v1 functionality that MUST survive** (read the v1 code in `src/legacy/` once the foundation has moved it there,
or in `src/components/` before that):
- Year selection (1/2/3), first-visit prompt, persisted in `localStorage.selectedYear`.
- Modules per year (`subjects.jsx`): name, description, icon, and resources — "Books and Study Guide"
  (Drive folder), "Students Notes" (named contributor links), "Exercises" (with special copy for
  mathematics/statistics), "Previous Exams" (VLE exams + older exams), "Cheat Sheet", and **Module Chapters**
  with embedded videos (YouTube ids, YouTube playlist ids, BigBlueButton `vc.bibf.com` playback URLs) and audio.
- Calendar of academic events (`Calander.jsx`, incl. the October 2026 exam session with real unit codes).
- Grade/classification calculator (`gpa/GPACalculator.tsx`) — **the algorithm must be preserved exactly**.
- Dark mode (persisted in `localStorage.theme`, `data-theme` on `<html>`).
- Footer: contributors list, BIBF/MyClass link (https://myclass.bibf.com), UoL student portal link
  (https://my.london.ac.uk/group/student), "Contribute" link (GitHub issues), disclaimer.
- The "new Year 2 notes" announcement → becomes a notification in v2.
- PostHog analytics provider in `main.jsx` (keep as is).

**New in v2**: dashboard home, **newsletter ("The Pulse")**, **forum**, **in-app file library with a document
viewer** (files that v1 only linked to on Google Drive appear as real files inside the app; the original
Drive link stays available as "Open original"), **video lessons player** with progress, full calendar
with .ics export, redesigned grade calculator, **⌘K search** over everything, notifications, onboarding.

**Context you may use**: the owner has approved anything on this branch, including the real reason for
the launch: the event (Tue 6 Oct 2026) is secretly a Teacher's Day surprise for the 17 tutors, disguised as
this product launch (and a fake "birthday" for the admin). So easter eggs are welcome, but **nothing on the
default, launch-visible views may give the surprise away** (Home, Modules, Library, Newsletter issue #01,
the Forum's default list, etc. will be filmed and shown to the tutors before the reveal). If you want to add
a Teacher's Day touch, put it behind a non-obvious route or toggle and mention it in your report.
Never invent quotes or content attributed to real tutors/staff. Existing v1 text that already names people
(e.g. footer contributors, "Dr. Mahmood's chapters have everything covered") may be kept.
Dummy students use common Bahraini first names + initial (Maryam S., Ali H., Fatima A., Hussain M.,
Zainab K., Ahmed J., Noor E., Sayed Ali M., Hawra T., Yusuf B.).

**Don't invent facts**: use UoL unit codes only where v1 has them (calendar): EC1002 Introduction to
Economics, MT1186 Mathematical Methods, ST1215 Introduction to Mathematical Statistics, MN1178 Business and
Management in a Global Context, ST2134 Advanced Statistics: Statistical Inference, ST2133 Advanced Statistics:
Distribution Theory, ST2187 Business Analytics, Applied Modelling and Prediction, EC2020 Elements of
Econometrics, IS2184 Information Systems Management, ST2195 Programming for Data Science. Year 3 modules
have no code in v1 → show none.

## 1. Design system

### Concept
**"An annotated notebook with a pulse."** DSBA students live in lecture notes, past papers and plots. v2 is a
sharp, modern study tool that feels built by data-science students: a precise grid, confident grotesk
typography, **highlighter-yellow annotation marks** for what's new or important (like a student's notes),
module codes used as big typographic objects, and one signature motif — the **pulse trace**, a small
time-series line with a single spike, which is the logo mark, the active-nav indicator and the loader.
Spend boldness there; keep everything else quiet and disciplined.

### Color tokens (CSS variables in `src/styles/tokens.css`)
| token | light | dark | use |
|---|---|---|---|
| `--paper` | `#F6F7FB` | `#0A0F2C` | app background (cool, never cream) |
| `--surface` | `#FFFFFF` | `#11183D` | panels, cards |
| `--surface-2` | `#EEF0F8` | `#18214F` | inset areas, hovers, table stripes |
| `--ink` | `#0E1542` | `#EEF0FF` | primary text & headings (brand navy ink) |
| `--ink-2` | `#4A5175` | `#A9B0D6` | secondary text |
| `--ink-3` | `#7C83A6` | `#7880AE` | tertiary/meta |
| `--line` | `#E2E5F0` | `#263063` | borders/dividers |
| `--cobalt` | `#2E3BFF` | `#7B86FF` | primary actions, links, focus, pulse |
| `--cobalt-ink` | `#FFFFFF` | `#0A0F2C` | text on cobalt |
| `--navy` | `#1A237E` | `#1A237E` | v1 brand navy (logo lockup, deep accents) |
| `--highlight` | `#FFE14A` | `#FFE14A` | highlighter marks only — never text color |
| `--signal` | `#12B886` | `#38D9A9` | live, answered, success, watched |
| `--alert` | `#F03E5E` | `#FF6B81` | exams, errors, destructive |
| `--y1` | `#0FA3B1` | `#3BC9DB` | Year 1 (lagoon) |
| `--y2` | `#7048E8` | `#9775FA` | Year 2 (iris) |
| `--y3` | `#F08C00` | `#FFA94D` | Year 3 (amber) |
Elevation: borders first. Shadows only on floating layers (menus, modals, toasts, the active file page):
`--shadow-float: 0 18px 40px -18px rgba(14,21,66,.35), 0 2px 6px rgba(14,21,66,.06)` (dark: rgba(0,0,0,.6)).
No decorative gradients, no glassmorphism, no glow-for-the-sake-of-it.

### Type
- **Schibsted Grotesk** (`@fontsource-variable/schibsted-grotesk`) — UI and all non-editorial headings.
  Headlines 700–800 with tracking −0.02em; UI 400–600.
- **Newsreader** (`@fontsource-variable/newsreader`, incl. italic/opsz if available) — the newsletter
  (body + headlines), pull quotes, long-form reading, and the document viewer's mock pages.
- **JetBrains Mono** (`@fontsource/jetbrains-mono` 400/600) — only real code, formulas, keyboard keys.
  Not for small labels.
- Scale (major third, 16px base): 12 · 14 · 16 · 20 · 25 · 31 · 39 · 49 · 61 · 76 (`--fs-12`…`--fs-76`).
  Sans body line-height 1.55, serif body 1.65; measure ≤ 72ch. Sentence case everywhere.
- Module codes (e.g. `ST2133`) are set big in Schibsted 800 with tabular numerals as a visual anchor.
- Avoid: ALL-CAPS eyebrow labels, meta strings joined with "·", "Word — fragment" labels, "→" appended
  to buttons/links, one-word-accented headlines.

### Layout
```
desktop ≥1100px                                   tablet 700–1099: rail = 72px icons only
┌────────────┬───────────────────────────────────────────────┐
│ ⌁ DSBA     │ [ Search everything…      ⌘K ]   🔔  Contribute│  ← top bar (sticky, 64px)
│   Pulse    ├───────────────────────────────────────────────┤
│ Year 1 2 3 │                                               │
│            │   page content, left-aligned,                 │
│ ⌂ Home     │   max-width 1180px, padding 40px              │
│ ▦ Modules  │                                               │
│ ▤ Library  │                                               │
│ ✉ Newsletter│                                              │
│ ☰ Forum NEW│                                               │
│ ▣ Calendar │                                               │
│ ∑ Grades   │                                               │
│ ───────    │                                               │
│ MyClass ↗  │                                               │
│ UoL portal↗│                                               │
│ ◐ theme    │                                               │
│ (profile)  │                                               │
└────────────┴───────────────────────────────────────────────┘
mobile <700: top bar (logo, search icon, bell) + bottom tab bar: Home · Modules · Library · Forum · More
```
Left rail 264px. Radii by hierarchy (not one radius everywhere): chips/pills 999px, inputs/buttons 10px,
panels 16px, large feature panels/modals 24px, document pages 4px. Spacing scale 4/8/12/16/24/32/48/64/96.
Prefer **lists, tables and editorial layouts** over grids of identical cards: forum = dense rows, library =
file table/grid toggle with real document thumbnails, newsletter = editorial, modules = typographic tiles.

### Motion
One orchestrated moment: on Home first load the pulse trace draws and the highlighter marks swipe in.
Otherwise motion only answers actions (open/close modal, drawer, menu, accordion, toast, tab change,
vote, star): 150–250ms, `cubic-bezier(.2,.8,.2,1)`. Respect `prefers-reduced-motion`. No scroll-reveal
fade-ups, no hover-lift on every card.

### Icons
`@phosphor-icons/react` (regular weight for UI, duotone for empty states/feature icons). Emoji are fine
inside user content (forum posts, newsletter) but not as UI icons.

### Copy
Plain verbs, sentence case, user's perspective. Buttons say exactly what happens ("Post thread",
"Open original", "Download .ics"). Empty states invite action. Errors say what happened and what to do.

### Quality floor
Responsive (1920 → 390), keyboard focus visible (2px cobalt ring, 2px offset), WCAG AA contrast, aria
labels on icon buttons, works in light and dark, no console errors (PostHog network errors in the sandbox
are expected).

## 2. Architecture

```
src/
  main.jsx                     foundation  (fonts, global css, PostHog provider kept)
  App.jsx                      foundation  (providers + HashRouter + AppShell + routes)
  routes.jsx                   foundation  (route table; React.lazy per page)
  styles/tokens.css base.css   foundation
  ui/                          foundation  shared primitives (see §3)
  shell/                       foundation  AppShell, Sidebar, TopBar, MobileNav, YearSwitcher, ThemeToggle
  state/                       foundation  contexts + hooks (see §3)
  data/modules.js              foundation  (extracted from v1 subjects.jsx — ALL data preserved)
  data/calendar.js             foundation  (extracted from v1 Calander.jsx, with types)
  data/people.js               foundation  (v1 footer contributors + note contributors)
  legacy/                      foundation  v1 components moved here untouched, not imported (reference only)
  features/
    about/      foundation   AboutPage (contributors, disclaimer, links), StyleGuidePage, NotFoundPage
    home/       agent E      HomePage
    modules/    agent A      ModulesPage, ModulePage (+ lessons player)
    library/    agent B      LibraryPage, FileViewerPage, mock file catalog
    newsletter/ agent C      NewsletterPage, IssuePage
    forum/      agent D      ForumPage, ThreadPage, NewThreadPage
    calendar/   agent E      CalendarPage
    grades/     agent E      GradesPage
    search/     agent E      CommandPalette (mounted by the shell)
    notifications/ agent E   NotificationsMenu (mounted by the shell)
    onboarding/ agent E      Onboarding (mounted by the shell)
```

### Routes (HashRouter; `src/routes.jsx`; every page lazy-loaded so one broken feature can't break others)
| path | component file |
|---|---|
| `/` | `features/home/HomePage.jsx` |
| `/modules` | `features/modules/ModulesPage.jsx` |
| `/modules/:moduleId` | `features/modules/ModulePage.jsx` — tabs via `?tab=overview\|lessons\|files\|discussion`, lesson via `?chapter=<i>&video=<j>` |
| `/library` | `features/library/LibraryPage.jsx` — filters via query (`?module=&type=&q=`) |
| `/library/:fileId` | `features/library/FileViewerPage.jsx` |
| `/newsletter` | `features/newsletter/NewsletterPage.jsx` |
| `/newsletter/:slug` | `features/newsletter/IssuePage.jsx` |
| `/forum` | `features/forum/ForumPage.jsx` |
| `/forum/new` | `features/forum/NewThreadPage.jsx` |
| `/forum/:threadId` | `features/forum/ThreadPage.jsx` |
| `/calendar` | `features/calendar/CalendarPage.jsx` |
| `/grades` | `features/grades/GradesPage.jsx` |
| `/about` | `features/about/AboutPage.jsx` |
| `/styleguide` | `features/about/StyleGuidePage.jsx` |
| `*` | `features/about/NotFoundPage.jsx` |

### Cross-feature public APIs
Every feature exposes **only** `features/<name>/public.js`. Other features import from there and nowhere
else. The foundation creates every `public.js` as a **working stub with the exact signatures below**
(returning empty arrays / `null` / a small placeholder component) so imports never break; the owning agent
replaces the stub with the real implementation **without changing signatures**. Components must render
gracefully with no data.
```js
// features/modules/public.js
export function ContinueLearning() {}                 // card(s) for Home: last watched lesson(s) + progress
export function getModuleProgress(moduleId) {}        // -> { watched, total, pct }
// features/library/public.js
export function getFilesForModule(moduleId) {}        // -> File[]
export function getRecentFiles(n = 6, { year } = {}) {} // -> File[] newest first
export function searchFiles(query) {}                 // -> File[]
export function ModuleFiles({ moduleId }) {}          // component for the module page Files tab
// File: { id, moduleId, year, kind, title, format, pages, sizeKB, author, addedAt (ISO), sourceUrl, isNew }
// features/newsletter/public.js
export function getLatestIssue() {}                   // -> { slug, number, title, date, summary, readMinutes } | null
export function LatestIssueCard() {}                  // component for Home
export function searchIssues(query) {}                // -> [{ slug, title, number, snippet }]
// features/forum/public.js
export function getHotThreads(n = 5, { year } = {}) {} // -> [{ id, title, votes, replies, year, moduleId, author, createdAt }]
export function HotThreads({ n = 5 }) {}              // component for Home
export function ModuleThreads({ moduleId }) {}        // component for the module page Discussion tab
export function searchThreads(query) {}               // -> threads
// features/calendar/public.js
export function getUpcomingEvents({ year, from = new Date(), n = 5 } = {}) {} // -> CalendarEvent[]
export function UpcomingEvents({ n = 5 }) {}          // component for Home
export function getNextExamForModule(moduleId) {}     // -> CalendarEvent | null
// features/search/public.js
export function CommandPalette() {}                   // mounted once by the shell
export function openCommandPalette() {}               // also bound to ⌘K / Ctrl+K and the top-bar search field
// features/notifications/public.js
export function NotificationsMenu() {}                // bell + dropdown, mounted by the top bar
// features/onboarding/public.js
export function Onboarding() {}                       // mounted by the shell; shows when no year is selected
```

### Shared state (foundation, `src/state/`)
- `useYear()` → `{ year, setYear }` (1|2|3|null; persists `localStorage.selectedYear`, v1-compatible).
- `useTheme()` → `{ theme, setTheme, toggleTheme }` (persists `localStorage.theme`; sets `data-theme`).
- `useToast()` → `{ push({ title, body?, tone?: 'info'|'success'|'alert' }) }`.
- `useLocalStorage(key, initial)` → `[value, setValue]` (JSON, SSR-safe, try/catch).
- Data helpers in `src/data/modules.js`: `MODULES`, `getModulesForYear(year)`, `getModule(id)`, and
  `src/data/calendar.js`: `EVENTS`, `EVENT_TYPES`. Cohort helpers: `cohortColor(year)` → `var(--y1|2|3)`.

## 3. Shared UI primitives (foundation, `src/ui/`, each with its own CSS; documented on `/styleguide`)
`Button` (primary/secondary/ghost/danger; sm/md/lg; leading/trailing icon; `as` link), `IconButton`
(required `label`), `Badge`, `CohortBadge({year})`, `Chip` (toggleable filter chip), `Avatar({name})`
(initials, deterministic color), `Tabs` (controlled, works with URL params), `TextField`, `TextArea`,
`Select`, `SearchField`, `Modal` (focus trap, Esc, scroll lock), `Drawer`, `Menu` (dropdown),
`Tooltip`, `Toaster` (renders `useToast` toasts), `EmptyState`, `Skeleton`, `ProgressRing`,
`Sparkline`, `PulseMark` (the brand trace; props: size, animate), `Highlight` (highlighter swipe behind
inline text), `Kbd`, `SectionHeader({title, action})`, `Divider`, `Panel` (surface with border; not a
generic "card everywhere" — use when a surface is actually needed).

## 4. Working rules for all agents (parallel, same tree)
- **Ownership**: edit only the files you own (table in §2). Need a shared primitive that doesn't exist?
  Build it inside your feature folder. Found a bug in a shared file? Report it in your final message; do
  not edit shared files (the foundation agent is done by the time features start; the lead integrates).
- **No new dependencies** for feature agents (foundation installs everything up front). No `npm install`.
- **Dev server**: one shared Vite server at `http://127.0.0.1:5173/DSBA/` (HMR). Check it with
  `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/DSBA/`. Only if it's down, start it:
  `cd /home/claude/dsba && nohup npx vite --port 5173 --host 127.0.0.1 > /tmp/vite.log 2>&1 &`.
- **Builds**: never write to `dist/`. Use `npx vite build --outDir /tmp/build-<yourname> --emptyOutDir`.
- **Lint**: `npx eslint src/features/<yours>` must be clean.
- **Screenshots** (Google Fonts & analytics are blocked in this sandbox; the helper handles both):
  `node /home/claude/launch-video/tools/shoot-ui.mjs --url "http://127.0.0.1:5173/DSBA/#/forum" --out /home/claude/v2-spec/review/<feature>-<name>.png --w 1920 --h 1080 [--theme dark] [--full] [--selector "..."] [--year 2]`
  **Look at every screenshot with the Read tool** and iterate until it is genuinely great — at 1920×1080
  (primary, light), 1440×900, dark mode, and 390×844 mobile.
- **Determinism for the film**: relative times ("2h ago") must be computed from `Date.now()` (the film's
  capture freezes the clock at 2026-10-06 10:00 Asia/Bahrain). Seeded data only, no `Math.random()` at render.
- **Film capture hooks**: add `data-pulse="<name>"` attributes on the key elements listed in your brief.
- **No git commits, no pushes.** The lead reviews and commits.
- 2 CPUs are shared by ~7 agents: don't run builds/screenshots in tight loops.
