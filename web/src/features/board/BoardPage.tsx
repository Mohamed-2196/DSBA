// Boards: a student's own boards for study and everyday tasks. Tabs switch between Today (what's due on every board)
// and each board, shown as columns or as a list; a card opens in a drawer. Only the student sees their boards.
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CaretDown,
  Columns,
  DotsThree,
  Funnel,
  Kanban,
  ListBullets,
  PencilSimple,
  Plus,
  Sun,
  Tag,
  Trash,
} from '@phosphor-icons/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AgendaCard, BoardCard, BoardColumn, BoardLabel, BoardPlan, BoardSummary } from '../../api/types';
import { useAuth } from '../../auth';
import { formatDay, todayKey } from '../../lib/dates';
import { BREAKPOINTS, useMediaQuery, useToast } from '../../state';
import {
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Menu,
  Page,
  PageHeader,
  QueryError,
  SegmentedControl,
  Skeleton,
  TabPanel,
  Tabs,
  cx,
  type MenuItem,
} from '../../ui';
import {
  useAgenda,
  useBoard,
  useBoards,
  useDeleteBoard,
  useDeleteCard,
  useDeletePlan,
  useMoveCard,
  usePlaceBoard,
  usePlaceColumn,
  useUpdateBoard,
  useUpdateColumn,
} from './api';
import {
  afterIdBefore,
  cardsIn,
  colorVar,
  doneColumn,
  DUE_FILTERS,
  isFiltering,
  isPastPaper,
  lastIn,
  matches,
  neighbourColumn,
  NO_FILTER,
  nudge,
  placeCard,
  planPace,
  storageText,
  type CardFilter,
} from './board';
import { BoardDialog } from './BoardDialog';
import { BoardStart } from './BoardStart';
import { CardDetailDrawer } from './CardDetailDrawer';
import { ColumnDialog, DeleteColumnDialog } from './ColumnDialog';
import { KanbanView, type ColumnActions, type DropPlace } from './KanbanView';
import { LabelDialog } from './LabelDialog';
import { ListView } from './ListView';
import { ScoreDialog } from './ScoreDialog';
import { usePaperScores } from './scores';
import { TODAY_DAYS, TodayView } from './TodayView';
import type { Adding, CardActions, FocusRequest } from './types';
import { useScrollEdges } from './useScrollEdges';
import './BoardPage.css';

const DESCRIPTION = 'Plan study, coursework and everyday tasks. Only you see your boards.';

const pickTablist = (el: HTMLDivElement) => el.querySelector<HTMLElement>('[role="tablist"]');

type View = 'board' | 'list' | 'today';

export default function BoardPage() {
  const { status, openSignIn } = useAuth();
  if (status === 'loading') return <BoardSkeleton />;
  if (status !== 'signed-in') {
    return (
      <Page width="wide" className="board-page">
        <PageHeader title="Boards" description={DESCRIPTION} />
        <EmptyState
          icon={Kanban}
          title="Sign in to use boards"
          body="Your boards hold study plans, coursework and to-dos, and they’re private to your student account."
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
  const suspended = me?.status === 'suspended';
  const isPhone = useMediaQuery(BREAKPOINTS.mobile);
  const navigate = useNavigate();
  const toast = useToast();
  const filterId = useId();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'list' ? 'list' : params.get('view') === 'today' ? 'today' : 'board';
  const boardParam = params.get('board');
  const cardParam = params.get('card');
  const today = todayKey();

  const boardsQuery = useBoards();
  const agenda = useAgenda({ days: TODAY_DAYS });
  const boards = useMemo(() => boardsQuery.data?.boards ?? [], [boardsQuery.data]);
  const active = boards.filter((b) => !b.archived);
  const archived = boards.filter((b) => b.archived);
  const current = (boardParam ? boards.find((b) => b.id === boardParam) : undefined) ?? active[0] ?? null;
  const detail = useBoard(view === 'today' ? null : current?.id);
  const labels = useMemo(() => boardsQuery.data?.labels ?? [], [boardsQuery.data]);
  const labelMap = useMemo(() => Object.fromEntries(labels.map((l) => [l.id, l])) as Record<string, BoardLabel>, [labels]);

  const move = useMoveCard();
  const removeCard = useDeleteCard();
  const updateBoard = useUpdateBoard();
  const placeBoard = usePlaceBoard();
  const removeBoard = useDeleteBoard();
  const placeColumn = usePlaceColumn();
  const updateColumn = useUpdateColumn();
  const removePlan = useDeletePlan();
  const [scores, setScore] = usePaperScores();
  const tabEdges = useScrollEdges<HTMLDivElement>(true, pickTablist);

  const [filter, setFilter] = useState<CardFilter>(NO_FILTER);
  const [showFilter, setShowFilter] = useState(false);
  const [boardDialog, setBoardDialog] = useState<BoardSummary | 'new' | null>(null);
  const [columnDialog, setColumnDialog] = useState<BoardColumn | 'new' | null>(null);
  const [deletingColumn, setDeletingColumn] = useState<BoardColumn | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [deletingBoard, setDeletingBoard] = useState<BoardSummary | null>(null);
  const [deletingCard, setDeletingCard] = useState<BoardCard | null>(null);
  const [unplanning, setUnplanning] = useState<BoardPlan | null>(null);
  const [scoring, setScoring] = useState<BoardCard | null>(null);
  const [phoneColumnId, setPhoneColumnId] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [said, setSaid] = useState({ text: '', n: 0 });
  // A card opened here pushed a history entry: closing it goes back, so Back doesn't open it again.
  const [openedHere, setOpenedHere] = useState(false);
  // A board made, archived or deleted here: its tab (or the next board's) takes focus once it's drawn.
  const [tabFocus, setTabFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!tabFocus) return;
    const tab = document.getElementById(`boards-tab-${tabFocus}`);
    if (!tab) return;
    tab.focus();
    setTabFocus(null);
  }, [tabFocus, boardsQuery.data]);

  /** Says what just happened to a screen reader: each message is a new node, so the same words twice are read twice. */
  const announce = (text: string) => setSaid((prev) => ({ text, n: prev.n + 1 }));

  const go = (next: { board?: string | null; view?: View; card?: string | null }, push = false) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next.board !== undefined) {
          if (next.board) p.set('board', next.board);
          else p.delete('board');
        }
        if (next.view !== undefined) {
          if (next.view === 'board') p.delete('view');
          else p.set('view', next.view);
        }
        if (next.card !== undefined) {
          if (next.card) p.set('card', next.card);
          else p.delete('card');
        }
        return p;
      },
      { replace: !push },
    );

  const openCard = (card: Pick<BoardCard, 'id'>) => {
    setOpenedHere(true);
    go({ card: card.id }, true);
  };
  const closeCard = () => {
    if (openedHere) {
      setOpenedHere(false);
      navigate(-1);
    } else go({ card: null });
  };

  if (boardsQuery.isPending) return <BoardSkeleton />;
  if (boardsQuery.isError) {
    return (
      <Page width="wide" className="board-page">
        <PageHeader title="Boards" description={DESCRIPTION} />
        <QueryError error={boardsQuery.error} title="Your boards didn’t load" onRetry={() => void boardsQuery.refetch()} retrying={boardsQuery.isFetching} />
      </Page>
    );
  }

  const names = boards.map((b) => b.name);
  const columns = current?.columns ?? [];
  const allCards = detail.data?.cards ?? [];
  const filtering = isFiltering(filter);
  const shownCards = allCards.filter((c) => matches(c, filter, today));
  const readOnly = suspended || current?.archived === true;
  const phoneColumn = columns.find((c) => c.id === phoneColumnId)?.id ?? columns[0]?.id ?? null;
  const dueNow = agenda.data ? agenda.data.cards.filter((c) => c.due <= today).length : null;

  // ── moving cards ─────────────────────────────────────────────────────────────────────────

  /** After a move, focus goes back to the card once it shows where it went, or to the column on a phone when the
   *  card left it. */
  const refocus = (card: BoardCard, columnId: string, afterId: string | null, part: 'title' | 'menu') => {
    const at = Date.now();
    if (isPhone && view === 'board' && columnId !== phoneColumn && phoneColumn) {
      setFocus({ kind: 'column', columnId: phoneColumn, at });
      return;
    }
    const placed = placeCard(allCards, columns, card.id, columnId, afterId, '').filter((c) => c.id === card.id || matches(c, filter, today));
    const there = cardsIn(placed, columnId);
    const prevId = there[there.findIndex((c) => c.id === card.id) - 1]?.id ?? null;
    setFocus({ kind: 'card', cardId: card.id, columnId, prevId, part, at });
  };

  /** A card deleted from the board: focus goes to the card that took its place (or the one above), else to its
   *  column. */
  const focusAfterRemoving = (card: BoardCard) => {
    const there = cardsIn(shownCards, card.columnId);
    const rest = there.filter((c) => c.id !== card.id);
    const i = there.findIndex((c) => c.id === card.id);
    const next = rest[i] ?? rest[i - 1];
    const at = Date.now();
    if (!next) {
      setFocus({ kind: 'column', columnId: card.columnId, at });
      return;
    }
    setFocus({ kind: 'card', cardId: next.id, columnId: next.columnId, prevId: rest[rest.indexOf(next) - 1]?.id ?? null, part: 'title', at });
  };

  const moveTo = (card: BoardCard, columnId: string, afterId: string | null) => {
    const column = columns.find((c) => c.id === columnId);
    move.mutate({ id: card.id, boardId: card.boardId, columnId, afterId });
    if (column?.done && card.doneAt == null && isPastPaper(card)) setScoring(card);
    return column;
  };

  const cardActions: CardActions = {
    readOnly,
    scores,
    onScore: setScoring,
    onOpen: openCard,
    onDelete: setDeletingCard,
    onMove: (card, columnId, part) => {
      const column = moveTo(card, columnId, null);
      announce(`Moved to ${column?.name ?? 'another column'}.`);
      refocus(card, columnId, null, part);
    },
    onNudge: (card, by, part) => {
      const after = nudge(allCards, card.id, by);
      if (after === undefined) {
        announce(by === -1 ? 'It’s already at the top.' : 'It’s already at the bottom.');
        return;
      }
      move.mutate({ id: card.id, boardId: card.boardId, columnId: card.columnId, afterId: after });
      announce(by === -1 ? 'Moved up.' : 'Moved down.');
      refocus(card, card.columnId, after, part);
    },
    canNudge: (card, by) => nudge(allCards, card.id, by) !== undefined,
    onStep: (card, by, part) => {
      const next = neighbourColumn(columns, card.columnId, by);
      if (!next) {
        announce(by === -1 ? 'It’s in the first column.' : 'It’s in the last column.');
        return;
      }
      moveTo(card, next.id, null);
      announce(`Moved to ${next.name}.`);
      refocus(card, next.id, null, part);
    },
    dragging,
    onDragStart: (card) => setDragging(card.id),
    onDragEnd: () => setDragging(null),
    focus,
    onFocused: () => setFocus(null),
  };

  const columnActions: ColumnActions = {
    onAdd: () => setColumnDialog('new'),
    onRename: setColumnDialog,
    onDelete: setDeletingColumn,
    onMove: (column, by) => {
      if (!current) return;
      const i = columns.findIndex((c) => c.id === column.id);
      const others = columns.filter((c) => c.id !== column.id);
      const to = i + by;
      if (to < 0 || to >= columns.length) return;
      placeColumn.mutate({ boardId: current.id, columnId: column.id, afterId: to === 0 ? null : (others[to - 1]?.id ?? null) });
      announce(by === -1 ? `${column.name} moved left.` : `${column.name} moved right.`);
    },
    onToggleDone: (column) => {
      if (!current) return;
      updateColumn.mutate({ boardId: current.id, columnId: column.id, patch: { done: !column.done } });
      announce(column.done ? `Cards in ${column.name} no longer count as done.` : `Cards in ${column.name} count as done.`);
    },
    onDrop: (column: BoardColumn, place: DropPlace) => {
      const card = allCards.find((c) => c.id === dragging);
      setDragging(null);
      if (!card || ('before' in place && place.before === card.id)) return;
      const afterId = 'before' in place ? afterIdBefore(allCards, card.id, column.id, place.before) : lastIn(allCards, column.id, card.id);
      const there = cardsIn(allCards, card.columnId);
      const now = there[there.findIndex((c) => c.id === card.id) - 1]?.id ?? null;
      if (card.columnId === column.id && afterId === now) return;
      moveTo(card, column.id, afterId);
      announce(card.columnId === column.id ? 'Moved.' : `Moved to ${column.name}.`);
    },
  };

  const toggleDone = (card: BoardCard | AgendaCard) => {
    const board = boards.find((b) => b.id === card.boardId);
    if (!board) return;
    const target = card.doneAt ? board.columns.find((c) => !c.done) : doneColumn(board.columns);
    if (!target) return;
    move.mutate({ id: card.id, boardId: card.boardId, columnId: target.id, afterId: null });
    announce(card.doneAt ? `Back in ${target.name}.` : `Done: moved to ${target.name}.`);
    if (!card.doneAt && isPastPaper(card)) setScoring(card);
  };

  // ── boards ───────────────────────────────────────────────────────────────────────────────

  const openBoard = (id: string) => {
    setFilter(NO_FILTER);
    setAdding(null);
    setPhoneColumnId(null);
    go({ board: id, view: view === 'today' ? 'board' : view, card: null });
  };
  /** A new board: open it, and give its tab focus. */
  const opened = (id: string) => {
    openBoard(id);
    setTabFocus(id);
  };

  const archive = (board: BoardSummary) =>
    updateBoard.mutate(
      { id: board.id, patch: { archived: true } },
      {
        onSuccess: () => {
          const next = active.find((b) => b.id !== board.id);
          go({ board: next?.id ?? null, card: null });
          setTabFocus(next?.id ?? 'today');
          toast.push({
            tone: 'success',
            title: `${board.name} is archived`,
            body: 'Its cards are kept. Find it under All boards.',
            action: { label: 'Undo', onClick: () => updateBoard.mutate({ id: board.id, patch: { archived: false } }, { onSuccess: () => go({ board: board.id }) }) },
          });
        },
      },
    );

  const moveBoard = (board: BoardSummary, by: -1 | 1) => {
    const i = active.findIndex((b) => b.id === board.id);
    const others = active.filter((b) => b.id !== board.id);
    const to = i + by;
    if (i < 0 || to < 0 || to >= active.length) return;
    placeBoard.mutate({ id: board.id, afterId: to === 0 ? null : (others[to - 1]?.id ?? null) });
    announce(by === -1 ? `${board.name} moved left.` : `${board.name} moved right.`);
  };

  const boardMenu = (board: BoardSummary): MenuItem[] => {
    const i = active.findIndex((b) => b.id === board.id);
    return [
      { id: 'edit', label: 'Edit board', icon: PencilSimple, onSelect: () => setBoardDialog(board) },
      { id: 'column', label: 'Add column', icon: Columns, onSelect: () => setColumnDialog('new') },
      { id: 'labels', label: 'Labels', icon: Tag, onSelect: () => setLabelsOpen(true) },
      { id: 'left', label: 'Move board left', icon: ArrowLeft, disabled: i <= 0, onSelect: () => moveBoard(board, -1) },
      { id: 'right', label: 'Move board right', icon: ArrowRight, disabled: i < 0 || i >= active.length - 1, onSelect: () => moveBoard(board, 1) },
      { divider: true, id: 'd' },
      { id: 'archive', label: 'Archive board', icon: Archive, onSelect: () => archive(board) },
      { id: 'delete', label: 'Delete board', icon: Trash, danger: true, onSelect: () => setDeletingBoard(board) },
    ];
  };

  const allBoardsMenu: MenuItem[] = [
    { heading: 'Boards', id: 'h1' },
    ...active.map(
      (b): MenuItem => ({
        id: b.id,
        label: <BoardName board={b} />,
        hint: current?.id === b.id && view !== 'today' ? 'Current' : b.open ? `${b.open} to do` : undefined,
        onSelect: () => openBoard(b.id),
      }),
    ),
    ...(archived.length
      ? ([{ divider: true, id: 'd' }, { heading: 'Archived', id: 'h2' }, ...archived.map((b): MenuItem => ({ id: b.id, label: <BoardName board={b} />, icon: Archive, onSelect: () => openBoard(b.id) }))] satisfies MenuItem[])
      : []),
    ...(suspended ? [] : ([{ divider: true, id: 'd3' }, { id: 'new', label: 'New board', icon: Plus, onSelect: () => setBoardDialog('new') }] satisfies MenuItem[])),
  ];

  const tabValue = view === 'today' ? 'today' : current && !current.archived ? current.id : null;
  const usage = boardsQuery.data.usage;

  const panel =
    view === 'today' ? (
      <TodayView boards={boards} readOnly={suspended} onOpen={openCard} onDone={toggleDone} />
    ) : !current ? (
      <BoardStart taken={names} readOnly={suspended} onStarted={opened} />
    ) : (
      <>
        {current.archived ? (
          <div className="board-archived" data-hub="board-archived">
            <Archive aria-hidden="true" className="board-archived__icon" />
            <p className="board-archived__text">
              <strong>{current.name} is archived.</strong> Its cards are kept but stay out of Today. Bring it back to change it.
            </p>
            {suspended ? null : (
              <div className="board-archived__actions">
                <Button leadingIcon={ArrowCounterClockwise} onClick={() => updateBoard.mutate({ id: current.id, patch: { archived: false } })} loading={updateBoard.isPending}>
                  Bring back
                </Button>
                <Button variant="ghost" leadingIcon={Trash} onClick={() => setDeletingBoard(current)}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        ) : null}

        <div className="board-toolbar" data-hub="board-toolbar">
          <SegmentedControl
            label="Show cards as"
            size="sm"
            value={view}
            onChange={(v) => go({ view: v })}
            options={[
              { value: 'board', label: 'Columns', icon: Kanban },
              { value: 'list', label: 'List', icon: ListBullets },
            ]}
          />
          <Button
            size="sm"
            variant={filtering ? 'secondary' : 'ghost'}
            leadingIcon={Funnel}
            aria-expanded={showFilter}
            aria-controls={filterId}
            onClick={() => setShowFilter((v) => !v)}
            data-hub="board-filter"
          >
            {filtering ? `Filter on` : 'Filter'}
          </Button>
          <span className="board-toolbar__end">
            {readOnly || isPhone || view !== 'board' || !columns.length ? null : (
              <Button
                size="sm"
                variant="primary"
                leadingIcon={Plus}
                onClick={() => {
                  const target = columns[0]?.id;
                  if (target) setAdding({ columnId: target, at: Date.now() });
                }}
                data-hub="board-add-card"
              >
                Add card
              </Button>
            )}
            {suspended || current.archived ? null : (
              <Menu label={`Board ${current.name}`} align="end" items={boardMenu(current)} trigger={<IconButton label="Board options" icon={DotsThree} variant="secondary" size="sm" data-hub="board-menu" />} />
            )}
          </span>
        </div>

        {showFilter ? (
          <div className="board-filter" id={filterId} role="group" aria-label="Filter cards">
            <div className="board-filter__group" role="group" aria-label="By due date">
              <span className="board-filter__label" aria-hidden="true">
                Due
              </span>
              {DUE_FILTERS.map((d) => (
                <Chip key={d.id} size="sm" selected={filter.due === d.id} onChange={() => setFilter((f) => ({ ...f, due: d.id }))}>
                  {d.label}
                </Chip>
              ))}
            </div>
            {labels.length ? (
              <div className="board-filter__group" role="group" aria-label="By label">
                <span className="board-filter__label" aria-hidden="true">
                  Labels
                </span>
                {labels.map((l) => {
                  const on = filter.labels.includes(l.id);
                  return (
                    <Chip
                      key={l.id}
                      size="sm"
                      color={colorVar(l.color)}
                      selected={on}
                      onChange={() => setFilter((f) => ({ ...f, labels: on ? f.labels.filter((id) => id !== l.id) : [...f.labels, l.id] }))}
                    >
                      {l.name}
                    </Chip>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        {filtering ? (
          <p className="board-filter__summary" role="status">
            Showing {shownCards.length} of {allCards.length} cards.{' '}
            <button type="button" className="board-filter__clear" onClick={() => setFilter(NO_FILTER)}>
              Clear the filter
            </button>
          </p>
        ) : null}

        {detail.data?.plans.length ? (
          <ul role="list" className="board-plans" aria-label="Revision plans on this board">
            {detail.data.plans.map((p) => (
              <PlanRow key={p.moduleId} plan={p} readOnly={readOnly} onRemove={() => setUnplanning(p)} />
            ))}
          </ul>
        ) : null}

        {detail.isError ? (
          <QueryError error={detail.error} title="This board didn’t load" onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
        ) : detail.isPending ? (
          <ColumnsSkeleton count={Math.min(columns.length || 3, 4)} />
        ) : view === 'list' ? (
          <ListView
            board={current}
            cards={shownCards}
            filtering={filtering}
            labels={labelMap}
            today={today}
            readOnly={readOnly}
            onOpen={openCard}
            onToggleDone={toggleDone}
            onClearFilter={() => setFilter(NO_FILTER)}
          />
        ) : (
          <KanbanView
            board={current}
            cards={shownCards}
            labels={labelMap}
            today={today}
            readOnly={readOnly}
            actions={cardActions}
            columnActions={columnActions}
            phoneColumnId={phoneColumn}
            onPhoneColumn={setPhoneColumnId}
            adding={adding}
            onAdding={(id) => {
              setAdding(id ? { columnId: id, at: Date.now() } : null);
              if (id && isPhone) setPhoneColumnId(id);
            }}
          />
        )}
      </>
    );

  return (
    <Page width="wide" className="board-page">
      <PageHeader
        title="Boards"
        description={DESCRIPTION}
        actions={
          suspended || isPhone || !boards.length ? null : (
            <Button leadingIcon={Plus} onClick={() => setBoardDialog('new')} data-hub="board-new">
              New board
            </Button>
          )
        }
      />

      {suspended ? <p className="board-page__notice">Your account is suspended, so your boards are read only.</p> : null}

      {!boards.length ? (
        <BoardStart taken={names} readOnly={suspended} onStarted={opened} />
      ) : (
        <>
          <div ref={tabEdges.ref} className={cx('board-tabs', tabEdges.start && 'has-more-start', tabEdges.end && 'has-more-end')}>
            <Tabs
              idBase="boards"
              label="Your boards"
              className="board-tabs__list"
              value={tabValue}
              onChange={(id) => (id === 'today' ? go({ view: 'today', card: null }) : openBoard(id))}
              tabs={[
                { id: 'today', label: 'Today', icon: Sun, count: dueNow || null },
                ...active.map((b) => ({ id: b.id, label: <BoardName board={b} />, count: b.open })),
              ]}
            />
            <Menu
              label="All boards"
              align="end"
              items={allBoardsMenu}
              trigger={
                <Button size="sm" variant="ghost" trailingIcon={CaretDown} className="board-tabs__all" data-hub="board-all">
                  All boards
                </Button>
              }
            />
          </div>
          {tabValue ? (
            <TabPanel idBase="boards" id={tabValue} value={tabValue} className="board-panel">
              {panel}
            </TabPanel>
          ) : (
            <section className="board-panel" aria-label={current ? `${current.name} (archived)` : 'Boards'}>
              {panel}
            </section>
          )}
        </>
      )}

      {boards.length ? (
        <p className="board-page__usage">
          <span>
            {usage.boards} of {usage.maxBoards} boards
          </span>
          <span>
            {usage.cards.toLocaleString('en-GB')} of {usage.maxCards.toLocaleString('en-GB')} cards
          </span>
          <span>{storageText(usage.storageBytes, usage.maxStorageBytes)} of files</span>
        </p>
      ) : null}

      {boardDialog ? (
        <BoardDialog board={boardDialog === 'new' ? null : boardDialog} taken={names} onClose={() => setBoardDialog(null)} onCreated={opened} />
      ) : null}
      {columnDialog && current ? <ColumnDialog boardId={current.id} column={columnDialog === 'new' ? null : columnDialog} onClose={() => setColumnDialog(null)} /> : null}
      {deletingColumn && current ? (
        <DeleteColumnDialog
          boardId={current.id}
          column={deletingColumn}
          others={columns.filter((c) => c.id !== deletingColumn.id)}
          cardCount={cardsIn(allCards, deletingColumn.id).length}
          onClose={() => setDeletingColumn(null)}
        />
      ) : null}
      {labelsOpen ? <LabelDialog labels={labels} onClose={() => setLabelsOpen(false)} /> : null}

      {cardParam ? (
        <CardDetailDrawer
          cardId={cardParam}
          boards={boards}
          labels={labels}
          readOnly={suspended}
          onClose={closeCard}
          onMoveColumn={(card, columnId) => {
            const board = boards.find((b) => b.id === card.boardId);
            const column = board?.columns.find((c) => c.id === columnId);
            move.mutate({ id: card.id, boardId: card.boardId, columnId, afterId: null });
            if (column?.done && card.doneAt == null && isPastPaper(card)) setScoring(card);
            announce(`Moved to ${column?.name ?? 'another column'}.`);
          }}
          onMoveBoard={(card, boardId) => {
            const target = boards.find((b) => b.id === boardId);
            const column = target?.columns[0];
            if (!target || !column) return;
            move.mutate(
              { id: card.id, boardId: card.boardId, toBoardId: target.id, columnId: column.id, afterId: null },
              {
                onSuccess: () => {
                  setOpenedHere(false);
                  go({ board: target.id, view: view === 'today' ? 'today' : view, card: card.id });
                  announce(`Moved to ${target.name}.`);
                },
              },
            );
          }}
          onDelete={setDeletingCard}
          onManageLabels={() => setLabelsOpen(true)}
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
        open={!!deletingCard}
        title={deletingCard ? `Delete “${deletingCard.title}”?` : ''}
        body="Its checklist, files and comments go with it. This can’t be undone."
        confirmLabel="Delete card"
        tone="danger"
        onConfirm={() => {
          if (deletingCard) {
            removeCard.mutate({ id: deletingCard.id, boardId: deletingCard.boardId });
            if (cardParam === deletingCard.id) closeCard();
            else focusAfterRemoving(deletingCard);
            announce('Card deleted.');
          }
          setDeletingCard(null);
        }}
        onClose={() => setDeletingCard(null)}
      />
      <ConfirmDialog
        open={!!deletingBoard}
        title={deletingBoard ? `Delete ${deletingBoard.name}?` : ''}
        body="Its columns, cards, files and revision plans go with it. This can’t be undone. To keep them out of the way instead, archive the board."
        confirmLabel="Delete board"
        tone="danger"
        busy={removeBoard.isPending}
        onConfirm={() => {
          const board = deletingBoard;
          if (!board) return;
          removeBoard.mutate(board.id, {
            onSuccess: () => {
              const next = active.find((b) => b.id !== board.id);
              setDeletingBoard(null);
              go({ board: next?.id ?? null, card: null });
              setTabFocus(next?.id ?? 'today');
              announce(`${board.name} deleted.`);
            },
          });
        }}
        onClose={() => setDeletingBoard(null)}
      />
      <ConfirmDialog
        open={!!unplanning}
        title={unplanning ? `Remove your ${unplanning.moduleName} revision plan?` : ''}
        body="Its cards still to do leave the board. The ones you’ve done stay."
        confirmLabel="Remove plan"
        tone="danger"
        onConfirm={() => {
          if (unplanning) removePlan.mutate(unplanning.moduleId);
          setUnplanning(null);
        }}
        onClose={() => setUnplanning(null)}
      />

      <div className="visually-hidden" role="status" aria-live="polite">
        <span key={said.n}>{said.text}</span>
      </div>
    </Page>
  );
}

/** A board's name as tabs and menus show it: its colour, its icon if it has one, its name. */
function BoardName({ board }: { board: BoardSummary }) {
  return (
    <span className="board-name">
      <span className="board-name__dot" style={{ background: colorVar(board.color) }} aria-hidden="true" />
      {board.emoji ? <span aria-hidden="true">{board.emoji}</span> : null}
      <span className="board-name__text">{board.name}</span>
    </span>
  );
}

function PlanRow({ plan, readOnly, onRemove }: { plan: BoardPlan; readOnly: boolean; onRemove: () => void }) {
  const total = plan.left + plan.done;
  return (
    <li className="board-plan" data-hub="board-plan-row">
      <CalendarCheck aria-hidden="true" weight="duotone" className="board-plan__icon" />
      <p className="board-plan__text">
        <strong>{plan.moduleName} revision</strong>
        <span>
          {plan.done} of {total} done. {planPace(plan)}
          {plan.left && plan.daysLeft > 0 ? ` until the exam on ${formatDay(plan.examDate, { weekday: 'short', month: 'short', year: false })}.` : ''}
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

function ColumnsSkeleton({ count }: { count: number }) {
  return (
    <div className={cx('board-columns', 'board-columns--loading')} aria-busy="true">
      <span className="visually-hidden">Loading the board</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="board-col" aria-hidden="true">
          <Skeleton height={18} width="45%" />
          <Skeleton height={76} radius={10} />
          <Skeleton height={76} radius={10} />
        </div>
      ))}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <Page width="wide" className="board-page" aria-busy="true">
      <PageHeader title="Boards" description={DESCRIPTION} />
      <div className="board-tabs" aria-hidden="true">
        <Skeleton height={20} width={280} />
      </div>
      <ColumnsSkeleton count={3} />
    </Page>
  );
}
