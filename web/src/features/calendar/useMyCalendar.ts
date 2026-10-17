// The signed-in student's own layer on the calendar: their events and the programme dates they keep off it.
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { calendarKeys, fetchEvents, mineKeys, STALE, useCalendarPrefs, useMyEvents, useUpdatePrefs } from './api';
import { isEventType } from './eventMeta';
import { isHidden } from './mine';
import type { CalendarEvent, CalendarPrefs, EventFilters, PersonalEvent } from './types';

export type HiddenKind = 'hiddenEvents' | 'hiddenModules' | 'hiddenTypes';

export interface MyCalendar {
  /** signed in, with the calendar on: they have a calendar of their own */
  signedIn: boolean;
  events: PersonalEvent[];
  prefs: CalendarPrefs | null;
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
  const events = useMyEvents({ enabled: signedIn });
  const prefs = useCalendarPrefs({ enabled: signedIn });
  const update = useUpdatePrefs();
  const { mutate } = update;
  const setHidden = useCallback(
    (kind: HiddenKind, value: string, hidden: boolean) => {
      // from what the cache holds now, earlier changes still on their way included
      const current = qc.getQueryData<CalendarPrefs>(mineKeys.settings);
      if (!current) return;
      const list: string[] = current[kind];
      const next = hidden ? (list.includes(value) ? list : [...list, value]) : list.filter((v) => v !== value);
      const body = kind === 'hiddenTypes' ? { hiddenTypes: next.filter(isEventType) } : { [kind]: next };
      mutate(body, {
        onError: () => push({ tone: 'alert', title: 'That change wasn’t saved', body: 'Your calendar shows what was kept. Check your connection and try again.' }),
      });
    },
    [qc, mutate, push],
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
    loading: signedIn && (events.isPending || prefs.isPending),
    loadError: signedIn ? (events.error ?? prefs.error) : null,
    retry,
    retrying: events.isFetching || prefs.isFetching,
    setHidden,
    saving: update.isPending,
    saveError: update.error,
  };
}

/**
 * Programme dates on the signed-in student's own calendar: `useCalendarEvents` less the dates, modules and types
 * they hid (a guest's: every date). It waits for their settings, so a hidden date never shows for a moment; when
 * the settings don't load, every date shows.
 */
export function useMyCalendarEvents(filters: EventFilters = {}, { enabled = true }: { enabled?: boolean } = {}) {
  const { me, featureOn } = useAuth();
  const signedIn = !!me && featureOn('calendar');
  const prefs = useCalendarPrefs({ enabled: signedIn && enabled });
  const hidden = prefs.data ?? null;
  const settled = !signedIn || prefs.isSuccess || prefs.isError;
  const select = useCallback((events: CalendarEvent[]) => (hidden ? events.filter((e) => !isHidden(e, hidden)) : events), [hidden]);
  return useQuery({
    queryKey: calendarKeys.events(filters),
    queryFn: () => fetchEvents(filters),
    staleTime: STALE,
    enabled: enabled && settled,
    select,
  });
}
