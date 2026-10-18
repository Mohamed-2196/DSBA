// The Daily's queries and moves. Signed in, the server keeps each play; a guest's moves live on this device
// (lib/storage.ts) and go with every request, so the server can replay and check them without keeping anything.
// Every move says which version of the day's puzzle it was made on: when an editor fixed today's puzzle since, the
// server answers 409 puzzle_fixed and the play loads again, started over on the fixed puzzle.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { todayKey } from '../../lib/dates';
import { NO_GUEST_PLAY, clearGuestPlay, guestPlay, saveGuestPlay, type GuestPlay } from './lib/storage';
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

function replayGuest(day: string, game: GameId, variant: string, kept: GuestPlay): Promise<PlayOut> {
  return call(
    api.POST('/api/v1/daily/{day}/{game}/moves', {
      params: { path: { day, game } },
      body: { variant, history: kept.moves, revision: kept.revision },
    }),
  );
}

/**
 * A guest's play as the server replayed it. Moves made on a version of today's puzzle that a fix replaced come back
 * finished as they were, or started again on the fixed puzzle: then this device forgets them, and remembers to say
 * why until the next move.
 */
function settleGuest(day: string, game: GameId, variant: string, kept: GuestPlay, out: PlayOut): PlayOut {
  if (out.play.restarted) {
    saveGuestPlay(day, game, variant, { revision: out.play.revision, moves: [], restarted: true }, todayKey());
    return out;
  }
  return kept.restarted && out.play.status === 'new' ? { ...out, play: { ...out.play, restarted: true } } : out;
}

async function fetchPlay(day: string, game: GameId, variant: string, guest: boolean): Promise<PlayOut> {
  if (!guest) {
    return call(
      api.GET('/api/v1/daily/{day}/{game}', {
        params: { path: { day, game }, query: { variant: variant || undefined } },
      }),
    );
  }
  const kept = guestPlay(day, game, variant);
  try {
    return settleGuest(day, game, variant, kept, await replayGuest(day, game, variant, kept));
  } catch (e) {
    // Moves the server can't replay: start again rather than stay stuck.
    if (kept.moves.length && isApiError(e) && (e.status === 422 || e.status === 409)) {
      clearGuestPlay(day, game, variant);
      return replayGuest(day, game, variant, NO_GUEST_PLAY);
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
  const key = dailyKeys.play(day, game, variant, guest);
  return useMutation({
    mutationFn: async (move: Move): Promise<PlayOut> => {
      const kept = guest ? guestPlay(day, game, variant) : NO_GUEST_PLAY;
      // The version of the puzzle on the screen, which a guest's moves were made on too.
      const revision = qc.getQueryData<PlayOut>(key)?.play.revision ?? kept.revision;
      const out = await call(
        api.POST('/api/v1/daily/{day}/{game}/moves', {
          params: { path: { day, game } },
          body: { variant, move, history: kept.moves, revision },
        }),
      );
      if (guest) {
        const moves = [...kept.moves, move];
        saveGuestPlay(day, game, variant, { revision: out.play.revision, moves, restarted: false }, todayKey());
      }
      return out;
    },
    onSuccess: (out) => {
      qc.setQueryData(key, out);
      void qc.invalidateQueries({ queryKey: dailyKeys.today() });
      if (out.play.status === 'won' || out.play.status === 'lost') afterFinish(qc);
    },
    onError: (e) => {
      // Finished elsewhere (another tab), or today's puzzle was fixed since it loaded: show the play as it is now.
      if (isApiError(e) && (e.code === 'game_over' || e.code === 'puzzle_fixed')) {
        void qc.invalidateQueries({ queryKey: key });
        if (e.code === 'puzzle_fixed') void qc.invalidateQueries({ queryKey: dailyKeys.today() });
      }
    },
  });
}
