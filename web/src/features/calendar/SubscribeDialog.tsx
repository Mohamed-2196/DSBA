import { useEffect, useState } from 'react';
import { CalendarPlus, Copy, DownloadSimple } from '@phosphor-icons/react';
import { cohortLabel, normalizeYear, YEARS, type CohortYear } from '../../state';
import { Button, Modal, SegmentedControl, TextField } from '../../ui';
import { useCopyLink } from '../../lib/useCopyLink';
import { feedUrl } from './api';

export interface SubscribeDialogProps {
  open: boolean;
  /** The cohort the student browses (the default choice). */
  year: CohortYear | null;
  /** the student's papers in that year (null: all its modules) */
  papers?: ReadonlySet<string> | null;
  onClose: () => void;
}

type Choice = 'all' | `${CohortYear}`;

/**
 * Subscribe to the calendar from Google Calendar, Outlook or Apple Calendar: the feed's address
 * (/api/v1/calendar/feed.ics, one cohort or every cohort), a copy button, a webcal link for calendar
 * apps and a one-off download.
 */
export function SubscribeDialog({ open, year, papers, onClose }: SubscribeDialogProps) {
  const copyLink = useCopyLink();
  const [choice, setChoice] = useState<Choice>(year ? `${year}` : 'all');
  useEffect(() => {
    if (open) setChoice(year ? `${year}` : 'all');
  }, [open, year]);

  const chosen: CohortYear | null = choice === 'all' ? null : normalizeYear(Number(choice));
  const mine = chosen && chosen === year && papers ? papers : null;
  const url = feedUrl(chosen, mine);
  const webcal = url.replace(/^https?:/, 'webcal:');
  const fileName = chosen ? `dsba-hub-year-${chosen}${mine ? '-papers' : ''}.ics` : 'dsba-hub.ics';

  const copy = () => copyLink(url, 'Paste it into your calendar app to subscribe.');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Subscribe to the calendar"
      description="Your calendar app keeps it up to date: new and changed dates show up there by themselves."
      size="md"
      className="cal-subscribe"
      footer={
        <>
          <Button variant="ghost" leadingIcon={DownloadSimple} href={url} download={fileName} external={false}>
            Download once (.ics)
          </Button>
          <Button variant="primary" leadingIcon={CalendarPlus} href={webcal} external={false}>
            Open in my calendar app
          </Button>
        </>
      }
    >
      <div className="cal-subscribe__body" data-hub="calendar-subscribe">
        <SegmentedControl
          label="Which dates"
          size="sm"
          value={choice}
          onChange={(v) => {
            const s = String(v);
            setChoice(s === '1' || s === '2' || s === '3' ? s : 'all');
          }}
          options={[
            ...YEARS.map((y) => ({ value: `${y}`, label: cohortLabel(y) })),
            { value: 'all', label: 'All years' },
          ]}
        />
        <TextField
          label="Calendar link"
          value={url}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          trailing={
            <Button size="sm" variant="ghost" leadingIcon={Copy} onClick={() => void copy()}>
              Copy
            </Button>
          }
          hint={
            mine
              ? `Your papers’ dates, ${cohortLabel(chosen)}’s other dates and the dates for everyone. The link doesn’t say who you are.`
              : chosen
                ? `${cohortLabel(chosen)} dates and the dates for everyone.`
                : 'Every cohort’s dates.'
          }
        />
        <ul role="list" className="cal-subscribe__how">
          <li>
            <b>Google Calendar:</b> Other calendars, then <i>From URL</i>. Paste the link.
          </li>
          <li>
            <b>Outlook:</b> Add calendar, then <i>Subscribe from web</i>. Paste the link.
          </li>
          <li>
            <b>Apple Calendar:</b> use <i>Open in my calendar app</i>, or File, then <i>New Calendar Subscription</i>.
          </li>
        </ul>
        <p className="cal-subscribe__note">Each date’s notes say whether it’s confirmed, with its time and place once they’re published.</p>
      </div>
    </Modal>
  );
}
