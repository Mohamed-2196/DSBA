// Today, across every active board: what's overdue, due today, tomorrow and over the next week. Tick a card to send
// it to its board's done column, or open it.
import { Clock, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import type { AgendaCard, BoardSummary } from '../../api/types';
import { formatDay, todayKey } from '../../lib/dates';
import { EmptyState, QueryError, Skeleton, cx } from '../../ui';
import { useAgenda } from './api';
import { agendaSections, colorVar, doneColumn, dueLabel, timeText, type AgendaSection } from './board';
import { PriorityBadge } from './CardItem';

/** How far ahead Today looks. */
export const TODAY_DAYS = 7;

/** When a card is due, as its section doesn't already say: how late, the time, or the day and time. */
function whenText(section: AgendaSection['id'], card: AgendaCard, today: string): string | null {
  const at = card.dueTime ? timeText(card.dueTime) : null;
  if (section === 'overdue') return dueLabel(card.due, today, '');
  if (section === 'week')
    return `${formatDay(card.due, { weekday: 'short', month: 'short', year: false })}${at ? ` at ${at}` : ''}`;
  return at ? `At ${at}` : null;
}

export interface TodayViewProps {
  boards: readonly BoardSummary[];
  readOnly: boolean;
  onOpen: (card: AgendaCard) => void;
  onDone: (card: AgendaCard) => void;
}

export function TodayView({ boards, readOnly, onOpen, onDone }: TodayViewProps) {
  const today = todayKey();
  const agenda = useAgenda({ days: TODAY_DAYS });
  // Ticked here, a card stays (struck through) until the agenda comes back: without it, or with it again when the
  // move failed.
  const [ticked, setTicked] = useState<{ on: unknown; ids: ReadonlySet<string> }>({ on: null, ids: new Set() });

  if (agenda.isPending) {
    return (
      <div className="board-today" aria-busy="true">
        <span className="visually-hidden">Loading what’s due</span>
        <Skeleton height={20} width="30%" />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }
  if (agenda.isError) {
    return (
      <QueryError
        error={agenda.error}
        title="What’s due didn’t load"
        onRetry={() => void agenda.refetch()}
        retrying={agenda.isFetching}
      />
    );
  }

  const sections = agendaSections(agenda.data.cards, today);
  if (!sections.length) {
    return (
      <EmptyState
        illustration="nothing-due"
        title="Nothing due in the next 7 days"
        body="Cards with a due date show here from all your boards, overdue ones first."
      />
    );
  }

  return (
    <div className="board-today">
      {sections.map((s) => (
        <section key={s.id} className="board-today__section" aria-labelledby={`board-today-${s.id}`}>
          <h2 className={cx('board-today__h', s.id === 'overdue' && 'is-overdue')} id={`board-today-${s.id}`}>
            {s.title}
            <span className="board-today__count">{s.cards.length}</span>
          </h2>
          <ul role="list" className="board-today__rows">
            {s.cards.map((card) => {
              const board = boards.find((b) => b.id === card.boardId);
              const canTick = !readOnly && board != null && doneColumn(board.columns) != null;
              const done = ticked.on === agenda.data && ticked.ids.has(card.id);
              const overdue = s.id === 'overdue';
              const when = whenText(s.id, card, today);
              return (
                <li key={card.id} className={cx('board-today__row', done && 'is-done')} data-hub="board-today-row">
                  {canTick ? (
                    <label className="board-list__tick">
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={done}
                        onChange={() => {
                          setTicked((prev) => ({
                            on: agenda.data,
                            ids: new Set(prev.on === agenda.data ? prev.ids : []).add(card.id),
                          }));
                          onDone(card);
                        }}
                      />
                      <span className="visually-hidden">Done: {card.title}</span>
                    </label>
                  ) : null}
                  <div className="board-today__main">
                    <button type="button" className="board-list__title" onClick={() => onOpen(card)}>
                      {card.title}
                    </button>
                    <div className="board-list__meta">
                      <span className="board-today__board">
                        <span
                          className="board-card__label-dot"
                          style={{ background: colorVar(card.boardColor) }}
                          aria-hidden="true"
                        />
                        {card.boardName}
                      </span>
                      {when ? (
                        <span className={cx('board-list__due', overdue && 'is-overdue')}>
                          {overdue ? <WarningCircle aria-hidden="true" weight="fill" /> : <Clock aria-hidden="true" />}
                          {when}
                        </span>
                      ) : null}
                      {card.priority === 'high' || card.priority === 'medium' ? (
                        <PriorityBadge priority={card.priority} />
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
