// The parts of a palette row: the leading tile or glyph, the title with the query marked, and what trails it.
import type { ReactNode } from 'react';
import { ArrowsLeftRight, Bank, Bug } from '@phosphor-icons/react';
import { Icon, Kbd, ModuleArt, cx, glyph, moduleArtSrc, type Glyph, type MateSection } from '../../ui';
import { formatMonthShort } from '../../lib/dates';
import { matchRanges } from './match';
import type { IconName, Item } from './search';

/** Each entry's picture: a brand icon where the family has one. */
const BRAND: Partial<Record<IconName, Glyph>> = {
  Books: glyph.library,
  Calculator: glyph.grades,
  CalendarDots: glyph.calendar,
  ChatCircleText: glyph.forum,
  ChatsCircle: glyph.forum,
  Eye: glyph.eye,
  EyeSlash: glyph.eyeOff,
  GraduationCap: glyph.career,
  House: glyph.home,
  Info: glyph.info,
  Kanban: glyph.boards,
  Moon: glyph.moon,
  Newspaper: glyph.newsletter,
  Notebook: glyph.notebook,
  PuzzlePiece: glyph.daily,
  Question: glyph.question,
  Sparkle: glyph.sparkle,
  PencilSimpleLine: glyph.edit,
  SquaresFour: glyph.modules,
  Sun: glyph.sun,
  UploadSimple: glyph.upload,
};
const OTHER: Partial<Record<IconName, ReactNode>> = {
  ArrowsLeftRight: <ArrowsLeftRight />,
  Bank: <Bank />,
  Bug: <Bug />,
};

function EntryIcon({ name }: { name: IconName }) {
  const g = BRAND[name];
  return g ? <Icon glyph={g} /> : <>{OTHER[name]}</>;
}

/** A result's section icon on that section's pill: a lesson or module, a file, a thread. */
function SectionTile({ section, g }: { section: MateSection; g: Glyph }) {
  return (
    <span className="cmdk-tile cmdk-tile--section" data-section={section} aria-hidden="true">
      <Icon glyph={g} size={20} active />
    </span>
  );
}

/** Text with every query token marked. */
export function Marked({
  text,
  tokens,
  className = 'cmdk-mark',
}: {
  text: string | null | undefined;
  tokens: readonly string[];
  className?: string;
}) {
  if (!text) return null;
  const ranges = matchRanges(text, tokens);
  if (!ranges.length) return <>{text}</>;
  const out: (string | JSX.Element)[] = [];
  let pos = 0;
  ranges.forEach(([a, b], i) => {
    if (a > pos) out.push(text.slice(pos, a));
    out.push(
      <mark key={i} className={className}>
        {text.slice(a, b)}
      </mark>,
    );
    pos = b;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

function DateTile({ when, type }: { when: Date; type: string | null }) {
  return (
    <span className={cx('cmdk-date', type && `cmdk-date--${type}`)} aria-hidden="true">
      <span className="cmdk-date__m">{formatMonthShort(when)}</span>
      <span className="cmdk-date__d u-tabular">{when.getDate()}</span>
    </span>
  );
}

export function Leading({ item }: { item: Item }) {
  switch (item.kind) {
    case 'module':
      return moduleArtSrc(item.art) ? (
        <ModuleArt art={item.art} className="cmdk-art" />
      ) : (
        <SectionTile section="modules" g={glyph.modules} />
      );
    case 'lesson':
      return <SectionTile section="modules" g={item.chapter ? glyph.modules : glyph.video} />;
    case 'file':
      return <SectionTile section="library" g={glyph.library} />;
    case 'thread':
      return <SectionTile section="forum" g={glyph.forum} />;
    case 'issue':
      return (
        <span className="cmdk-tile cmdk-tile--issue" aria-hidden="true">
          {item.number != null ? String(item.number).padStart(2, '0') : <Icon glyph={glyph.newsletter} />}
        </span>
      );
    case 'event':
      return item.when ? (
        <DateTile when={item.when} type={item.eventType} />
      ) : (
        <SectionTile section="calendar" g={glyph.calendar} />
      );
    case 'recent':
      return <Icon glyph={glyph.clock} className="cmdk-glyph" />;
    case 'suggestion':
      return <Icon glyph={glyph.search} className="cmdk-glyph" />;
    case 'more':
      return <Icon glyph={glyph.chevronDown} className="cmdk-glyph" />;
    case 'action':
    case 'page':
    case 'fallback':
      return (
        <span className="cmdk-tile" aria-hidden="true">
          <EntryIcon name={item.icon} />
        </span>
      );
  }
}

export function Trailing({ item, tokens, active }: { item: Item; tokens: readonly string[]; active: boolean }) {
  let meta = null;
  if (item.kind === 'module' && item.code)
    meta = (
      <span className="cmdk-code u-code">
        <Marked text={item.code} tokens={tokens} className="cmdk-mark cmdk-mark--code" />
      </span>
    );
  else if (item.kind === 'event' && item.rel)
    meta = <span className={cx('cmdk-meta', !item.past && item.eventType === 'exam' && 'is-exam')}>{item.rel}</span>;
  else if (item.kind === 'thread' && item.meta) meta = <span className="cmdk-meta u-tabular">{item.meta}</span>;
  else if (item.kind === 'action' && item.href)
    meta = <Icon glyph={glyph.external} className="cmdk-ext" label="Opens in a new tab" />;
  return (
    <span className="cmdk-trail">
      {meta}
      <span className={cx('cmdk-enter', active && 'is-on')} aria-hidden="true">
        <span className="cmdk-enter__word">
          {item.kind === 'suggestion' ? 'Search' : item.kind === 'more' ? 'Show' : 'Open'}
        </span>
        <Kbd>↵</Kbd>
      </span>
    </span>
  );
}
