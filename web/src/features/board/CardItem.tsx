import { ArrowDown, ArrowRight, ArrowUp, BookOpen, CalendarDots, DotsThree, FileText, PencilSimple, PlayCircle, Trash, type Icon } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { BoardCard, BoardLink } from '../../api/types';
import { formatDay } from '../../lib/dates';
import { BREAKPOINTS, useMediaQuery } from '../../state';
import { Badge, IconButton, Menu, cx, safeInternalPath, type MenuItem } from '../../ui';
import { COLUMNS, dueLabel, dueOf, isOverdue } from './board';
import type { CardActions } from './BoardPage';

const LINK_ICON: Record<BoardLink['type'], Icon> = { event: CalendarDots, lesson: PlayCircle, module: BookOpen, library_item: FileText };
// What the link says when the card already carries the thing's title.
const OPEN_LABEL: Record<BoardLink['type'], string> = {
  event: 'Open in the calendar',
  lesson: 'Watch the lesson',
  module: 'Open the module',
  library_item: 'Open the file',
};

export interface CardItemProps {
  card: BoardCard;
  today: string;
  actions: CardActions;
  /** added here, not saved yet: it can't move until the API has it */
  unsaved: boolean;
}

/** One card: its title (opens the editor), what it links to, when it's due, its note and a menu to move it. */
export function CardItem({ card, today, actions, unsaved }: CardItemProps) {
  const fine = useMediaQuery('(pointer: fine)');
  const isPhone = useMediaQuery(BREAKPOINTS.mobile);
  const due = dueOf(card);
  const overdue = isOverdue(card, today);
  const locked = actions.readOnly || unsaved;
  const draggable = fine && !isPhone && !locked;

  const items: MenuItem[] = [
    ...COLUMNS.filter((c) => c.id !== card.column).map(
      (c): MenuItem => ({ id: `to-${c.id}`, label: `Move to ${c.label}`, icon: ArrowRight, onSelect: () => actions.onMove(card, c.id) }),
    ),
    { id: 'up', label: 'Move up', icon: ArrowUp, disabled: !actions.canNudge(card, -1), onSelect: () => actions.onNudge(card, -1) },
    { id: 'down', label: 'Move down', icon: ArrowDown, disabled: !actions.canNudge(card, 1), onSelect: () => actions.onNudge(card, 1) },
    { divider: true, id: 'd' },
    { id: 'edit', label: 'Edit', icon: PencilSimple, onSelect: () => actions.onEdit(card) },
    { id: 'delete', label: 'Delete', icon: Trash, danger: true, onSelect: () => actions.onDelete(card) },
  ];

  return (
    <article
      className={cx('board-card', overdue && 'is-overdue', card.column === 'done' && 'is-done', actions.dragging === card.id && 'is-dragging', unsaved && 'is-unsaved')}
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
      <div className="board-card__top">
        {locked ? (
          <h3 className="board-card__title">{card.title}</h3>
        ) : (
          <h3 className="board-card__title">
            <button type="button" className="board-card__open" onClick={() => actions.onEdit(card)}>
              {card.title}
            </button>
          </h3>
        )}
        {locked ? null : (
          <Menu label={`Move or change “${card.title}”`} align="end" items={items} trigger={<IconButton label={`Actions for “${card.title}”`} icon={DotsThree} size="sm" className="board-card__menu" data-hub="board-card-menu" />} />
        )}
      </div>
      {card.link ? <CardLink link={card.link} cardTitle={card.title} /> : null}
      {card.note ? <p className="board-card__note">{card.note}</p> : null}
      {due && card.column !== 'done' ? (
        <p className={cx('board-card__due', overdue && 'is-overdue')}>
          {overdue ? (
            <Badge tone="alert" size="sm">
              Overdue
            </Badge>
          ) : null}
          <span>{overdue ? `Was due ${formatDay(due, { weekday: 'short', month: 'short', year: false })}` : dueLabel(due, today, formatDay(due, { weekday: 'short', month: 'short', year: false }))}</span>
        </p>
      ) : null}
    </article>
  );
}

function CardLink({ link, cardTitle }: { link: BoardLink; cardTitle: string }) {
  const IconFor = LINK_ICON[link.type];
  const to = link.url ? safeInternalPath(link.url) : null;
  if (!link.title || !to) {
    return (
      <p className="board-card__link is-gone">
        <IconFor aria-hidden="true" weight="duotone" />
        <span>No longer in the hub</span>
      </p>
    );
  }
  return (
    <p className="board-card__link">
      <IconFor aria-hidden="true" weight="duotone" />
      <Link to={to}>{link.title === cardTitle ? OPEN_LABEL[link.type] : link.title}</Link>
    </p>
  );
}
