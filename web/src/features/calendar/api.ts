// Calendar data from the API: queries (TanStack Query) and the moderators' mutations.
//   GET /api/v1/calendar/events      every date, filtered by from/to/year/module/type
//   GET /api/v1/calendar/upcoming    the next n dates from today (Bahrain time)
//   POST/PATCH/DELETE /api/v1/calendar/events[/id]   moderators only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiUrl, call } from '../../api/client';
import type { CohortYear } from '../../lib/modules';
import { dayKeyFromToday, sortEvents } from './queries';
import type { CalendarEvent, EventFilters, EventInput, EventPatch } from './types';

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
const STALE = 5 * 60_000;

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
      sortEvents(await call(api.GET('/api/v1/calendar/upcoming', { params: { query: { n: size, year: year ?? undefined } } }))),
    staleTime: STALE,
  });
}

/** The next exam (today or later) for a module; data is null when none is on the calendar. */
export function useNextExamForModule(moduleId: string | null | undefined) {
  const from = dayKeyFromToday();
  return useQuery({
    queryKey: [...calendarKeys.events({ moduleId: moduleId ?? null, type: 'exam', from }), 'next'] as const,
    queryFn: async () => (await fetchEvents({ moduleId, type: 'exam', from }))[0] ?? null,
    enabled: !!moduleId,
    staleTime: STALE,
  });
}

/** The iCalendar feed for a cohort (null: every cohort), as an absolute URL calendar apps can subscribe to. */
export function feedUrl(year: CohortYear | null): string {
  const path = apiUrl(year ? `/api/v1/calendar/feed.ics?year=${year}` : '/api/v1/calendar/feed.ics');
  return new URL(path, window.location.origin).href;
}

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
    mutationFn: (id: string) => call(api.DELETE('/api/v1/calendar/events/{event_id}', { params: { path: { event_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: CALENDAR_KEY }),
  });
}
