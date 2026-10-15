import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CalendarDots,
  ChatCircleDots,
  CheckSquare,
  DotsThree,
  FileText,
  Paperclip,
  PencilSimple,
  PlayCircle,
  Trash,
  Trophy,
  type Icon,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { BoardCard, BoardColumn, BoardLabel, BoardLink } from '../../api/types';
import { formatDay } from '../../lib/dates';
import { BREAKPOINTS, useMediaQuery } from '../../state';
import { Badge, IconButton, Menu, cx, safeInternalPath, type MenuItem } from '../../ui';
import { checklistProgress, colorVar, dueLabel, dueOf, isOverdue, isPastPaper } from './board';
import type { CardActions } from './BoardPage';

const LINK_ICON: Record<BoardLink['type'], Icon> = {
  event: CalendarDots,
  my_event: CalendarDots,
  lesson: PlayCircle,
  module: BookOpen,
  library_item: FileText,
};

export interface CardItemProps {
  card: BoardCard;
  columns: readonly BoardColumn[];
  labels: Readonly<Record<string, BoardLabel>>;
  today: string;
  actions: CardActions;
  /** added here, not saved yet: it can't move until the API has it */
  unsaved: boolean;
}

/** One card on the kanban board: cover, title, priority, labels, checklist progress, due date, counts and menu. */
export function CardItem({ card, columns, labels, today, actions, unsaved }: CardItemProps) {
  const fine = useMediaQuery('(pointer: fine)');
  const isPhone = useMediaQuery(BREAKPOINTS.mobile);
  const due = dueOf(card);
  const overdue = isOverdue(card, today);
  const locked = actions.readOnly || unsaved;
  const draggable = fine && !isPhone && !locked;
  const paper = isPastPaper(card) && card.link ? card.link.id : null;
  const score = paper ? actions.scores[paper] : undefined;
  const isDone = card.doneAt != null;
  const check = card.checklist?.length ? checklistProgress(card.checklist) : null;

  const items: MenuItem[] = [
    ...columns
      .filter((c) => c.id !== card.columnId)
      .map(
        (c): MenuItem => ({
          id: `to-${c.id}`,
          label: `Move to ${c.name}`,
          icon: ArrowRight,
          onSelect: () => actions.onMove(card, c.id),
        }),
      ),
    { id: 'up', label: 'Move up', icon: ArrowUp, disabled: !actions.canNudge(card, -1), onSelect: () => actions.onNudge(card, -1) },
    { id: 'down', label: 'Move down', icon: ArrowDown, disabled: !actions.canNudge(card, 1), onSelect: () => actions.onNudge(card, 1) },
    { divider: true, id: 'd' },
    ...(paper && isDone
      ? ([{ id: 'score', label: score == null ? 'Add your score' : 'Change your score', icon: Trophy, onSelect: () => actions.onScore(card) }] satisfies MenuItem[])
      : []),
    { id: 'edit', label: 'Edit details', icon: PencilSimple, onSelect: () => actions.onOpenDetail(card.id) },
    { id: 'delete', label: 'Delete', icon: Trash, danger: true, onSelect: () => actions.onDelete(card) },
  ];

  return (
    <article
      className={cx(
        'board-card',
        overdue && 'is-overdue',
        isDone && 'is-done',
        actions.dragging === card.id && 'is-dragging',
        unsaved && 'is-unsaved',
      )}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.title);
        actions.onDragStart(card);
      }}
      onDragEnd={actions.onDragEnd}
      aria-label={card.title}
      data-hub="board-card"
    >
      {card.coverUrl ? (
        <div className="board-card__cover">
          <img src={card.coverUrl} alt="" loading="lazy" />
        </div>
      ) : null}

      <div className="board-card__top">
        <div className="board-card__badges">
          {card.priority === 'high' ? (
            <Badge tone="alert" size="sm">
              High
            </Badge>
          ) : card.priority === 'medium' ? (
            <Badge tone="signal" size="sm">
              Med
            </Badge>
          ) : card.priority === 'low' ? (
            <Badge tone="neutral" size="sm">
              Low
            </Badge>
          ) : null}

          {card.labelIds?.map((lid) => {
            const l = labels[lid];
            if (!l) return null;
            return (
              <span key={lid} className="board-card__label-tag" style={{ color: colorVar(l.color) }}>
                <span className="board-card__label-dot" style={{ backgroundColor: colorVar(l.color) }} aria-hidden="true" />
                {l.name}
              </span>
            );
          })}
        </div>

        {locked ? null : (
          <Menu
            label={`Actions for “${card.title}”`}
            align="end"
            items={items}
            trigger={
              <IconButton
                label={`Actions for “${card.title}”`}
                icon={DotsThree}
                size="sm"
                className="board-card__menu"
                data-hub="board-card-menu"
              />
            }
          />
        )}
      </div>

      <div className="board-card__title-row">
        {locked ? (
          <h3 className="board-card__title">{card.title}</h3>
        ) : (
          <h3 className="board-card__title">
            <button type="button" className="board-card__open" onClick={() => actions.onOpenDetail(card.id)}>
              {card.title}
            </button>
          </h3>
        )}
      </div>

      {card.link ? <CardLink link={card.link} cardTitle={card.title} /> : null}

      {card.description ? <p className="board-card__desc-preview">{card.description}</p> : null}

      {score != null && isDone ? <p className="board-card__score">Your score: {score}%</p> : null}

      <div className="board-card__footer">
        {due && !isDone ? (
          <p className={cx('board-card__due', overdue && 'is-overdue')}>
            {overdue ? (
              <Badge tone="alert" size="sm">
                Overdue
              </Badge>
            ) : null}
            <span>
              {dueLabel(due, today, formatDay(due, { weekday: 'short', month: 'short', year: false }), card.dueTime)}
            </span>
          </p>
        ) : null}

        <div className="board-card__meta">
          {check ? (
            <span className={cx('board-card__meta-item', check.done === check.total && 'is-done')}>
              <CheckSquare aria-hidden="true" />
              <span>
                {check.done}/{check.total}
              </span>
            </span>
          ) : null}

          {card.attachmentCount > 0 ? (
            <span className="board-card__meta-item" title={`${card.attachmentCount} attachments`}>
              <Paperclip aria-hidden="true" />
              <span>{card.attachmentCount}</span>
            </span>
          ) : null}

          {card.commentCount > 0 ? (
            <span className="board-card__meta-item" title={`${card.commentCount} comments`}>
              <ChatCircleDots aria-hidden="true" />
              <span>{card.commentCount}</span>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function CardLink({ link, cardTitle }: { link: BoardLink; cardTitle: string }) {
  const IconFor = LINK_ICON[link.type];
  const to = link.url ? safeInternalPath(link.url) : null;
  if (!link.title || !to) {
    return (
      <span className="board-card__link board-card__link--vanished">
        <IconFor aria-hidden="true" />
        <span>Linked item is gone</span>
      </span>
    );
  }
  const showTitle = link.title !== cardTitle;
  return (
    <Link to={to} className="board-card__link" onClick={(e) => e.stopPropagation()}>
      <IconFor aria-hidden="true" />
      <span>{showTitle ? link.title : 'Open linked item'}</span>
    </Link>
  );
}
