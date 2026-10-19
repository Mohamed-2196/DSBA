// The boards and cards from the API. Moving, changing and deleting a card show at once (the cache changes before the
// answer comes, and goes back if the API refuses); then each change reloads what it touched, and no more.
import { skipToken, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, apiUrl, call } from '../../api/client';
import { errorMessage } from '../../api/errors';
import type {
  BoardCard,
  BoardCardCreate,
  BoardCardDetail,
  BoardCardUpdate,
  BoardCreate,
  BoardDetail,
  BoardPlanCreate,
  Boards,
  BoardUpdate,
  ColumnCreate,
  ColumnUpdate,
  LabelCreate,
  LabelUpdate,
  PaperScore,
} from '../../api/types';
import { useToast } from '../../state';
import { appendCard, patchCard, placeAfter, placeCard, TODAY_DAYS } from './board';
import { scoresById, withScore } from './scores';

export const BOARDS_KEY = ['boards'] as const;
const BOARD_PREFIX = ['board'] as const;
export const BOARD_KEY = (id: string | null | undefined) => [...BOARD_PREFIX, id] as const;
export const AGENDA_KEY = ['board-agenda'] as const;
export const LINKS_KEY = ['board-links'] as const;
const SCORES_KEY = ['paper-scores'] as const;
const CARD_PREFIX = ['board-card'] as const;
export const CARD_DETAIL_KEY = (id: string | null | undefined) => [...CARD_PREFIX, id] as const;
/** Card writes go one after another, in the order they were made. */
const SCOPE = { id: 'board' };
const CARD_WRITE = ['board-card-write'] as const;

/** A card file in the browser (pictures and PDFs show; other files download), or saved under its name. */
export const boardFileHref = (uploadId: string, download = false): string =>
  apiUrl(`/api/v1/board-files/${encodeURIComponent(uploadId)}${download ? '?download=true' : ''}`);

const isApiPath = (path: string): path is `/api/v1/${string}` => path.startsWith('/api/v1/');

/** Where the browser loads a file the API names by its path (a card's cover). */
export const apiFileSrc = (path: string): string => (isApiPath(path) ? apiUrl(path) : path);

/** Numbers the cards added here until the API answers ('new-3', board.ts isUnsaved): only their ids need it, so one
 *  count for the page is enough. */
let unsavedCount = 0;

// ── reading ─────────────────────────────────────────────────────────────────────────────────

// The boards and the agenda are read again on every visit, however fresh: cards also arrive from elsewhere (a
// revision plan, "Add to my board" on another page, reminders, another device), and a board must never open on what
// it held a minute ago.

export function useBoards({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: BOARDS_KEY,
    queryFn: () => call(api.GET('/api/v1/boards')),
    enabled,
    refetchOnMount: 'always',
  });
}

export function useBoard(boardId: string | null | undefined) {
  return useQuery({
    queryKey: BOARD_KEY(boardId),
    queryFn: boardId
      ? () => call(api.GET('/api/v1/boards/{board_id}', { params: { path: { board_id: boardId } } }))
      : skipToken,
    refetchOnMount: 'always',
  });
}

/** The dated cards overdue or due in the next TODAY_DAYS days, across the active boards: the boards' Today and
 *  Home's To-do. */
export function useTodayAgenda({ enabled = true }: { enabled?: boolean } = {}) {
  const days = TODAY_DAYS;
  return useQuery({
    queryKey: [...AGENDA_KEY, days],
    queryFn: () => call(api.GET('/api/v1/board-agenda', { params: { query: { days } } })),
    enabled,
    refetchOnMount: 'always',
  });
}

/** What is on the boards, for "Add to my board" (every paper row has one, so it isn't read again on each mount; the
 *  card writes refresh it). */
export function useBoardLinks({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: LINKS_KEY,
    queryFn: () => call(api.GET('/api/v1/board-links')),
    enabled,
  });
}

export function useCardDetail(cardId: string | null | undefined) {
  return useQuery({
    queryKey: CARD_DETAIL_KEY(cardId),
    queryFn: cardId
      ? () => call(api.GET('/api/v1/board-cards/{card_id}', { params: { path: { card_id: cardId } } }))
      : skipToken,
  });
}

// ── the cache, changed before the answer comes ──────────────────────────────────────────────

type Snapshot = readonly (readonly [readonly unknown[], unknown])[];

/** Stops the reads of `keys` in flight (they would overwrite the change) and keeps what they hold, to put back. */
async function hold(qc: QueryClient, keys: readonly (readonly unknown[])[]): Promise<Snapshot> {
  await Promise.all(keys.map((queryKey) => qc.cancelQueries({ queryKey, exact: true })));
  return keys.map((queryKey) => [queryKey, qc.getQueryData(queryKey)] as const);
}

function putBack(qc: QueryClient, snapshot: Snapshot | undefined): void {
  for (const [queryKey, data] of snapshot ?? []) qc.setQueryData(queryKey, data);
}

function editBoard(qc: QueryClient, boardId: string, edit: (detail: BoardDetail) => BoardDetail): void {
  qc.setQueryData<BoardDetail>(BOARD_KEY(boardId), (prev) => (prev ? edit(prev) : prev));
}

// ── boards ──────────────────────────────────────────────────────────────────────────────────

export function useCreateBoard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: BoardCreate) => call(api.POST('/api/v1/boards', { body })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The board wasn’t made', body: errorMessage(e) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARDS_KEY }),
  });
}

export function useUpdateBoard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BoardUpdate }) =>
      call(api.PATCH('/api/v1/boards/{board_id}', { params: { path: { board_id: id } }, body: patch })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The board wasn’t saved', body: errorMessage(e) }),
    onSuccess: (_board, { id }) => {
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: BOARD_KEY(id) });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY }); // its name, colour, or leaving the agenda when archived
    },
  });
}

export function usePlaceBoard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, afterId }: { id: string; afterId: string | null }) =>
      call(api.PUT('/api/v1/boards/{board_id}/place', { params: { path: { board_id: id } }, body: { afterId } })),
    onMutate: async ({ id, afterId }) => {
      const snapshot = await hold(qc, [BOARDS_KEY]);
      qc.setQueryData<Boards>(BOARDS_KEY, (prev) =>
        prev ? { ...prev, boards: placeAfter(prev.boards, id, afterId) } : prev,
      );
      return snapshot;
    },
    onError: (e, _vars, snapshot) => {
      putBack(qc, snapshot);
      toast.push({ tone: 'alert', title: 'The board wasn’t moved', body: errorMessage(e) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: BOARDS_KEY }),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => call(api.DELETE('/api/v1/boards/{board_id}', { params: { path: { board_id: id } } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The board wasn’t deleted', body: errorMessage(e) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
      void qc.invalidateQueries({ queryKey: LINKS_KEY });
    },
  });
}

// ── columns ─────────────────────────────────────────────────────────────────────────────────

/** After a column changes: the board, the boards' summaries (columns, open counts) and, when cards became done or
 *  not done, the agenda and the hub's "On your board" buttons. */
function columnsChanged(qc: QueryClient, boardId: string, cardsChanged: boolean): void {
  void qc.invalidateQueries({ queryKey: BOARD_KEY(boardId) });
  void qc.invalidateQueries({ queryKey: BOARDS_KEY });
  if (cardsChanged) {
    void qc.invalidateQueries({ queryKey: AGENDA_KEY });
    void qc.invalidateQueries({ queryKey: LINKS_KEY });
  }
}

export function useAddColumn() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ boardId, body }: { boardId: string; body: ColumnCreate }) =>
      call(api.POST('/api/v1/boards/{board_id}/columns', { params: { path: { board_id: boardId } }, body })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The column wasn’t added', body: errorMessage(e) }),
    onSuccess: (_summary, { boardId }) => columnsChanged(qc, boardId, false),
  });
}

export function useUpdateColumn() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ boardId, columnId, patch }: { boardId: string; columnId: string; patch: ColumnUpdate }) =>
      call(
        api.PATCH('/api/v1/boards/{board_id}/columns/{column_id}', {
          params: { path: { board_id: boardId, column_id: columnId } },
          body: patch,
        }),
      ),
    onError: (e) => toast.push({ tone: 'alert', title: 'The column wasn’t saved', body: errorMessage(e) }),
    onSuccess: (_summary, { boardId, patch }) => columnsChanged(qc, boardId, patch.done != null),
  });
}

export function usePlaceColumn() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ boardId, columnId, afterId }: { boardId: string; columnId: string; afterId: string | null }) =>
      call(
        api.PUT('/api/v1/boards/{board_id}/columns/{column_id}/place', {
          params: { path: { board_id: boardId, column_id: columnId } },
          body: { afterId },
        }),
      ),
    onMutate: async ({ boardId, columnId, afterId }) => {
      const snapshot = await hold(qc, [BOARDS_KEY]);
      qc.setQueryData<Boards>(BOARDS_KEY, (prev) =>
        prev
          ? {
              ...prev,
              boards: prev.boards.map((b) =>
                b.id === boardId ? { ...b, columns: placeAfter(b.columns, columnId, afterId) } : b,
              ),
            }
          : prev,
      );
      return snapshot;
    },
    onError: (e, _vars, snapshot) => {
      putBack(qc, snapshot);
      toast.push({ tone: 'alert', title: 'The column wasn’t moved', body: errorMessage(e) });
    },
    onSettled: (_summary, _e, { boardId }) => columnsChanged(qc, boardId, false),
  });
}

export function useDeleteColumn() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ boardId, columnId, moveTo }: { boardId: string; columnId: string; moveTo?: string }) =>
      call(
        api.DELETE('/api/v1/boards/{board_id}/columns/{column_id}', {
          params: { path: { board_id: boardId, column_id: columnId }, query: { moveTo } },
        }),
      ),
    onError: (e) => toast.push({ tone: 'alert', title: 'The column wasn’t deleted', body: errorMessage(e) }),
    onSuccess: (_summary, { boardId }) => columnsChanged(qc, boardId, true),
  });
}

// ── labels ──────────────────────────────────────────────────────────────────────────────────

/** Labels are the student's own, on every board. A label's name or colour is read from the boards' summary; a
 *  label that goes leaves every card. The dialogs say what went wrong next to the field. */
export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LabelCreate) => call(api.POST('/api/v1/board-labels', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARDS_KEY }),
  });
}

export function useUpdateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LabelUpdate }) =>
      call(api.PATCH('/api/v1/board-labels/{label_id}', { params: { path: { label_id: id } }, body: patch })),
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARDS_KEY }),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/board-labels/{label_id}', { params: { path: { label_id: id } } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The label wasn’t deleted', body: errorMessage(e) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: BOARD_PREFIX });
      void qc.invalidateQueries({ queryKey: CARD_PREFIX });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
    },
  });
}

// ── cards ───────────────────────────────────────────────────────────────────────────────────

/** What the card writes still on their way touched, for each query client. A reload while another write is pending
 *  would bring back the board as it was before that write (a to-do just added, gone again), so the last write to
 *  settle reloads it all. */
const touchedBy = new WeakMap<QueryClient, Map<string, readonly unknown[]>>();

function cardWriteSettled(qc: QueryClient, keys: readonly (readonly unknown[])[]): void {
  const touched = touchedBy.get(qc) ?? new Map<string, readonly unknown[]>();
  touchedBy.set(qc, touched);
  for (const queryKey of keys) touched.set(JSON.stringify(queryKey), queryKey);
  if (qc.isMutating({ mutationKey: CARD_WRITE }) > 1) return;
  const all = [...touched.values()];
  touched.clear();
  for (const queryKey of all) void qc.invalidateQueries({ queryKey });
}

/** After a card was added, moved or deleted: its board(s), the open counts and the limits, the agenda, and the hub's
 *  "On your board" buttons. */
const cardsChanged = (...boardIds: string[]): (readonly unknown[])[] => [
  ...[...new Set(boardIds)].map((id) => BOARD_KEY(id)),
  BOARDS_KEY,
  AGENDA_KEY,
  LINKS_KEY,
];

/** Adds a card. Given its board and column, it shows at the end of the column at once (it can't be opened until
 *  the API has it), and a failure says so; from elsewhere in the hub (a link) the API picks the board, and the
 *  button that asked ("Add to my board") says what happened. */
export function useAddCard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationKey: CARD_WRITE,
    mutationFn: (body: BoardCardCreate) => call(api.POST('/api/v1/board-cards', { body })),
    onMutate: async (body) => {
      const { boardId, columnId } = body;
      if (!boardId || !columnId || !body.title) return { snapshot: undefined, tempId: null };
      const snapshot = await hold(qc, [BOARD_KEY(boardId)]);
      unsavedCount += 1;
      const tempId = `new-${unsavedCount}`;
      editBoard(qc, boardId, (detail) => {
        const column = detail.board.columns.find((c) => c.id === columnId);
        const now = new Date().toISOString();
        const card: BoardCard = {
          id: tempId,
          boardId,
          columnId,
          title: body.title ?? '',
          description: null,
          dueDate: body.dueDate ?? null,
          dueTime: null,
          remindBefore: null,
          priority: body.priority ?? 'none',
          labelIds: body.labelIds ?? [],
          checklist: [],
          link: null,
          planModuleId: null,
          planDate: null,
          coverUrl: null,
          attachmentCount: 0,
          commentCount: 0,
          createdAt: now,
          doneAt: column?.done ? now : null,
        };
        return { ...detail, cards: appendCard(detail.cards, detail.board.columns, card) };
      });
      return { snapshot, tempId };
    },
    onError: (e, body, context) => {
      putBack(qc, context?.snapshot);
      if (!body.link) toast.push({ tone: 'alert', title: 'The card wasn’t added', body: errorMessage(e) });
    },
    onSuccess: (card, _body, context) => {
      if (context?.tempId)
        editBoard(qc, card.boardId, (detail) => ({
          ...detail,
          cards: detail.cards.map((c) => (c.id === context.tempId ? card : c)),
        }));
    },
    onSettled: (card, _e, body) => {
      const boardId = card?.boardId ?? body.boardId;
      cardWriteSettled(qc, boardId ? cardsChanged(boardId) : [BOARD_PREFIX, BOARDS_KEY, AGENDA_KEY, LINKS_KEY]);
    },
  });
}

export interface CardUpdate {
  id: string;
  boardId: string;
  patch: BoardCardUpdate;
}

export function useUpdateCard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationKey: CARD_WRITE,
    mutationFn: ({ id, patch }: CardUpdate) =>
      call(api.PATCH('/api/v1/board-cards/{card_id}', { params: { path: { card_id: id } }, body: patch })),
    onMutate: async ({ id, boardId, patch }) => {
      const snapshot = await hold(qc, [BOARD_KEY(boardId), CARD_DETAIL_KEY(id)]);
      editBoard(qc, boardId, (detail) => ({
        ...detail,
        cards: detail.cards.map((c) => (c.id === id ? patchCard(c, patch) : c)),
      }));
      qc.setQueryData<BoardCardDetail>(CARD_DETAIL_KEY(id), (prev) => (prev ? patchCard(prev, patch) : prev));
      return snapshot;
    },
    onError: (e, _vars, snapshot) => {
      putBack(qc, snapshot);
      toast.push({ tone: 'alert', title: 'The card wasn’t saved', body: errorMessage(e) });
    },
    onSettled: (_card, _e, { id, boardId }) =>
      cardWriteSettled(qc, [BOARD_KEY(boardId), CARD_DETAIL_KEY(id), AGENDA_KEY]),
  });
}

export interface CardMove {
  id: string;
  /** the board the card is on now */
  boardId: string;
  /** the board it goes to, when that is another one */
  toBoardId?: string;
  columnId: string;
  afterId: string | null;
}

export function useMoveCard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationKey: CARD_WRITE,
    mutationFn: ({ id, columnId, afterId }: CardMove) =>
      call(
        api.PUT('/api/v1/board-cards/{card_id}/place', {
          params: { path: { card_id: id } },
          body: { columnId, afterId },
        }),
      ),
    onMutate: async ({ id, boardId, toBoardId, columnId, afterId }) => {
      const snapshot = await hold(qc, [BOARD_KEY(boardId)]);
      editBoard(qc, boardId, (detail) =>
        toBoardId && toBoardId !== boardId
          ? { ...detail, cards: detail.cards.filter((c) => c.id !== id) }
          : {
              ...detail,
              cards: placeCard(detail.cards, detail.board.columns, id, columnId, afterId, new Date().toISOString()),
            },
      );
      return snapshot;
    },
    onError: (e, _vars, snapshot) => {
      putBack(qc, snapshot);
      toast.push({ tone: 'alert', title: 'The card wasn’t moved', body: errorMessage(e) });
    },
    onSettled: (_card, _e, { id, boardId, toBoardId }) =>
      cardWriteSettled(qc, [...cardsChanged(boardId, toBoardId ?? boardId), CARD_DETAIL_KEY(id)]),
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationKey: CARD_WRITE,
    mutationFn: ({ id }: { id: string; boardId: string }) =>
      call(api.DELETE('/api/v1/board-cards/{card_id}', { params: { path: { card_id: id } } })),
    onMutate: async ({ id, boardId }) => {
      const snapshot = await hold(qc, [BOARD_KEY(boardId)]);
      editBoard(qc, boardId, (detail) => ({ ...detail, cards: detail.cards.filter((c) => c.id !== id) }));
      return snapshot;
    },
    onError: (e, _vars, snapshot) => {
      putBack(qc, snapshot);
      toast.push({ tone: 'alert', title: 'The card wasn’t deleted', body: errorMessage(e) });
    },
    onSuccess: (_res, { id }) => qc.removeQueries({ queryKey: CARD_DETAIL_KEY(id), exact: true }),
    onSettled: (_res, _e, { boardId }) => cardWriteSettled(qc, cardsChanged(boardId)),
  });
}

// ── files and comments on a card ────────────────────────────────────────────────────────────

interface OnCard {
  cardId: string;
  boardId: string;
}

/** After a card's files or comments changed: the card, its counts and cover on the board, and (files) the storage
 *  the student uses. */
function cardDetailChanged(qc: QueryClient, { cardId, boardId }: OnCard, files: boolean): void {
  void qc.invalidateQueries({ queryKey: CARD_DETAIL_KEY(cardId) });
  void qc.invalidateQueries({ queryKey: BOARD_KEY(boardId) });
  if (files) void qc.invalidateQueries({ queryKey: BOARDS_KEY });
}

export function useAttachFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, uploadId }: OnCard & { uploadId: string }) =>
      call(
        api.POST('/api/v1/board-cards/{card_id}/attachments', {
          params: { path: { card_id: cardId } },
          body: { uploadId },
        }),
      ),
    onSettled: (_attachment, _e, vars) => cardDetailChanged(qc, vars, true),
  });
}

export function useDetachFile() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ cardId, uploadId }: OnCard & { uploadId: string }) =>
      call(
        api.DELETE('/api/v1/board-cards/{card_id}/attachments/{upload_id}', {
          params: { path: { card_id: cardId, upload_id: uploadId } },
        }),
      ),
    onError: (e) => toast.push({ tone: 'alert', title: 'The file wasn’t removed', body: errorMessage(e) }),
    onSettled: (_res, _e, vars) => cardDetailChanged(qc, vars, true),
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ cardId, body }: OnCard & { body: string }) =>
      call(
        api.POST('/api/v1/board-cards/{card_id}/comments', { params: { path: { card_id: cardId } }, body: { body } }),
      ),
    onError: (e) => toast.push({ tone: 'alert', title: 'The comment wasn’t added', body: errorMessage(e) }),
    onSuccess: (_comment, vars) => cardDetailChanged(qc, vars, false),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ cardId, commentId }: OnCard & { commentId: string }) =>
      call(
        api.DELETE('/api/v1/board-cards/{card_id}/comments/{comment_id}', {
          params: { path: { card_id: cardId, comment_id: commentId } },
        }),
      ),
    onError: (e) => toast.push({ tone: 'alert', title: 'The comment wasn’t deleted', body: errorMessage(e) }),
    onSuccess: (_res, vars) => cardDetailChanged(qc, vars, false),
  });
}

// ── revision plans ──────────────────────────────────────────────────────────────────────────

/** A plan adds or removes cards on a board the API picks (or the one asked for): every board may change. Plans are
 *  card writes: they wait their turn, and the last write to settle reloads what they touched. */
const PLAN_CHANGES: readonly (readonly unknown[])[] = [BOARD_PREFIX, BOARDS_KEY, AGENDA_KEY, LINKS_KEY];

export function useMakePlan() {
  const qc = useQueryClient();
  return useMutation({
    scope: SCOPE,
    mutationKey: CARD_WRITE,
    mutationFn: (body: BoardPlanCreate) => call(api.POST('/api/v1/board-plans', { body })),
    onSettled: () => cardWriteSettled(qc, PLAN_CHANGES),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationKey: CARD_WRITE,
    mutationFn: (moduleId: string) =>
      call(api.DELETE('/api/v1/board-plans/{module_id}', { params: { path: { module_id: moduleId } } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The plan wasn’t removed', body: errorMessage(e) }),
    onSettled: () => cardWriteSettled(qc, PLAN_CHANGES),
  });
}

// ── practice scores ─────────────────────────────────────────────────────────────────────────

/** The student's practice scores on past papers, by library item id (only they see them). */
export function usePaperScores({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SCORES_KEY,
    queryFn: () => call(api.GET('/api/v1/paper-scores')),
    enabled,
    select: scoresById,
  });
}

/** Saves a practice score (null removes it). The board shows it at once, and goes back if the API refuses. The toasts
 *  live here, not in `mutate()`'s callbacks, so they still show when the dialog that saved has closed. */
export function useSaveScore() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ itemId, score }: { itemId: string; score: number | null }) => {
      const path = { item_id: itemId };
      return score === null
        ? call(api.DELETE('/api/v1/paper-scores/{item_id}', { params: { path } }))
        : call(api.PUT('/api/v1/paper-scores/{item_id}', { params: { path }, body: { score } }));
    },
    onMutate: async ({ itemId, score }) => {
      await qc.cancelQueries({ queryKey: SCORES_KEY });
      const before = qc.getQueryData<PaperScore[]>(SCORES_KEY);
      qc.setQueryData<PaperScore[]>(SCORES_KEY, (list) =>
        withScore(list ?? [], itemId, score, new Date().toISOString()),
      );
      return before;
    },
    onSuccess: (_data, { score }) =>
      toast.push({
        tone: 'success',
        title: score === null ? 'Score removed' : `Saved: ${score}%`,
        body: score === null ? undefined : 'It shows on the paper and in its sitting.',
      }),
    onError: (e, _vars, before) => {
      qc.setQueryData(SCORES_KEY, before);
      toast.push({ tone: 'alert', title: 'Your score wasn’t saved', body: errorMessage(e) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SCORES_KEY }),
  });
}
