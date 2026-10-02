# How to build a page in DSBA Hub (from the foundation engineer)

Foundation is done and verified: data check passes against v1 (16 modules, 94 chapters, 337 videos,
46 links, 11 notes; 46 events), `npx eslint src` clean, build OK. Reference screenshots:
`/home/claude/v2-spec/review/foundation-*.png` (styleguide, home, about, dark, tablet, mobile).
Live style guide: http://127.0.0.1:5173/DSBA/#/styleguide — copy its patterns.

## What exists (all under `src/`)
- `styles/` tokens.css (spec tokens + derived), base.css.
- `ui/` every primitive in spec §3 + `Page`, `PageHeader`, `PageSection`, `SegmentedControl`, `ModuleIcon`,
  `ErrorBoundary`, `TabPanel`, `Field`. **Import everything from `src/ui`.**
- `state/` providers + hooks. `shell/` rail, top bar, mobile nav, footer, loader, per-route error boundary.
- `data/` modules.js, calendar.js, people.js. `routes.jsx` lazy pages + per-route error boundaries.
- `features/*/public.js` working stubs with the spec's exact signatures (calendar's two query functions are real).
- `legacy/` untouched v1 code (excluded from ESLint) — e.g. `legacy/components/gpa/GPACalculator.tsx`.

## Page pattern
```jsx
import { Plus } from '@phosphor-icons/react';
import { Button, ErrorBoundary, Page, PageHeader, PageSection, SectionHeader } from '../../ui';
import { useYear, useQueryParam, useDocumentTitle } from '../../state';
import { UpcomingEvents } from '../calendar/public.js';   // other features: public.js ONLY
import './ForumPage.css';                                   // classes prefixed forum-

export default function ForumPage() {
  return (
    <Page>                       {/* 1180px column; padding 40/32/16px; width="wide"(1440)|"narrow"(760) */}
      <PageHeader title="Forum" description="One sentence, ≤72ch."
        actions={<Button variant="primary" leadingIcon={Plus} to="/forum/new">Start a thread</Button>}
        meta={/* badges */ null} leading={/* e.g. <span className="u-code">ST2133</span>, renders ABOVE the title */ null} />
      <PageSection aria-labelledby="forum-hot">          {/* sections sit 48px apart (32 on mobile) */}
        <SectionHeader id="forum-hot" title="Hot this week" action={null} />
        …
      </PageSection>
      <ErrorBoundary name="UpcomingEvents"><UpcomingEvents n={3} /></ErrorBoundary>
    </Page>
  );
}
```

## CSS rules
- Prefix every class with your feature: `mod-`, `lib-`, `nl-`, `forum-`, `cal-`, `grades-`, `home-`, `cmdk-`, `notif-`, `onb-`.
- Only tokens: `var(--ink…)`, `--fs-12…76`, `--sp-4…96`, `--r-pill/control/panel/feature/page/xs`, `--ease`, `--dur-fast/dur/dur-slow`.
- `--shadow-float` only for floating layers.
- Text on fills: `--cobalt-ink`, `--on-y1/2/3`, `--alert-ink`. Small coloured text: the `*-strong` tokens. Never `--ink-3` for small text.
- Don't write `[data-theme='dark']` overrides — tokens switch on their own; any `data-theme="dark"` element re-maps everything inside it.
- Icons: Phosphor regular for UI, duotone for empty states.

## Primitive props
- `Button`: `variant` primary|secondary|ghost|danger (default secondary), `size` sm|md|lg (32/40/48), `leadingIcon`, `trailingIcon`, `to` (Link), `href` (external opens new tab), `as`, `loading`, `disabled`, `fullWidth`.
- `IconButton`: `label` (required), `icon`, `variant` ghost|secondary|primary, `size`, `badge` (true|number), `tooltip`, `active`, `toggle`, `to`, `href`.
- `Badge`: `tone` neutral|cobalt|signal|alert|highlight|navy|outline, `size`, `icon`.
- `CohortBadge`: `year`, `variant` soft|solid|dot, `short`.
- `Chip`: `selected`, `onChange(next)`, `icon`, `count`, `color`, `size`.
- `Avatar`: `name`, `size` xs..xl|number, `decorative`.
- `Tabs`: `tabs` ([{id,label,icon?,count?}]), `value`, `onChange`, `label`, `idBase`, `variant` underline|pill. `TabPanel`: `idBase`, `id`, `value`.
- `SegmentedControl`: `options` ([{value,label,icon?,color?,onColor?}]), `value`, `onChange`, `label`, `size`, `iconOnly`, `fullWidth`.
- `TextField`/`TextArea`/`Select`: `label`, `hint`, `error`, `required`, `hideLabel`; TextField adds `leadingIcon`, `trailing`, `size`; Select takes `options` [{value,label}] + `placeholder`.
- `SearchField`: `value`, `onValueChange`, `onClear`, `placeholder`, `label`, `shortcut="K"`, `size`, `asButton`.
- `Modal`: `open`, `onClose`, `title`, `description`, `footer`, `size` sm|md|lg|xl, `initialFocusRef`, `hideHeader`. `Drawer`: same + `side` right|left|bottom.
- `Menu`: `trigger`, `items` ([{id,label,icon,onSelect|to|href,danger,hint}|{divider}|{heading}]) or `children({close})` popover, `align`, `side`, `width`, `label`.
- `Tooltip`: `label`, `side`. `EmptyState`: `icon`, `title`, `body`, `action`, `size`. `Skeleton`: `width`, `height`, `circle`, `radius`, `lines`.
- `ProgressRing`: `value`, `size`, `stroke`, `color`, `label`. `Sparkline`: `data`, `width`, `height`, `color`, `area`, `label`.
- `HubMark`: `size`, `animate` false|'draw'|'loop', `tone`, `tile`, `dot`, `title`. `Highlight`: `animate`, `delay`, `as`.
- `Kbd`, `SectionHeader` (`title`,`description`,`action`,`as`,`id`), `Divider`, `Panel` (`padding` none|sm|md|lg, `radius` panel|feature, `tone` surface|inset, `float`), `ModuleIcon` (`moduleId`).
- `ErrorBoundary`: `name`, `fallback` (node|fn|null), `resetKey`.
- Utils: `cx`, `initials`, `modKeyLabel`, `timeAgo(input, now = Date.now())`, `formatDate`.

## State (`src/state`)
- `useYear()` → `{ year (1|2|3|null), setYear, activeYear }` (`localStorage.selectedYear` raw `'2'`; `year` null until onboarding; `activeYear` falls back to 1).
- `useTheme()` → `{ theme, setTheme, toggleTheme }` (`localStorage.theme`).
- `useToast()` → `{ push({ title, body?, tone, duration?, action? }), dismiss }` (stable identity).
- `useLocalStorage(key, initial)` (JSON, synced across hooks/tabs), `useQueryParam(key, default)` → `[value, set(v, {replace})]`,
  `useDocumentTitle(title)`, `useMediaQuery`, `BREAKPOINTS`.
- Cohort helpers: `cohortColor`, `cohortTextColor`, `cohortOnColor`, `cohortLabel`, `COHORTS`, `normalizeYear`.

## Data
- `modules.js`: `MODULES`, `YEARS`, `V1_CODE_MAP`, `getModulesForYear(y)`, `getModule(id | v1 code)`, `getModuleByUnitCode`, `moduleLabel`,
  `getModuleStats(m)` → {chapters, videos, notes, links}, `lessonKey(moduleId, chapterIndex, videoIndex)`,
  `classifyVideo`, `videoEmbedUrl(v)`, `videoSourceUrl(v)`, `videoThumbnailUrl(v)` (null for class recordings & playlists), `VIDEO_KIND_LABEL`.
- `calendar.js`: `EVENTS` (sorted), `EVENT_TYPES` ({label, token, color} per type), `eventDate`, `getEventsForYear`, `getEventsForModule`.
  A `year: null` event applies to every year.
- `people.js`: `CONTRIBUTORS`, `NOTE_CONTRIBUTORS`, `DUMMY_STUDENTS` (9), `CURRENT_USER` (Maryam S., Year 2), `getStudent`,
  `CONTRIBUTE_URL`, `MYCLASS_URL`, `UOL_PORTAL_URL`, `DISCLAIMER`.

Sample module:
```js
{ id:'econometrics', v1Code:'econometrics', unitCode:'EC2020', name:'Elements of Econometrics', v1Name:'Econometrics',
  shortName:'Econometrics', year:2, description:'Study economic relationships using …', icon:'ChartScatter',
  resources:{ materials:'https://drive…', exercises:null, exercisesNote:null, vle:'https://drive…', olderExams:'https://drive…', cheatSheet:null },
  notes:[ /* { name, author|null, url, v1Name? } */ ],
  chapters:[{ title:'The Simple Regression Model', v1Title?, audioUrl?, videos:[{ kind:'youtube', id:'WHas2yaIlcs' }] }] }
// other video kinds: { kind:'youtube-playlist', id } | { kind:'bbb', url:'https://vc.bibf.com/playback/…' }
```
Sample event:
```js
{ id:'2026-10-22-mathematics-exam', date:'2026-10-22', title:'MT1186 Mathematical Methods (October exam)',
  type:'exam', year:1, moduleId:'mathematics', unitCode:'MT1186' }
```

## Must know / avoid
- Don't edit shared files (`styles`, `ui`, `shell`, `state`, `data`, `routes`, `App`, `main`). Report bugs instead.
- Import other features only via `public.js`, and wrap their components in `ErrorBoundary`.
- No `href="#section"` links (the router uses the hash). Use buttons + `scrollIntoView`.
- Tab/filter state in the URL via `useQueryParam(..., { replace: true })`. The shell scrolls to top only on path change.
- Dialogs focus themselves; add `data-autofocus` to the field that should get focus.
- ⌘K is bound by `CommandPalette` (search feature), not by the shell. On Linux the hint reads "Ctrl K"; a Mac UA shows ⌘.
- `u-tabular` only on numbers (it also widens commas in Schibsted).
- Statistics: `exercises` null but `exercisesNote` set (show the note without a link). Mathematics has both.
- Year 3 modules have no unit code. Several Year 2 modules share the same URL for `vle` and `olderExams` (as v1).
- Class recordings (BBB) have no thumbnails (50 in statistics, 2 in mathematics). YouTube thumbnails (i.ytimg.com) are
  **blocked in this sandbox**, so always design a good fallback poster.
- Note `author` can be null.
- Deadline colour `--highlight` is too faint as a dot on white: give the dot a 1px ink ring or use `Highlight` behind the label.
- v1 Year 2 announcement (key `year2_new_notes_announcement_v1`) had an empty list → becomes a notification.
- Existing `data-hub` hooks: `sidebar`, `topbar`, `brand`, `year-switcher` (`-mobile`, `-more`), `search`, `contribute`,
  `theme-toggle`, `profile`, `notifications` (keep on the bell), `nav-<id>`, `tab-<id>`.
- Fixed bottom UI on mobile must sit above `calc(var(--tabbar-h) + env(safe-area-inset-bottom))`.
- Never show the Teacher's Day surprise on launch-visible views.
