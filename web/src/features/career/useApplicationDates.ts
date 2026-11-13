// Each employer's next application date, from the careers dates on the calendar: one query for the whole board.
import { useMemo } from 'react';
import { useAuth } from '../../auth';
import { applicationLine, dayKeyFromToday, useCalendarEvents, type CalendarEvent } from '../calendar/public';

/** An employer's next application date on the calendar: the event, what its row says, and the day it closes. */
export interface ApplicationDate {
  event: CalendarEvent;
  line: string;
  closes: string;
}

/** Each employer's next application date on the calendar, by employer id (one query for the whole board). */
export function useApplicationDates(): ReadonlyMap<string, ApplicationDate> {
  const { featureOn } = useAuth();
  const today = dayKeyFromToday();
  const dates = useCalendarEvents({ type: 'careers', from: today }, { enabled: featureOn('calendar') });
  return useMemo(() => {
    const byEmployer = new Map<string, ApplicationDate>();
    for (const event of dates.data ?? []) {
      if (!event.employerId || byEmployer.has(event.employerId)) continue;
      const line = applicationLine(event, today);
      const closes = event.endDate && event.endDate > event.date ? event.endDate : event.date;
      if (line) byEmployer.set(event.employerId, { event, line, closes });
    }
    return byEmployer;
  }, [dates.data, today]);
}
