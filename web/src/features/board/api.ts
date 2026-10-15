// The boards and cards from the API. Every change shows at once and queries update on settlement.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { errorMessage } from '../../api/errors';
import type {
  BoardCardCreate,
  BoardCardDetail,
  BoardCardUpdate,
  BoardCreate,
  BoardPlanCreate,
  BoardUpdate,
  ColumnCreate,
  ColumnUpdate,
  LabelCreate,
  LabelUpdate,
} from '../../api/types';
import { useToast } from '../../state';

export const BOARDS_KEY = ['boards'] as const;
export const BOARD_KEY = (id: string | null | undefined) => ['board', id] as const;
export const AGENDA_KEY = ['board-agenda'] as const;
export const LINKS_KEY = ['board-links'] as const;
export const CARD_DETAIL_KEY = (id: string | null | undefined) => ['board-card', id] as const;
const SCOPE = { id: 'board' };



export function useBoards({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: BOARDS_KEY,
    queryFn: () => call(api.GET('/api/v1/boards')),
    enabled,
    refetchOnMount: 'always',
  });
}

export function useBoard(boardId: string | null | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: BOARD_KEY(boardId),
    queryFn: () => call(api.GET('/api/v1/boards/{board_id}', { params: { path: { board_id: boardId! } } })),
    enabled: enabled && !!boardId,
    refetchOnMount: 'always',
  });
}

export function useAgenda({ days = 14, enabled = true }: { days?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...AGENDA_KEY, days],
    queryFn: () => call(api.GET('/api/v1/board-agenda', { params: { query: { days } } })),
    enabled,
    refetchOnMount: 'always',
  });
}

export function useBoardLinks({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: LINKS_KEY,
    queryFn: () => call(api.GET('/api/v1/board-links')),
    enabled,
    refetchOnMount: 'always',
  });
}

export function useCardDetail(cardId: string | null | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: CARD_DETAIL_KEY(cardId),
    queryFn: () => call(api.GET('/api/v1/board-cards/{card_id}', { params: { path: { card_id: cardId! } } })),
    enabled: enabled && !!cardId,
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: BoardCreate) => call(api.POST('/api/v1/boards', { body })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The board wasn’t created', body: errorMessage(e) }),
    onSuccess: (board) => {
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      return board;
    },
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
    },
  });
}

export function usePlaceBoard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, afterId }: { id: string; afterId: string | null }) =>
      call(api.PUT('/api/v1/boards/{board_id}/place', { params: { path: { board_id: id } }, body: { afterId } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The board wasn’t reordered', body: errorMessage(e) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
    },
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

export function useAddColumn() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ boardId, body }: { boardId: string; body: ColumnCreate }) =>
      call(api.POST('/api/v1/boards/{board_id}/columns', { params: { path: { board_id: boardId } }, body })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The column wasn’t added', body: errorMessage(e) }),
    onSuccess: (_summary, { boardId }) => {
      void qc.invalidateQueries({ queryKey: BOARD_KEY(boardId) });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
    },
  });
}

export function useUpdateColumn() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ boardId, columnId, patch }: { boardId: string; columnId: string; patch: ColumnUpdate }) =>
      call(api.PATCH('/api/v1/boards/{board_id}/columns/{column_id}', { params: { path: { board_id: boardId, column_id: columnId } }, body: patch })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The column wasn’t saved', body: errorMessage(e) }),
    onSuccess: (_summary, { boardId }) => {
      void qc.invalidateQueries({ queryKey: BOARD_KEY(boardId) });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
    },
  });
}

export function usePlaceColumn() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ boardId, columnId, afterId }: { boardId: string; columnId: string; afterId: string | null }) =>
      call(api.PUT('/api/v1/boards/{board_id}/columns/{column_id}/place', { params: { path: { board_id: boardId, column_id: columnId } }, body: { afterId } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The column wasn’t moved', body: errorMessage(e) }),
    onSuccess: (_summary, { boardId }) => {
      void qc.invalidateQueries({ queryKey: BOARD_KEY(boardId) });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
    },
  });
}

export function useDeleteColumn() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ boardId, columnId, moveTo }: { boardId: string; columnId: string; moveTo?: string | null }) =>
      call(api.DELETE('/api/v1/boards/{board_id}/columns/{column_id}', { params: { path: { board_id: boardId, column_id: columnId }, query: { moveTo: moveTo ?? undefined } } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The column wasn’t deleted', body: errorMessage(e) }),
    onSuccess: (_summary, { boardId }) => {
      void qc.invalidateQueries({ queryKey: BOARD_KEY(boardId) });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
    },
  });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: LabelCreate) => call(api.POST('/api/v1/board-labels', { body })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The label wasn’t added', body: errorMessage(e) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
    },
  });
}

export function useUpdateLabel() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LabelUpdate }) =>
      call(api.PATCH('/api/v1/board-labels/{label_id}', { params: { path: { label_id: id } }, body: patch })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The label wasn’t saved', body: errorMessage(e) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => call(api.DELETE('/api/v1/board-labels/{label_id}', { params: { path: { label_id: id } } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The label wasn’t deleted', body: errorMessage(e) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useAddCard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: (body: BoardCardCreate) => call(api.POST('/api/v1/board-cards', { body })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The card wasn’t added', body: errorMessage(e) }),
    onSuccess: (card) => {
      void qc.invalidateQueries({ queryKey: BOARD_KEY(card.boardId) });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
      void qc.invalidateQueries({ queryKey: LINKS_KEY });
      return card;
    },
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: ({ id, patch }: { id: string; patch: BoardCardUpdate }) =>
      call(api.PATCH('/api/v1/board-cards/{card_id}', { params: { path: { card_id: id } }, body: patch })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The card wasn’t saved', body: errorMessage(e) }),
    onSuccess: (card) => {
      qc.setQueryData(CARD_DETAIL_KEY(card.id), (prev: BoardCardDetail | undefined) => (prev ? { ...prev, ...card } : prev));
      void qc.invalidateQueries({ queryKey: BOARD_KEY(card.boardId) });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
      void qc.invalidateQueries({ queryKey: CARD_DETAIL_KEY(card.id) });
    },
  });
}

export function useMoveCard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: ({ id, columnId, afterId }: { id: string; columnId: string; afterId: string | null }) =>
      call(api.PUT('/api/v1/board-cards/{card_id}/place', { params: { path: { card_id: id } }, body: { columnId, afterId } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The card wasn’t moved', body: errorMessage(e) }),
    onSuccess: (card) => {
      void qc.invalidateQueries({ queryKey: BOARD_KEY(card.boardId) });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
      void qc.invalidateQueries({ queryKey: CARD_DETAIL_KEY(card.id) });
    },
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: (id: string) => call(api.DELETE('/api/v1/board-cards/{card_id}', { params: { path: { card_id: id } } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The card wasn’t deleted', body: errorMessage(e) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
      void qc.invalidateQueries({ queryKey: LINKS_KEY });
    },
  });
}

export function useAttachFile() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ cardId, uploadId }: { cardId: string; uploadId: string }) =>
      call(api.POST('/api/v1/board-cards/{card_id}/attachments', { params: { path: { card_id: cardId } }, body: { uploadId } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The file wasn’t attached', body: errorMessage(e) }),
    onSuccess: (_attachment, { cardId }) => {
      void qc.invalidateQueries({ queryKey: CARD_DETAIL_KEY(cardId) });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
    },
  });
}

export function useDetachFile() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ cardId, uploadId }: { cardId: string; uploadId: string }) =>
      call(api.DELETE('/api/v1/board-cards/{card_id}/attachments/{upload_id}', { params: { path: { card_id: cardId, upload_id: uploadId } } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The file wasn’t removed', body: errorMessage(e) }),
    onSuccess: (_res, { cardId }) => {
      void qc.invalidateQueries({ queryKey: CARD_DETAIL_KEY(cardId) });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ cardId, body }: { cardId: string; body: string }) =>
      call(api.POST('/api/v1/board-cards/{card_id}/comments', { params: { path: { card_id: cardId } }, body: { body } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The comment wasn’t added', body: errorMessage(e) }),
    onSuccess: (_comment, { cardId }) => {
      void qc.invalidateQueries({ queryKey: CARD_DETAIL_KEY(cardId) });
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ cardId, commentId }: { cardId: string; commentId: string }) =>
      call(api.DELETE('/api/v1/board-cards/{card_id}/comments/{comment_id}', { params: { path: { card_id: cardId, comment_id: commentId } } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The comment wasn’t deleted', body: errorMessage(e) }),
    onSuccess: (_res, { cardId }) => {
      void qc.invalidateQueries({ queryKey: CARD_DETAIL_KEY(cardId) });
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useMakePlan() {
  const qc = useQueryClient();
  return useMutation({
    scope: SCOPE,
    mutationFn: (body: BoardPlanCreate) => call(api.POST('/api/v1/board-plans', { body })),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
      void qc.invalidateQueries({ queryKey: LINKS_KEY });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: (moduleId: string) => call(api.DELETE('/api/v1/board-plans/{module_id}', { params: { path: { module_id: moduleId } } })),
    onError: (e) => toast.push({ tone: 'alert', title: 'The plan wasn’t removed', body: errorMessage(e) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: BOARDS_KEY });
      void qc.invalidateQueries({ queryKey: AGENDA_KEY });
      void qc.invalidateQueries({ queryKey: LINKS_KEY });
    },
  });
}
