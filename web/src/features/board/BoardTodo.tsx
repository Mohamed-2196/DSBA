// Home's "My to-do": the study board's In progress and To do cards, in board order, with when each is due. A card
// that points at something in the hub opens it; the others open the board.
import { Kanban } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { BoardCard } from '../../api/types';
import { Badge, Button, EmptyState, Panel, QueryError, Skeleton, cx, safeInternalPath } from '../../ui';
import { formatDay, todayKey } from '../../lib/dates';
import { useBoard } from './api';
import { cardsIn, dueLabel, dueOf, isOverdue } from './board';
import './BoardTodo.css';

function TodoRow({ card, today }: { card: BoardCard; today: string }) {
  const due = dueOf(card);
  const overdue = isOverdue(card, today);
  const to = (card.link?.url ? safeInternalPath(card.link.url) : null) ?? '/board';
  const when = due ? (overdue ? 'Overdue' : dueLabel(due, today, formatDay(due, { weekday: 'short', month: 'short', year: false }))) : null;
  return (
    <li>
      <Link to={to} className="board-todo__row">
        <span className={cx('board-todo__dot', card.column === 'doing' && 'is-doing')} aria-hidden="true" />
        <span className="board-todo__text">
          <span className="board-todo__title">{card.title}</span>
          <span className="board-todo__meta">
            {card.column === 'doing' ? 'In progress' : 'To do'}
            {when && !overdue ? <span>{when}</span> : null}
          </span>
        </span>
        {overdue ? (
          <Badge tone="alert" size="sm">
            Overdue
          </Badge>
        ) : null}
      </Link>
    </li>
  );
}

/** The first `n` cards still to finish (In progress first), or an invitation to plan the week. */
export function BoardTodo({ n = 5 }: { n?: number }) {
  const board = useBoard();
  const today = todayKey();

  if (board.isPending) {
    return (
      <Panel padding="none" className="board-todo" aria-busy="true">
        <span className="visually-hidden">Loading your board</span>
        <div className="board-todo__loading" aria-hidden="true">
          <Skeleton width="70%" height={14} />
          <Skeleton width="55%" height={14} />
          <Skeleton width="62%" height={14} />
        </div>
      </Panel>
    );
  }
  if (board.isError) {
    return <QueryError error={board.error} title="Your board didn’t load" size="sm" onRetry={() => void board.refetch()} retrying={board.isFetching} />;
  }
  const open = [...cardsIn(board.data.cards, 'doing'), ...cardsIn(board.data.cards, 'todo')];
  if (!open.length) {
    return (
      <Panel padding="none" data-hub="home-todo">
        <EmptyState
          size="sm"
          icon={Kanban}
          title="Nothing to do on your board"
          body="Add lessons, past papers and dates to your study board to plan your week."
          action={
            <Button size="sm" to="/board">
              Open my board
            </Button>
          }
        />
      </Panel>
    );
  }
  const more = open.length - n;
  return (
    <Panel padding="none" className="board-todo" data-hub="home-todo">
      <ul role="list" className="board-todo__list">
        {open.slice(0, n).map((c) => (
          <TodoRow key={c.id} card={c} today={today} />
        ))}
      </ul>
      {more > 0 ? (
        <Link to="/board" className="board-todo__more">
          {more} more on your board
        </Link>
      ) : null}
    </Panel>
  );
}
