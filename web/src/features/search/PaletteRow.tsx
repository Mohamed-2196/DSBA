// The parts of a palette row: the leading tile or glyph, the title with the query marked, and what trails it.
import { createElement } from 'react';
import {
  ArrowSquareOut,
  ArrowsLeftRight,
  Bank,
  BookOpenText,
  Books,
  Calculator,
  CalendarDots,
  CaretDown,
  ChatCircleText,
  ChatsCircle,
  ClockCounterClockwise,
  Eye,
  EyeSlash,
  Bug,
  GraduationCap,
  House,
  Info,
  Kanban,
  MagnifyingGlass,
  Moon,
  Newspaper,
  PencilSimpleLine,
  PlayCircle,
  SquaresFour,
  Sun,
  UploadSimple,
  type Icon,
} from '@phosphor-icons/react';
import { Kbd, ModuleArt, ModuleIcon, cx, moduleArtSrc } from '../../ui';
import { formatMonthShort } from '../../lib/dates';
import { matchRanges } from './match';
import type { IconName, Item } from './search';

const ICONS: Record<IconName, Icon> = {
  ArrowsLeftRight,
  Bank,
  Books,
  Calculator,
  CalendarDots,
  ChatCircleText,
  ChatsCircle,
  Eye,
  EyeSlash,
  Bug,
  GraduationCap,
  House,
  Info,
  Kanban,
  Moon,
  Newspaper,
  PencilSimpleLine,
  SquaresFour,
  Sun,
  UploadSimple,
};

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
        <span
          className={cx('cmdk-tile', 'cmdk-tile--module', item.year && `cmdk-tile--y${item.year}`)}
          aria-hidden="true"
        >
          <ModuleIcon moduleId={item.moduleId} />
        </span>
      );
    case 'lesson':
      return (
        <span className="cmdk-tile" aria-hidden="true">
          {item.chapter ? <BookOpenText /> : <PlayCircle />}
        </span>
      );
    case 'file':
      return <span className="cmdk-doc" aria-hidden="true" />;
    case 'thread':
      return (
        <span className="cmdk-tile" aria-hidden="true">
          <ChatsCircle />
        </span>
      );
    case 'issue':
      return (
        <span className="cmdk-tile cmdk-tile--issue" aria-hidden="true">
          {item.number != null ? String(item.number).padStart(2, '0') : <Newspaper />}
        </span>
      );
    case 'event':
      return item.when ? (
        <DateTile when={item.when} type={item.eventType} />
      ) : (
        <span className="cmdk-tile" aria-hidden="true">
          <CalendarDots />
        </span>
      );
    case 'recent':
      return <ClockCounterClockwise className="cmdk-glyph" aria-hidden="true" />;
    case 'suggestion':
      return <MagnifyingGlass className="cmdk-glyph" aria-hidden="true" />;
    case 'more':
      return <CaretDown className="cmdk-glyph" aria-hidden="true" weight="bold" />;
    case 'action':
    case 'page':
    case 'fallback':
      return (
        <span className="cmdk-tile" aria-hidden="true">
          {createElement(ICONS[item.icon])}
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
    meta = <ArrowSquareOut className="cmdk-ext" aria-label="Opens in a new tab" />;
  return (
    <span className="cmdk-trail">
      {meta}
      <span className={cx('cmdk-enter', active && 'is-on')} aria-hidden="true">
        <Kbd>↵</Kbd>
      </span>
    </span>
  );
}
