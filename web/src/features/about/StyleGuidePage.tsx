// /styleguide — every token and shared primitive, rendered in the current theme plus a light/dark
// side-by-side. Feature agents: copy patterns from here (and the code strips under each specimen).
import { useMemo, useState, type ReactNode } from 'react';
import type { ModuleSummary } from '../../api/types';
import { cohortColor, useToast, type CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import {
  Avatar,
  Badge,
  Button,
  Chip,
  CohortBadge,
  Divider,
  Drawer,
  EmptyState,
  Highlight,
  IconButton,
  Kbd,
  Menu,
  Modal,
  ModuleIcon,
  Page,
  PageHeader,
  Panel,
  ProgressRing,
  HubLogo,
  Icon,
  SearchField,
  SectionHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  TabPanel,
  Tabs,
  TextArea,
  TextField,
  WholeNumberField,
  Tooltip,
  cx,
  glyph,
  type Glyph,
  Deskmate,
  SECTION_MATE,
} from '../../ui';
import { EVENT_TYPES, TYPE_ORDER, useCalendarEvents, type EventType } from '../calendar/public';
import { GameColours } from '../daily/public';
import { scrollMotion } from '../../lib/motion';
import { TokenPairs } from './TokenPairs';
import './StyleGuidePage.css';

// ── Reference data ────────────────────────────────────────────────────────
type Row2 = [string, string];
type Row3 = [string, string, string];

const COLOURS: { group: string; items: [string, string, string, string][] }[] = [
  {
    group: 'Surfaces',
    items: [
      ['--paper', '#F2F5FB', '#0B1530', 'The canvas: cool, never cream'],
      ['--surface', '#FFFFFF', '#111E3E', 'Cards and panels'],
      ['--surface-2', '#ECF1F9', '#1A2B54', 'Insets, hovers, table stripes'],
      ['--raised', '#FFFFFF', '#16244A', 'Menus and popovers'],
      ['--line', '#DCE4F1', '#22355F', 'Card edges and dividers'],
      ['--line-strong', '#C5D2E6', '#2F4677', 'Chip borders'],
    ],
  },
  {
    group: 'Ink',
    items: [
      ['--ink', '#0A1F44', '#EAF0FF', 'Text and headings'],
      ['--ink-2', '#3E4E6E', '#A9B8D9', 'Secondary text'],
      ['--ink-3', '#5A6A8C', '#8798BE', 'Meta and placeholders, AA on every ground'],
    ],
  },
  {
    group: 'Accent',
    items: [
      ['--accent', '#2445C2', '#8DA6FF', 'Primary buttons, links, focus'],
      ['--accent-edge', '#1F3A93', '#5F7BE0', 'The lip under a primary button'],
      ['--on-accent', '#FFFFFF', '#0B1530', 'Text on the accent'],
      ['--inverse', '#0A1F44', '#EAF0FF', 'The one dark pill (Filters)'],
      ['--logo-blue', '#1F3A93', '#1F3A93', 'The logo’s blue: Noora’s ring, the logo tile'],
      ['--highlight', '#FFE14A', '#FFE14A', 'Highlighter marks only, never text'],
    ],
  },
  {
    group: 'Status',
    items: [
      ['--success', '#18794A', '#5BD49A', 'Saved, answered, watched'],
      ['--warning', '#8F5A00', '#FFC233', 'Warnings'],
      ['--warning-fill', '#FFC233', '#FFC233', 'Counts and badges, with --on-warning-fill'],
      ['--error', '#C0262D', '#FF7A7A', 'Errors and destructive actions'],
      ['--exam', '#C21D5C', '#FF7EB0', 'Exams only'],
    ],
  },
  {
    group: 'Cohorts',
    items: [
      ['--y1', '#3BC9DB', '#3BC9DB', 'Year 1, lagoon'],
      ['--y2', '#6FA2FF', '#6FA2FF', 'Year 2, sky'],
      ['--y3', '#FFA94D', '#FFA94D', 'Year 3, amber'],
    ],
  },
];

const DERIVED: Row2[] = [
  ['--accent-soft', 'Selected rows, info tints'],
  ['--accent-hover', 'Primary button hover'],
  ['--accent-text', 'Accent as text on accent-soft'],
  ['--success-fill', 'Bars, dots and large fills'],
  ['--success-soft', 'Success tints'],
  ['--warning-soft', 'Warning tints'],
  ['--error-soft', 'Error tints'],
  ['--exam-soft', 'Exam tints'],
  ['--highlight-soft', 'Pale highlighter wash'],
  ['--highlight-ink', 'Text on a highlighter mark'],
  ['--y1-strong', 'Year 1 as small text'],
  ['--y2-strong', 'Year 2 as small text'],
  ['--y3-strong', 'Year 3 as small text'],
  ['--y2-soft', 'Year 2 tint; same for y1 and y3'],
  ['--on-y2', 'Text on a solid Year 2 fill; same for y1 and y3'],
];

/** The sections (tokens.css --sec-*): a nav item, a section header or a pill sets data-section to take them. */
const SECTION_COLOURS: [string, string, string][] = [
  ['home', 'Home', 'Lumen'],
  ['library', 'Library', 'Stacks'],
  ['modules', 'Modules', 'Binder'],
  ['notebook', 'Notebook', 'Jot'],
  ['forum', 'Forum', 'Pip and Pod'],
  ['calendar', 'Calendar', 'Blink'],
  ['search', 'Search', 'Loupe'],
  ['tools', 'Tools', 'Boards, Grades, Career Navigator, Newsletter, Daily'],
];

const GLYPHS = Object.entries(glyph);
const NAV_GLYPH: Record<string, Glyph> = {
  home: glyph.home,
  library: glyph.library,
  modules: glyph.modules,
  notebook: glyph.notebook,
  forum: glyph.forum,
  calendar: glyph.calendar,
  search: glyph.search,
  tools: glyph.boards,
};

const TYPE_SCALE: [number, string, string, string, string][] = [
  [44, '--fs-44', 'Display XL: the module code on its page', 'ST2133', 'code'],
  [44, '--fs-44', 'Display XL', 'Exam season', 'display'],
  [34, '--fs-34', 'Display: the page title (h1)', 'Distribution theory', 'display'],
  [28, '--fs-28', 'Title: the page title on a phone', 'Hypothesis tests', 'display'],
  [22, '--fs-22', 'Heading: a section title (h2)', 'Coming up this week', 'display'],
  [20, '--fs-20', 'Subsection (h3)', 'Students’ notes', 'display'],
  [17, '--fs-17', 'Subhead, in the interface face', 'Pick up where you left off', 'heading'],
  [16, '--fs-16', 'Body', 'Notes for chapter 2 were added by Mohamed A. and checked against the guide.', 'body'],
  [14, '--fs-14', 'Body small, secondary text', 'Updated 2h ago by Ali H.', 'body'],
  [12, '--fs-12', 'Meta, tab labels, overlines', '22 lessons, 2 chapters', 'body'],
];

const SPACE = [4, 8, 12, 16, 24, 32, 48, 64, 96];

const RADII: Row3[] = [
  ['--r-pill', '999px', 'Chips, pills, badges'],
  ['--r-control', '13px', 'Buttons'],
  ['--r-input', '14px', 'Text fields and selects'],
  ['--r-nav', '14px', 'Sidebar items'],
  ['--r-tab', '17px', 'Tab and segment pills'],
  ['--r-card', '18px', 'Index cards, menus, toasts'],
  ['--r-panel', '22px', 'Feature panels, dialogs, drawers'],
  ['--r-sheet', '28px', 'Bottom sheets'],
  ['--r-page', '4px', 'Document pages'],
  ['--r-xs', '6px', 'Document thumbnails, keys, tooltips'],
];

const LAYOUT_TOKENS: Row3[] = [
  ['--rail-w', '248px', 'Left rail, desktop'],
  ['--rail-w-collapsed', '72px', 'Icon rail, 700–1099px'],
  ['--topbar-h', '64px', 'Sticky top bar (56px on mobile)'],
  ['--tabbar-h', '84px', 'Mobile bottom tab bar, plus the home indicator'],
  ['--touch-min', '44px', 'The smallest target on a touch screen'],
  ['--content-max', '1180px', 'Page column (<Page>)'],
  ['--content-max-wide', '1440px', '<Page width="wide">'],
  ['--content-max-narrow', '760px', '<Page width="narrow">, reading'],
  ['--content-pad', '40 / 32 / 16px', 'Page padding by breakpoint'],
  ['--measure', '50ch', 'Longest line of text: under 75 characters in Figtree'],
];

const MOTION_TOKENS: Row3[] = [
  ['--ease', 'cubic-bezier(.2,.8,.2,1)', 'Every transition'],
  ['--ease-bounce', 'cubic-bezier(.34,1.56,.64,1)', 'The happy hop only'],
  ['--dur-fast', '140ms', 'Hovers, menus, tooltips, presses'],
  ['--dur', '200ms', 'Tabs, toggles, drawers closing'],
  ['--dur-slow', '320ms', 'Modals and drawers opening, toasts'],
];

const SECTIONS: Row2[] = [
  ['brand', 'Brand'],
  ['colour', 'Colour'],
  ['type', 'Type'],
  ['icons', 'Icons'],
  ['deskmates', 'Deskmates'],
  ['space', 'Space and shape'],
  ['actions', 'Buttons'],
  ['forms', 'Forms'],
  ['selection', 'Selection'],
  ['labels', 'Labels and people'],
  ['feedback', 'Feedback and data'],
  ['overlays', 'Overlays'],
  ['layout', 'Page layout'],
  ['themes', 'Light and dark'],
];

// Specimen content. Names are invented (never a real student); the module and the counts come from the API.
const SAMPLE_PEOPLE = ['Ali H.', 'Fatima A.', 'Hussain M.', 'Zainab K.', 'Ahmed J.', 'Noor E.'];
const SAMPLE_NAME = 'Fatima A.';
const SAMPLE_NOTES = [
  { name: 'Mohamed study guide', author: 'Mohamed' },
  { name: 'Chapter 2 summary', author: 'Zainab K.' },
];
const COHORT_YEARS: readonly CohortYear[] = [1, 2, 3];
const AVATAR_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const EVENT_ENTRIES = TYPE_ORDER.map((type) => [type, EVENT_TYPES[type]] as const);

/** Shown only if the catalogue has no ST2133 and no module at all. */
const FALLBACK_MODULE: ModuleSummary = {
  id: 'advanced-stats-distribution',
  unitCode: 'ST2133',
  name: 'Advanced Statistics: Distribution Theory',
  shortName: 'Distribution theory',
  year: 2,
  description: 'Probability distributions, their moments and how to transform them.',
  icon: null,
  art: null,
  chapterCount: 0,
  lessonCount: 0,
  libraryCount: 0,
};

/** The module the specimens show: ST2133 from the catalogue. */
function useDemoModule(): ModuleSummary {
  const { getModule, modules } = useModules();
  return getModule('advanced-stats-distribution') ?? modules[0] ?? FALLBACK_MODULE;
}

/** Calendar dates per type (0 until the calendar has loaded). */
function useEventCounts(): { counts: Partial<Record<EventType, number>>; total: number } {
  const events = useCalendarEvents();
  return useMemo(() => {
    const counts: Partial<Record<EventType, number>> = {};
    for (const e of events.data ?? []) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return { counts, total: events.data?.length ?? 0 };
  }, [events.data]);
}

// ── Building blocks of this page ──────────────────────────────────────────
function scrollToSection(id: string) {
  document.getElementById(`sg-${id}`)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' });
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={`sg-${id}`} className="sg-section" aria-labelledby={`sg-${id}-title`}>
      <header className="sg-section__head">
        <h2 id={`sg-${id}-title`} className="sg-section__title">
          {title}
        </h2>
        {description ? <p className="sg-section__desc">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** One primitive: name, short note, the live specimen, and the code to copy. */
interface SpecimenProps {
  title: string;
  note?: string;
  code?: string;
  className?: string;
  stageClassName?: string;
  children: ReactNode;
}

function Specimen({ title, note, code, className, stageClassName, children }: SpecimenProps) {
  return (
    <figure className={cx('sg-spec', className)}>
      <figcaption className="sg-spec__head">
        <span className="sg-spec__title">{title}</span>
        {note ? <span className="sg-spec__note">{note}</span> : null}
      </figcaption>
      <div className={cx('sg-spec__stage', stageClassName)}>{children}</div>
      {code ? (
        <pre className="sg-spec__code">
          <code>{code}</code>
        </pre>
      ) : null}
    </figure>
  );
}

function Swatch({ token, light, dark, use }: { token: string; light?: string; dark?: string; use: string }) {
  return (
    <li className="sg-swatch">
      {light ? (
        <span className="sg-swatch__chip sg-swatch__chip--pair" aria-hidden="true">
          <span style={{ background: light }} />
          <span style={{ background: dark }} />
        </span>
      ) : (
        <span className="sg-swatch__chip" style={{ background: `var(${token})` }} aria-hidden="true" />
      )}
      <span className="sg-swatch__text">
        <code className="sg-token">{token}</code>
        <span className="sg-swatch__use">{use}</span>
        {light ? (
          <span className="sg-swatch__hex u-tabular">
            <span>{light}</span>
            <span className="sg-swatch__dark">{dark}</span>
          </span>
        ) : null}
      </span>
    </li>
  );
}

function Replay({ onClick, label = 'Replay' }: { onClick: () => void; label?: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} leadingIcon={<Icon glyph={glyph.play} />}>
      {label}
    </Button>
  );
}

function MotionDemo() {
  const [on, setOn] = useState(false);
  return (
    <div className="sg-motion">
      <svg
        viewBox="-4 -4 108 108"
        className="sg-motion__curve"
        role="img"
        aria-label="The easing curve cubic-bezier(.2,.8,.2,1)"
      >
        <path className="sg-motion__axis" d="M0 100 H100 M0 100 V0" />
        <path className="sg-motion__path" d="M0 100 C20 20 20 0 100 0" />
      </svg>
      <div className="sg-motion__side">
        <div className="sg-motion__track" aria-hidden="true">
          <span className={cx('sg-motion__dot', on && 'is-on')} />
        </div>
        <Button size="sm" onClick={() => setOn((v) => !v)} leadingIcon={<Icon glyph={glyph.play} />}>
          Play 250ms
        </Button>
      </div>
    </div>
  );
}

function ThemeIsland({ theme }: { theme: 'light' | 'dark' }) {
  const demo = useDemoModule();
  const [view, setView] = useState('lessons');
  return (
    <div data-theme={theme} className="sg-island">
      <p className="sg-island__label">{theme === 'dark' ? 'Dark' : 'Light'}</p>
      <div className="sg-island__module">
        <span className="u-code sg-island__code">{demo.unitCode ?? demo.shortName}</span>
        <div className="sg-island__mod-text">
          <p className="sg-island__name">{demo.name}</p>
          <p className="sg-island__meta">
            <CohortBadge year={demo.year} size="sm" />
            <span>
              {demo.chapterCount} chapters, {demo.lessonCount} lessons
            </span>
          </p>
        </div>
        <ProgressRing value={41} size={44} color={cohortColor(demo.year)} label="Lessons watched" />
      </div>
      <p className="sg-island__copy">
        Chapter 2 notes are <Highlight>new this week</Highlight>. Your exam is on 30 Oct.
      </p>
      <div className="sg-island__row">
        <Button variant="primary" leadingIcon={<Icon glyph={glyph.play} />}>
          Resume lesson
        </Button>
        <Button leadingIcon={<Icon glyph={glyph.page} />}>Open files</Button>
        <IconButton label="Save module" icon={<Icon glyph={glyph.bookmark} />} variant="secondary" />
      </div>
      <div className="sg-island__row">
        <SegmentedControl
          size="sm"
          label="Section"
          value={view}
          onChange={setView}
          options={[
            { value: 'lessons', label: 'Lessons' },
            { value: 'files', label: 'Files' },
            { value: 'discussion', label: 'Discussion' },
          ]}
        />
        <Badge tone="exam">Exam</Badge>
        <Badge tone="signal">Answered</Badge>
        <Badge tone="highlight">New</Badge>
      </div>
      <div className="sg-island__row sg-island__row--chips">
        <Chip selected>All years</Chip>
        <Chip color={cohortColor(1)}>Year 1</Chip>
        <Chip color={cohortColor(2)}>Year 2</Chip>
        <Chip color={cohortColor(3)}>Year 3</Chip>
      </div>
      <SearchField placeholder="Search this module" label="Search this module" value="" onChange={() => {}} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function StyleGuidePage() {
  const { push } = useToast();
  const { modules } = useModules();
  const demo = useDemoModule();
  const { counts: eventCounts, total: eventTotal } = useEventCounts();
  const [hlKey, setHlKey] = useState(0);
  const [chips, setChips] = useState<string[]>(['exam']);
  const [tab, setTab] = useState('all');
  const [pill, setPill] = useState('week');
  const [view, setView] = useState('table');
  const [year, setYear] = useState<CohortYear>(2);
  const [query, setQuery] = useState('');
  const [weeks, setWeeks] = useState(6);
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState<'right' | 'bottom' | null>(null);
  const [loading, setLoading] = useState(false);
  const tabType = TYPE_ORDER.find((t) => t === tab);

  const toggleChip = (id: string) =>
    setChips((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const fakeLoad = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1600);
  };

  return (
    <Page className="sg">
      <PageHeader
        title="Style guide"
        description="The tokens and shared primitives DSBA Hub is built from. Build pages from these and copy the code under each specimen. Don’t invent new colours, radii or shadows."
        meta={
          <>
            <Badge tone="outline">{modules.length} modules from the API</Badge>
            <Badge tone="outline">Rendered in the current theme</Badge>
          </>
        }
      />

      <div className="sg-layout">
        <nav className="sg-toc" aria-label="Style guide sections">
          <p className="sg-toc__title">On this page</p>
          <ul role="list">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <button type="button" className="sg-toc__link" onClick={() => scrollToSection(id)}>
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sg-main">
          {/* Principles */}
          <Panel tone="inset" padding="md" className="sg-rules">
            <div>
              <h2 className="sg-rules__title">Spend boldness in one place</h2>
              <p className="sg-rules__body">
                The highlighter is the signature. Everything else stays quiet: borders before shadows, lists and tables
                before grids of cards, sentence case, plain verbs.
              </p>
            </div>
            <ul role="list" className="sg-rules__list">
              <li>No all-caps eyebrow labels</li>
              <li>No meta strings joined with middle dots</li>
              <li>No arrows appended to buttons or links</li>
              <li>No gradients, glass or glow</li>
              <li>Mono only for code, formulas and keys</li>
              <li>Highlighter yellow is never a text colour</li>
            </ul>
          </Panel>

          {/* ── Brand ─────────────────────────────────────────────────── */}
          <Section
            id="brand"
            title="Brand"
            description="The active page sits on its section’s pill; a plain ring is the loader. The logo is a file (data/brand.ts): the “DSBA Hub” lockup and the “DH” tile. The highlighter marks what is new or important."
          >
            <div className="sg-grid sg-grid--2">
              <Specimen
                title="HubLogo, Spinner"
                note="the logo slot; the loader (size)"
                code={`<HubLogo variant="tile" size={32} />   // the logo slot\n<Spinner size={18} />   // beside what is loading, inside role="status"`}
                stageClassName="sg-stage--brand"
              >
                <div className="sg-mark-row">
                  <HubLogo variant="tile" size={20} decorative />
                  <HubLogo variant="tile" size={28} decorative />
                  <HubLogo variant="tile" size={40} decorative />
                  <HubLogo variant="tile" size={64} />
                </div>
                <div className="sg-mark-row">
                  <span className="sg-mark-loader" role="status">
                    <Spinner /> <span className="sg-caption">Loading</span>
                  </span>
                </div>
              </Specimen>

              <Specimen
                title="Highlight"
                note="as, animate, delay"
                code={`<Highlight>new this week</Highlight>\n<Highlight animate delay={300}>…</Highlight>  // Home only\n<Badge tone="highlight">New</Badge>`}
                stageClassName="sg-stage--column"
              >
                <p className="sg-hl-display">
                  Know what’s <Highlight>new</Highlight> before your exam.
                </p>
                <p className="sg-hl-body" key={hlKey}>
                  Mock papers for ST2133 and ST2134 are{' '}
                  <Highlight animate delay={150}>
                    in the library now
                  </Highlight>
                  , and the October exam timetable has{' '}
                  <Highlight animate delay={500}>
                    real unit codes
                  </Highlight>
                  .
                </p>
                <div className="sg-inline">
                  <Replay onClick={() => setHlKey((k) => k + 1)} label="Replay swipe" />
                  <span className="sg-inline">
                    Forum{' '}
                    <Badge tone="highlight" size="sm">
                      New
                    </Badge>
                  </span>
                </div>
              </Specimen>
            </div>

            <Specimen
              title="Lockup"
              note="HubLogo: the official DSBA wordmark with “Hub” in matching type, blue on light surfaces and white on dark."
              stageClassName="sg-stage--lockups"
            >
              <HubLogo variant="lockup" size={48} />
              <HubLogo variant="lockup" size={32} />
              <span className="sg-lockup sg-lockup--blue" data-theme="dark">
                <HubLogo variant="lockup" size={24} />
              </span>
            </Specimen>
          </Section>

          {/* ── Colour ────────────────────────────────────────────────── */}
          <Section
            id="colour"
            title="Colour"
            description="Use tokens, never hex values. Each spec swatch shows light on the left and dark on the right; derived swatches follow the current theme."
          >
            <div className="sg-colours">
              {COLOURS.map((g) => (
                <div key={g.group} className="sg-colour-group">
                  <h3 className="sg-subhead">{g.group}</h3>
                  <ul role="list" className="sg-swatches">
                    {g.items.map(([token, light, dark, use]) => (
                      <Swatch key={token} token={token} light={light} dark={dark} use={use} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="sg-colour-group">
              <h3 className="sg-subhead">Derived, for contrast and tints</h3>
              <ul role="list" className="sg-swatches sg-swatches--derived">
                {DERIVED.map(([token, use]) => (
                  <Swatch key={token} token={token} use={use} />
                ))}
              </ul>
            </div>
            <div className="sg-colour-group">
              <h3 className="sg-subhead">Sections</h3>
              <p className="sg-caption">
                Each section has four tones: art (drawings, the active icon body; never text), tint (the resting icon
                body), pill (the active item, section headers) and text (labels and counts). Set{' '}
                <code>data-section</code> and use <code>--sec-art</code>, <code>--sec-tint</code>,{' '}
                <code>--sec-pill</code> and <code>--sec-text</code>.
              </p>
              <ul role="list" className="sg-sections">
                {SECTION_COLOURS.map(([id, name, who]) => (
                  <li key={id} className="sg-tone" data-section={id}>
                    <span className="sg-tone__swatches" aria-hidden="true">
                      <span style={{ background: 'var(--sec-art)' }} />
                      <span style={{ background: 'var(--sec-tint)' }} />
                      <span style={{ background: 'var(--sec-pill)' }} />
                    </span>
                    <span className="sg-tone__pill">{name}</span>
                    <span className="sg-caption">{who}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sg-colour-group">
              <h3 className="sg-subhead">Text on its ground</h3>
              <p className="sg-caption">
                Every text pair in the tokens, light theme then dark, with the contrast measured here. Text needs 4.5:1;
                a dashed ring marks one that falls short.
              </p>
              <TokenPairs />
            </div>
            <div className="sg-colour-group">
              <h3 className="sg-subhead">Daily’s game colours</h3>
              <p className="sg-caption">
                From <code>features/daily/daily.css</code>: each fill with the text it carries, light theme then dark,
                and the contrast measured here. Text needs 4.5:1.
              </p>
              <GameColours />
            </div>
            <div className="sg-colour-group">
              <h3 className="sg-subhead">Calendar event types</h3>
              <p className="sg-caption">
                From <code>EVENT_TYPES</code> in <code>features/calendar/eventMeta.ts</code>. Always pair the colour
                with the label.
              </p>
              <ul role="list" className="sg-events">
                {EVENT_ENTRIES.map(([type, t]) => (
                  <li key={type} className="sg-event">
                    <span
                      className={cx('sg-event__dot', type === 'deadline' && 'sg-event__dot--ring')}
                      style={{ background: t.color }}
                      aria-hidden="true"
                    />
                    <span className="sg-event__label">{t.label}</span>
                    <code className="sg-token">{t.token}</code>
                    <span className="sg-event__count u-tabular">{eventCounts[type] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          {/* ── Type ──────────────────────────────────────────────────── */}
          <Section
            id="type"
            title="Type"
            description="Bricolage Grotesque for titles and headings, Figtree for the interface and reading, JetBrains Mono for codes and timers, IBM Plex Sans Arabic for Arabic in every stack."
          >
            <div className="sg-families">
              <div className="sg-family sg-family--display">
                <p className="sg-family__glyph">Aa</p>
                <p className="sg-family__name">Bricolage Grotesque</p>
                <p className="sg-family__role">
                  Page titles, greetings and card titles: 750, optical size by the browser, −0.025em. Never body text.
                </p>
                <p className="sg-family__sample">Good evening, Sara</p>
              </div>
              <div className="sg-family">
                <p className="sg-family__glyph">Aa</p>
                <p className="sg-family__name">Figtree</p>
                <p className="sg-family__role">Everything else: the interface, body text, labels and the newsletter.</p>
                <p className="sg-family__weights">
                  <span style={{ fontWeight: 400 }}>Regular</span>
                  <span style={{ fontWeight: 500 }}>Medium</span>
                  <span style={{ fontWeight: 600 }}>Semibold</span>
                  <span style={{ fontWeight: 700 }}>Bold</span>
                  <span style={{ fontWeight: 800 }}>Heavy</span>
                </p>
                <blockquote className="sg-quote">
                  “Past papers are the closest thing we have to a map of the exam.”
                </blockquote>
              </div>
              <div className="sg-family sg-family--mono">
                <p className="sg-family__glyph">Aa</p>
                <p className="sg-family__name">JetBrains Mono</p>
                <p className="sg-family__role">Codes, timers, formulas and keyboard keys. Never small labels.</p>
                <pre className="sg-mono-sample">
                  <code>{'mean(x)  # R\nVar(X) = E[X²] − (E[X])²'}</code>
                </pre>
                <p className="sg-inline">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd> <span className="sg-caption">opens search</span>
                </p>
              </div>
            </div>

            <ul role="list" className="sg-scale">
              {TYPE_SCALE.map(([px, token, role, sample, kind]) => (
                <li key={token} className="sg-scale__row">
                  <span className="sg-scale__meta">
                    <code className="sg-token">{token}</code>
                    <span className="sg-scale__px u-tabular">{px}px</span>
                    <span className="sg-scale__role">{role}</span>
                  </span>
                  <span
                    className={cx('sg-scale__sample', `sg-scale__sample--${kind}`)}
                    style={{ fontSize: `var(${token})` }}
                  >
                    {sample}
                  </span>
                </li>
              ))}
            </ul>

            <div className="sg-grid sg-grid--2">
              <Specimen
                title="Module code as a typographic object"
                note="className u-code: Figtree 800, tabular figures"
                code={`<span className="u-code" style={{ fontSize: 'var(--fs-44)' }}>{m.unitCode}</span>\n// year 3 modules have no unit code: show the name instead`}
                stageClassName="sg-stage--column"
              >
                <div className="sg-unit">
                  <span className="u-code sg-unit__code" style={{ color: 'var(--y2-strong)' }}>
                    ST2133
                  </span>
                  <span className="sg-unit__name">Advanced Statistics: Distribution Theory</span>
                </div>
                <ul role="list" className="sg-unit-list">
                  {modules
                    .filter((m) => m.unitCode)
                    .slice(0, 6)
                    .map((m) => (
                      <li key={m.id}>
                        <span className="u-code sg-unit-list__code" style={{ color: `var(--y${m.year}-strong)` }}>
                          {m.unitCode}
                        </span>
                        <span className="sg-unit-list__name">{m.shortName}</span>
                      </li>
                    ))}
                </ul>
              </Specimen>
              <Specimen
                title="Text utilities"
                note="in styles/base.css"
                code={`u-tabular  u-display  u-mono  u-muted\nu-measure  u-code  visually-hidden`}
                stageClassName="sg-stage--column"
              >
                <p className="u-measure">
                  Body text at 16px with line height 1.55 keeps to the measure, about 75 characters a line.{' '}
                  <a href="#/styleguide" onClick={(e) => e.preventDefault()}>
                    Links are the accent
                  </a>{' '}
                  with a quiet underline that firms up on hover. <strong>Bold</strong> for emphasis,{' '}
                  <code>inline code</code> for code.
                </p>
                <p className="u-muted">Secondary text uses ink-2 and stays AA on paper and surface.</p>
                <p>
                  <span className="u-tabular">22</span> lessons, <span className="u-tabular">2</span> chapters: wrap
                  only the numbers in u-tabular (it widens commas).
                </p>
                <p className="u-display">A title set in the display face</p>
              </Specimen>
            </div>
          </Section>

          {/* ── Icons ─────────────────────────────────────────────────── */}
          <Section
            id="icons"
            title="Icons"
            description="One hand-drawn two-tone family: the line takes the text colour, the body the section’s tint, paper parts the surface. 24 in the tab and top bars, 20 in the sidebar, buttons and fields, 16 inline with meta. Every icon in the app comes from this family."
          >
            <Specimen
              title="Icon"
              note="glyph, size 16 | 20 | 24, active, label (names a meaningful icon; otherwise hidden)"
              code={`import { Icon, glyph } from '../../ui';\n<Icon glyph={glyph.library} size={20} />\n<Icon glyph={glyph.library} size={24} active />   // inside data-section="library"\n<Button leadingIcon={<Icon glyph={glyph.upload} />}>Upload a file</Button>`}
              stageClassName="sg-stage--column"
            >
              <ul role="list" className="sg-icons">
                {GLYPHS.map(([name, g]) => (
                  <li key={name} className="sg-icons__item">
                    <Icon glyph={g} size={24} />
                    <code className="sg-token">{name}</code>
                  </li>
                ))}
              </ul>
              <div className="sg-icons__states">
                {SECTION_COLOURS.map(([id, name]) => (
                  <span key={id} className="sg-icons__state" data-section={id}>
                    <Icon glyph={NAV_GLYPH[id]} size={24} />
                    <span className="sg-icons__pill">
                      <Icon glyph={NAV_GLYPH[id]} size={24} active />
                    </span>
                    <span className="sg-caption">{name}</span>
                  </span>
                ))}
              </div>
            </Specimen>
          </Section>

          {/* ── Deskmates ─────────────────────────────────────────────── */}
          <Section
            id="deskmates"
            title="Deskmates"
            description="Each core section’s study object come to life: idle in its section header, asleep in an empty list, happy on a success that matters. One per view, never below 32 px, never on a failure."
          >
            <Specimen
              title="Deskmate"
              note="mate, state idle | happy | sleepy (and wave, countdown, searching), size, label (decorative without), cover"
              code={`import { Deskmate } from '../../ui';
<PageHeader section="library" title="Library" />            // the band and its deskmate
<EmptyState mate="jot" title="No notes yet" />              // asleep
push({ title: 'Thread posted', tone: 'success', mate: 'pip-pod' })  // happy`}
              stageClassName="sg-stage--column"
            >
              <ul role="list" className="sg-mates">
                {Object.entries(SECTION_MATE).map(([section, mate]) => (
                  <li key={mate} className="sg-mates__row" data-section={section}>
                    <Deskmate mate={mate} size={72} />
                    <Deskmate mate={mate} state="happy" size={72} />
                    <Deskmate mate={mate} state="sleepy" size={72} />
                    <code className="sg-token">{mate}</code>
                  </li>
                ))}
              </ul>
            </Specimen>
          </Section>

          {/* ── Space, shape, elevation, motion ─────────────────────────── */}
          <Section
            id="space"
            title="Space and shape"
            description="Spacing scale 4 to 96. Radii by hierarchy, not one radius everywhere. Borders first; shadows only on floating layers."
          >
            <div className="sg-grid sg-grid--2">
              <Specimen title="Spacing" note="--sp-4 … --sp-96" stageClassName="sg-stage--column">
                <ul role="list" className="sg-space">
                  {SPACE.map((n) => (
                    <li key={n} className="sg-space__row">
                      <code className="sg-token">--sp-{n}</code>
                      <span className="sg-space__bar" style={{ width: n * 2.4 }} aria-hidden="true" />
                      <span className="sg-space__px u-tabular">{n}</span>
                    </li>
                  ))}
                </ul>
              </Specimen>
              <Specimen title="Radii" note="--r-*" stageClassName="sg-stage--radii">
                {RADII.map(([token, value, use]) => (
                  <div key={token} className="sg-radius">
                    <span className="sg-radius__box" style={{ borderRadius: `var(${token})` }} aria-hidden="true" />
                    <code className="sg-token">{token}</code>
                    <span className="sg-caption">
                      {value}, {use}
                    </span>
                  </div>
                ))}
              </Specimen>
            </div>
            <div className="sg-grid sg-grid--2">
              <Specimen
                title="Elevation"
                note="border first, --shadow-float for floating layers"
                stageClassName="sg-stage--elevation"
              >
                <div className="sg-elev sg-elev--border">
                  <span className="sg-elev__name">Border</span>
                  <span className="sg-caption">Panels, rows, inputs</span>
                </div>
                <div className="sg-elev sg-elev--float">
                  <span className="sg-elev__name">Float</span>
                  <span className="sg-caption">Menus, modals, toasts</span>
                </div>
              </Specimen>
              <Specimen
                title="Focus"
                note="2px accent ring, 2px offset, keyboard only"
                stageClassName="sg-stage--column"
              >
                <div className="sg-focus-row">
                  <Button className="sg-force-focus">Focused button</Button>
                  <IconButton
                    label="Focused icon button"
                    icon={<Icon glyph={glyph.search} />}
                    variant="secondary"
                    className="sg-force-focus"
                  />
                  <a href="#/styleguide" className="sg-force-focus" onClick={(e) => e.preventDefault()}>
                    Focused link
                  </a>
                </div>
                <p className="sg-caption">
                  Base styles draw <code>:focus-visible</code> for you. Don’t remove outlines; inside dense lists use an
                  inset ring.
                </p>
              </Specimen>
            </div>
            <Specimen
              title="Motion"
              note="140–320ms, one easing, only in answer to an action (plus Home’s first load)"
              stageClassName="sg-stage--motion"
            >
              <MotionDemo />
              <ul role="list" className="sg-kv sg-kv--motion">
                {MOTION_TOKENS.map(([t, v, use]) => (
                  <li key={t}>
                    <code className="sg-token">{t}</code>
                    <span className="u-tabular">{v}</span>
                    <span className="sg-caption">{use}</span>
                  </li>
                ))}
              </ul>
            </Specimen>
            <Specimen title="Layout tokens" note="the shell owns these; pages use <Page>">
              <ul role="list" className="sg-kv sg-kv--wide">
                {LAYOUT_TOKENS.map(([t, v, use]) => (
                  <li key={t}>
                    <code className="sg-token">{t}</code>
                    <span className="u-tabular">{v}</span>
                    <span className="sg-caption">{use}</span>
                  </li>
                ))}
              </ul>
            </Specimen>
          </Section>

          {/* ── Buttons ───────────────────────────────────────────────── */}
          <Section
            id="actions"
            title="Buttons"
            description="Labels say exactly what happens: Post thread, Open original, Download .ics."
          >
            <Specimen
              title="Button"
              note="variant primary | secondary | ghost | danger, size sm | md | lg, leadingIcon, trailingIcon, to, href, as, loading, fullWidth"
              code={`<Button variant="primary" leadingIcon={<Icon glyph={glyph.plus} />} to="/forum/new">Start a thread</Button>\n<Button href={file.sourceUrl} trailingIcon={<Icon glyph={glyph.external} />}>Open original</Button>   // external: new tab\n<Button variant="danger" size="sm" leadingIcon={<Icon glyph={glyph.trash} />}>Delete draft</Button>`}
              stageClassName="sg-stage--column"
            >
              <div className="sg-inline">
                <Button variant="primary" leadingIcon={<Icon glyph={glyph.plus} />}>
                  Post thread
                </Button>
                <Button leadingIcon={<Icon glyph={glyph.download} />}>Download .ics</Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="danger" leadingIcon={<Icon glyph={glyph.trash} />}>
                  Delete draft
                </Button>
              </div>
              <div className="sg-inline">
                <Button variant="primary" size="lg">
                  Choose Year 2
                </Button>
                <Button variant="primary">Save notes</Button>
                <Button variant="primary" size="sm">
                  Reply
                </Button>
                <Divider orientation="vertical" />
                <Button size="lg">Open original</Button>
                <Button>Open original</Button>
                <Button size="sm">Open original</Button>
              </div>
              <div className="sg-inline">
                <Button trailingIcon={<Icon glyph={glyph.external} />} href="https://myclass.bibf.com">
                  MyClass
                </Button>
                <Button to="/modules" variant="ghost" leadingIcon={<Icon glyph={glyph.gridView} />}>
                  All modules
                </Button>
                <Button variant="primary" loading={loading} onClick={fakeLoad}>
                  {loading ? 'Posting' : 'Post thread'}
                </Button>
                <Button disabled>Disabled</Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
              </div>
            </Specimen>
            <Specimen
              title="IconButton"
              note="label (required, becomes aria-label), icon, variant ghost | secondary | primary, size, badge, tooltip, active + toggle"
              code={`<IconButton label="Share thread" icon={<Icon glyph={glyph.share} />} tooltip />\n<IconButton label="Notifications" icon={glyph.bell} badge={3} />`}
            >
              <IconButton label="Search" icon={<Icon glyph={glyph.search} />} tooltip />
              <IconButton label="Edit" icon={<Icon glyph={glyph.edit} />} variant="secondary" tooltip />
              <IconButton label="Add file" icon={<Icon glyph={glyph.plus} />} variant="primary" tooltip />
              <IconButton label="Copy link" icon={<Icon glyph={glyph.copy} />} size="sm" tooltip />
              <IconButton label="Share" icon={<Icon glyph={glyph.share} />} size="lg" variant="secondary" tooltip />
              <IconButton label="Messages, unread" icon={<Icon glyph={glyph.forum} />} badge tooltip />
              <IconButton
                label="Files, 3 new"
                icon={<Icon glyph={glyph.library} />}
                badge={3}
                variant="secondary"
                tooltip
              />
              <IconButton label="Saved" icon={<Icon glyph={glyph.bookmark} />} active toggle tooltip />
            </Specimen>
          </Section>

          {/* ── Forms ─────────────────────────────────────────────────── */}
          <Section
            id="forms"
            title="Forms"
            description="Labels above fields, hints under them, errors that say what to do."
          >
            <div className="sg-grid sg-grid--2">
              <Specimen
                title="TextField, WholeNumberField"
                note="label, hint, error, required, leadingIcon, trailing, size md | lg; a whole number kept in range"
                stageClassName="sg-stage--column sg-stage--form"
                code={`<TextField label="Thread title" hint="Ask one clear question." required />\n<TextField label="Final mark" error="Enter a mark between 0 and 100." />\n<WholeNumberField label="For how many weeks" min={1} max={20} value={weeks} onValue={setWeeks} />`}
              >
                <TextField
                  label="Thread title"
                  placeholder="How do I find the MGF of a gamma distribution?"
                  hint="Ask one clear question. Add details below."
                  required
                />
                <TextField
                  label="Final mark"
                  defaultValue="104"
                  error="Enter a mark between 0 and 100."
                  inputMode="numeric"
                  trailing="%"
                />
                <TextField label="Your name" leadingIcon={<Icon glyph={glyph.user} />} defaultValue={SAMPLE_NAME} />
                <WholeNumberField
                  label="For how many weeks"
                  hint="1 to 20. Clear it and type again: it never becomes 0."
                  min={1}
                  max={20}
                  value={weeks}
                  onValue={setWeeks}
                />
              </Specimen>
              <Specimen
                title="TextArea, Select"
                note="same label, hint and error props"
                stageClassName="sg-stage--column sg-stage--form"
                code={`<Select label="Module" placeholder="Choose a module" options={mods.map((m) => ({ value: m.id, label: m.name }))} />\n<TextArea label="Details" rows={4} />`}
              >
                <Select
                  label="Module"
                  placeholder="Choose a module"
                  defaultValue=""
                  options={modules
                    .filter((m) => m.year === 2)
                    .map((m) => ({ value: m.id, label: m.unitCode ? `${m.unitCode} ${m.name}` : m.name }))}
                />
                <TextArea
                  label="Details"
                  placeholder="What have you tried so far?"
                  hint="Markdown is fine. Be kind."
                  rows={3}
                />
              </Specimen>
            </div>
            <Specimen
              title="SearchField"
              note="value + onValueChange, onClear, shortcut, size, asButton (the top bar uses this to open ⌘K)"
              code={`<SearchField value={q} onValueChange={setQ} placeholder="Search threads" />\n<SearchField asButton shortcut="K" placeholder="Search everything…" onClick={() => openCommandPalette()} />`}
              stageClassName="sg-stage--search"
            >
              <SearchField value={query} onValueChange={setQuery} placeholder="Search threads" label="Search threads" />
              <SearchField
                asButton
                shortcut="K"
                placeholder="Search everything…"
                label="Search everything"
                onClick={() =>
                  push({
                    title: 'This opens the command palette',
                    body: 'Use openCommandPalette() from features/search/public.ts.',
                  })
                }
              />
              <SearchField size="lg" value="gamma distribution" onValueChange={() => {}} label="Search the library" />
            </Specimen>
          </Section>

          {/* ── Selection ─────────────────────────────────────────────── */}
          <Section
            id="selection"
            title="Selection"
            description="Chips filter, tabs switch views of one thing, segmented controls switch modes."
          >
            <Specimen
              title="Chip"
              note="selected, onChange(next), icon, count, color (leading dot), size sm | md"
              code={`<Chip selected={types.has('exam')} onChange={() => toggle('exam')} color="var(--error)" count={24}>Exams</Chip>`}
            >
              {EVENT_ENTRIES.map(([type, t]) => (
                <Chip
                  key={type}
                  selected={chips.includes(type)}
                  onChange={() => toggleChip(type)}
                  color={t.color}
                  count={eventCounts[type] ?? 0}
                >
                  {t.label}
                </Chip>
              ))}
              <Chip icon={<Icon glyph={glyph.filter} />} size="sm">
                More filters
              </Chip>
            </Specimen>
            <div className="sg-grid sg-grid--2">
              <Specimen
                title="Tabs"
                note="controlled; variant underline | pill; tabs [{ id, label, icon?, count? }]"
                code={`const [tab, setTab] = useQueryParam('tab', 'overview');\n<Tabs idBase="module" label="Module sections" tabs={TABS} value={tab} onChange={setTab} />\n<TabPanel idBase="module" id="overview" value={tab}>…</TabPanel>`}
                stageClassName="sg-stage--column"
              >
                <Tabs
                  idBase="sg-tabs"
                  label="Event types"
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { id: 'all', label: 'All', count: eventTotal },
                    { id: 'exam', label: 'Exams', count: eventCounts.exam ?? 0 },
                    { id: 'mock', label: 'Mocks', count: eventCounts.mock ?? 0 },
                    { id: 'deadline', label: 'Deadlines', count: eventCounts.deadline ?? 0 },
                  ]}
                />
                <TabPanel idBase="sg-tabs" id={tab} value={tab} className="sg-tabpanel">
                  <p className="sg-caption">
                    Showing {tabType ? `${EVENT_TYPES[tabType].label.toLowerCase()}s` : 'every event'}. Arrow keys move
                    between tabs.
                  </p>
                </TabPanel>
                <Tabs
                  idBase="sg-pill"
                  variant="pill"
                  label="Range"
                  value={pill}
                  onChange={setPill}
                  tabs={[
                    { id: 'week', label: 'This week' },
                    { id: 'month', label: 'This month' },
                    { id: 'term', label: 'Term' },
                  ]}
                />
              </Specimen>
              <Specimen
                title="SegmentedControl"
                note="options [{ value, label, icon?, color?, onColor? }], value, onChange, label, size, iconOnly, fullWidth"
                code={`<SegmentedControl label="View" value={view} onChange={setView}\n  options={[{ value: 'table', label: 'Table', icon: glyph.rows }, { value: 'grid', label: 'Grid', icon: glyph.gridView }]} />`}
                stageClassName="sg-stage--column"
              >
                <SegmentedControl
                  label="View"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'table', label: 'Table', icon: glyph.rows },
                    { value: 'grid', label: 'Grid', icon: glyph.gridView },
                  ]}
                />
                <SegmentedControl
                  label="Year"
                  value={year}
                  onChange={setYear}
                  options={COHORT_YEARS.map((y) => ({
                    value: y,
                    label: `Year ${y}`,
                    color: cohortColor(y),
                    onColor: `var(--on-y${y})`,
                  }))}
                />
                <SegmentedControl
                  size="sm"
                  iconOnly
                  label="Layout"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'table', label: 'Table', icon: glyph.rows },
                    { value: 'grid', label: 'Grid', icon: glyph.gridView },
                  ]}
                />
              </Specimen>
            </div>
          </Section>

          {/* ── Labels and people ─────────────────────────────────────── */}
          <Section
            id="labels"
            title="Labels and people"
            description="Badges carry status, cohort badges carry the year, avatars carry a person."
          >
            <div className="sg-grid sg-grid--2">
              <Specimen
                title="Badge"
                note="tone neutral | cobalt | signal | alert | exam | highlight | navy | outline, size sm | md, icon; a number is a count (Count: tabular digits, '1,234')"
                code={`<Badge tone="exam">Exam</Badge>  <Badge tone="highlight">New</Badge>  <Badge tone="cobalt">{1234}</Badge>`}
              >
                <Badge>Draft</Badge>
                <Badge tone="cobalt">Pinned</Badge>
                <Badge tone="signal">Answered</Badge>
                <Badge tone="exam">Exam</Badge>
                <Badge tone="highlight">New</Badge>
                <Badge tone="navy">Staff pick</Badge>
                <Badge tone="outline">PDF</Badge>
                <Badge tone="signal" size="sm">
                  Live
                </Badge>
                <Badge tone="cobalt">{1234}</Badge>
              </Specimen>
              <Specimen
                title="CohortBadge"
                note="year, variant soft | solid | dot, short, size"
                code={`<CohortBadge year={2} />  <CohortBadge year={2} variant="solid" short />`}
              >
                {COHORT_YEARS.map((y) => (
                  <CohortBadge key={`s${y}`} year={y} />
                ))}
                {COHORT_YEARS.map((y) => (
                  <CohortBadge key={`f${y}`} year={y} variant="solid" short />
                ))}
                {COHORT_YEARS.map((y) => (
                  <CohortBadge key={`d${y}`} year={y} variant="dot" />
                ))}
                <CohortBadge year={null} />
              </Specimen>
              <Specimen
                title="Avatar"
                note="name, size xs | sm | md | lg | xl | px, decorative"
                code={`<Avatar name="Zainab K." size="sm" decorative />  // name printed next to it`}
              >
                {AVATAR_SIZES.map((s) => (
                  <Avatar key={s} name={SAMPLE_NAME} size={s} />
                ))}
                <Divider orientation="vertical" />
                {SAMPLE_PEOPLE.map((name) => (
                  <Avatar key={name} name={name} />
                ))}
              </Specimen>
              <Specimen
                title="Kbd, ModuleIcon"
                note="keys in mono; module icons by id"
                code={`<Kbd>⌘</Kbd><Kbd>K</Kbd>   <ModuleIcon moduleId="econometrics" size={20} />`}
              >
                <span className="sg-inline">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
                <span className="sg-inline">
                  <Kbd>Esc</Kbd>
                </span>
                <span className="sg-inline">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                </span>
                <Divider orientation="vertical" />
                {modules.slice(0, 10).map((m) => (
                  <Tooltip key={m.id} label={m.name}>
                    <span className="sg-modicon" tabIndex={0} aria-label={m.name}>
                      <ModuleIcon moduleId={m.id} size={20} />
                    </span>
                  </Tooltip>
                ))}
              </Specimen>
            </div>
          </Section>

          {/* ── Feedback and data ─────────────────────────────────────── */}
          <Section
            id="feedback"
            title="Feedback and data"
            description="Toasts confirm actions, empty states invite them, skeletons hold space while loading."
          >
            <div className="sg-grid sg-grid--2">
              <Specimen
                title="Toast"
                note="useToast().push({ title, body?, tone, duration?, action? })"
                code={`const { push } = useToast();\npush({ title: 'Thread posted', body: 'Your cohort can see it now.', tone: 'success', mate: 'pip-pod' });`}
              >
                <Button onClick={() => push({ title: 'Saved to your library', body: 'Find it under Saved files.' })}>
                  Info toast
                </Button>
                <Button
                  onClick={() =>
                    push({
                      title: 'Thread posted',
                      body: 'Your cohort can see it now.',
                      tone: 'success',
                      mate: 'pip-pod',
                      action: { label: 'View thread', onClick: () => {} },
                    })
                  }
                >
                  Success toast
                </Button>
                <Button
                  onClick={() =>
                    push({
                      title: 'Upload failed',
                      body: 'The file is over 20 MB. Compress it and try again.',
                      tone: 'alert',
                    })
                  }
                >
                  Alert toast
                </Button>
              </Specimen>
              <Specimen
                title="ProgressRing"
                note="value 0–100, size, stroke, color"
                code={`<ProgressRing value={pct} color={cohortColor(year)} label="Lessons watched" />`}
              >
                <ProgressRing value={0} />
                <ProgressRing value={35} color={cohortColor(1)} />
                <ProgressRing value={72} size={48} color={cohortColor(2)} />
                <ProgressRing value={100} size={56} stroke={5} color="var(--success-fill)" />
                <ProgressRing value={60} size={20} stroke={3} />
              </Specimen>
            </div>
            <div className="sg-grid sg-grid--2">
              <Specimen
                title="EmptyState"
                note="icon (duotone), title, body, action, size md | sm"
                stageClassName="sg-stage--flush"
                code={`<EmptyState icon={<Icon glyph={glyph.forum} />} title="No threads for ST2133 yet" body="Ask the first question…" action={<Button …>Start a thread</Button>} />`}
              >
                <EmptyState
                  icon={<Icon glyph={glyph.forum} />}
                  title="No threads for ST2133 yet"
                  body="Ask the first question and your classmates will see it here."
                  action={
                    <Button variant="primary" leadingIcon={<Icon glyph={glyph.plus} />}>
                      Start a thread
                    </Button>
                  }
                />
              </Specimen>
              <Specimen
                title="Skeleton"
                note="width, height, circle, radius, lines"
                stageClassName="sg-stage--column"
                code={`<Skeleton lines={3} />  <Skeleton circle width={32} height={32} />`}
              >
                <div className="sg-skel-row">
                  <Skeleton circle width={40} height={40} />
                  <div className="sg-skel-text">
                    <Skeleton width="55%" height={14} />
                    <Skeleton width="35%" height={12} />
                  </div>
                </div>
                <Skeleton lines={3} />
                <Skeleton height={96} radius="var(--r-card)" />
              </Specimen>
            </div>
            <Specimen
              title="ErrorBoundary"
              note="wrap every component imported from another feature; default fallback shown here"
              code={`<ErrorBoundary name="UpcomingEvents"><UpcomingEvents n={5} /></ErrorBoundary>\n<ErrorBoundary name="Overlay" fallback={null}>…</ErrorBoundary>`}
            >
              <div className="ui-boundary" role="note">
                <Icon glyph={glyph.error} className="ui-boundary__icon" aria-hidden="true" active />
                <span>This section didn’t load.</span>
                <button type="button" className="ui-boundary__retry">
                  Try again
                </button>
              </div>
            </Specimen>
          </Section>

          {/* ── Overlays ──────────────────────────────────────────────── */}
          <Section
            id="overlays"
            title="Overlays"
            description="All overlays trap focus where needed, close on Esc and return focus to what opened them."
          >
            <Specimen
              title="Modal, Drawer, Menu, Tooltip"
              note="Modal: open, onClose, title, description, footer, size sm | md | lg | xl. Drawer: side right | left | bottom. Menu: trigger, items or children({ close })."
              code={`<Modal open={open} onClose={close} title="Delete this draft?" footer={<>…buttons…</>}>…</Modal>\n<Drawer side="right" open={open} onClose={close} title="Filters">…</Drawer>\n<Menu trigger={<Button trailingIcon={<Icon glyph={glyph.chevronDown} />}>Sort</Button>} items={[{ id, label, icon, onSelect }]} />\n<Tooltip label="Copy link"><button …/></Tooltip>`}
            >
              <Button variant="primary" onClick={() => setModal(true)}>
                Open modal
              </Button>
              <Button onClick={() => setDrawer('right')}>Open side drawer</Button>
              <Button onClick={() => setDrawer('bottom')}>Open bottom sheet</Button>
              <Menu
                label="Sort threads"
                trigger={<Button trailingIcon={<Icon glyph={glyph.chevronDown} />}>Sort by</Button>}
                items={[
                  { heading: 'Sort threads' },
                  { id: 'hot', label: 'Hot', icon: glyph.forum, onSelect: () => push({ title: 'Sorted by hot' }) },
                  {
                    id: 'new',
                    label: 'Newest',
                    icon: glyph.plus,
                    hint: 'N',
                    onSelect: () => push({ title: 'Sorted by newest' }),
                  },
                  { id: 'open', label: 'Open the library', icon: glyph.library, to: '/library' },
                  { divider: true },
                  {
                    id: 'delete',
                    label: 'Delete draft',
                    icon: glyph.trash,
                    danger: true,
                    onSelect: () => push({ title: 'Draft deleted', tone: 'alert' }),
                  },
                ]}
              />
              <Menu
                label="Share"
                align="end"
                width={300}
                trigger={<Button leadingIcon={<Icon glyph={glyph.share} />}>Popover</Button>}
              >
                {({ close }) => (
                  <div className="sg-popover">
                    <p className="sg-popover__title">Share this file</p>
                    <p className="sg-caption">Anyone in DSBA Hub with the link can open it.</p>
                    <Button
                      size="sm"
                      variant="primary"
                      leadingIcon={<Icon glyph={glyph.copy} />}
                      onClick={() => {
                        push({ title: 'Link copied', tone: 'success' });
                        close();
                      }}
                    >
                      Copy link
                    </Button>
                  </div>
                )}
              </Menu>
              <Tooltip label="Opens in a new tab">
                <Button
                  variant="ghost"
                  trailingIcon={<Icon glyph={glyph.external} />}
                  href="https://my.london.ac.uk/group/student"
                >
                  UoL portal
                </Button>
              </Tooltip>
            </Specimen>
          </Section>

          {/* ── Page layout ───────────────────────────────────────────── */}
          <Section
            id="layout"
            title="Page layout"
            description="Every page is one <Page> with a <PageHeader> and <PageSection>s 48px apart. Content is left-aligned in a 1180px column."
          >
            <Specimen
              title="PageHeader"
              note="title, description, actions, meta, leading"
              stageClassName="sg-stage--frame"
            >
              <div className="sg-frame">
                <PageHeader
                  title={demo.name}
                  description={demo.description}
                  leading={<span className="u-code sg-frame__code">{demo.unitCode ?? demo.shortName}</span>}
                  meta={
                    <>
                      <CohortBadge year={demo.year} />
                      <Badge tone="exam">Exam 30 Oct</Badge>
                      <span className="sg-caption">
                        {demo.chapterCount} chapters, {demo.lessonCount} lessons
                      </span>
                    </>
                  }
                  actions={
                    <>
                      <Button leadingIcon={<Icon glyph={glyph.bookmark} />}>Save</Button>
                      <Button variant="primary" leadingIcon={<Icon glyph={glyph.play} />}>
                        Resume lesson
                      </Button>
                    </>
                  }
                />
                <SectionHeader
                  title="Students’ notes"
                  description="Shared by your classmates."
                  action={
                    <Button variant="ghost" size="sm">
                      See all notes
                    </Button>
                  }
                />
                <Panel padding="none" className="sg-rows">
                  {SAMPLE_NOTES.map((n, i) => (
                    <div key={i} className="sg-row">
                      <Icon glyph={glyph.page} className="sg-row__icon" aria-hidden="true" />
                      <span className="sg-row__name">{n.name}</span>
                      <span className="sg-caption">{n.author || 'Shared notes'}</span>
                      <Button size="sm" variant="ghost" trailingIcon={<Icon glyph={glyph.external} />}>
                        Open
                      </Button>
                    </div>
                  ))}
                </Panel>
              </div>
            </Specimen>
            <div className="sg-grid sg-grid--2">
              <Specimen
                title="Panel"
                note="padding none | sm | md | lg, radius panel | feature, tone surface | inset, float"
                stageClassName="sg-stage--panels"
              >
                <Panel padding="sm">
                  <span className="sg-caption">surface, 16px radius</span>
                </Panel>
                <Panel padding="sm" tone="inset">
                  <span className="sg-caption">inset</span>
                </Panel>
                <Panel padding="sm" radius="feature">
                  <span className="sg-caption">feature, 24px</span>
                </Panel>
                <Panel padding="sm" float>
                  <span className="sg-caption">float (rare)</span>
                </Panel>
              </Specimen>
              <Specimen
                title="SectionHeader, Divider"
                note="title, description, action, as h2 | h3; orientation, spacing"
                stageClassName="sg-stage--column"
              >
                <SectionHeader
                  title="Coming up"
                  action={
                    <Button variant="ghost" size="sm" to="/calendar">
                      Open calendar
                    </Button>
                  }
                />
                <Divider />
                <SectionHeader as="h3" title="Chapter 2" description="Random variables and univariate distributions" />
              </Specimen>
            </div>
            <Specimen title="Build a page" note="the whole recipe" stageClassName="sg-stage--flush">
              <pre className="sg-recipe">
                <code>{`import { Button, ErrorBoundary, glyph, Icon, Page, PageHeader, PageSection, SectionHeader } from '../../ui';
import { useYear } from '../../state';
import { UpcomingEvents } from '../calendar/public';   // other features: public.ts only
import './ForumPage.css';                                   // classes prefixed forum-

export default function ForumPage() {
  const { year } = useYear();
  return (
    <Page>                                                  {/* 1180px column, page padding */}
      <PageHeader
        title="Forum"
        description="Ask questions, share answers and find study partners."
        actions={<Button variant="primary" leadingIcon={<Icon glyph={glyph.plus} />} to="/forum/new">Start a thread</Button>}
      />
      <PageSection aria-labelledby="forum-hot">             {/* sections sit 48px apart */}
        <SectionHeader id="forum-hot" title="Hot this week" />
        <ul role="list" className="forum-rows">…</ul>
      </PageSection>
      <PageSection aria-labelledby="forum-dates">
        <SectionHeader id="forum-dates" title="Coming up" />
        <ErrorBoundary name="UpcomingEvents"><UpcomingEvents n={3} /></ErrorBoundary>
      </PageSection>
    </Page>
  );
}`}</code>
              </pre>
            </Specimen>
          </Section>

          {/* ── Light and dark ────────────────────────────────────────── */}
          <Section
            id="themes"
            title="Light and dark"
            description='The same components in both themes. Any element with data-theme="light" or "dark" re-maps every colour token inside it.'
          >
            <div className="sg-islands">
              <ThemeIsland theme="light" />
              <ThemeIsland theme="dark" />
            </div>
          </Section>
        </div>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Delete this draft?"
        description="Your thread draft for ST2133 will be removed. This can’t be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Keep draft
            </Button>
            <Button
              variant="danger"
              leadingIcon={<Icon glyph={glyph.trash} />}
              onClick={() => {
                setModal(false);
                push({ title: 'Draft deleted', tone: 'alert' });
              }}
            >
              Delete draft
            </Button>
          </>
        }
      >
        <p className="sg-caption">
          Modals trap focus, close on Esc or a click outside, lock page scroll and return focus to the button that
          opened them.
        </p>
      </Modal>

      <Drawer
        open={drawer !== null}
        side={drawer ?? 'right'}
        onClose={() => setDrawer(null)}
        title="Filter files"
        description="Narrow the library by year and type."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawer(null)}>
              Clear
            </Button>
            <Button variant="primary" onClick={() => setDrawer(null)}>
              Show 42 files
            </Button>
          </>
        }
      >
        <div className="sg-drawer">
          <p className="sg-subhead">Year</p>
          <div className="sg-inline">
            {COHORT_YEARS.map((y) => (
              <Chip key={y} color={cohortColor(y)} selected={y === 2}>
                Year {y}
              </Chip>
            ))}
          </div>
          <p className="sg-subhead">Type</p>
          <div className="sg-inline">
            {['Study guides', 'Notes', 'Past papers', 'Cheat sheets'].map((t, i) => (
              <Chip key={t} selected={i === 2}>
                {t}
              </Chip>
            ))}
          </div>
          <EmptyState
            size="sm"
            icon={<Icon glyph={glyph.library} />}
            title="Drawers hold secondary tasks"
            body="Filters, details and settings. Keep the page behind them in place."
          />
        </div>
      </Drawer>
    </Page>
  );
}
