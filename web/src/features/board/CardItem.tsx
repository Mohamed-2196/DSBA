// One card on a board: its cover, its title (which opens it), priority and labels, a line of its description, and
// what's due and attached. Its menu moves it (Alt with the arrow keys does the same from the keyboard), scores a past
// paper, or deletes it.
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CalendarDots,
  ChatCircleDots,
  CheckSquare,
  Clock,
  DotsThree,
  FileText,
  Paperclip,
  PencilSimple,
  PlayCircle,
  Trash,
  Trophy,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react';
import { useId, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { BoardCard, BoardColumn, BoardLabel, BoardLink } from '../../api/types';
import { formatDay } from '../../lib/dates';
import { BREAKPOINTS, useMediaQuery } from '../../state';
import { Badge, IconButton, Menu, cx, safeInternalPath, type MenuItem } from '../../ui';
import { apiFileSrc, isUnsaved } from './api';
import {
  checklistProgress,
  colorVar,
  dueLabel,
  dueOf,
  isOverdue,
  isPastPaper,
  plainText,
  PRIORITIES,
  type Priority,
} from './board';
import { FOCUS_WAIT_MS, type CardActions } from './types';

const LINK_ICON: Record<BoardLink['type'], Icon> = {
  event: CalendarDots,
  my_event: CalendarDots,
  lesson: PlayCircle,
  module: BookOpen,
  library_item: FileText,
};

/** What the link says when the card is named after what it links to. */
const OPEN_LINK: Record<BoardLink['type'], string> = {
  event: 'Open in the calendar',
  my_event: 'Open in the calendar',
  lesson: 'Watch the lesson',
  module: 'Open the module',
  library_item: 'Open the file',
};

const PRIORITY_TONE = { high: 'alert', medium: 'cobalt', low: 'neutral' } as const;

/** "High", "Medium" or "Low" as a badge (read as "High priority"); nothing for no priority. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'none') return null;
  return (
    <Badge tone={PRIORITY_TONE[priority]} size="sm">
      {PRIORITIES.find((p) => p.id === priority)?.label}
      <span className="visually-hidden"> priority</span>
    </Badge>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface CardItemProps {
  card: BoardCard;
  /** the card shown above it in its column, if any */
  prevId: string | null;
  columns: readonly BoardColumn[];
  labels: Readonly<Record<string, BoardLabel>>;
  today: string;
  actions: CardActions;
}

export function CardItem({ card, prevId, columns, labels, today, actions }: CardItemProps) {
  const titleId = useId();
  const fine = useMediaQuery('(pointer: fine)');
  const isPhone = useMediaQuery(BREAKPOINTS.mobile);
  const unsaved = isUnsaved(card);
  const locked = actions.readOnly || unsaved;
  const draggable = fine && !isPhone && !locked;
  const due = dueOf(card);
  const overdue = isOverdue(card, today);
  const isDone = card.doneAt != null;
  const paper = isPastPaper(card) && card.link ? card.link.id : null;
  const score = paper ? actions.scores[paper] : undefined;
  const check = card.checklist.length ? checklistProgress(card.checklist) : null;
  const preview = plainText(card.description);
  const priority = card.priority === 'none' ? null : card.priority;
  const cardLabels = card.labelIds.map((id) => labels[id]).filter((l): l is BoardLabel => l != null);

  // Once a move has redrawn the board, the moved card takes focus back where it was.
  const focus = actions.focus;
  const wants = (part: 'title' | 'menu') => (el: HTMLElement | null) => {
    if (!el || focus?.kind !== 'card' || focus.cardId !== card.id || focus.part !== part) return;
    if (focus.columnId !== card.columnId || focus.prevId !== prevId) return; // not redrawn where it went yet
    if (Date.now() - focus.at < FOCUS_WAIT_MS) el.focus({ preventScroll: false });
    actions.onFocused();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (locked || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const part = (e.target as HTMLElement).dataset.part === 'menu' ? 'menu' : 'title';
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      actions.onStep(card, e.key === 'ArrowLeft' ? -1 : 1, part);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const by = e.key === 'ArrowUp' ? -1 : 1;
      if (actions.canNudge(card, by)) actions.onNudge(card, by, part);
    }
  };

  const items: MenuItem[] = [
    { id: 'open', label: 'Open card', icon: PencilSimple, onSelect: () => actions.onOpen(card) },
    { divider: true, id: 'd1' },
    ...columns
      .filter((c) => c.id !== card.columnId)
      .map(
        (c): MenuItem => ({
          id: `to-${c.id}`,
          label: `Move to ${c.name}`,
          icon: ArrowRight,
          onSelect: () => actions.onMove(card, c.id, 'menu'),
        }),
      ),
    {
      id: 'up',
      label: 'Move up',
      icon: ArrowUp,
      hint: 'Alt+↑',
      disabled: !actions.canNudge(card, -1),
      onSelect: () => actions.onNudge(card, -1, 'menu'),
    },
    {
      id: 'down',
      label: 'Move down',
      icon: ArrowDown,
      hint: 'Alt+↓',
      disabled: !actions.canNudge(card, 1),
      onSelect: () => actions.onNudge(card, 1, 'menu'),
    },
    { divider: true, id: 'd2' },
    ...(paper && isDone
      ? ([
          {
            id: 'score',
            label: score == null ? 'Add your score' : 'Change your score',
            icon: Trophy,
            onSelect: () => actions.onScore(card),
          },
        ] satisfies MenuItem[])
      : []),
    { id: 'delete', label: 'Delete card', icon: Trash, danger: true, onSelect: () => actions.onDelete(card) },
  ];

  return (
    <article
      className={cx(
        'board-card',
        overdue && 'is-overdue',
        isDone && 'is-done',
        actions.dragging === card.id && 'is-dragging',
        unsaved && 'is-unsaved',
        locked && 'is-locked',
      )}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.title);
        actions.onDragStart(card);
      }}
      onDragEnd={actions.onDragEnd}
      onKeyDown={onKeyDown}
      aria-labelledby={titleId}
      aria-busy={unsaved || undefined}
      data-hub="board-card"
    >
      {card.coverUrl ? (
        <div className="board-card__cover">
          <img src={apiFileSrc(card.coverUrl)} alt="" loading="lazy" decoding="async" />
        </div>
      ) : null}

      <div className="board-card__head">
        <h3 className="board-card__title" id={titleId}>
          {locked ? (
            card.title
          ) : (
            <button
              ref={wants('title')}
              type="button"
              className="board-card__open"
              data-part="title"
              aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
              onClick={() => actions.onOpen(card)}
            >
              {card.title}
            </button>
          )}
        </h3>
        {locked ? null : (
          <Menu
            label={`Card “${card.title}”`}
            align="end"
            items={items}
            trigger={
              <IconButton
                ref={wants('menu')}
                label={`Actions for “${card.title}”`}
                icon={DotsThree}
                size="sm"
                className="board-card__menu"
                data-part="menu"
                data-hub="board-card-menu"
              />
            }
          />
        )}
      </div>

      {priority || cardLabels.length ? (
        <ul role="list" className="board-card__tags">
          {priority ? (
            <li>
              <PriorityBadge priority={priority} />
            </li>
          ) : null}
          {cardLabels.map((l) => (
            <li key={l.id} className="board-card__label">
              <span className="board-card__label-dot" style={{ background: colorVar(l.color) }} aria-hidden="true" />
              {l.name}
            </li>
          ))}
        </ul>
      ) : null}

      {card.link ? <CardLink link={card.link} cardTitle={card.title} /> : null}

      {preview ? <p className="board-card__desc">{preview}</p> : null}

      {score != null && isDone ? <p className="board-card__score">Your score: {score}%</p> : null}

      {(due && !isDone) || check || card.attachmentCount || card.commentCount ? (
        <div className="board-card__foot">
          {due && !isDone ? (
            <p className={cx('board-card__due', overdue && 'is-overdue')}>
              {overdue ? <WarningCircle aria-hidden="true" weight="fill" /> : <Clock aria-hidden="true" />}
              {dueLabel(due, today, formatDay(due, { weekday: 'short', month: 'short', year: false }), card.dueTime)}
            </p>
          ) : null}
          <p className="board-card__counts">
            {check ? (
              <span className={cx('board-card__count', check.done === check.total && 'is-complete')}>
                <CheckSquare aria-hidden="true" />
                <span aria-hidden="true">
                  {check.done}/{check.total}
                </span>
                <span className="visually-hidden">{`${check.done} of ${plural(check.total, 'to-do', 'to-dos')} done`}</span>
              </span>
            ) : null}
            {card.attachmentCount ? (
              <span className="board-card__count">
                <Paperclip aria-hidden="true" />
                <span aria-hidden="true">{card.attachmentCount}</span>
                <span className="visually-hidden">{plural(card.attachmentCount, 'file', 'files')}</span>
              </span>
            ) : null}
            {card.commentCount ? (
              <span className="board-card__count">
                <ChatCircleDots aria-hidden="true" />
                <span aria-hidden="true">{card.commentCount}</span>
                <span className="visually-hidden">{plural(card.commentCount, 'comment', 'comments')}</span>
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function CardLink({ link, cardTitle }: { link: BoardLink; cardTitle: string }) {
  const IconFor = LINK_ICON[link.type];
  const to = link.url ? safeInternalPath(link.url) : null;
  if (!link.title || !to) {
    return (
      <p className="board-card__link board-card__link--gone">
        <IconFor aria-hidden="true" />
        <span>What this card linked to is no longer in the hub</span>
      </p>
    );
  }
  return (
    <Link to={to} className="board-card__link">
      <IconFor aria-hidden="true" />
      <span>{link.title === cardTitle ? OPEN_LINK[link.type] : link.title}</span>
    </Link>
  );
}
