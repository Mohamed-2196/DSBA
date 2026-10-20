// "Add to calendar": links to the API's .ics files (one date, or every exam of a cohort), so there is one iCalendar
// writer, on the server (code quality review CQ-5). A short note says what to do with the file.
import { cohortLabel, useToast, type CohortYear } from '../../state';
import { Button, IconButton, type ButtonSize, type ButtonVariant, type TooltipSide, Icon, glyph } from '../../ui';
import { formatLong, parseDay } from '../../lib/dates';
import { usePapers } from '../papers/public';
import { eventIcsUrl, examsIcsUrl } from './api';
import type { CalendarEvent } from './types';

// The API names the file (Content-Disposition), so the note doesn't.
function useDownloadNote() {
  const { push } = useToast();
  return (what: string) =>
    push({ tone: 'info', title: 'Downloading an .ics file', body: `Open it to add ${what} to your calendar.` });
}

export interface AddToCalendarProps {
  event: CalendarEvent;
  /** an icon button (on a card) instead of a labelled one */
  iconOnly?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  tooltipSide?: TooltipSide;
  className?: string;
}

/** One date as an .ics file: all day, with a reminder the day before an exam or a deadline. */
export function AddToCalendar({
  event,
  iconOnly = false,
  variant = 'primary',
  size = 'md',
  tooltipSide = 'bottom',
  className,
}: AddToCalendarProps) {
  const note = useDownloadNote();
  const href = eventIcsUrl(event.id);
  const onClick = () => note('the date');
  if (iconOnly) {
    return (
      <IconButton
        label={`Add ${event.title} on ${formatLong(parseDay(event.date))} to your calendar`}
        icon={<Icon glyph={glyph.calendarAdd} />}
        size={size}
        href={href}
        download
        external={false}
        tooltip
        tooltipSide={tooltipSide}
        onClick={onClick}
        className={className}
      />
    );
  }
  return (
    <Button
      variant={variant}
      size={size}
      leadingIcon={<Icon glyph={glyph.calendarAdd} />}
      href={href}
      download
      external={false}
      onClick={onClick}
      className={className}
    >
      Add to calendar
    </Button>
  );
}

/** Every exam of a cohort (null: every cohort), or of a student's papers in it, as one .ics file. */
export function AddExamsToCalendar({
  year,
  papers,
  size = 'md',
}: {
  year: CohortYear | null;
  papers?: ReadonlySet<string> | null;
  size?: ButtonSize;
}) {
  const note = useDownloadNote();
  const { home, resits } = usePapers();
  return (
    <Button
      size={size}
      leadingIcon={<Icon glyph={glyph.download} />}
      href={examsIcsUrl(year, papers, year && year === home ? resits : undefined)}
      download
      external={false}
      onClick={() => note('every exam')}
    >
      {year && papers ? 'All your exams' : year ? `All ${cohortLabel(year)} exams` : 'All exams'}
    </Button>
  );
}
