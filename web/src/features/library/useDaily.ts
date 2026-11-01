// A past question a day: the student's choice of modules and chapters (on the account, or in this browser for a
// guest), and the day's question for a module (GET /library/daily-question). daily.ts has the rules.
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api, call } from '../../api/client';
import { errorMessage } from '../../api/errors';
import type { DailyQuestion } from '../../api/types';
import { useAuth, useUpdatePreferences } from '../../auth';
import { todayKey } from '../../lib/dates';
import { useLocalStorage, useToast } from '../../state';
import { NO_CHOICE, isNoChoice, normalizeChoice, type DailyChoice } from './daily';

export const GUEST_DAILY_KEY = 'hub.dailyQuestion';

/** Whether a past question a day is on for this person: the library, past questions by topic and its own switch. */
export function useDailyOn(): boolean {
  const { featureOn } = useAuth();
  return featureOn('library') && featureOn('library.questions') && featureOn('library.daily-question');
}

/** The student's choice, and a way to save a new one (shown at once; a toast when the account didn't take it). */
export function useDailyChoice(): { choice: DailyChoice; save: (next: DailyChoice) => void } {
  const { me, status } = useAuth();
  const account = status === 'signed-in' && me ? me : null;
  const [guestRaw, setGuestRaw] = useLocalStorage<unknown>(GUEST_DAILY_KEY, null);
  const { mutate } = useUpdatePreferences();
  const { push } = useToast();
  const accountChoice = account?.preferences.dailyQuestion ?? null;
  const choice = useMemo(
    () => (account ? (accountChoice ?? NO_CHOICE) : (normalizeChoice(guestRaw) ?? NO_CHOICE)),
    [account, accountChoice, guestRaw],
  );
  const save = useCallback(
    (next: DailyChoice) => {
      const stored = isNoChoice(next) ? null : next;
      if (account) {
        mutate(
          { dailyQuestion: stored },
          {
            onError: (e) =>
              push({
                tone: 'alert',
                title: 'Your choice wasn’t saved',
                body: errorMessage(e, 'Try again in a moment.'),
              }),
          },
        );
      } else setGuestRaw(stored ?? undefined);
    },
    [account, mutate, push, setGuestRaw],
  );
  return { choice, save };
}

/** The day's question for a module from `chapters` (empty: every chapter). */
export function useDailyQuestion(
  moduleId: string | null | undefined,
  chapters: readonly string[],
  { enabled = true }: { enabled?: boolean } = {},
) {
  const list = chapters.join(',');
  const day = todayKey(new Date());
  return useQuery({
    queryKey: ['library', 'daily-question', moduleId ?? '', list, day] as const,
    queryFn: ({ signal }): Promise<DailyQuestion> =>
      call(
        api.GET('/api/v1/library/daily-question', {
          params: { query: { module_id: moduleId ?? '', chapters: list || undefined } },
          signal,
        }),
      ),
    enabled: enabled && !!moduleId,
    staleTime: 10 * 60_000,
  });
}
