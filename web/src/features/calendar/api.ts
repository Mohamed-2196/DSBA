// Calendar data from the API: queries (TanStack Query) and the moderators' mutations.
//   GET /api/v1/calendar/events      every date, filtered by from/to/year/module/type
//   GET /api/v1/calendar/upcoming    the next n dates from today (Bahrain time)
//   GET /api/v1/calendar/feed.ics    the feed to subscribe to (a cohort, or every cohort; ?type=exam: the exams)
//   GET /api/v1/calendar/events/{id}.ics   one date, to add to a calendar
//   POST/PATCH/DELETE /api/v1/calendar/events[/id]   moderators only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiUrl, call } from '../../api/client';
import { HOME_KEY } from '../../api/keys';
import { appUrl } from '../../lib/share';
import type { CohortYear } from '../../state';
import { dayKeyFromToday, sortEvents } from './queries';
import type { CalendarPrefsUpdate, TimetablePreviewIn, TimetableSave } from '../../api/types';
import type { DayKey } from '../../lib/dates';
import type {
  CalendarEvent,
  CalendarPrefs,
  DayScope,
  EventFilters,
  EventInput,
  EventPatch,
  PersonalInput,
  PersonalPatch,
} from './types';

export const CALENDAR_KEY = ['calendar'] as const;

const clean = (f: EventFilters): EventFilters => {
  const out: EventFilters = {};
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.year) out.year = f.year;
  if (f.moduleId) out.moduleId = f.moduleId;
  if (f.type) out.type = f.type;
  return out;
};

export const calendarKeys = {
  all: CALENDAR_KEY,
  events: (f: EventFilters = {}) => [...CALENDAR_KEY, 'events', clean(f)] as const,
  upcoming: (n: number, year: CohortYear | null) => [...CALENDAR_KEY, 'upcoming', { n, year }] as const,
};

// The calendar changes a few times a term: keep what was read for five minutes.
export const STALE = 5 * 60_000;

export async function fetchEvents(filters: EventFilters = {}): Promise<CalendarEvent[]> {
  const f = clean(filters);
  const events = await call(
    api.GET('/api/v1/calendar/events', {
      params: { query: { from: f.from, to: f.to, year: f.year, module_id: f.moduleId, type: f.type } },
    }),
  );
  return sortEvents(events);
}

/** Calendar events (oldest first). No filters: every date on the calendar. */
export function useCalendarEvents(filters: EventFilters = {}, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: calendarKeys.events(filters),
    queryFn: () => fetchEvents(filters),
    staleTime: STALE,
    enabled,
  });
}

/** The next `n` dates from today (Bahrain time) for a cohort plus everyone-dates; year null → every cohort. */
export function useUpcomingEvents({ n = 5, year = null }: { n?: number; year?: CohortYear | null } = {}) {
  const size = Math.max(1, Math.min(60, Math.round(n)));
  return useQuery({
    queryKey: calendarKeys.upcoming(size, year ?? null),
    queryFn: async () =>
      sortEvents(
        await call(
          api.GET('/api/v1/calendar/upcoming', { params: { query: { limit: size, year: year ?? undefined } } }),
        ),
      ),
    staleTime: STALE,
  });
}

/** The next exam (today or later) for a module; data is null when none is on the calendar. */
export function useNextExamForModule(
  moduleId: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const from = dayKeyFromToday();
  return useQuery({
    queryKey: [...calendarKeys.events({ moduleId: moduleId ?? null, type: 'exam', from }), 'next'] as const,
    queryFn: async () => (await fetchEvents({ moduleId, type: 'exam', from }))[0] ?? null,
    enabled: enabled && !!moduleId,
    staleTime: STALE,
  });
}

/** The feed's query: a cohort, and a student's papers in it (module ids; nothing in it says who they are). */
function feedQuery(year: CohortYear | null, papers: ReadonlySet<string> | null | undefined, type?: 'exam'): string {
  const q = new URLSearchParams();
  if (type) q.set('type', type);
  if (year) q.set('year', String(year));
  if (year && papers) q.set('modules', [...papers].sort().join(','));
  const s = q.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}

/**
 * The iCalendar feed for a cohort (null: every cohort), as an absolute URL calendar apps can subscribe to. With
 * `papers`, a module's dates only for those papers.
 */
export function feedUrl(year: CohortYear | null, papers?: ReadonlySet<string> | null): string {
  return new URL(apiUrl(`/api/v1/calendar/feed.ics${feedQuery(year, papers)}`), window.location.origin).href;
}

/** The address of a date on the calendar page, to share. */
export const eventPageUrl = (e: Pick<CalendarEvent, 'id'>): string =>
  appUrl(`/calendar?event=${encodeURIComponent(e.id)}`);

/** One date as an .ics file to import ("Add to calendar"): all day, with a reminder the day before an exam or a deadline. */
export const eventIcsUrl = (id: string): string => apiUrl(`/api/v1/calendar/events/${encodeURIComponent(id)}.ics`);

/** Every exam of a cohort (and the exams for everyone; null: every cohort) as one .ics file. */
export const examsIcsUrl = (year: CohortYear | null, papers?: ReadonlySet<string> | null): string =>
  apiUrl(`/api/v1/calendar/feed.ics${feedQuery(year, papers, 'exam')}`);

// ── Moderators ─────────────────────────────────────────────────────────────────────────────────

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EventInput) => call(api.POST('/api/v1/calendar/events', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: CALENDAR_KEY }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EventPatch }) =>
      call(api.PATCH('/api/v1/calendar/events/{event_id}', { params: { path: { event_id: id } }, body: patch })),
    onSuccess: () => qc.invalidateQueries({ queryKey: CALENDAR_KEY }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/calendar/events/{event_id}', { params: { path: { event_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: CALENDAR_KEY }),
  });
}

// ── A student's own calendar ───────────────────────────────────────────────────────────────────
//   GET/POST/PATCH/DELETE /api/v1/calendar/mine/events[/id]   their events (each repeat is one event)
//   PATCH/DELETE /api/v1/calendar/mine/events/{id}/occurrences/{day}?scope=one|following
//                                                             one day of a repeat, or it and the later ones
//   GET /api/v1/calendar/mine/events/{id}.ics                 one of them to import
//   GET/PATCH /api/v1/calendar/mine/settings                  the programme dates they hide, their private feed
//   POST/DELETE /api/v1/calendar/mine/feed                    a new private feed address, or none

export const mineKeys = {
  events: [...CALENDAR_KEY, 'mine', 'events'] as const,
  settings: [...CALENDAR_KEY, 'mine', 'settings'] as const,
  plan: [...CALENDAR_KEY, 'mine', 'plan'] as const,
};

/** Saves of what a student hides: each sends whole lists, so they go one at a time, in the order they were made. */
const PREFS_SAVE = [...CALENDAR_KEY, 'mine', 'settings', 'save'] as const;

/** The signed-in student's own events; off for guests (`enabled`). Kept while the page is open. */
export function useMyEvents({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: mineKeys.events,
    queryFn: () => call(api.GET('/api/v1/calendar/mine/events')),
    enabled,
    staleTime: STALE,
  });
}

/** What the student keeps off their calendar, and their private feed. */
/** The signed-in student's plan: their boards' cards with a day of their own. Read while it shows (`enabled`), and
 *  again each time the calendar opens: the board changes it. */
export function useMyPlan({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: mineKeys.plan,
    queryFn: () => call(api.GET('/api/v1/calendar/mine/plan')),
    enabled,
    staleTime: 0,
  });
}

export function useCalendarPrefs({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: mineKeys.settings,
    queryFn: () => call(api.GET('/api/v1/calendar/mine/settings')),
    enabled,
    staleTime: STALE,
  });
}

export function useCreateMyEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonalInput) => call(api.POST('/api/v1/calendar/mine/events', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: mineKeys.events }),
  });
}

export function useUpdateMyEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PersonalPatch }) =>
      call(api.PATCH('/api/v1/calendar/mine/events/{event_id}', { params: { path: { event_id: id } }, body: patch })),
    onSuccess: () => qc.invalidateQueries({ queryKey: mineKeys.events }),
  });
}

export function useDeleteMyEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/calendar/mine/events/{event_id}', { params: { path: { event_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: mineKeys.events }),
  });
}

/** A change made from one day of a repeat (`one`: that day only; `following`: it and the later ones). The answer is
 *  the event that now holds the day. */
export function useEditMyOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, day, scope, patch }: { id: string; day: DayKey; scope: DayScope; patch: PersonalPatch }) =>
      call(
        api.PATCH('/api/v1/calendar/mine/events/{event_id}/occurrences/{day}', {
          params: { path: { event_id: id, day }, query: { scope } },
          body: patch,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: mineKeys.events }),
  });
}

/** Takes one day off a repeat (`one`), or it and the later ones (`following`). */
export function useDeleteMyOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, day, scope }: { id: string; day: DayKey; scope: DayScope }) =>
      call(
        api.DELETE('/api/v1/calendar/mine/events/{event_id}/occurrences/{day}', {
          params: { path: { event_id: id, day }, query: { scope } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: mineKeys.events }),
  });
}

/**
 * Hide or show programme dates: each list sent replaces the kept one. Shown at once. Saves go one at a time; when one
 * fails, the calendar reads back what the server kept.
 */
export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: PREFS_SAVE,
    scope: { id: PREFS_SAVE.join('.') },
    mutationFn: (body: CalendarPrefsUpdate) => call(api.PATCH('/api/v1/calendar/mine/settings', { body })),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: mineKeys.settings });
      qc.setQueryData<CalendarPrefs>(mineKeys.settings, (before) =>
        before
          ? {
              ...before,
              hiddenEvents: body.hiddenEvents ?? before.hiddenEvents,
              hiddenModules: body.hiddenModules ?? before.hiddenModules,
              hiddenTypes: body.hiddenTypes ?? before.hiddenTypes,
              showPlan: body.showPlan ?? before.showPlan,
            }
          : before,
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: mineKeys.settings }),
    onSuccess: (saved) => {
      // a later save still on its way keeps what it shows until it answers
      if (qc.isMutating({ mutationKey: PREFS_SAVE }) <= 1) qc.setQueryData(mineKeys.settings, saved);
      void qc.invalidateQueries({ queryKey: HOME_KEY }); // Home leaves out what the student hides
    },
  });
}

/** A new private feed address (the old one stops working), or `off`: none. */
export function usePrivateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'new' | 'off') =>
      call(action === 'new' ? api.POST('/api/v1/calendar/mine/feed') : api.DELETE('/api/v1/calendar/mine/feed')),
    onSuccess: (saved) =>
      qc.setQueryData<CalendarPrefs>(mineKeys.settings, (before) =>
        before ? { ...before, feedPath: saved.feedPath } : saved,
      ),
  });
}

/** The private feed's absolute address, for calendar apps. */
export const privateFeedUrl = (path: string): string =>
  new URL(apiUrl(path as `/api/v1/${string}`), window.location.origin).href;

/** One of the student's events as an .ics file to import. */
export const myEventIcsUrl = (id: string): string =>
  apiUrl(`/api/v1/calendar/mine/events/${encodeURIComponent(id)}.ics`);

/** The exam timetable as pasted, or its fixed rows: what saving each row will do (reps). Changes nothing. */
export function useTimetablePreview() {
  return useMutation({
    mutationFn: (body: TimetablePreviewIn) => call(api.POST('/api/v1/calendar/timetable/preview', { body })),
  });
}

/** Saves the timetable's rows at once (reps); the calendar is read again. */
export function useSaveTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TimetableSave) => call(api.POST('/api/v1/calendar/timetable', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: CALENDAR_KEY }),
  });
}
