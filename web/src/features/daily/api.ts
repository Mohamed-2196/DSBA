import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { useAuth } from '../../auth';
import type {
  BoardPeriod,
  DailyCalendar,
  DailyMe,
  DailyToday,
  GameId,
  Leaderboard,
  Move,
  MoveIn,
  PlayOut,
} from './types';

export const DAILY_KEY = ['daily'] as const;

export const dailyKeys = {
  all: DAILY_KEY,
  today: () => [...DAILY_KEY, 'today'] as const,
  calendar: (month: string) => [...DAILY_KEY, 'calendar', month] as const,
  leaderboard: (period: BoardPeriod, year?: number | null) => [...DAILY_KEY, 'leaderboard', period, year ?? null] as const,
  me: () => [...DAILY_KEY, 'me'] as const,
  play: (day: string, game: GameId, variant?: string, isGuest?: boolean) => [...DAILY_KEY, 'play', day, game, variant ?? '', Boolean(isGuest)] as const,
};

const STALE_TODAY = 60_000;
const STALE_BOARD = 30_000;

// ── Guest history storage ──────────────────────────────────────────────────────────

const GUEST_PREFIX = 'dsba:daily:guest:';

function guestKey(day: string, game: GameId, variant = ''): string {
  return `${GUEST_PREFIX}${day}:${game}:${variant || 'default'}`;
}

export function getGuestHistory(day: string, game: GameId, variant = ''): Move[] {
  try {
    const raw = localStorage.getItem(guestKey(day, game, variant));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Move[]) : [];
  } catch {
    return [];
  }
}

export function saveGuestHistory(day: string, game: GameId, variant: string, history: Move[]): void {
  try {
    localStorage.setItem(guestKey(day, game, variant), JSON.stringify(history));
  } catch {
    /* ignore storage quota / disabled */
  }
}

// ── API fetches ────────────────────────────────────────────────────────────────────

export async function fetchToday(): Promise<DailyToday> {
  return call(api.GET('/api/v1/daily'));
}

export function useDailyToday() {
  return useQuery({
    queryKey: dailyKeys.today(),
    queryFn: fetchToday,
    staleTime: STALE_TODAY,
  });
}

export async function fetchCalendar(month: string): Promise<DailyCalendar> {
  return call(api.GET('/api/v1/daily/calendar', { params: { query: { month } } }));
}

export function useDailyCalendar(month: string) {
  return useQuery({
    queryKey: dailyKeys.calendar(month),
    queryFn: () => fetchCalendar(month),
    staleTime: 5 * 60_000,
    enabled: Boolean(month),
  });
}

export async function fetchLeaderboard(period: BoardPeriod = 'week', year?: number | null): Promise<Leaderboard> {
  return call(
    api.GET('/api/v1/daily/leaderboard', {
      params: { query: { period, year: year ?? undefined } },
    }),
  );
}

export function useDailyLeaderboard(period: BoardPeriod = 'week', year?: number | null) {
  return useQuery({
    queryKey: dailyKeys.leaderboard(period, year),
    queryFn: () => fetchLeaderboard(period, year),
    staleTime: STALE_BOARD,
  });
}

export async function fetchDailyMe(): Promise<DailyMe> {
  return call(api.GET('/api/v1/daily/me'));
}

export function useDailyMe() {
  const { me } = useAuth();
  return useQuery({
    queryKey: dailyKeys.me(),
    queryFn: fetchDailyMe,
    staleTime: STALE_TODAY,
    enabled: Boolean(me),
  });
}

export function useUpdateDailyMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (showOnBoard: boolean) =>
      call(api.PUT('/api/v1/daily/me', { body: { showOnBoard } })),
    onSuccess: (updated) => {
      qc.setQueryData(dailyKeys.me(), updated);
      qc.invalidateQueries({ queryKey: [...DAILY_KEY, 'leaderboard'] });
    },
  });
}

export async function fetchPlay(day: string, game: GameId, variant = '', isGuest = false): Promise<PlayOut> {
  if (isGuest) {
    const history = getGuestHistory(day, game, variant);
    // Guest play: send history to reconstruct view
    return call(
      api.POST('/api/v1/daily/{day}/{game}/moves', {
        params: { path: { day, game } },
        body: { variant, history },
      }),
    );
  }
  return call(
    api.GET('/api/v1/daily/{day}/{game}', {
      params: { path: { day, game }, query: { variant: variant || undefined } },
    }),
  );
}

export function useDailyPlay(day: string, game: GameId, variant = '') {
  const { me } = useAuth();
  const isGuest = !me;
  return useQuery({
    queryKey: dailyKeys.play(day, game, variant, isGuest),
    queryFn: () => fetchPlay(day, game, variant, isGuest),
    enabled: Boolean(day && game),
    staleTime: 5_000,
  });
}

export function useDailyMove(day: string, game: GameId, variant = '') {
  const qc = useQueryClient();
  const { me } = useAuth();
  const isGuest = !me;

  return useMutation({
    mutationFn: async (move: Move) => {
      const history = isGuest ? getGuestHistory(day, game, variant) : [];
      const body: MoveIn = {
        variant,
        move,
        history,
      };
      const result = await call(
        api.POST('/api/v1/daily/{day}/{game}/moves', {
          params: { path: { day, game } },
          body,
        }),
      );
      if (isGuest) {
        saveGuestHistory(day, game, variant, [...history, move]);
      }
      return result;
    },
    onSuccess: (playOut) => {
      qc.setQueryData(dailyKeys.play(day, game, variant), playOut);
      qc.invalidateQueries({ queryKey: dailyKeys.today() });
      if (playOut.play.status === 'won' || playOut.play.status === 'lost') {
        qc.invalidateQueries({ queryKey: dailyKeys.me() });
        qc.invalidateQueries({ queryKey: [...DAILY_KEY, 'leaderboard'] });
        qc.invalidateQueries({ queryKey: [...DAILY_KEY, 'calendar'] });
      }
    },
  });
}
