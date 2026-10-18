// The Daily's queries and moves. Signed in, the server keeps each play; a guest's moves live on this device
// (lib/storage.ts) and go with every request, so the server can replay and check them without keeping anything.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { todayKey } from '../../lib/dates';
import { clearGuestMoves, guestMoves, saveGuestMoves } from './lib/storage';
import type { BoardPeriod, GameId, Move, PlayOut } from './types';

export const DAILY_KEY = ['daily'] as const;

export const dailyKeys = {
  today: () => [...DAILY_KEY, 'today'] as const,
  calendar: (month: string) => [...DAILY_KEY, 'calendar', month] as const,
  leaderboard: (period: BoardPeriod, year: number | null) => [...DAILY_KEY, 'leaderboard', period, year] as const,
  me: () => [...DAILY_KEY, 'me'] as const,
  play: (day: string, game: GameId, variant: string, guest: boolean) =>
    [...DAILY_KEY, 'play', day, game, variant, guest] as const,
};

/** Today's set: the theme, each game and how far you got, your points and streak. */
export function useDailyToday() {
  return useQuery({
    queryKey: dailyKeys.today(),
    queryFn: () => call(api.GET('/api/v1/daily')),
    staleTime: 30_000,
  });
}

/** A month's days with puzzles out ('YYYY-MM'), and the games you finished on each. */
export function useDailyCalendar(month: string) {
  return useQuery({
    queryKey: dailyKeys.calendar(month),
    queryFn: () => call(api.GET('/api/v1/daily/calendar', { params: { query: { month } } })),
    staleTime: 60_000,
  });
}

export function useDailyLeaderboard(period: BoardPeriod, year: number | null) {
  return useQuery({
    queryKey: dailyKeys.leaderboard(period, year),
    queryFn: () =>
      call(api.GET('/api/v1/daily/leaderboard', { params: { query: { period, year: year ?? undefined } } })),
    staleTime: 30_000,
  });
}

/** Your totals, streak, badges and leaderboard choice (signed in). */
export function useDailyMe() {
  const { me } = useAuth();
  return useQuery({
    queryKey: dailyKeys.me(),
    queryFn: () => call(api.GET('/api/v1/daily/me')),
    staleTime: 30_000,
    enabled: Boolean(me),
  });
}

export function useShowOnBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (showOnBoard: boolean) => call(api.PUT('/api/v1/daily/me', { body: { showOnBoard } })),
    onSuccess: (updated) => {
      qc.setQueryData(dailyKeys.me(), updated);
      void qc.invalidateQueries({ queryKey: [...DAILY_KEY, 'leaderboard'] });
    },
  });
}

function replayGuest(day: string, game: GameId, variant: string, history: Move[]): Promise<PlayOut> {
  return call(
    api.POST('/api/v1/daily/{day}/{game}/moves', { params: { path: { day, game } }, body: { variant, history } }),
  );
}

async function fetchPlay(day: string, game: GameId, variant: string, guest: boolean): Promise<PlayOut> {
  if (!guest) {
    return call(
      api.GET('/api/v1/daily/{day}/{game}', {
        params: { path: { day, game }, query: { variant: variant || undefined } },
      }),
    );
  }
  const history = guestMoves(day, game, variant);
  try {
    return await replayGuest(day, game, variant, history);
  } catch (e) {
    // Moves the server can't replay (made on another puzzle): start again rather than stay stuck.
    if (history.length && isApiError(e) && (e.status === 422 || e.status === 409)) {
      clearGuestMoves(day, game, variant);
      return replayGuest(day, game, variant, []);
    }
    throw e;
  }
}

/** A day's game (and Sudoku difficulty) as it stands for you. */
export function useDailyPlay(day: string, game: GameId, variant: string) {
  const { me, status } = useAuth();
  const guest = !me;
  return useQuery({
    queryKey: dailyKeys.play(day, game, variant, guest),
    queryFn: () => fetchPlay(day, game, variant, guest),
    enabled: status !== 'loading',
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** What a finished play changes besides itself. */
function afterFinish(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: dailyKeys.me() });
  void qc.invalidateQueries({ queryKey: [...DAILY_KEY, 'leaderboard'] });
  void qc.invalidateQueries({ queryKey: [...DAILY_KEY, 'calendar'] });
}

/** One move, checked by the server. Resolves with the play as it stands after it; rejects with the ApiError. */
export function useDailyMove(day: string, game: GameId, variant: string) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const guest = !me;
  return useMutation({
    mutationFn: async (move: Move): Promise<PlayOut> => {
      const history = guest ? guestMoves(day, game, variant) : [];
      const out = await call(
        api.POST('/api/v1/daily/{day}/{game}/moves', {
          params: { path: { day, game } },
          body: { variant, move, history },
        }),
      );
      if (guest) saveGuestMoves(day, game, variant, [...history, move], todayKey());
      return out;
    },
    onSuccess: (out) => {
      qc.setQueryData(dailyKeys.play(day, game, variant, guest), out);
      void qc.invalidateQueries({ queryKey: dailyKeys.today() });
      if (out.play.status === 'won' || out.play.status === 'lost') afterFinish(qc);
    },
    onError: (e) => {
      // Finished elsewhere (another tab): show the play as it is now.
      if (isApiError(e) && e.code === 'game_over')
        void qc.invalidateQueries({ queryKey: dailyKeys.play(day, game, variant, guest) });
    },
  });
}
