// The signed-in student's own layer on the calendar: their events and the programme dates they keep off it.
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { mineKeys, useCalendarPrefs, useMyEvents, useMyPlan, useUpdatePrefs } from './api';
import { isEventType } from './eventMeta';
import type { CalendarPrefs, PersonalEvent, PlanCard } from './types';

export type HiddenKind = 'hiddenEvents' | 'hiddenModules' | 'hiddenTypes';

export interface MyCalendar {
  /** signed in, with the calendar on: they have a calendar of their own */
  signedIn: boolean;
  events: PersonalEvent[];
  prefs: CalendarPrefs | null;
  /** their plan (their boards' dated cards): read while they show it on their calendar */
  plan: PlanCard[];
  /** whether boards are on for them: the plan comes from their boards */
  hasBoards: boolean;
  /** show their plan on their calendar and private link, or not; saved at once */
  setShowPlan: (show: boolean) => void;
  /** their events and settings are still loading */
  loading: boolean;
  /** their events or settings didn't load: the programme dates show alone until `retry` works */
  loadError: unknown;
  retry: () => void;
  retrying: boolean;
  /** hide (or show again) a programme date, every date of a module, or every date of a type; saved at once */
  setHidden: (kind: HiddenKind, value: string, hidden: boolean) => void;
  saving: boolean;
  /** the last hide or show that failed (the calendar then shows what the server kept) */
  saveError: unknown;
}

export function useMyCalendar(): MyCalendar {
  const { me, featureOn } = useAuth();
  const { push } = useToast();
  const qc = useQueryClient();
  const signedIn = !!me && featureOn('calendar');
  const hasBoards = signedIn && featureOn('board');
  const events = useMyEvents({ enabled: signedIn });
  const prefs = useCalendarPrefs({ enabled: signedIn });
  const plan = useMyPlan({ enabled: hasBoards && !!prefs.data?.showPlan });
  const update = useUpdatePrefs();
  const { mutate } = update;
  const notSaved = useCallback(
    () =>
      push({
        tone: 'alert',
        title: 'That change wasn’t saved',
        body: 'Your calendar shows what was kept. Check your connection and try again.',
      }),
    [push],
  );
  const setHidden = useCallback(
    (kind: HiddenKind, value: string, hidden: boolean) => {
      // from what the cache holds now, earlier changes still on their way included
      const current = qc.getQueryData<CalendarPrefs>(mineKeys.settings);
      if (!current) return;
      const list: string[] = current[kind];
      const next = hidden ? (list.includes(value) ? list : [...list, value]) : list.filter((v) => v !== value);
      const body = kind === 'hiddenTypes' ? { hiddenTypes: next.filter(isEventType) } : { [kind]: next };
      mutate(body, { onError: notSaved });
    },
    [qc, mutate, notSaved],
  );
  const setShowPlan = useCallback(
    (show: boolean) => mutate({ showPlan: show }, { onError: notSaved }),
    [mutate, notSaved],
  );
  const { refetch: refetchEvents } = events;
  const { refetch: refetchPrefs } = prefs;
  const retry = useCallback(() => {
    void refetchEvents();
    void refetchPrefs();
  }, [refetchEvents, refetchPrefs]);
  return {
    signedIn,
    events: events.data ?? [],
    prefs: prefs.data ?? null,
    plan: hasBoards ? (plan.data ?? []) : [],
    hasBoards,
    setShowPlan,
    loading: signedIn && (events.isPending || prefs.isPending),
    loadError: signedIn ? (events.error ?? prefs.error) : null,
    retry,
    retrying: events.isFetching || prefs.isFetching,
    setHidden,
    saving: update.isPending,
    saveError: update.error,
  };
}
