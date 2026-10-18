// A board as columns of cards. Laptops and tablets see every column side by side (the row scrolls when there are
// more than fit) and drag cards with a mouse; phones see one column at a time behind tabs. Every move is also in
// each card's menu, and Alt with the arrow keys moves a focused card.
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Circle,
  DotsThree,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import type { BoardCard, BoardColumn, BoardLabel, BoardSummary } from '../../api/types';
import { BREAKPOINTS, useMediaQuery } from '../../state';
import { Button, IconButton, Menu, TabPanel, Tabs, TextField, Tooltip, cx, type MenuItem } from '../../ui';
import { useAddCard } from './api';
import { cardsIn, counts, splitDone } from './board';
import { CardItem } from './CardItem';
import { FOCUS_WAIT_MS, type Adding, type CardActions } from './types';
import { useScrollEdges } from './useScrollEdges';

/** Where a dragged card lands: right before a card, or after the last one of the column. */
export type DropPlace = { before: string } | { last: true };

export interface ColumnActions {
  onAdd: () => void;
  onRename: (column: BoardColumn) => void;
  onDelete: (column: BoardColumn) => void;
  onMove: (column: BoardColumn, by: -1 | 1) => void;
  onToggleDone: (column: BoardColumn) => void;
  onDrop: (column: BoardColumn, place: DropPlace) => void;
}

export interface KanbanViewProps {
  board: BoardSummary;
  /** the cards that pass the filter, column by column */
  cards: readonly BoardCard[];
  labels: Readonly<Record<string, BoardLabel>>;
  today: string;
  readOnly: boolean;
  actions: CardActions;
  columnActions: ColumnActions;
  /** the column on a phone's screen */
  phoneColumnId: string | null;
  onPhoneColumn: (columnId: string) => void;
  /** the column whose "Add a card" form is open */
  adding: Adding | null;
  onAdding: (columnId: string | null) => void;
}

export function KanbanView({
  board,
  cards,
  labels,
  today,
  readOnly,
  actions,
  columnActions,
  phoneColumnId,
  onPhoneColumn,
  adding,
  onAdding,
}: KanbanViewProps) {
  const isPhone = useMediaQuery(BREAKPOINTS.mobile);
  const edges = useScrollEdges<HTMLDivElement>(!isPhone);
  const columns = board.columns;
  const shown = counts(cards);

  if (isPhone) {
    const active = columns.find((c) => c.id === phoneColumnId) ?? columns[0];
    if (!active) return null;
    return (
      <div className="board-phone">
        <Tabs
          idBase="board-cols"
          label="Columns"
          className="board-phone__tabs"
          value={active.id}
          onChange={onPhoneColumn}
          tabs={columns.map((c) => ({
            id: c.id,
            label: c.name,
            icon: c.done ? CheckCircle : null,
            count: shown[c.id] ?? 0,
          }))}
        />
        <TabPanel idBase="board-cols" id={active.id} value={active.id} className="board-phone__panel">
          <KanbanColumn
            key={active.id}
            board={board}
            column={active}
            index={columns.indexOf(active)}
            cards={cardsIn(cards, active.id)}
            labels={labels}
            today={today}
            readOnly={readOnly}
            actions={actions}
            columnActions={columnActions}
            adding={adding?.columnId === active.id ? adding : null}
            onAdding={onAdding}
            single
          />
        </TabPanel>
      </div>
    );
  }

  return (
    <div
      ref={edges.ref}
      className={cx('board-columns', edges.start && 'has-more-start', edges.end && 'has-more-end')}
      data-hub="board-columns"
    >
      {columns.map((c, i) => (
        <KanbanColumn
          key={c.id}
          board={board}
          column={c}
          index={i}
          cards={cardsIn(cards, c.id)}
          labels={labels}
          today={today}
          readOnly={readOnly}
          actions={actions}
          columnActions={columnActions}
          adding={adding?.columnId === c.id ? adding : null}
          onAdding={onAdding}
        />
      ))}
      {readOnly ? null : (
        <Tooltip label="Add column" side="left" describe={false}>
          <button
            type="button"
            className="board-columns__add"
            aria-label="Add column"
            onClick={columnActions.onAdd}
            data-hub="board-add-column"
          >
            <Plus aria-hidden="true" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

interface KanbanColumnProps {
  board: BoardSummary;
  column: BoardColumn;
  index: number;
  cards: BoardCard[];
  labels: Readonly<Record<string, BoardLabel>>;
  today: string;
  readOnly: boolean;
  actions: CardActions;
  columnActions: ColumnActions;
  adding: Adding | null;
  onAdding: (columnId: string | null) => void;
  /** the only column on screen (phones) */
  single?: boolean;
}

function KanbanColumn({
  board,
  column,
  index,
  cards,
  labels,
  today,
  readOnly,
  actions,
  columnActions,
  adding,
  onAdding,
  single = false,
}: KanbanColumnProps) {
  const headingId = useId();
  const [over, setOver] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  // Closing the form puts focus back on "Add a card".
  const [backToAdd, setBackToAdd] = useState(false);
  const dragging = actions.dragging;
  const { recent, older } = column.done ? splitDone(cards, today) : { recent: cards, older: [] };
  const visible = showOlder ? cards : recent;
  const total = board.columns.length;

  // A move that took the card off a phone's column puts focus on the column.
  const focus = actions.focus;
  const wantsFocus = (el: HTMLElement | null) => {
    if (!el || focus?.kind !== 'column' || focus.columnId !== column.id) return;
    if (Date.now() - focus.at < FOCUS_WAIT_MS) el.focus();
    actions.onFocused();
  };

  const allow = (e: DragEvent, target: string) => {
    if (dragging == null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (over !== target) setOver(target);
  };
  const drop = (e: DragEvent, place: { before: string } | { last: true }) => {
    if (dragging == null) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    columnActions.onDrop(column, place);
  };

  const menu: MenuItem[] = [
    { id: 'rename', label: 'Rename column', icon: PencilSimple, onSelect: () => columnActions.onRename(column) },
    {
      id: 'left',
      label: 'Move left',
      icon: ArrowLeft,
      disabled: index === 0,
      onSelect: () => columnActions.onMove(column, -1),
    },
    {
      id: 'right',
      label: 'Move right',
      icon: ArrowRight,
      disabled: index === total - 1,
      onSelect: () => columnActions.onMove(column, 1),
    },
    {
      id: 'done',
      label: column.done ? 'Stop counting cards here as done' : 'Count cards here as done',
      icon: column.done ? Circle : CheckCircle,
      onSelect: () => columnActions.onToggleDone(column),
    },
    { divider: true, id: 'd' },
    {
      id: 'delete',
      label: 'Delete column',
      icon: Trash,
      danger: true,
      disabled: total <= 1,
      onSelect: () => columnActions.onDelete(column),
    },
  ];

  return (
    <section
      ref={wantsFocus}
      tabIndex={-1}
      className={cx('board-col', single && 'board-col--single', dragging != null && over != null && 'is-over')}
      aria-labelledby={headingId}
      data-hub="board-column"
      onDragOver={(e) => allow(e, 'end')}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
      }}
      onDrop={(e) => drop(e, { last: true })}
    >
      <header className="board-col__head">
        <h2 className="board-col__name" id={headingId}>
          <span className="board-col__title">{column.name}</span>
          <span className="board-col__count">
            {cards.length}
            <span className="visually-hidden"> {cards.length === 1 ? 'card' : 'cards'}</span>
          </span>
          {column.done ? (
            <CheckCircle className="board-col__done" weight="fill" aria-label="Cards here count as done" role="img" />
          ) : null}
        </h2>
        {readOnly ? null : (
          <span className="board-col__tools">
            {single ? (
              <IconButton
                label={`Add a card to ${column.name}`}
                icon={Plus}
                size="sm"
                onClick={() => onAdding(column.id)}
              />
            ) : null}
            <Menu
              label={`Column ${column.name}`}
              align="end"
              items={menu}
              trigger={<IconButton label={`Column options for ${column.name}`} icon={DotsThree} size="sm" />}
            />
          </span>
        )}
      </header>

      {cards.length === 0 && !adding ? (
        <p className="board-col__empty">{column.done ? 'Finished cards land here.' : 'No cards yet.'}</p>
      ) : null}

      <ul role="list" className="board-col__cards">
        {visible.map((card, i) => (
          <li
            key={card.id}
            className={cx(
              'board-col__card',
              dragging != null && over === card.id && card.id !== dragging && 'is-drop-before',
            )}
            onDragOver={(e) => allow(e, card.id)}
            onDrop={(e) => drop(e, { before: card.id })}
          >
            <CardItem
              card={card}
              prevId={visible[i - 1]?.id ?? null}
              columns={board.columns}
              labels={labels}
              today={today}
              actions={actions}
            />
          </li>
        ))}
      </ul>

      {older.length ? (
        <button
          type="button"
          className="board-col__older"
          aria-expanded={showOlder}
          onClick={() => setShowOlder((v) => !v)}
        >
          {showOlder ? 'Hide cards done over 2 weeks ago' : `Show ${older.length} done over 2 weeks ago`}
        </button>
      ) : null}

      {readOnly ? null : adding ? (
        <QuickAdd
          key={adding.at}
          board={board}
          column={column}
          onClose={() => {
            setBackToAdd(true);
            onAdding(null);
          }}
        />
      ) : (
        <button
          ref={(el) => {
            if (el && backToAdd) {
              el.focus();
              setBackToAdd(false);
            }
          }}
          type="button"
          className="board-col__add"
          onClick={() => onAdding(column.id)}
          data-hub="board-quick-add"
        >
          <Plus aria-hidden="true" />
          Add a card
        </button>
      )}
    </section>
  );
}

/** "Add a card" at the foot of a column: Enter adds it and keeps the form open for the next one; Esc or Close
 *  closes it. */
function QuickAdd({ board, column, onClose }: { board: BoardSummary; column: BoardColumn; onClose: () => void }) {
  const add = useAddCard();
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    add.mutate({ boardId: board.id, columnId: column.id, title: t, priority: 'none' });
    setTitle('');
    inputRef.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };
  return (
    <form className="board-col__form" onSubmit={submit} data-hub="board-quick-form">
      <TextField
        ref={inputRef}
        label={`New card in ${column.name}`}
        hideLabel
        value={title}
        maxLength={200}
        placeholder="Card title"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        enterKeyHint="done"
      />
      <div className="board-col__form-actions">
        <Button size="sm" variant="primary" type="submit" disabled={!title.trim()}>
          Add card
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </form>
  );
}
