// A board as one list, in board order: tick a card done (or not done again), open it, see where it stands. A card
// added here goes to the end of the first column that isn't done.
import { CheckCircle, Clock, ListBullets, Plus, WarningCircle } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { BoardCard, BoardLabel, BoardSummary } from '../../api/types';
import { formatDay } from '../../lib/dates';
import { Button, EmptyState, TextField, cx } from '../../ui';
import { isUnsaved, useAddCard } from './api';
import { checklistProgress, colorVar, doneColumn, dueLabel, dueOf, isOverdue } from './board';
import { PriorityBadge } from './CardItem';

export interface ListViewProps {
  board: BoardSummary;
  /** the cards that pass the filter, in board order */
  cards: readonly BoardCard[];
  filtering: boolean;
  labels: Readonly<Record<string, BoardLabel>>;
  today: string;
  readOnly: boolean;
  onOpen: (card: BoardCard) => void;
  onToggleDone: (card: BoardCard) => void;
  onClearFilter: () => void;
}

export function ListView({
  board,
  cards,
  filtering,
  labels,
  today,
  readOnly,
  onOpen,
  onToggleDone,
  onClearFilter,
}: ListViewProps) {
  const add = useAddCard();
  const [title, setTitle] = useState('');
  const first = board.columns.find((c) => !c.done) ?? board.columns[0];
  const canTick = doneColumn(board.columns) != null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || !first) return;
    add.mutate({ boardId: board.id, columnId: first.id, title: t, priority: 'none' });
    setTitle('');
  };

  return (
    <div className="board-list">
      {readOnly || !first ? null : (
        <form className="board-list__add" onSubmit={submit}>
          <TextField
            label={`New card in ${first.name}`}
            hideLabel
            value={title}
            maxLength={200}
            placeholder={`Add a card to ${first.name}`}
            onChange={(e) => setTitle(e.target.value)}
            enterKeyHint="done"
          />
          <Button type="submit" variant="primary" leadingIcon={Plus} disabled={!title.trim()}>
            Add
          </Button>
        </form>
      )}

      {cards.length === 0 ? (
        filtering ? (
          <EmptyState
            size="sm"
            icon={ListBullets}
            title="No cards match the filter"
            body="Try another due date or label."
            action={
              <Button size="sm" onClick={onClearFilter}>
                Clear the filter
              </Button>
            }
          />
        ) : (
          <EmptyState
            size="sm"
            icon={ListBullets}
            title="No cards on this board yet"
            body={readOnly ? undefined : 'Add your first one above.'}
          />
        )
      ) : (
        <ul role="list" className="board-list__rows">
          {cards.map((card) => {
            const isDone = card.doneAt != null;
            const due = dueOf(card);
            const overdue = isOverdue(card, today);
            const check = card.checklist.length ? checklistProgress(card.checklist) : null;
            const column = board.columns.find((c) => c.id === card.columnId);
            const locked = readOnly || isUnsaved(card);
            return (
              <li key={card.id} className={cx('board-list__row', isDone && 'is-done')} data-hub="board-list-row">
                {canTick ? (
                  <label className="board-list__tick">
                    <input type="checkbox" checked={isDone} disabled={locked} onChange={() => onToggleDone(card)} />
                    <span className="visually-hidden">Done: {card.title}</span>
                  </label>
                ) : null}
                <div className="board-list__main">
                  <button type="button" className="board-list__title" disabled={locked} onClick={() => onOpen(card)}>
                    {card.title}
                  </button>
                  <div className="board-list__meta">
                    {column ? (
                      <span className="board-list__column">
                        {column.done ? <CheckCircle aria-hidden="true" weight="fill" /> : null}
                        {column.name}
                      </span>
                    ) : null}
                    <PriorityBadge priority={card.priority} />
                    {card.labelIds.map((id) => {
                      const l = labels[id];
                      return l ? (
                        <span key={id} className="board-list__label">
                          <span
                            className="board-card__label-dot"
                            style={{ background: colorVar(l.color) }}
                            aria-hidden="true"
                          />
                          {l.name}
                        </span>
                      ) : null;
                    })}
                    {check ? (
                      <span className="board-list__count">
                        {check.done} of {check.total} to-dos
                      </span>
                    ) : null}
                    {due && !isDone ? (
                      <span className={cx('board-list__due', overdue && 'is-overdue')}>
                        {overdue ? <WarningCircle aria-hidden="true" weight="fill" /> : <Clock aria-hidden="true" />}
                        {dueLabel(
                          due,
                          today,
                          formatDay(due, { weekday: 'short', month: 'short', year: false }),
                          card.dueTime,
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
