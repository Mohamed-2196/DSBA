// The study board from the API. Every change shows at once and is rolled back if the API refuses it.
//   GET    /api/v1/board                       every card, To do first, each column in order
//   POST   /api/v1/board/cards                 a card at the end of its column (or from a hub link)
//   PATCH  /api/v1/board/cards/{id}            title, note, due date
//   PUT    /api/v1/board/cards/{id}/place      a column, after a card or at the top
//   DELETE /api/v1/board/cards/{id}
// Writes share one mutation scope, so they reach the API in the order they were made.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { errorMessage } from '../../api/errors';
import type { Board, BoardCard, BoardCardCreate, BoardCardUpdate } from '../../api/types';
import { useToast } from '../../state';
import { appendCard, placeCard, type Column } from './board';

export const BOARD_KEY = ['board'] as const;
const SCOPE = { id: 'board' };

/** A card added here that the API hasn't saved yet. */
export const isUnsaved = (card: Pick<BoardCard, 'id'>): boolean => card.id.startsWith('unsaved-');

export function useBoard({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => call(api.GET('/api/v1/board')),
    enabled,
    // Watching a lesson elsewhere can move a card: read it again whenever the board opens.
    refetchOnMount: 'always',
  });
}

async function edit(qc: QueryClient, change: (cards: BoardCard[]) => BoardCard[]): Promise<{ before: Board | undefined }> {
  await qc.cancelQueries({ queryKey: BOARD_KEY });
  const before = qc.getQueryData<Board>(BOARD_KEY);
  if (before) qc.setQueryData<Board>(BOARD_KEY, { ...before, cards: change(before.cards) });
  return { before };
}

function rollback(qc: QueryClient, ctx: { before: Board | undefined } | undefined) {
  if (ctx?.before) qc.setQueryData(BOARD_KEY, ctx.before);
}

/** Rolls the board back and says why, wherever the change was made (the dialog that made it may be gone). */
function useFailure(title: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return (e: unknown, ctx: { before: Board | undefined } | undefined) => {
    rollback(qc, ctx);
    toast.push({ tone: 'alert', title, body: errorMessage(e) });
  };
}

const replaceCard = (qc: QueryClient, id: string, card: BoardCard) =>
  qc.setQueryData<Board>(BOARD_KEY, (b) => (b ? { ...b, cards: b.cards.map((c) => (c.id === id ? card : c)) } : b));

export function useAddCard() {
  const qc = useQueryClient();
  const failed = useFailure('The card wasn’t added');
  return useMutation({
    scope: SCOPE,
    mutationFn: (body: BoardCardCreate) => call(api.POST('/api/v1/board/cards', { body })),
    onMutate: async (body) => {
      const now = new Date().toISOString();
      const temp: BoardCard = {
        id: `unsaved-${now}-${Math.random().toString(36).slice(2)}`,
        column: body.column ?? 'todo',
        title: body.title ?? '',
        note: body.note ?? null,
        dueDate: body.dueDate ?? null,
        link: null,
        createdAt: now,
        doneAt: body.column === 'done' ? now : null,
      };
      // A card from the hub waits for its title and place from the API; one written here shows at once.
      const ctx = body.link ? await edit(qc, (cards) => cards) : await edit(qc, (cards) => appendCard(cards, temp));
      return { ...ctx, tempId: temp.id };
    },
    onError: (e, body, ctx) => {
      if (body.link) rollback(qc, ctx); // the hub's button says why itself
      else failed(e, ctx);
    },
    onSuccess: (card, _v, ctx) =>
      qc.setQueryData<Board>(BOARD_KEY, (b) => {
        if (!b) return b;
        const saved = b.cards.some((c) => c.id === ctx.tempId) ? b.cards.map((c) => (c.id === ctx.tempId ? card : c)) : null;
        return { ...b, cards: saved ?? appendCard(b.cards, card) };
      }),
    onSettled: (_d, _e, body) => {
      // A card from the hub lands where the API put it (a watched lesson goes to Done).
      if (body.link) void qc.invalidateQueries({ queryKey: BOARD_KEY });
    },
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  const failed = useFailure('The card wasn’t saved');
  return useMutation({
    scope: SCOPE,
    mutationFn: ({ id, patch }: { id: string; patch: BoardCardUpdate }) =>
      call(api.PATCH('/api/v1/board/cards/{card_id}', { params: { path: { card_id: id } }, body: patch })),
    onMutate: ({ id, patch }) =>
      edit(qc, (cards) =>
        cards.map((c) =>
          c.id === id
            ? {
                ...c,
                title: patch.title ?? c.title,
                note: 'note' in patch ? (patch.note ?? null) : c.note,
                dueDate: 'dueDate' in patch ? (patch.dueDate ?? null) : c.dueDate,
              }
            : c,
        ),
      ),
    onError: (e, _v, ctx) => failed(e, ctx),
    onSuccess: (card, { id }) => replaceCard(qc, id, card),
  });
}

export function useMoveCard() {
  const qc = useQueryClient();
  const failed = useFailure('The card wasn’t moved');
  return useMutation({
    scope: SCOPE,
    mutationFn: ({ id, column, afterId }: { id: string; column: Column; afterId: string | null }) =>
      call(api.PUT('/api/v1/board/cards/{card_id}/place', { params: { path: { card_id: id } }, body: { column, afterId } })),
    onMutate: ({ id, column, afterId }) => edit(qc, (cards) => placeCard(cards, id, column, afterId, new Date().toISOString())),
    onError: (e, _v, ctx) => {
      failed(e, ctx);
      void qc.invalidateQueries({ queryKey: BOARD_KEY });
    },
    onSuccess: (card, { id }) => replaceCard(qc, id, card),
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  const failed = useFailure('The card wasn’t deleted');
  return useMutation({
    scope: SCOPE,
    mutationFn: (id: string) => call(api.DELETE('/api/v1/board/cards/{card_id}', { params: { path: { card_id: id } } })),
    onMutate: (id) => edit(qc, (cards) => cards.filter((c) => c.id !== id)),
    onError: (e, _v, ctx) => failed(e, ctx),
  });
}
