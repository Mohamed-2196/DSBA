// /styleguide — every token and shared primitive, rendered in the current theme plus a light/dark
// side-by-side. Feature agents: copy patterns from here (and the code strips under each specimen).
import { useState } from 'react';
import {
  ArrowSquareOut, BookmarkSimple, Books, CaretDown, ChatsCircle, Copy, DownloadSimple, FileText, Funnel,
  MagnifyingGlass, PencilSimple, Play, Plus, Rows, ShareNetwork, SquaresFour, Trash, User, WarningCircle,
} from '@phosphor-icons/react';
import { getModule, getModuleStats, MODULES } from '../../data/modules.js';
import { EVENTS, EVENT_TYPES } from '../../data/calendar.js';
import { CURRENT_USER, DUMMY_STUDENTS } from '../../data/people.js';
import { cohortColor, useToast } from '../../state';
import {
  Avatar, Badge, Button, Chip, CohortBadge, Divider, Drawer, EmptyState, Highlight, IconButton, Kbd, Menu, Modal,
  ModuleIcon, Page, PageHeader, Panel, ProgressRing, HubLogo, HubMark, SearchField, SectionHeader, SegmentedControl, Select,
  Skeleton, Sparkline, TabPanel, Tabs, TextArea, TextField, Tooltip, cx,
} from '../../ui';
import './StyleGuidePage.css';

// ── Reference data ────────────────────────────────────────────────────────
const COLOURS = [
  {
    group: 'Surfaces',
    items: [
      ['--paper', '#F4F7FC', '#07122B', 'App background'],
      ['--surface', '#FFFFFF', '#0D1B3B', 'Panels and cards'],
      ['--surface-2', '#EAF0F9', '#14264F', 'Insets, hovers, table stripes'],
      ['--line', '#DCE5F2', '#213563', 'Borders and dividers'],
      ['--line-strong', '#C6D3E6', '#2F477E', 'Input and chip borders'],
    ],
  },
  {
    group: 'Ink',
    items: [
      ['--ink', '#0A1F44', '#ECF2FF', 'Text and headings'],
      ['--ink-2', '#425372', '#A6B6D8', 'Secondary text'],
      ['--ink-3', '#7587A6', '#7488B0', 'Icons and placeholders, not small text'],
    ],
  },
  {
    group: 'Brand',
    items: [
      ['--cobalt', '#1558F0', '#6FA2FF', 'Actions, links, focus'],
      ['--cobalt-ink', '#FFFFFF', '#07122B', 'Text on cobalt'],
      ['--navy', '#0C2D75', '#0C2D75', 'Logo tile, deep accents'],
      ['--highlight', '#FFE14A', '#FFE14A', 'Highlighter marks only, never text'],
    ],
  },
  {
    group: 'Status',
    items: [
      ['--signal', '#12B886', '#38D9A9', 'Live, answered, success, watched'],
      ['--alert', '#F03E5E', '#FF6B81', 'Exams, errors, destructive'],
    ],
  },
  {
    group: 'Cohorts',
    items: [
      ['--y1', '#0FA3B1', '#3BC9DB', 'Year 1, lagoon'],
      ['--y2', '#1F6FEB', '#5E9BFF', 'Year 2, azure'],
      ['--y3', '#F08C00', '#FFA94D', 'Year 3, amber'],
    ],
  },
];

const DERIVED = [
  ['--cobalt-soft', 'Selected rows, info tints'],
  ['--cobalt-hover', 'Primary button hover'],
  ['--alert-strong', 'Alert as small text, danger fill'],
  ['--alert-soft', 'Exam and error tints'],
  ['--signal-strong', 'Success as small text'],
  ['--signal-soft', 'Success tints'],
  ['--highlight-soft', 'Pale highlighter wash'],
  ['--highlight-ink', 'Text on a highlighter mark'],
  ['--y1-strong', 'Year 1 as small text'],
  ['--y2-strong', 'Year 2 as small text'],
  ['--y3-strong', 'Year 3 as small text'],
  ['--on-y2', 'Text on a solid Year 2 fill; same for y1 and y3'],
];

const TYPE_SCALE = [
  [76, '--fs-76', 'Display, the module code on its page', 'ST2133', 'code'],
  [61, '--fs-61', 'Display', 'Exam season', 'display'],
  [49, '--fs-49', 'Hero headline', 'Your week at a glance', 'display'],
  [39, '--fs-39', 'Page title (h1)', 'Distribution theory', 'heading'],
  [31, '--fs-31', 'Page title on mobile', 'Hypothesis tests', 'heading'],
  [25, '--fs-25', 'Section title (h2)', 'Coming up this week', 'heading'],
  [20, '--fs-20', 'Subsection, section header (h3)', 'Students’ notes', 'heading'],
  [16, '--fs-16', 'Body', 'Notes for chapter 2 were added by Mohamed A. and checked against the guide.', 'body'],
  [14, '--fs-14', 'UI text, secondary text', 'Updated 2h ago by Ali H.', 'body'],
  [12, '--fs-12', 'Meta and captions', '22 lessons, 2 chapters', 'body'],
];

const SPACE = [4, 8, 12, 16, 24, 32, 48, 64, 96];

const RADII = [
  ['--r-pill', '999px', 'Chips, pills, badges'],
  ['--r-control', '10px', 'Inputs and buttons'],
  ['--r-panel', '16px', 'Panels, menus, toasts'],
  ['--r-feature', '24px', 'Feature panels, modals, drawers'],
  ['--r-page', '4px', 'Document pages'],
  ['--r-xs', '6px', 'Keys, tooltips, swatches'],
];

const LAYOUT_TOKENS = [
  ['--rail-w', '264px', 'Left rail, desktop'],
  ['--rail-w-collapsed', '72px', 'Icon rail, 700–1099px'],
  ['--topbar-h', '64px', 'Sticky top bar (56px on mobile)'],
  ['--tabbar-h', '64px', 'Mobile bottom tab bar'],
  ['--content-max', '1180px', 'Page column (<Page>)'],
  ['--content-max-wide', '1440px', '<Page width="wide">'],
  ['--content-max-narrow', '760px', '<Page width="narrow">, reading'],
  ['--content-pad', '40 / 32 / 16px', 'Page padding by breakpoint'],
  ['--measure', '72ch', 'Longest line for body text'],
];

const MOTION_TOKENS = [
  ['--ease', 'cubic-bezier(.2,.8,.2,1)', 'Every transition'],
  ['--dur-fast', '150ms', 'Hovers, menus, tooltips'],
  ['--dur', '200ms', 'Tabs, toggles, drawers closing'],
  ['--dur-slow', '250ms', 'Modals and drawers opening, toasts'],
];

const SECTIONS = [
  ['brand', 'Brand'],
  ['colour', 'Colour'],
  ['type', 'Type'],
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

const DEMO_MODULE = getModule('advanced-stats-distribution');
const DEMO_STATS = getModuleStats(DEMO_MODULE);
const EVENT_COUNTS = EVENTS.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] || 0) + 1 }), {});

// ── Building blocks of this page ──────────────────────────────────────────
function scrollToSection(id) {
  document.getElementById(`sg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Section({ id, title, description, children }) {
  return (
    <section id={`sg-${id}`} className="sg-section" aria-labelledby={`sg-${id}-title`}>
      <header className="sg-section__head">
        <h2 id={`sg-${id}-title`} className="sg-section__title">{title}</h2>
        {description ? <p className="sg-section__desc">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** One primitive: name, short note, the live specimen, and the code to copy. */
function Specimen({ title, note, code, className, stageClassName, children }) {
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

function Swatch({ token, light, dark, use }) {
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

function Replay({ onClick, label = 'Replay' }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} leadingIcon={Play}>
      {label}
    </Button>
  );
}

function MotionDemo() {
  const [on, setOn] = useState(false);
  return (
    <div className="sg-motion">
      <svg viewBox="-4 -4 108 108" className="sg-motion__curve" role="img" aria-label="The easing curve cubic-bezier(.2,.8,.2,1)">
        <path className="sg-motion__axis" d="M0 100 H100 M0 100 V0" />
        <path className="sg-motion__path" d="M0 100 C20 20 20 0 100 0" />
      </svg>
      <div className="sg-motion__side">
        <div className="sg-motion__track" aria-hidden="true">
          <span className={cx('sg-motion__dot', on && 'is-on')} />
        </div>
        <Button size="sm" onClick={() => setOn((v) => !v)} leadingIcon={Play}>
          Play 250ms
        </Button>
      </div>
    </div>
  );
}

function ThemeIsland({ theme }) {
  const [view, setView] = useState('lessons');
  return (
    <div data-theme={theme} className="sg-island">
      <p className="sg-island__label">{theme === 'dark' ? 'Dark' : 'Light'}</p>
      <div className="sg-island__module">
        <span className="u-code sg-island__code">{DEMO_MODULE.unitCode}</span>
        <div className="sg-island__mod-text">
          <p className="sg-island__name">{DEMO_MODULE.name}</p>
          <p className="sg-island__meta">
            <CohortBadge year={DEMO_MODULE.year} size="sm" />
            <span>{DEMO_STATS.chapters} chapters, {DEMO_STATS.videos} lessons</span>
          </p>
        </div>
        <ProgressRing value={41} size={44} color={cohortColor(DEMO_MODULE.year)} label="Lessons watched" />
      </div>
      <p className="sg-island__copy">
        Chapter 2 notes are <Highlight>new this week</Highlight>. Your exam is on 30 Oct.
      </p>
      <div className="sg-island__row">
        <Button variant="primary" leadingIcon={Play}>Resume lesson</Button>
        <Button leadingIcon={FileText}>Open files</Button>
        <IconButton label="Save module" icon={BookmarkSimple} variant="secondary" />
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
        <Badge tone="alert">Exam</Badge>
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
  const [drawKey, setDrawKey] = useState(0);
  const [hlKey, setHlKey] = useState(0);
  const [chips, setChips] = useState(['exam']);
  const [tab, setTab] = useState('all');
  const [pill, setPill] = useState('week');
  const [view, setView] = useState('table');
  const [year, setYear] = useState(2);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(null); // 'right' | 'bottom' | null
  const [loading, setLoading] = useState(false);

  const toggleChip = (id) => setChips((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const fakeLoad = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1600);
  };

  return (
    <Page className="sg">
      <PageHeader
        title="Style guide"
        description="The tokens and shared primitives DSBA Hub is built from. Build pages from these and copy the code under each specimen. Don't invent new colours, radii or shadows."
        meta={
          <>
            <Badge tone="outline">{MODULES.length} modules in the data</Badge>
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
                The trace and the highlighter are the signature. Everything else stays quiet: borders before shadows,
                lists and tables before grids of cards, sentence case, plain verbs.
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
          <Section id="brand" title="Brand" description="The trace marks the active page and is the loader. The logo is a file (data/brand.js): until it arrives, HubLogo sets the name as text. The highlighter marks what is new or important.">
            <div className="sg-grid sg-grid--2">
              <Specimen
                title="HubMark"
                note="size, animate, tone, dot"
                code={`<HubMark size={24} />\n<HubMark size={40} animate="draw" />   // once\n<HubMark size={22} animate="loop" />   // loader\n<HubLogo variant="tile" size={32} />   // the logo slot`}
                stageClassName="sg-stage--brand"
              >
                <div className="sg-mark-row">
                  <HubMark size={12} />
                  <HubMark size={18} />
                  <HubMark size={24} />
                  <HubMark size={40} tone="ink" />
                  <span className="sg-mark-inverse"><HubMark size={24} tone="inverse" /></span>
                </div>
                <div className="sg-mark-row">
                  <HubLogo variant="tile" size={20} decorative />
                  <HubLogo variant="tile" size={28} decorative />
                  <HubLogo variant="tile" size={40} decorative />
                  <HubLogo variant="tile" size={64} />
                </div>
                <div className="sg-mark-row">
                  <HubMark key={drawKey} size={40} animate="draw" />
                  <Replay onClick={() => setDrawKey((k) => k + 1)} />
                  <span className="sg-mark-loader"><HubMark size={22} animate="loop" /> <span className="sg-caption">Loader</span></span>
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
                  Mock papers for ST2133 and ST2134 are <Highlight animate delay={150}>in the library now</Highlight>, and
                  the October exam timetable has <Highlight animate delay={500}>real unit codes</Highlight>.
                </p>
                <div className="sg-inline">
                  <Replay onClick={() => setHlKey((k) => k + 1)} label="Replay swipe" />
                  <span className="sg-inline">
                    Forum <Badge tone="highlight" size="sm">New</Badge>
                  </span>
                </div>
              </Specimen>
            </div>

            <Specimen title="Lockup" note="HubLogo: the logo (data/brand.js) plus the name in Schibsted 800. Until the logo arrives, the name alone." stageClassName="sg-stage--lockups">
              <HubLogo variant="lockup" size={48} />
              <HubLogo variant="lockup" size={32} />
              <span className="sg-lockup sg-lockup--navy" data-theme="dark">
                <HubLogo variant="lockup" size={24} />
              </span>
            </Specimen>
          </Section>

          {/* ── Colour ────────────────────────────────────────────────── */}
          <Section id="colour" title="Colour" description="Use tokens, never hex values. Each spec swatch shows light on the left and dark on the right; derived swatches follow the current theme.">
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
              <h3 className="sg-subhead">Calendar event types</h3>
              <p className="sg-caption">From <code>EVENT_TYPES</code> in <code>data/calendar.js</code>. Always pair the colour with the label.</p>
              <ul role="list" className="sg-events">
                {Object.entries(EVENT_TYPES).map(([type, t]) => (
                  <li key={type} className="sg-event">
                    <span className={cx('sg-event__dot', type === 'deadline' && 'sg-event__dot--ring')} style={{ background: t.color }} aria-hidden="true" />
                    <span className="sg-event__label">{t.label}</span>
                    <code className="sg-token">{t.token}</code>
                    <span className="sg-event__count u-tabular">{EVENT_COUNTS[type] || 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          {/* ── Type ──────────────────────────────────────────────────── */}
          <Section id="type" title="Type" description="Schibsted Grotesk for the interface, Newsreader for long reading, JetBrains Mono for code. Major-third scale on a 16px base.">
            <div className="sg-families">
              <div className="sg-family">
                <p className="sg-family__glyph">Aa</p>
                <p className="sg-family__name">Schibsted Grotesk</p>
                <p className="sg-family__role">UI and every non-editorial heading. Headlines 700–800 at −0.02em; UI 400–600.</p>
                <p className="sg-family__weights">
                  <span style={{ fontWeight: 400 }}>Regular</span>
                  <span style={{ fontWeight: 500 }}>Medium</span>
                  <span style={{ fontWeight: 600 }}>Semibold</span>
                  <span style={{ fontWeight: 700 }}>Bold</span>
                  <span style={{ fontWeight: 800 }}>Heavy</span>
                </p>
              </div>
              <div className="sg-family sg-family--serif">
                <p className="sg-family__glyph">Aa</p>
                <p className="sg-family__name">Newsreader</p>
                <p className="sg-family__role">The newsletter, pull quotes, long reading and document pages. Body line height 1.65.</p>
                <blockquote className="sg-quote">
                  “Past papers are the closest thing we have to a map of the exam.”
                </blockquote>
              </div>
              <div className="sg-family sg-family--mono">
                <p className="sg-family__glyph">Aa</p>
                <p className="sg-family__name">JetBrains Mono</p>
                <p className="sg-family__role">Real code, formulas and keyboard keys only. Never small labels.</p>
                <pre className="sg-mono-sample"><code>{'mean(x)  # R\nVar(X) = E[X²] − (E[X])²'}</code></pre>
                <p className="sg-inline"><Kbd>⌘</Kbd><Kbd>K</Kbd> <span className="sg-caption">opens search</span></p>
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
                  <span className={cx('sg-scale__sample', `sg-scale__sample--${kind}`)} style={{ fontSize: `var(${token})` }}>
                    {sample}
                  </span>
                </li>
              ))}
            </ul>

            <div className="sg-grid sg-grid--2">
              <Specimen
                title="Module code as a typographic object"
                note="className u-code: Schibsted 800, tabular figures"
                code={`<span className="u-code" style={{ fontSize: 'var(--fs-76)' }}>{m.unitCode}</span>\n// year 3 modules have no unit code: show the name instead`}
                stageClassName="sg-stage--column"
              >
                <div className="sg-unit">
                  <span className="u-code sg-unit__code" style={{ color: 'var(--y2-strong)' }}>ST2133</span>
                  <span className="sg-unit__name">Advanced Statistics: Distribution Theory</span>
                </div>
                <ul role="list" className="sg-unit-list">
                  {MODULES.filter((m) => m.unitCode).slice(0, 6).map((m) => (
                    <li key={m.id}>
                      <span className="u-code sg-unit-list__code" style={{ color: `var(--y${m.year}-strong)` }}>{m.unitCode}</span>
                      <span className="sg-unit-list__name">{m.shortName}</span>
                    </li>
                  ))}
                </ul>
              </Specimen>
              <Specimen
                title="Text utilities"
                note="in styles/base.css"
                code={`u-tabular  u-serif  u-mono  u-muted\nu-measure  u-code  visually-hidden`}
                stageClassName="sg-stage--column"
              >
                <p className="u-measure">
                  Body text at 16px with line height 1.55 keeps to a 72 character measure. <a href="#/styleguide" onClick={(e) => e.preventDefault()}>Links are cobalt</a> with
                  a quiet underline that firms up on hover. <strong>Bold</strong> for emphasis, <code>inline code</code> for code.
                </p>
                <p className="u-muted">Secondary text uses ink-2 and stays AA on paper and surface.</p>
                <p><span className="u-tabular">22</span> lessons, <span className="u-tabular">2</span> chapters: wrap only the numbers in u-tabular (it widens commas).</p>
                <p className="u-serif">Serif reading text sits in Newsreader with a little more line height.</p>
              </Specimen>
            </div>
          </Section>

          {/* ── Space, shape, elevation, motion ─────────────────────────── */}
          <Section id="space" title="Space and shape" description="Spacing scale 4 to 96. Radii by hierarchy, not one radius everywhere. Borders first; shadows only on floating layers.">
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
                    <span className="sg-caption">{value}, {use}</span>
                  </div>
                ))}
              </Specimen>
            </div>
            <div className="sg-grid sg-grid--2">
              <Specimen title="Elevation" note="border first, --shadow-float for floating layers" stageClassName="sg-stage--elevation">
                <div className="sg-elev sg-elev--border">
                  <span className="sg-elev__name">Border</span>
                  <span className="sg-caption">Panels, rows, inputs</span>
                </div>
                <div className="sg-elev sg-elev--float">
                  <span className="sg-elev__name">Float</span>
                  <span className="sg-caption">Menus, modals, toasts</span>
                </div>
              </Specimen>
              <Specimen title="Focus" note="2px cobalt ring, 2px offset, keyboard only" stageClassName="sg-stage--column">
                <div className="sg-focus-row">
                  <Button className="sg-force-focus">Focused button</Button>
                  <IconButton label="Focused icon button" icon={MagnifyingGlass} variant="secondary" className="sg-force-focus" />
                  <a href="#/styleguide" className="sg-force-focus" onClick={(e) => e.preventDefault()}>Focused link</a>
                </div>
                <p className="sg-caption">
                  Base styles draw <code>:focus-visible</code> for you. Don’t remove outlines; inside dense lists use an inset ring.
                </p>
              </Specimen>
            </div>
            <Specimen title="Motion" note="150–250ms, one easing, only in answer to an action (plus Home's first load)" stageClassName="sg-stage--motion">
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
          <Section id="actions" title="Buttons" description="Labels say exactly what happens: Post thread, Open original, Download .ics.">
            <Specimen
              title="Button"
              note="variant primary | secondary | ghost | danger, size sm | md | lg, leadingIcon, trailingIcon, to, href, as, loading, fullWidth"
              code={`<Button variant="primary" leadingIcon={Plus} to="/forum/new">Start a thread</Button>\n<Button href={file.sourceUrl} trailingIcon={ArrowSquareOut}>Open original</Button>   // external: new tab\n<Button variant="danger" size="sm" leadingIcon={Trash}>Delete draft</Button>`}
              stageClassName="sg-stage--column"
            >
              <div className="sg-inline">
                <Button variant="primary" leadingIcon={Plus}>Post thread</Button>
                <Button leadingIcon={DownloadSimple}>Download .ics</Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="danger" leadingIcon={Trash}>Delete draft</Button>
              </div>
              <div className="sg-inline">
                <Button variant="primary" size="lg">Choose Year 2</Button>
                <Button variant="primary">Save notes</Button>
                <Button variant="primary" size="sm">Reply</Button>
                <Divider orientation="vertical" />
                <Button size="lg">Open original</Button>
                <Button>Open original</Button>
                <Button size="sm">Open original</Button>
              </div>
              <div className="sg-inline">
                <Button trailingIcon={ArrowSquareOut} href="https://myclass.bibf.com">MyClass</Button>
                <Button to="/modules" variant="ghost" leadingIcon={SquaresFour}>All modules</Button>
                <Button variant="primary" loading={loading} onClick={fakeLoad}>{loading ? 'Posting' : 'Post thread'}</Button>
                <Button disabled>Disabled</Button>
                <Button variant="primary" disabled>Disabled</Button>
              </div>
            </Specimen>
            <Specimen
              title="IconButton"
              note="label (required, becomes aria-label), icon, variant ghost | secondary | primary, size, badge, tooltip, active + toggle"
              code={`<IconButton label="Share thread" icon={ShareNetwork} tooltip />\n<IconButton label="Notifications" icon={Bell} badge={3} />`}
            >
              <IconButton label="Search" icon={MagnifyingGlass} tooltip />
              <IconButton label="Edit" icon={PencilSimple} variant="secondary" tooltip />
              <IconButton label="Add file" icon={Plus} variant="primary" tooltip />
              <IconButton label="Copy link" icon={Copy} size="sm" tooltip />
              <IconButton label="Share" icon={ShareNetwork} size="lg" variant="secondary" tooltip />
              <IconButton label="Messages, unread" icon={ChatsCircle} badge tooltip />
              <IconButton label="Files, 3 new" icon={Books} badge={3} variant="secondary" tooltip />
              <IconButton label="Saved" icon={BookmarkSimple} active toggle tooltip />
            </Specimen>
          </Section>

          {/* ── Forms ─────────────────────────────────────────────────── */}
          <Section id="forms" title="Forms" description="Labels above fields, hints under them, errors that say what to do.">
            <div className="sg-grid sg-grid--2">
              <Specimen title="TextField" note="label, hint, error, required, leadingIcon, trailing, size md | lg" stageClassName="sg-stage--column sg-stage--form"
                code={`<TextField label="Thread title" hint="Ask one clear question." required />\n<TextField label="Final mark" error="Enter a mark between 0 and 100." />`}>
                <TextField label="Thread title" placeholder="How do I find the MGF of a gamma distribution?" hint="Ask one clear question. Add details below." required />
                <TextField label="Final mark" defaultValue="104" error="Enter a mark between 0 and 100." inputMode="numeric" trailing="%" />
                <TextField label="Your name" leadingIcon={User} defaultValue={CURRENT_USER.name} />
              </Specimen>
              <Specimen title="TextArea, Select" note="same label, hint and error props" stageClassName="sg-stage--column sg-stage--form"
                code={`<Select label="Module" placeholder="Choose a module" options={mods.map((m) => ({ value: m.id, label: m.name }))} />\n<TextArea label="Details" rows={4} />`}>
                <Select
                  label="Module"
                  placeholder="Choose a module"
                  defaultValue=""
                  options={MODULES.filter((m) => m.year === 2).map((m) => ({ value: m.id, label: m.unitCode ? `${m.unitCode} ${m.name}` : m.name }))}
                />
                <TextArea label="Details" placeholder="What have you tried so far?" hint="Markdown is fine. Be kind." rows={3} />
              </Specimen>
            </div>
            <Specimen
              title="SearchField"
              note="value + onValueChange, onClear, shortcut, size, asButton (the top bar uses this to open ⌘K)"
              code={`<SearchField value={q} onValueChange={setQ} placeholder="Search threads" />\n<SearchField asButton shortcut="K" placeholder="Search everything…" onClick={() => openCommandPalette()} />`}
              stageClassName="sg-stage--search"
            >
              <SearchField value={query} onValueChange={setQuery} placeholder="Search threads" label="Search threads" />
              <SearchField asButton shortcut="K" placeholder="Search everything…" label="Search everything" onClick={() => push({ title: 'This opens the command palette', body: 'Use openCommandPalette() from features/search/public.js.' })} />
              <SearchField size="lg" value="gamma distribution" onValueChange={() => {}} label="Search the library" />
            </Specimen>
          </Section>

          {/* ── Selection ─────────────────────────────────────────────── */}
          <Section id="selection" title="Selection" description="Chips filter, tabs switch views of one thing, segmented controls switch modes.">
            <Specimen
              title="Chip"
              note="selected, onChange(next), icon, count, color (leading dot), size sm | md"
              code={`<Chip selected={types.has('exam')} onChange={() => toggle('exam')} color="var(--alert)" count={24}>Exams</Chip>`}
            >
              {Object.entries(EVENT_TYPES).map(([type, t]) => (
                <Chip key={type} selected={chips.includes(type)} onChange={() => toggleChip(type)} color={t.color} count={EVENT_COUNTS[type] || 0}>
                  {t.label}
                </Chip>
              ))}
              <Chip icon={Funnel} size="sm">More filters</Chip>
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
                    { id: 'all', label: 'All', count: EVENTS.length },
                    { id: 'exam', label: 'Exams', count: EVENT_COUNTS.exam },
                    { id: 'mock', label: 'Mocks', count: EVENT_COUNTS.mock },
                    { id: 'deadline', label: 'Deadlines', count: EVENT_COUNTS.deadline },
                  ]}
                />
                <TabPanel idBase="sg-tabs" id={tab} value={tab} className="sg-tabpanel">
                  <p className="sg-caption">
                    Showing {tab === 'all' ? 'every event' : EVENT_TYPES[tab].label.toLowerCase() + 's'}. Arrow keys move between tabs.
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
                code={`<SegmentedControl label="View" value={view} onChange={setView}\n  options={[{ value: 'table', label: 'Table', icon: Rows }, { value: 'grid', label: 'Grid', icon: SquaresFour }]} />`}
                stageClassName="sg-stage--column"
              >
                <SegmentedControl
                  label="View"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'table', label: 'Table', icon: Rows },
                    { value: 'grid', label: 'Grid', icon: SquaresFour },
                  ]}
                />
                <SegmentedControl
                  label="Year"
                  value={year}
                  onChange={setYear}
                  options={[1, 2, 3].map((y) => ({ value: y, label: `Year ${y}`, color: cohortColor(y), onColor: `var(--on-y${y})` }))}
                />
                <SegmentedControl
                  size="sm"
                  iconOnly
                  label="Layout"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'table', label: 'Table', icon: Rows },
                    { value: 'grid', label: 'Grid', icon: SquaresFour },
                  ]}
                />
              </Specimen>
            </div>
          </Section>

          {/* ── Labels and people ─────────────────────────────────────── */}
          <Section id="labels" title="Labels and people" description="Badges carry status, cohort badges carry the year, avatars carry a person.">
            <div className="sg-grid sg-grid--2">
              <Specimen title="Badge" note="tone neutral | cobalt | signal | alert | highlight | navy | outline, size sm | md, icon"
                code={`<Badge tone="alert">Exam</Badge>  <Badge tone="highlight">New</Badge>`}>
                <Badge>Draft</Badge>
                <Badge tone="cobalt">Pinned</Badge>
                <Badge tone="signal">Answered</Badge>
                <Badge tone="alert">Exam</Badge>
                <Badge tone="highlight">New</Badge>
                <Badge tone="navy">Staff pick</Badge>
                <Badge tone="outline">PDF</Badge>
                <Badge tone="signal" size="sm">Live</Badge>
              </Specimen>
              <Specimen title="CohortBadge" note="year, variant soft | solid | dot, short, size"
                code={`<CohortBadge year={2} />  <CohortBadge year={2} variant="solid" short />`}>
                {[1, 2, 3].map((y) => <CohortBadge key={`s${y}`} year={y} />)}
                {[1, 2, 3].map((y) => <CohortBadge key={`f${y}`} year={y} variant="solid" short />)}
                {[1, 2, 3].map((y) => <CohortBadge key={`d${y}`} year={y} variant="dot" />)}
                <CohortBadge year={null} />
              </Specimen>
              <Specimen title="Avatar" note="name, size xs | sm | md | lg | xl | px, decorative"
                code={`<Avatar name="Zainab K." size="sm" decorative />  // name printed next to it`}>
                {['xs', 'sm', 'md', 'lg', 'xl'].map((s) => <Avatar key={s} name={CURRENT_USER.name} size={s} />)}
                <Divider orientation="vertical" />
                {DUMMY_STUDENTS.slice(0, 6).map((s) => <Avatar key={s.id} name={s.name} />)}
              </Specimen>
              <Specimen title="Kbd, ModuleIcon" note="keys in mono; module icons by id"
                code={`<Kbd>⌘</Kbd><Kbd>K</Kbd>   <ModuleIcon moduleId="econometrics" size={20} />`}>
                <span className="sg-inline"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
                <span className="sg-inline"><Kbd>Esc</Kbd></span>
                <span className="sg-inline"><Kbd>↑</Kbd><Kbd>↓</Kbd></span>
                <Divider orientation="vertical" />
                {MODULES.slice(0, 10).map((m) => (
                  <Tooltip key={m.id} label={m.name}>
                    <span className="sg-modicon" tabIndex={0} aria-label={m.name}><ModuleIcon moduleId={m.id} size={20} /></span>
                  </Tooltip>
                ))}
              </Specimen>
            </div>
          </Section>

          {/* ── Feedback and data ─────────────────────────────────────── */}
          <Section id="feedback" title="Feedback and data" description="Toasts confirm actions, empty states invite them, skeletons hold space while loading.">
            <div className="sg-grid sg-grid--2">
              <Specimen title="Toast" note="useToast().push({ title, body?, tone, duration?, action? })"
                code={`const { push } = useToast();\npush({ title: 'Thread posted', body: 'Your cohort can see it now.', tone: 'success' });`}>
                <Button onClick={() => push({ title: 'Saved to your library', body: 'Find it under Saved files.' })}>Info toast</Button>
                <Button onClick={() => push({ title: 'Thread posted', body: 'Your cohort can see it now.', tone: 'success', action: { label: 'View thread', onClick: () => {} } })}>Success toast</Button>
                <Button onClick={() => push({ title: 'Upload failed', body: 'The file is over 20 MB. Compress it and try again.', tone: 'alert' })}>Alert toast</Button>
              </Specimen>
              <Specimen title="ProgressRing, Sparkline" note="value 0–100, size, stroke, color; data, area, dot, label"
                code={`<ProgressRing value={pct} color={cohortColor(year)} label="Lessons watched" />\n<Sparkline data={[3, 5, 4, 9, 7, 12]} label="Replies per day" area />`}>
                <ProgressRing value={0} />
                <ProgressRing value={35} color={cohortColor(1)} />
                <ProgressRing value={72} size={48} color={cohortColor(2)} />
                <ProgressRing value={100} size={56} stroke={5} color="var(--signal)" />
                <ProgressRing value={60} size={20} stroke={3} />
                <Divider orientation="vertical" />
                <Sparkline data={[3, 4, 3, 5, 4, 11, 6, 5, 7, 6]} label="Views per day, last 10 days" />
                <Sparkline data={[2, 3, 3, 5, 6, 5, 8, 9, 12, 14]} area color={cohortColor(2)} label="Replies per day" />
              </Specimen>
            </div>
            <div className="sg-grid sg-grid--2">
              <Specimen title="EmptyState" note="icon (duotone), title, body, action, size md | sm" stageClassName="sg-stage--flush"
                code={`<EmptyState icon={ChatsCircle} title="No threads for ST2133 yet" body="Ask the first question…" action={<Button …>Start a thread</Button>} />`}>
                <EmptyState
                  icon={ChatsCircle}
                  title="No threads for ST2133 yet"
                  body="Ask the first question and your classmates will see it here."
                  action={<Button variant="primary" leadingIcon={Plus}>Start a thread</Button>}
                />
              </Specimen>
              <Specimen title="Skeleton" note="width, height, circle, radius, lines" stageClassName="sg-stage--column"
                code={`<Skeleton lines={3} />  <Skeleton circle width={32} height={32} />`}>
                <div className="sg-skel-row">
                  <Skeleton circle width={40} height={40} />
                  <div className="sg-skel-text">
                    <Skeleton width="55%" height={14} />
                    <Skeleton width="35%" height={12} />
                  </div>
                </div>
                <Skeleton lines={3} />
                <Skeleton height={96} radius="var(--r-panel)" />
              </Specimen>
            </div>
            <Specimen title="ErrorBoundary" note="wrap every component imported from another feature; default fallback shown here"
              code={`<ErrorBoundary name="HotThreads"><HotThreads n={5} /></ErrorBoundary>\n<ErrorBoundary name="Overlay" fallback={null}>…</ErrorBoundary>`}>
              <div className="ui-boundary" role="note">
                <WarningCircle className="ui-boundary__icon" aria-hidden="true" weight="fill" />
                <span>This section didn’t load.</span>
                <button type="button" className="ui-boundary__retry">Try again</button>
              </div>
            </Specimen>
          </Section>

          {/* ── Overlays ──────────────────────────────────────────────── */}
          <Section id="overlays" title="Overlays" description="All overlays trap focus where needed, close on Esc and return focus to what opened them.">
            <Specimen
              title="Modal, Drawer, Menu, Tooltip"
              note="Modal: open, onClose, title, description, footer, size sm | md | lg | xl. Drawer: side right | left | bottom. Menu: trigger, items or children({ close })."
              code={`<Modal open={open} onClose={close} title="Delete this draft?" footer={<>…buttons…</>}>…</Modal>\n<Drawer side="right" open={open} onClose={close} title="Filters">…</Drawer>\n<Menu trigger={<Button trailingIcon={CaretDown}>Sort</Button>} items={[{ id, label, icon, onSelect }]} />\n<Tooltip label="Copy link"><button …/></Tooltip>`}
            >
              <Button variant="primary" onClick={() => setModal(true)}>Open modal</Button>
              <Button onClick={() => setDrawer('right')}>Open side drawer</Button>
              <Button onClick={() => setDrawer('bottom')}>Open bottom sheet</Button>
              <Menu
                label="Sort threads"
                trigger={<Button trailingIcon={CaretDown}>Sort by</Button>}
                items={[
                  { heading: 'Sort threads' },
                  { id: 'hot', label: 'Hot', icon: ChatsCircle, onSelect: () => push({ title: 'Sorted by hot' }) },
                  { id: 'new', label: 'Newest', icon: Plus, hint: 'N', onSelect: () => push({ title: 'Sorted by newest' }) },
                  { id: 'open', label: 'Open the library', icon: Books, to: '/library' },
                  { divider: true },
                  { id: 'delete', label: 'Delete draft', icon: Trash, danger: true, onSelect: () => push({ title: 'Draft deleted', tone: 'alert' }) },
                ]}
              />
              <Menu
                label="Share"
                align="end"
                width={300}
                trigger={<Button leadingIcon={ShareNetwork}>Popover</Button>}
              >
                {({ close }) => (
                  <div className="sg-popover">
                    <p className="sg-popover__title">Share this file</p>
                    <p className="sg-caption">Anyone in DSBA Hub with the link can open it.</p>
                    <Button size="sm" variant="primary" leadingIcon={Copy} onClick={() => { push({ title: 'Link copied', tone: 'success' }); close(); }}>Copy link</Button>
                  </div>
                )}
              </Menu>
              <Tooltip label="Opens in a new tab">
                <Button variant="ghost" trailingIcon={ArrowSquareOut} href="https://my.london.ac.uk/group/student">UoL portal</Button>
              </Tooltip>
            </Specimen>
          </Section>

          {/* ── Page layout ───────────────────────────────────────────── */}
          <Section id="layout" title="Page layout" description="Every page is one <Page> with a <PageHeader> and <PageSection>s 48px apart. Content is left-aligned in a 1180px column.">
            <Specimen title="PageHeader" note="title, description, actions, meta, leading" stageClassName="sg-stage--frame">
              <div className="sg-frame">
                <PageHeader
                  title={DEMO_MODULE.name}
                  description={DEMO_MODULE.description}
                  leading={<span className="u-code sg-frame__code">{DEMO_MODULE.unitCode}</span>}
                  meta={
                    <>
                      <CohortBadge year={DEMO_MODULE.year} />
                      <Badge tone="alert">Exam 30 Oct</Badge>
                      <span className="sg-caption">{DEMO_STATS.chapters} chapters, {DEMO_STATS.videos} lessons</span>
                    </>
                  }
                  actions={
                    <>
                      <Button leadingIcon={BookmarkSimple}>Save</Button>
                      <Button variant="primary" leadingIcon={Play}>Resume lesson</Button>
                    </>
                  }
                />
                <SectionHeader title="Students’ notes" description="Shared by your classmates." action={<Button variant="ghost" size="sm">See all notes</Button>} />
                <Panel padding="none" className="sg-rows">
                  {DEMO_MODULE.notes.concat([{ name: 'Chapter 2 summary', author: 'Zainab K.' }]).map((n, i) => (
                    <div key={i} className="sg-row">
                      <FileText className="sg-row__icon" aria-hidden="true" />
                      <span className="sg-row__name">{n.name}</span>
                      <span className="sg-caption">{n.author || 'Shared notes'}</span>
                      <Button size="sm" variant="ghost" trailingIcon={ArrowSquareOut}>Open</Button>
                    </div>
                  ))}
                </Panel>
              </div>
            </Specimen>
            <div className="sg-grid sg-grid--2">
              <Specimen title="Panel" note="padding none | sm | md | lg, radius panel | feature, tone surface | inset, float" stageClassName="sg-stage--panels">
                <Panel padding="sm"><span className="sg-caption">surface, 16px radius</span></Panel>
                <Panel padding="sm" tone="inset"><span className="sg-caption">inset</span></Panel>
                <Panel padding="sm" radius="feature"><span className="sg-caption">feature, 24px</span></Panel>
                <Panel padding="sm" float><span className="sg-caption">float (rare)</span></Panel>
              </Specimen>
              <Specimen title="SectionHeader, Divider" note="title, description, action, as h2 | h3; orientation, spacing" stageClassName="sg-stage--column">
                <SectionHeader title="Coming up" action={<Button variant="ghost" size="sm" to="/calendar">Open calendar</Button>} />
                <Divider />
                <SectionHeader as="h3" title="Chapter 2" description="Random variables and univariate distributions" />
              </Specimen>
            </div>
            <Specimen title="Build a page" note="the whole recipe" stageClassName="sg-stage--flush">
              <pre className="sg-recipe">
                <code>{`import { Plus } from '@phosphor-icons/react';
import { Button, ErrorBoundary, Page, PageHeader, PageSection, SectionHeader } from '../../ui';
import { useYear } from '../../state';
import { UpcomingEvents } from '../calendar/public.js';   // other features: public.js only
import './ForumPage.css';                                   // classes prefixed forum-

export default function ForumPage() {
  const { year } = useYear();
  return (
    <Page>                                                  {/* 1180px column, page padding */}
      <PageHeader
        title="Forum"
        description="Ask questions, share answers and find study partners."
        actions={<Button variant="primary" leadingIcon={Plus} to="/forum/new">Start a thread</Button>}
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
          <Section id="themes" title="Light and dark" description='The same components in both themes. Any element with data-theme="light" or "dark" re-maps every colour token inside it.'>
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
        description="Your thread draft for ST2133 will be removed. This can't be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Keep draft</Button>
            <Button
              variant="danger"
              leadingIcon={Trash}
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
        <p className="sg-caption">Modals trap focus, close on Esc or a click outside, lock page scroll and return focus to the button that opened them.</p>
      </Modal>

      <Drawer
        open={drawer !== null}
        side={drawer || 'right'}
        onClose={() => setDrawer(null)}
        title="Filter files"
        description="Narrow the library by year and type."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawer(null)}>Clear</Button>
            <Button variant="primary" onClick={() => setDrawer(null)}>Show 42 files</Button>
          </>
        }
      >
        <div className="sg-drawer">
          <p className="sg-subhead">Year</p>
          <div className="sg-inline">
            {[1, 2, 3].map((y) => (
              <Chip key={y} color={cohortColor(y)} selected={y === 2}>Year {y}</Chip>
            ))}
          </div>
          <p className="sg-subhead">Type</p>
          <div className="sg-inline">
            {['Study guides', 'Notes', 'Past papers', 'Cheat sheets'].map((t, i) => (
              <Chip key={t} selected={i === 2}>{t}</Chip>
            ))}
          </div>
          <EmptyState size="sm" icon={Books} title="Drawers hold secondary tasks" body="Filters, details and settings. Keep the page behind them in place." />
        </div>
      </Drawer>
    </Page>
  );
}
