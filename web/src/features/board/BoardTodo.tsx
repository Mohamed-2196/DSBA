// Home's "My to-do": overdue and upcoming cards across the student's active boards.
import { Kanban } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { AgendaCard } from '../../api/types';
import { Badge, Button, EmptyState, Panel, QueryError, Skeleton, safeInternalPath } from '../../ui';
import { formatDay, todayKey } from '../../lib/dates';
import { useAgenda } from './api';
import { dueLabel, isOverdue } from './board';
import './BoardTodo.css';

function TodoRow({ card, today }: { card: AgendaCard; today: string }) {
  const overdue = isOverdue(card, today);
  const to = (card.link?.url ? safeInternalPath(card.link.url) : null) ?? `/board?board=${card.boardId}&card=${card.id}`;
  const when = overdue ? 'Overdue' : dueLabel(card.due, today, formatDay(card.due, { weekday: 'short', month: 'short', year: false }));
  return (
    <li>
      <Link to={to} className="board-todo__row">
        <span className="board-todo__dot" style={{ background: `var(--${card.boardColor === 'slate' ? 'ink-3' : card.boardColor})` }} aria-hidden="true" />
        <span className="board-todo__text">
          <span className="board-todo__title">{card.title}</span>
          <span className="board-todo__meta">
            <span>{card.boardEmoji ? `${card.boardEmoji} ` : ''}{card.boardName}</span>
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

/** The first `n` cards due soon or overdue across active boards, or an invitation to add cards. */
export function BoardTodo({ n = 5 }: { n?: number }) {
  const agenda = useAgenda({ days: 14 });
  const today = todayKey();

  if (agenda.isPending) {
    return (
      <Panel padding="none" className="board-todo" aria-busy="true">
        <span className="visually-hidden">Loading your to-do</span>
        <div className="board-todo__loading" aria-hidden="true">
          <Skeleton width="70%" height={14} />
          <Skeleton width="55%" height={14} />
          <Skeleton width="62%" height={14} />
        </div>
      </Panel>
    );
  }
  if (agenda.isError) {
    return <QueryError error={agenda.error} title="Your to-do didn’t load" size="sm" onRetry={() => void agenda.refetch()} retrying={agenda.isFetching} />;
  }
  const cards = agenda.data.cards;
  if (!cards.length) {
    return (
      <Panel padding="none" data-hub="home-todo">
        <EmptyState
          size="sm"
          icon={Kanban}
          title="Nothing to do right now"
          body="Add tasks, lessons and deadlines to your boards to plan your study."
          action={
            <Button size="sm" to="/board">
              Open my boards
            </Button>
          }
        />
      </Panel>
    );
  }
  const more = cards.length - n;
  return (
    <Panel padding="none" className="board-todo" data-hub="home-todo">
      <ul role="list" className="board-todo__list">
        {cards.slice(0, n).map((c) => (
          <TodoRow key={c.id} card={c} today={today} />
        ))}
      </ul>
      {more > 0 ? (
        <Link to="/board?view=today" className="board-todo__more">
          {more} more on your boards
        </Link>
      ) : null}
    </Panel>
  );
}
