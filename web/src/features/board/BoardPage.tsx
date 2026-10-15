// Boards: personal task manager. Many boards started from templates, columns, cards with rich details,
// checklists, attachments, comments, reminders, filters, list view, and today agenda across all boards.
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CheckCircle,
  CheckSquare,
  Clock,
  DotsThree,
  Funnel,
  Kanban,
  ListBullets,
  PencilSimple,
  Plus,
  Tag,
  Trash,
} from '@phosphor-icons/react';
import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BoardCard, BoardColumn, BoardLabel, BoardPlan, BoardSummary } from '../../api/types';
import { useAuth } from '../../auth';
import { formatDay, todayKey } from '../../lib/dates';
import { BREAKPOINTS, useMediaQuery } from '../../state';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Menu,
  Page,
  PageHeader,
  QueryError,
  SegmentedControl,
  Select,
  Skeleton,
  cx,
  type MenuItem,
} from '../../ui';
import {
  useAddCard,
  useAgenda,
  useBoard,
  useBoards,
  useDeleteBoard,
  useDeletePlan,
  useMoveCard,
  usePlaceBoard,
  usePlaceColumn,
  useUpdateBoard,
} from './api';
import {
  afterIdBefore,
  agendaSections,
  cardsIn,
  checklistProgress,
  colorVar,
  counts,
  doneColumn,
  dueLabel,
  dueOf,
  DUE_FILTERS,
  isFiltering,
  isOverdue,
  isPastPaper,
  lastIn,
  matches,
  NO_FILTER,
  nudge,
  planPace,
  storageText,
  type CardFilter,
} from './board';
import { BoardDialog } from './BoardDialog';
import { CardDetailDrawer } from './CardDetailDrawer';
import { CardItem } from './CardItem';
import { ColumnDialog } from './ColumnDialog';
import { LabelDialog } from './LabelDialog';
import { ScoreDialog } from './ScoreDialog';
import { usePaperScores, type Scores } from './scores';
import './BoardPage.css';

export interface CardActions {
  readOnly: boolean;
  scores: Scores;
  onScore: (card: BoardCard) => void;
  onOpenDetail: (cardId: string) => void;
  onDelete: (card: BoardCard) => void;
  onMove: (card: BoardCard, columnId: string) => void;
  onNudge: (card: BoardCard, by: -1 | 1) => void;
  canNudge: (card: BoardCard, by: -1 | 1) => boolean;
  dragging: string | null;
  onDragStart: (card: BoardCard) => void;
  onDragEnd: () => void;
  onDropAt: (
    columnId: string,
    place: { before: string; after?: undefined } | { after: string | null; before?: undefined },
  ) => void;
}

export default function BoardPage() {
  const { status, openSignIn } = useAuth();
  if (status === 'loading') return <BoardSkeleton />;
  if (status !== 'signed-in') {
    return (
      <Page width="wide" className="board-page">
        <PageHeader title="Boards" description="Your personal task manager. Only you see your boards." />
        <EmptyState
          icon={Kanban}
          title="Sign in to use your boards"
          body="Your boards, tasks and checklists are private to your student account."
          action={
            <Button variant="primary" onClick={() => openSignIn()}>
              Sign in
            </Button>
          }
        />
      </Page>
    );
  }
  return <BoardApp />;
}

function BoardApp() {
  const { me } = useAuth();
  const readOnly = me?.status === 'suspended';
  const isPhone = useMediaQuery(BREAKPOINTS.mobile);
  const [searchParams, setSearchParams] = useSearchParams();

  const [scores, setScore] = usePaperScores();
  const [scoring, setScoring] = useState<BoardCard | null>(null);
  const [unplanning, setUnplanning] = useState<BoardPlan | null>(null);

  // Dialogs
  const [editingBoard, setEditingBoard] = useState<BoardSummary | null | 'new'>(null);
  const [editingColumn, setEditingColumn] = useState<BoardColumn | null | 'new'>(null);
  const [showLabelsDialog, setShowLabelsDialog] = useState(false);
  const [deletingBoard, setDeletingBoard] = useState<BoardSummary | null>(null);

  // Filter state
  const [filter, setFilter] = useState<CardFilter>(NO_FILTER);
  const [showFilters, setShowFilters] = useState(false);

  // Dragging state
  const [dragging, setDragging] = useState<string | null>(null);
  const [phoneColumnId, setPhoneColumnId] = useState<string | null>(null);

  // API hooks
  const boardsQuery = useBoards();
  const activeBoards = useMemo(() => boardsQuery.data?.boards.filter((b) => !b.archived) ?? [], [boardsQuery.data]);
  const archivedBoards = useMemo(() => boardsQuery.data?.boards.filter((b) => b.archived) ?? [], [boardsQuery.data]);
  const allLabels = useMemo(() => boardsQuery.data?.labels ?? [], [boardsQuery.data]);
  const labelMap = useMemo(() => Object.fromEntries(allLabels.map((l) => [l.id, l])), [allLabels]);

  const view = (searchParams.get('view') as 'board' | 'list' | 'today') || 'board';
  const boardIdParam = searchParams.get('board');
  const activeCardId = searchParams.get('card');

  // Active board selection
  const currentBoard = useMemo(() => {
    if (boardIdParam) {
      const match = boardsQuery.data?.boards.find((b) => b.id === boardIdParam);
      if (match) return match;
    }
    return activeBoards[0] ?? null;
  }, [boardIdParam, boardsQuery.data, activeBoards]);

  const setView = (v: 'board' | 'list' | 'today') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', v);
      return next;
    });
  };

  const setBoardId = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('board', id);
      return next;
    });
  };

  const openCardDetail = (cardId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (cardId) next.set('card', cardId);
      else next.delete('card');
      return next;
    });
  };

  // Board details
  const boardDetail = useBoard(currentBoard?.id, { enabled: !!currentBoard?.id && view !== 'today' });
  const move = useMoveCard();
  const placeBoard = usePlaceBoard();
  const placeColumn = usePlaceColumn();
  const updateBoard = useUpdateBoard();
  const deleteBoard = useDeleteBoard();
  const removePlan = useDeletePlan();
  const addCard = useAddCard();

  const today = todayKey();

  if (boardsQuery.isPending) return <BoardSkeleton />;
  if (boardsQuery.isError) {
    return (
      <Page width="wide" className="board-page">
        <PageHeader title="Boards" />
        <QueryError
          error={boardsQuery.error}
          title="Your boards didn’t load"
          onRetry={() => void boardsQuery.refetch()}
          retrying={boardsQuery.isFetching}
        />
      </Page>
    );
  }

  // If student has no boards at all
  if (activeBoards.length === 0 && archivedBoards.length === 0) {
    return (
      <Page width="wide" className="board-page">
        <PageHeader title="Boards" description="Your personal task manager." />
        <EmptyState
          icon={Kanban}
          title="Create your first board"
          body="Manage your revision, assignments, weekly schedule and personal to-dos."
          action={
            <Button variant="primary" leadingIcon={Plus} onClick={() => setEditingBoard('new')}>
              Create a board
            </Button>
          }
        />
        {editingBoard ? (
          <BoardDialog
            board={null}
            onClose={() => setEditingBoard(null)}
            onCreated={(id) => setBoardId(id)}
          />
        ) : null}
      </Page>
    );
  }

  const rawCards = boardDetail.data?.cards ?? [];
  const filteredCards = rawCards.filter((c) => matches(c, filter, today));
  const columns = currentBoard?.columns ?? [];
  const colCounts = counts(filteredCards);
  const activeColId = phoneColumnId && columns.some((c) => c.id === phoneColumnId) ? phoneColumnId : columns[0]?.id;

  const cardActions: CardActions = {
    readOnly,
    scores,
    onScore: setScoring,
    onOpenDetail: (cardId) => openCardDetail(cardId),
    onDelete: (card) => {
      // delete card directly
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (next.get('card') === card.id) next.delete('card');
        return next;
      });
    },
    onMove: (card, colId) => {
      move.mutate({ id: card.id, columnId: colId, afterId: null });
      const targetCol = columns.find((c) => c.id === colId);
      if (targetCol?.done && isPastPaper(card)) setScoring(card);
    },
    onNudge: (card, by) => {
      const after = nudge(rawCards, card.id, by);
      if (after !== undefined) move.mutate({ id: card.id, columnId: card.columnId, afterId: after });
    },
    canNudge: (card, by) => nudge(rawCards, card.id, by) !== undefined,
    dragging,
    onDragStart: (card) => setDragging(card.id),
    onDragEnd: () => setDragging(null),
    onDropAt: (colId, place) => {
      const card = rawCards.find((c) => c.id === dragging);
      setDragging(null);
      if (!card || place.before === card.id) return;
      const after = place.before !== undefined ? afterIdBefore(rawCards, card.id, colId, place.before) : place.after;
      move.mutate({ id: card.id, columnId: colId, afterId: after });
      const targetCol = columns.find((c) => c.id === colId);
      if (targetCol?.done && isPastPaper(card)) setScoring(card);
    },
  };

  // Reordering board among active boards
  const currentBoardIndex = activeBoards.findIndex((b) => b.id === currentBoard?.id);
  const canMoveBoardLeft = currentBoardIndex > 0;
  const canMoveBoardRight = currentBoardIndex >= 0 && currentBoardIndex < activeBoards.length - 1;

  const handleMoveBoard = (by: -1 | 1) => {
    if (!currentBoard) return;
    const targetIndex = currentBoardIndex + by;
    if (targetIndex < 0 || targetIndex >= activeBoards.length) return;
    const afterId = by === -1 ? (targetIndex === 0 ? null : activeBoards[targetIndex - 1]?.id ?? null) : activeBoards[targetIndex]?.id ?? null;
    placeBoard.mutate({ id: currentBoard.id, afterId });
  };

  const boardMenuItems: MenuItem[] = [
    {
      id: 'edit',
      label: 'Edit board',
      icon: PencilSimple,
      onSelect: () => setEditingBoard(currentBoard),
    },
    {
      id: 'move-left',
      label: 'Move left',
      icon: ArrowLeft,
      disabled: !canMoveBoardLeft,
      onSelect: () => handleMoveBoard(-1),
    },
    {
      id: 'move-right',
      label: 'Move right',
      icon: ArrowRight,
      disabled: !canMoveBoardRight,
      onSelect: () => handleMoveBoard(1),
    },
    { divider: true, id: 'd1' },
    {
      id: 'archive',
      label: currentBoard?.archived ? 'Unarchive board' : 'Archive board',
      icon: Archive,
      onSelect: () => {
        if (!currentBoard) return;
        updateBoard.mutate({ id: currentBoard.id, patch: { archived: !currentBoard.archived } });
      },
    },
    {
      id: 'delete',
      label: 'Delete board',
      icon: Trash,
      danger: true,
      onSelect: () => setDeletingBoard(currentBoard),
    },
  ];

  return (
    <Page width="wide" className="board-page">
      {/* Top Bar: Board Selector, View Switcher & Action buttons */}
      <div className="board-page__header">
        <div className="board-page__selector-row">
          <div className="board-page__picker">
            <Select
              label="Select board"
              hideLabel
              value={view === 'today' ? 'today' : (currentBoard?.id ?? '')}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'today') {
                  setView('today');
                } else if (val === 'new') {
                  setEditingBoard('new');
                } else {
                  if (view === 'today') setView('board');
                  setBoardId(val);
                }
              }}
              options={[
                ...activeBoards.map((b) => ({
                  value: b.id,
                  label: `${b.emoji ? `${b.emoji} ` : ''}${b.name} (${b.open} open)`,
                })),
                ...(archivedBoards.length > 0
                  ? [
                      { value: '---', label: '── Archived ──', disabled: true },
                      ...archivedBoards.map((b) => ({
                        value: b.id,
                        label: `📦 ${b.name} (archived)`,
                      })),
                    ]
                  : []),
                { value: 'today', label: '📅 Today across all boards' },
                { value: 'new', label: '➕ New board…' },
              ]}
            />
          </div>

          {view !== 'today' && currentBoard ? (
            <div className="board-page__board-actions">
              <span
                className="board-page__board-dot"
                style={{ backgroundColor: colorVar(currentBoard.color) }}
                aria-hidden="true"
              />
              <Menu
                label="Board actions"
                items={boardMenuItems}
                trigger={
                  <IconButton
                    label="Board options"
                    icon={DotsThree}
                    size="sm"
                    data-hub="board-menu"
                  />
                }
              />
            </div>
          ) : null}

          {/* View switcher: Board / List / Today */}
          <div className="board-page__views">
            <SegmentedControl
              label="View"
              value={view}
              onChange={(v) => setView(v as 'board' | 'list' | 'today')}
              options={[
                { value: 'board', label: 'Board', icon: Kanban },
                { value: 'list', label: 'List', icon: ListBullets },
                { value: 'today', label: 'Today', icon: Clock },
              ]}
            />
          </div>

          {/* Quick buttons */}
          <div className="board-page__quick-buttons">
            <Button
              size="sm"
              variant={isFiltering(filter) ? 'primary' : 'ghost'}
              leadingIcon={Funnel}
              onClick={() => setShowFilters((v) => !v)}
            >
              Filter
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={Tag}
              onClick={() => setShowLabelsDialog(true)}
            >
              Labels
            </Button>
            {!readOnly && view !== 'today' && currentBoard && columns.length > 0 ? (
              <Button
                size="sm"
                variant="primary"
                leadingIcon={Plus}
                onClick={() => {
                  addCard.mutate(
                    {
                      boardId: currentBoard.id,
                      columnId: columns[0]?.id as string,
                      title: 'New card',
                      priority: 'none',
                    },
                    {
                      onSuccess: (newCard) => openCardDetail(newCard.id),
                    },
                  );
                }}
              >
                Add card
              </Button>
            ) : null}
          </div>
        </div>

        {/* Filter Drawer / Bar */}
        {showFilters ? (
          <div className="board-page__filters-bar">
            <div className="board-page__filter-group">
              <span className="board-page__filter-label">Due:</span>
              <div className="board-page__filter-pills">
                {DUE_FILTERS.map((df) => (
                  <button
                    type="button"
                    key={df.id}
                    className={cx('board-page__filter-pill', filter.due === df.id && 'is-active')}
                    onClick={() => setFilter((f) => ({ ...f, due: df.id }))}
                  >
                    {df.label}
                  </button>
                ))}
              </div>
            </div>

            {allLabels.length > 0 ? (
              <div className="board-page__filter-group">
                <span className="board-page__filter-label">Labels:</span>
                <div className="board-page__filter-pills">
                  {allLabels.map((l) => {
                    const active = filter.labels.includes(l.id);
                    return (
                      <button
                        type="button"
                        key={l.id}
                        className={cx('board-page__filter-pill', active && 'is-active')}
                        style={
                          active
                            ? { backgroundColor: colorVar(l.color), color: '#fff', borderColor: colorVar(l.color) }
                            : undefined
                        }
                        onClick={() =>
                          setFilter((f) => ({
                            ...f,
                            labels: active ? f.labels.filter((id) => id !== l.id) : [...f.labels, l.id],
                          }))
                        }
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {isFiltering(filter) ? (
              <Button size="sm" variant="ghost" onClick={() => setFilter(NO_FILTER)}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {readOnly ? (
        <p className="board-page__notice">Your account is suspended, so your boards are read only.</p>
      ) : null}

      {/* Revision plans for this board */}
      {view !== 'today' && boardDetail.data?.plans.length ? (
        <ul role="list" className="board-plans" aria-label="Revision plans">
          {boardDetail.data.plans.map((p) => (
            <PlanRow key={p.moduleId} plan={p} readOnly={readOnly} onRemove={() => setUnplanning(p)} />
          ))}
        </ul>
      ) : null}

      {/* VIEW: TODAY (Across all boards) */}
      {view === 'today' ? (
        <TodayView onOpenCard={openCardDetail} />
      ) : view === 'list' ? (
        /* VIEW: LIST */
        <ListView
          columns={columns}
          cards={filteredCards}
          labels={labelMap}
          today={today}
          readOnly={readOnly}
          onOpenCard={openCardDetail}
        />
      ) : (
        /* VIEW: BOARD (Kanban) */
        <div className="board-kanban-container">
          {isPhone && columns.length > 1 ? (
            <SegmentedControl
              label="Column"
              fullWidth
              className="board-page__switch"
              value={activeColId ?? columns[0]?.id ?? ''}
              onChange={(val) => setPhoneColumnId(val)}
              options={columns.map((c) => ({
                value: c.id,
                label: `${c.name} ${colCounts[c.id] ?? 0}`,
              }))}
            />
          ) : null}

          <div className={cx('board', isPhone && 'board--one')}>
            {(isPhone && activeColId ? columns.filter((c) => c.id === activeColId) : columns).map((c, idx, arr) => (
              <KanbanColumn
                key={c.id}
                column={c}
                index={idx}
                total={arr.length}
                boardId={currentBoard?.id ?? ''}
                cards={cardsIn(filteredCards, c.id)}
                columns={columns}
                labels={labelMap}
                today={today}
                actions={cardActions}
                readOnly={readOnly}
                onEditColumn={() => setEditingColumn(c)}
                onMoveColumn={(by) => {
                  if (!currentBoard) return;
                  const targetIdx = idx + by;
                  if (targetIdx < 0 || targetIdx >= arr.length) return;
                  const afterId = by === -1 ? (targetIdx === 0 ? null : (arr[targetIdx - 1]?.id ?? null)) : (arr[targetIdx]?.id ?? null);
                  placeColumn.mutate({ boardId: currentBoard.id, columnId: c.id, afterId });
                }}
              />
            ))}

            {!readOnly && !isPhone ? (
              <button
                type="button"
                className="board-col__add-col-btn"
                onClick={() => setEditingColumn('new')}
              >
                <Plus aria-hidden="true" />
                <span>Add column</span>
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Footer: Usage & Storage Limits */}
      {boardsQuery.data?.usage ? (
        <footer className="board-page__footer">
          <span>
            {boardsQuery.data.usage.boards} of {boardsQuery.data.usage.maxBoards} boards
          </span>
          <span>•</span>
          <span>
            {boardsQuery.data.usage.cards} of {boardsQuery.data.usage.maxCards} cards
          </span>
          <span>•</span>
          <span>{storageText(boardsQuery.data.usage.storageBytes, boardsQuery.data.usage.maxStorageBytes)} storage</span>
        </footer>
      ) : null}

      {/* MODALS */}
      {editingBoard ? (
        <BoardDialog
          board={editingBoard === 'new' ? null : editingBoard}
          onClose={() => setEditingBoard(null)}
          onCreated={(id) => setBoardId(id)}
        />
      ) : null}

      {editingColumn && currentBoard ? (
        <ColumnDialog
          boardId={currentBoard.id}
          column={editingColumn === 'new' ? null : editingColumn}
          otherColumns={columns.filter((c) => editingColumn === 'new' || c.id !== editingColumn.id)}
          cardCount={editingColumn !== 'new' ? cardsIn(rawCards, editingColumn.id).length : 0}
          onClose={() => setEditingColumn(null)}
        />
      ) : null}

      {showLabelsDialog ? (
        <LabelDialog labels={allLabels} onClose={() => setShowLabelsDialog(false)} />
      ) : null}

      {activeCardId && currentBoard ? (
        <CardDetailDrawer
          cardId={activeCardId}
          boardId={currentBoard.id}
          columns={columns}
          boards={boardsQuery.data?.boards ?? []}
          labels={allLabels}
          readOnly={readOnly}
          onClose={() => openCardDetail(null)}
        />
      ) : null}

      {scoring ? (
        <ScoreDialog
          key={scoring.id}
          card={scoring}
          score={scoring.link ? (scores[scoring.link.id] ?? null) : null}
          onSave={(score) => {
            if (scoring.link) setScore(scoring.link.id, score);
          }}
          onClose={() => setScoring(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!deletingBoard}
        title={deletingBoard ? `Delete board “${deletingBoard.name}”?` : ''}
        body="This board, all its columns, cards, files and revision plans will be permanently removed."
        confirmLabel="Delete board"
        tone="danger"
        onConfirm={() => {
          if (deletingBoard) deleteBoard.mutate(deletingBoard.id);
          setDeletingBoard(null);
        }}
        onClose={() => setDeletingBoard(null)}
      />

      <ConfirmDialog
        open={!!unplanning}
        title={unplanning ? `Remove your ${unplanning.moduleName} plan?` : ''}
        body="Its cards still to do go from your board. The ones you’ve done stay."
        confirmLabel="Remove plan"
        tone="danger"
        onConfirm={() => {
          if (unplanning) removePlan.mutate(unplanning.moduleId);
          setUnplanning(null);
        }}
        onClose={() => setUnplanning(null)}
      />
    </Page>
  );
}

// ── Kanban Column Component ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: BoardColumn;
  index: number;
  total: number;
  boardId: string;
  cards: BoardCard[];
  columns: readonly BoardColumn[];
  labels: Record<string, BoardLabel>;
  today: string;
  actions: CardActions;
  readOnly: boolean;
  onEditColumn: () => void;
  onMoveColumn?: (by: -1 | 1) => void;
}

const END = 'end';

function KanbanColumn({
  column,
  index,
  total,
  boardId,
  cards,
  columns,
  labels,
  today,
  actions,
  readOnly,
  onEditColumn,
  onMoveColumn,
}: KanbanColumnProps) {
  const [over, setOver] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [addingQuick, setAddingQuick] = useState(false);
  const addCard = useAddCard();

  const dropping = actions.dragging != null;
  const last = lastIn(cards, column.id, actions.dragging);

  const drop = (e: DragEvent, target: string) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    actions.onDropAt(column.id, target === END ? { after: last } : { before: target });
  };

  const allow = (e: DragEvent, target: string) => {
    if (!dropping) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (over !== target) setOver(target);
  };

  const handleQuickAdd = (e: FormEvent) => {
    e.preventDefault();
    const t = quickTitle.trim();
    if (!t) return;
    addCard.mutate(
      { boardId, columnId: column.id, title: t, priority: 'none' },
      {
        onSuccess: () => {
          setQuickTitle('');
          setAddingQuick(false);
        },
      },
    );
  };

  return (
    <section
      className={cx('board-col', dropping && over != null && 'is-over')}
      aria-label={column.name}
      onDragOver={(e) => allow(e, END)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
      }}
      onDrop={(e) => drop(e, END)}
    >
      <header className="board-col__header">
        <h2 className="board-col__h">
          <span>{column.name}</span>
          <span className="board-col__count">{cards.length}</span>
          {column.done ? (
            <CheckCircle aria-label="Done column" className="board-col__done-icon" weight="fill" />
          ) : null}
        </h2>

        {!readOnly ? (
          <Menu
            align="end"
            trigger={
              <IconButton
                label={`Column options for ${column.name}`}
                icon={DotsThree}
                size="sm"
              />
            }
            items={[
              { id: 'edit', label: 'Edit column', icon: PencilSimple, onSelect: onEditColumn },
              {
                id: 'left',
                label: 'Move left',
                icon: ArrowLeft,
                disabled: index === 0,
                onSelect: () => onMoveColumn?.(-1),
              },
              {
                id: 'right',
                label: 'Move right',
                icon: ArrowRight,
                disabled: index === total - 1,
                onSelect: () => onMoveColumn?.(1),
              },
            ]}
          />
        ) : null}
      </header>

      {cards.length === 0 ? <p className="board-col__empty">No cards in this column.</p> : null}

      <ul role="list" className="board-col__list">
        {cards.map((card) => (
          <li
            key={card.id}
            className={cx(
              'board-col__item',
              dropping && over === card.id && card.id !== actions.dragging && 'is-drop-before',
            )}
            onDragOver={(e) => allow(e, card.id)}
            onDrop={(e) => drop(e, card.id)}
          >
            <CardItem
              card={card}
              columns={columns}
              labels={labels}
              today={today}
              actions={actions}
              unsaved={false}
            />
          </li>
        ))}
      </ul>

      {/* Quick Add Card */}
      {!readOnly ? (
        addingQuick ? (
          <form className="board-col__quick-add-form" onSubmit={handleQuickAdd}>
            <input
              type="text"
              className="board-col__quick-input"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Card title…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') setAddingQuick(false);
              }}
            />
            <div className="board-col__quick-actions">
              <Button size="sm" type="submit" disabled={!quickTitle.trim()}>
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingQuick(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="board-col__quick-add-btn"
            onClick={() => setAddingQuick(true)}
          >
            <Plus aria-hidden="true" />
            <span>Add a card</span>
          </button>
        )
      ) : null}
    </section>
  );
}

// ── List View Component ─────────────────────────────────────────────────────────────────

interface ListViewProps {
  columns: readonly BoardColumn[];
  cards: BoardCard[];
  labels: Record<string, BoardLabel>;
  today: string;
  readOnly: boolean;
  onOpenCard: (cardId: string) => void;
}

function ListView({ columns, cards, labels, today, readOnly, onOpenCard }: ListViewProps) {
  const move = useMoveCard();
  const doneCol = doneColumn(columns);
  const todoCol = columns.find((c) => !c.done) ?? columns[0];

  const toggleDone = (card: BoardCard) => {
    if (readOnly) return;
    const isDone = card.doneAt != null;
    const targetCol = isDone ? todoCol : doneCol;
    if (targetCol) move.mutate({ id: card.id, columnId: targetCol.id, afterId: null });
  };

  if (cards.length === 0) {
    return (
      <div className="board-list-empty">
        <EmptyState
          size="sm"
          icon={ListBullets}
          title="No cards match your filter"
          body="Try selecting another filter or adding new cards."
        />
      </div>
    );
  }

  return (
    <div className="board-list-view">
      <ul role="list" className="board-list-items">
        {cards.map((card) => {
          const isDone = card.doneAt != null;
          const due = dueOf(card);
          const overdue = isOverdue(card, today);
          const check = card.checklist?.length ? checklistProgress(card.checklist) : null;
          const col = columns.find((c) => c.id === card.columnId);

          return (
            <li key={card.id} className={cx('board-list-row', isDone && 'is-done')}>
              <input
                type="checkbox"
                checked={isDone}
                disabled={readOnly}
                onChange={() => toggleDone(card)}
                className="board-list-checkbox"
                aria-label={`Mark “${card.title}” as ${isDone ? 'not done' : 'done'}`}
              />
              <button
                type="button"
                className="board-list-title"
                onClick={() => onOpenCard(card.id)}
              >
                {card.title}
              </button>

              <div className="board-list-meta">
                {col ? <Badge size="sm">{col.name}</Badge> : null}

                {card.priority === 'high' ? (
                  <Badge tone="alert" size="sm">
                    High
                  </Badge>
                ) : card.priority === 'medium' ? (
                  <Badge tone="signal" size="sm">
                    Med
                  </Badge>
                ) : null}

                {card.labelIds?.map((lid) => {
                  const l = labels[lid];
                  if (!l) return null;
                  return (
                    <span
                      key={lid}
                      className="board-card__label-tag"
                      style={{ color: colorVar(l.color) }}
                    >
                      <span
                        className="board-card__label-dot"
                        style={{ backgroundColor: colorVar(l.color) }}
                        aria-hidden="true"
                      />
                      {l.name}
                    </span>
                  );
                })}

                {check ? (
                  <span className="board-card__meta-item">
                    <CheckSquare aria-hidden="true" />
                    <span>
                      {check.done}/{check.total}
                    </span>
                  </span>
                ) : null}

                {due && !isDone ? (
                  <span className={cx('board-card__due', overdue && 'is-overdue')}>
                    {overdue ? 'Overdue' : dueLabel(due, today, formatDay(due, { month: 'short', year: false }), card.dueTime)}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Today View Component (Across All Boards) ────────────────────────────────────────────

function TodayView({ onOpenCard }: { onOpenCard: (cardId: string) => void }) {
  const today = todayKey();
  const {
    data: agData,
    isPending: agPending,
    isError: agError,
    error: agErr,
    refetch: agRefetch,
  } = useAgenda({ days: 14 });

  if (agPending) {
    return (
      <div className="board-today-loading" aria-busy="true">
        <Skeleton height={32} width="40%" />
        <Skeleton height={72} />
        <Skeleton height={72} />
      </div>
    );
  }

  if (agError) {
    return (
      <QueryError
        error={agErr}
        title="Agenda didn’t load"
        onRetry={() => void agRefetch()}
      />
    );
  }

  const sections = agData ? agendaSections(agData.cards, today) : [];

  if (sections.length === 0) {
    return (
      <div className="board-today-empty">
        <EmptyState
          size="sm"
          icon={Clock}
          title="All caught up"
          body="No tasks are due today or in the next week across your boards."
        />
      </div>
    );
  }

  return (
    <div className="board-today-view">
      {sections.map((sec) => (
        <section key={sec.id} className="board-today-section">
          <h2 className="board-today-h">{sec.title} ({sec.cards.length})</h2>
          <ul role="list" className="board-today-list">
            {sec.cards.map((c) => (
              <li key={c.id} className="board-today-item">
                <button
                  type="button"
                  className="board-today-card-btn"
                  onClick={() => onOpenCard(c.id)}
                >
                  <span
                    className="board-today-dot"
                    style={{ backgroundColor: colorVar(c.boardColor) }}
                    aria-hidden="true"
                  />
                  <div className="board-today-info">
                    <span className="board-today-title">{c.title}</span>
                    <span className="board-today-meta">
                      <span>{c.boardEmoji ? `${c.boardEmoji} ` : ''}{c.boardName}</span>
                      <span>•</span>
                      <span>{formatDay(c.due, { weekday: 'short', month: 'short', year: false })}</span>
                      {c.dueTime ? <span>at {c.dueTime.slice(0, 5)}</span> : null}
                    </span>
                  </div>
                  {c.priority === 'high' ? (
                    <Badge tone="alert" size="sm">
                      High
                    </Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}


function PlanRow({
  plan,
  readOnly,
  onRemove,
}: {
  plan: BoardPlan;
  readOnly: boolean;
  onRemove: () => void;
}) {
  const total = plan.left + plan.done;
  return (
    <li className="board-plan" data-hub="board-plan-row">
      <CalendarCheck aria-hidden="true" weight="duotone" className="board-plan__icon" />
      <p className="board-plan__text">
        <strong>{plan.moduleName} revision</strong>
        <span>
          {plan.done} of {total} done. {planPace(plan)}
          {plan.left && plan.daysLeft > 0
            ? ` until the exam on ${formatDay(plan.examDate, { weekday: 'short', month: 'short', year: false })}.`
            : ''}
        </span>
      </p>
      {readOnly ? null : (
        <Button size="sm" variant="ghost" onClick={onRemove} className="board-plan__remove">
          Remove plan
        </Button>
      )}
    </li>
  );
}

function BoardSkeleton() {
  return (
    <Page width="wide" className="board-page" aria-busy="true">
      <PageHeader title="Boards" />
      <div className="board" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className="board-col">
            <Skeleton height={20} width="40%" />
            <Skeleton height={88} radius={12} />
            <Skeleton height={88} radius={12} />
          </div>
        ))}
      </div>
    </Page>
  );
}
