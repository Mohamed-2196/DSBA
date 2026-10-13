// The study board: the student's own cards in To do, In progress and Done. Laptops show the three columns side by
// side, phones one at a time behind a segmented switch. Cards move by drag and drop or from each card's menu.
import { useState, type DragEvent } from 'react';
import { Kanban, Plus } from '@phosphor-icons/react';
import type { BoardCard } from '../../api/types';
import { useAuth } from '../../auth';
import { BREAKPOINTS, useMediaQuery } from '../../state';
import { Button, ConfirmDialog, EmptyState, Page, PageHeader, QueryError, SegmentedControl, Skeleton, cx } from '../../ui';
import { todayKey } from '../../lib/dates';
import { isUnsaved, useBoard, useDeleteCard, useMoveCard } from './api';
import { afterIdBefore, cardsIn, columnLabel, COLUMNS, counts, nudge, splitDone, type Column } from './board';
import { CardDialog } from './CardDialog';
import { CardItem } from './CardItem';
import './BoardPage.css';

type Editing = { card: BoardCard | null; column: Column } | null;

export default function BoardPage() {
  const { status, openSignIn } = useAuth();
  if (status === 'loading') return <BoardSkeleton />;
  if (status !== 'signed-in') {
    return (
      <Page width="wide" className="board-page">
        <PageHeader title="Study board" description="Your own list of what to study, what you’re on and what’s done." />
        <EmptyState
          icon={Kanban}
          title="Sign in to use your study board"
          body="Your board is private. Only you see it."
          action={
            <Button variant="primary" onClick={() => openSignIn()}>
              Sign in
            </Button>
          }
        />
      </Page>
    );
  }
  return <Board />;
}

function Board() {
  const { me } = useAuth();
  const readOnly = me?.status === 'suspended';
  const board = useBoard();
  const move = useMoveCard();
  const remove = useDeleteCard();
  const isPhone = useMediaQuery(BREAKPOINTS.mobile);
  const [shown, setShown] = useState<Column>('todo');
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<BoardCard | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  if (board.isPending) return <BoardSkeleton />;
  if (board.isError) {
    return (
      <Page width="wide" className="board-page">
        <PageHeader title="Study board" />
        <QueryError error={board.error} title="Your board didn’t load" onRetry={() => void board.refetch()} retrying={board.isFetching} />
      </Page>
    );
  }

  const cards = board.data.cards;
  const n = counts(cards);
  const full = cards.length >= board.data.limit;
  const today = todayKey();

  const moveTo = (card: BoardCard, column: Column, afterId: string | null) => {
    move.mutate({ id: card.id, column, afterId });
    setAnnouncement(card.column === column ? `Moved “${card.title}”.` : `Moved “${card.title}” to ${columnLabel(column)}.`);
  };
  const actions: CardActions = {
    readOnly,
    onEdit: (card) => setEditing({ card, column: card.column }),
    onDelete: setDeleting,
    onMove: (card, column) => moveTo(card, column, null),
    onNudge: (card, by) => {
      const after = nudge(cards, card.id, by);
      if (after !== undefined) moveTo(card, card.column, after);
    },
    canNudge: (card, by) => nudge(cards, card.id, by) !== undefined,
    dragging,
    onDragStart: (card) => setDragging(card.id),
    onDragEnd: () => setDragging(null),
    onDropAt: (column, place) => {
      const card = cards.find((c) => c.id === dragging);
      setDragging(null);
      if (!card || place.before === card.id) return;
      moveTo(card, column, place.before !== undefined ? afterIdBefore(cards, card.id, column, place.before) : place.after);
    },
  };
  const visible = isPhone ? COLUMNS.filter((c) => c.id === shown) : COLUMNS;

  return (
    <Page width="wide" className="board-page">
      <PageHeader
        title="Study board"
        description="Your own list of what to study, what you’re on and what’s done. Only you see it."
        actions={
          readOnly ? null : (
            <Button variant="primary" leadingIcon={Plus} onClick={() => setEditing({ card: null, column: isPhone ? shown : 'todo' })} disabled={full} data-hub="board-new">
              Add a card
            </Button>
          )
        }
      />
      {readOnly ? <p className="board-page__notice">Your account is suspended, so your board is read only.</p> : null}
      {full ? <p className="board-page__notice">Your board holds {board.data.limit} cards. Delete some you’ve finished to add more.</p> : null}

      {isPhone ? (
        <SegmentedControl
          label="Column"
          fullWidth
          className="board-page__switch"
          value={shown}
          onChange={setShown}
          options={COLUMNS.map((c) => ({ value: c.id, label: `${c.label} ${n[c.id]}`, ariaLabel: `${c.label}, ${n[c.id]} card${n[c.id] === 1 ? '' : 's'}` }))}
        />
      ) : null}

      <div className={cx('board', isPhone && 'board--one')}>
        {visible.map((c) => (
          <BoardColumn key={c.id} column={c.id} cards={cardsIn(cards, c.id)} today={today} actions={actions} hideHeading={isPhone} />
        ))}
      </div>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      {editing ? <CardDialog key={editing.card?.id ?? `new-${editing.column}`} card={editing.card} column={editing.column} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Delete “${deleting.title}”?` : ''}
        body="It goes from your board for good."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
        onClose={() => setDeleting(null)}
      />
    </Page>
  );
}

export interface CardActions {
  readOnly: boolean;
  onEdit: (card: BoardCard) => void;
  onDelete: (card: BoardCard) => void;
  onMove: (card: BoardCard, column: Column) => void;
  onNudge: (card: BoardCard, by: -1 | 1) => void;
  canNudge: (card: BoardCard, by: -1 | 1) => boolean;
  dragging: string | null;
  onDragStart: (card: BoardCard) => void;
  onDragEnd: () => void;
  /** Dropped right before a card, or after one (null: at the top). */
  onDropAt: (column: Column, place: { before: string; after?: undefined } | { after: string | null; before?: undefined }) => void;
}

interface BoardColumnProps {
  column: Column;
  cards: BoardCard[];
  today: string;
  actions: CardActions;
  hideHeading: boolean;
}

const EMPTY: Record<Column, string> = {
  todo: 'Nothing to do yet. Add a card, or add an exam, a deadline or a lesson from the hub.',
  doing: 'Nothing in progress. Move a card here when you start it.',
  done: 'Nothing done yet. Lessons you watch move here by themselves.',
};

const END = 'end';

function BoardColumn({ column, cards, today, actions, hideHeading }: BoardColumnProps) {
  const [showOlder, setShowOlder] = useState(false);
  const [over, setOver] = useState<string | null>(null); // the card a drop would go before, or END
  const { recent, older } = column === 'done' ? splitDone(cards, today) : { recent: cards, older: [] };
  const list = showOlder ? [...recent, ...older] : recent;
  const headingId = `board-col-${column}`;
  const dropping = actions.dragging != null;
  const last = list.filter((c) => c.id !== actions.dragging).at(-1);

  // Dropped on a card: it goes before that card. Dropped on the column's free space: after the last card shown.
  const drop = (e: DragEvent, target: string) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    actions.onDropAt(column, target === END ? { after: last?.id ?? null } : { before: target });
  };
  const allow = (e: DragEvent, target: string) => {
    if (!dropping) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (over !== target) setOver(target);
  };

  return (
    <section
      className={cx('board-col', `board-col--${column}`, dropping && over != null && 'is-over')}
      aria-labelledby={hideHeading ? undefined : headingId}
      aria-label={hideHeading ? columnLabel(column) : undefined}
      onDragOver={(e) => allow(e, END)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
      }}
      onDrop={(e) => drop(e, END)}
    >
      {hideHeading ? null : (
        <h2 id={headingId} className="board-col__h">
          {columnLabel(column)} <span className="board-col__count">{cards.length}</span>
        </h2>
      )}
      {cards.length === 0 ? <p className="board-col__empty">{EMPTY[column]}</p> : null}
      <ul role="list" className="board-col__list">
        {list.map((card) => (
          <li
            key={card.id}
            className={cx('board-col__item', dropping && over === card.id && card.id !== actions.dragging && 'is-drop-before')}
            onDragOver={(e) => allow(e, card.id)}
            onDrop={(e) => drop(e, card.id)}
          >
            <CardItem card={card} today={today} actions={actions} unsaved={isUnsaved(card)} />
          </li>
        ))}
      </ul>
      {older.length ? (
        <Button variant="ghost" size="sm" className="board-col__older" onClick={() => setShowOlder((v) => !v)} aria-expanded={showOlder}>
          {showOlder ? 'Hide older' : `Show ${older.length} older`}
        </Button>
      ) : null}
    </section>
  );
}

function BoardSkeleton() {
  return (
    <Page width="wide" className="board-page" aria-busy="true">
      <PageHeader title="Study board" />
      <div className="board" aria-hidden="true">
        {COLUMNS.map((c) => (
          <div key={c.id} className="board-col">
            <Skeleton height={20} width="40%" />
            <Skeleton height={88} radius={12} />
            <Skeleton height={88} radius={12} />
          </div>
        ))}
      </div>
    </Page>
  );
}
