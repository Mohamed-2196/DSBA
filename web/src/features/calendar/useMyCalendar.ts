// The signed-in student's own layer on the calendar: their events and the programme dates they keep off it.
import { useCallback } from 'react';
import { useAuth } from '../../auth';
import { useCalendarPrefs, useMyEvents, useUpdatePrefs } from './api';
import { isEventType } from './eventMeta';
import type { CalendarPrefs, PersonalEvent } from './types';

export type HiddenKind = 'hiddenEvents' | 'hiddenModules' | 'hiddenTypes';

export interface MyCalendar {
  /** signed in, with the calendar on: they have a calendar of their own */
  signedIn: boolean;
  events: PersonalEvent[];
  prefs: CalendarPrefs | null;
  /** their events and settings are still loading */
  loading: boolean;
  /** hide (or show again) a programme date, every date of a module, or every date of a type */
  setHidden: (kind: HiddenKind, value: string, hidden: boolean) => void;
  saving: boolean;
  /** the last hide or show that failed, put back */
  error: unknown;
}

export function useMyCalendar(): MyCalendar {
  const { me, featureOn } = useAuth();
  const signedIn = !!me && featureOn('calendar');
  const events = useMyEvents({ enabled: signedIn });
  const prefs = useCalendarPrefs({ enabled: signedIn });
  const update = useUpdatePrefs();
  const current = prefs.data;
  const { mutate } = update;
  const setHidden = useCallback(
    (kind: HiddenKind, value: string, hidden: boolean) => {
      if (!current) return;
      const list: string[] = current[kind];
      const next = hidden ? (list.includes(value) ? list : [...list, value]) : list.filter((v) => v !== value);
      if (kind === 'hiddenTypes') mutate({ hiddenTypes: next.filter(isEventType) });
      else mutate({ [kind]: next });
    },
    [current, mutate],
  );
  return {
    signedIn,
    events: events.data ?? [],
    prefs: current ?? null,
    loading: signedIn && (events.isPending || prefs.isPending),
    setHidden,
    saving: update.isPending,
    error: update.error,
  };
}
