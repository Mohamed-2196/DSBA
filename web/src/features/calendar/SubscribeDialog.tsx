import { useEffect, useState } from 'react';
import { CalendarPlus, Copy, DownloadSimple, Key } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import { cohortLabel, normalizeYear, useToast, YEARS, type CohortYear } from '../../state';
import { Button, ConfirmDialog, Modal, SegmentedControl, TextField } from '../../ui';
import { useCopyLink } from '../../lib/useCopyLink';
import { feedUrl, privateFeedUrl, usePrivateFeed } from './api';
import type { MyCalendar } from './useMyCalendar';

export interface SubscribeDialogProps {
  open: boolean;
  /** The cohort the student browses (the default choice). */
  year: CohortYear | null;
  /** the student's papers in that year (null: all its modules) */
  papers?: ReadonlySet<string> | null;
  /** signed in: their own calendar, as a private link, comes first */
  my?: MyCalendar;
  onClose: () => void;
}

type Choice = 'mine' | 'all' | `${CohortYear}`;

/**
 * Subscribe to the calendar from Google Calendar, Outlook or Apple Calendar. Signed in, the first choice is the
 * student's own calendar: a private link (/api/v1/feeds/calendar/<secret>.ics) with their programme dates, less
 * what they hid, and their own events. The shared feeds (/api/v1/calendar/feed.ics, one cohort or every cohort)
 * hold programme dates only. A copy button, a webcal link for calendar apps and a one-off download.
 */
export function SubscribeDialog({ open, year, papers, my, onClose }: SubscribeDialogProps) {
  const copyLink = useCopyLink();
  const { push } = useToast();
  const feed = usePrivateFeed();
  const mineFirst = !!my?.signedIn;
  const initial: Choice = mineFirst ? 'mine' : year ? `${year}` : 'all';
  const [choice, setChoice] = useState<Choice>(initial);
  /** a new link, or none: both stop the link in use, so the student confirms first */
  const [confirming, setConfirming] = useState<'new' | 'off' | null>(null);
  useEffect(() => {
    if (open) {
      setChoice(initial);
      setConfirming(null);
      feed.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh choice each time it opens
  }, [open]);

  const replaceLink = (action: 'new' | 'off') =>
    feed.mutate(action, {
      onSuccess: () => {
        setConfirming(null);
        push(
          action === 'new'
            ? {
                tone: 'success',
                title: 'New link made',
                body: 'The old one stopped working. Paste the new one into your calendar app.',
              }
            : {
                tone: 'success',
                title: 'Your link is off',
                body: 'Calendar apps that used it stop getting your dates. You can make a new link at any time.',
              },
        );
      },
    });

  const path = my?.prefs?.feedPath ?? null;
  const isMine = choice === 'mine';
  const chosen: CohortYear | null = isMine || choice === 'all' ? null : normalizeYear(Number(choice));
  const papersHere = chosen && chosen === year && papers ? papers : null;
  const url = isMine ? (path ? privateFeedUrl(path) : null) : feedUrl(chosen, papersHere);
  const webcal = url ? url.replace(/^https?:/, 'webcal:') : null;
  const fileName = isMine
    ? 'dsba-hub-my-calendar.ics'
    : chosen
      ? `dsba-hub-year-${chosen}${papersHere ? '-papers' : ''}.ics`
      : 'dsba-hub.ics';

  const copy = () =>
    url
      ? copyLink(
          url,
          isMine
            ? 'Paste it into your calendar app. Keep it to yourself: it shows your own events.'
            : 'Paste it into your calendar app to subscribe.',
        )
      : undefined;

  const hint = isMine
    ? 'Your year’s and papers’ dates, less what you hid, and your own events with their reminders. Anyone with this link sees them: keep it to yourself.'
    : papersHere
      ? `Your papers’ dates, ${cohortLabel(chosen)}’s other dates and the dates for everyone. The link doesn’t say who you are.`
      : chosen
        ? `${cohortLabel(chosen)} dates and the dates for everyone. Programme dates only.`
        : 'Every cohort’s dates. Programme dates only.';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Subscribe to the calendar"
      description="Your calendar app keeps it up to date: new and changed dates show up there by themselves."
      size="md"
      className="cal-subscribe"
      footer={
        url && webcal ? (
          <>
            <Button variant="ghost" leadingIcon={DownloadSimple} href={url} download={fileName} external={false}>
              Download once (.ics)
            </Button>
            <Button variant="primary" leadingIcon={CalendarPlus} href={webcal} external={false}>
              Open in my calendar app
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            leadingIcon={Key}
            loading={feed.isPending}
            onClick={() => feed.mutate('new')}
            data-hub="calendar-feed-new"
          >
            Make my private link
          </Button>
        )
      }
    >
      <div className="cal-subscribe__body" data-hub="calendar-subscribe">
        <SegmentedControl
          label="Which dates"
          size="sm"
          value={choice}
          onChange={(v) => {
            const s = String(v);
            setChoice(s === 'mine' || s === '1' || s === '2' || s === '3' ? s : 'all');
          }}
          options={[
            ...(mineFirst ? [{ value: 'mine', label: 'Mine' }] : []),
            ...YEARS.map((y) => ({ value: `${y}`, label: cohortLabel(y) })),
            { value: 'all', label: 'All years' },
          ]}
        />
        {url ? (
          <TextField
            label={isMine ? 'Your private calendar link' : 'Calendar link'}
            value={url}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            trailing={
              <Button size="sm" variant="ghost" leadingIcon={Copy} onClick={() => void copy()}>
                Copy
              </Button>
            }
            hint={hint}
          />
        ) : (
          <p className="cal-subscribe__lead">{hint}</p>
        )}
        {isMine && path ? (
          <div className="cal-subscribe__manage">
            <Button size="sm" variant="ghost" onClick={() => setConfirming('new')} data-hub="calendar-feed-rotate">
              Make a new link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming('off')} data-hub="calendar-feed-off">
              Turn the link off
            </Button>
            <p className="cal-subscribe__note">
              Shared it by mistake? A new link stops the old one working, wherever you pasted it.
            </p>
          </div>
        ) : null}
        {feed.isError && !confirming ? (
          <p className="cal-form__error" role="alert">
            {errorMessage(feed.error, 'Your link didn’t change. Try again.')}
          </p>
        ) : null}
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
        <p className="cal-subscribe__note">
          Each date’s notes say whether it’s confirmed, with its time and place once they’re published.
        </p>
      </div>
      <ConfirmDialog
        open={!!confirming}
        title={confirming === 'off' ? 'Turn your link off?' : 'Make a new link?'}
        body={
          <p>
            {confirming === 'off'
              ? 'Calendar apps that use your link stop getting your dates. You can make a new link at any time.'
              : 'Your current link stops working. Calendar apps that use it stop updating until you paste the new one.'}
          </p>
        }
        confirmLabel={confirming === 'off' ? 'Turn it off' : 'Make a new link'}
        tone="danger"
        busy={feed.isPending}
        error={feed.isError ? errorMessage(feed.error, 'Your link didn’t change. Try again.') : null}
        onConfirm={() => {
          if (confirming) replaceLink(confirming);
        }}
        onClose={() => {
          setConfirming(null);
          feed.reset();
        }}
      />
    </Modal>
  );
}
