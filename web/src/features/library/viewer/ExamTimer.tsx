// "Time me": sit a past paper against the clock in the paper's own page. Any duration (1, 2 or 3 hours, or hours and
// minutes of your own), pause and resume. The clock runs on timestamps, kept in this browser, so it keeps time while
// the tab is hidden, the phone sleeps or the page reloads; when time is up it says so in the page and the tab's title,
// vibrates, plays a short tone and, if allowed, shows a notification.
import { Pause, Play, Timer, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryItem } from '../../../api/types';
import { removeStored, useLocalStorage } from '../../../state';
import { Button, IconButton, Modal, SegmentedControl, TextField } from '../../../ui';
import { itemPath } from '../api';
import {
  cleanClock,
  clockLabel,
  clockLeft,
  clockPause,
  clockResume,
  clockStart,
  durationLabel,
  parseDuration,
  type ExamClock,
} from '../papers';

const PRESETS = [1, 2, 3] as const;
type Preset = `${(typeof PRESETS)[number]}` | 'custom';

const clockKey = (itemId: string) => `hub.timeMe.${itemId}`;

// eslint-disable-next-line react-refresh/only-export-components
export function useExamClock(itemId: string) {
  const key = clockKey(itemId);
  const [raw, setRaw] = useLocalStorage<unknown>(key, null);
  const clock = cleanClock(raw, Date.now());
  const start = useCallback((total: number) => setRaw(clockStart(total, Date.now())), [setRaw]);
  const pause = useCallback(
    () =>
      setRaw((c: unknown) => {
        const v = cleanClock(c, Date.now());
        return v ? clockPause(v, Date.now()) : null;
      }),
    [setRaw],
  );
  const resume = useCallback(
    () =>
      setRaw((c: unknown) => {
        const v = cleanClock(c, Date.now());
        return v ? clockResume(v, Date.now()) : null;
      }),
    [setRaw],
  );
  const stop = useCallback(() => removeStored(key), [key]);
  return { clock, start, pause, resume, stop };
}

/** The toolbar's button. */
export function TimeMeButton({ onClick, compact }: { onClick: () => void; compact: boolean }) {
  return compact ? (
    <IconButton label="Time me" icon={Timer} onClick={onClick} data-hub="time-me" />
  ) : (
    <Button leadingIcon={Timer} onClick={onClick} data-hub="time-me">
      Time me
    </Button>
  );
}

/** Pick how long: 1, 2 or 3 hours, or any hours and minutes. */
export function TimeMeDialog({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (ms: number) => void;
}) {
  const [preset, setPreset] = useState<Preset>('2');
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const ms = preset === 'custom' ? parseDuration(hours, minutes) : Number(preset) * 3600_000;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ms === null) {
      setError('Pick from 1 minute to 12 hours: whole hours, and minutes from 0 to 59.');
      return;
    }
    // Asked now, while the student is clicking: browsers allow the question only then.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default')
      void Notification.requestPermission().catch(() => undefined);
    onStart(ms);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Time me"
      description="Sit the paper as in the exam. The clock keeps going if you switch tabs or lock your phone, and tells you when time’s up."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="time-me-form" leadingIcon={Timer} data-hub="time-me-start">
            {ms !== null ? `Start ${durationLabel(ms)}` : 'Start'}
          </Button>
        </>
      }
    >
      <form id="time-me-form" className="lib-timeme" onSubmit={submit} noValidate>
        <SegmentedControl<Preset>
          label="How long"
          value={preset}
          onChange={(v) => {
            setPreset(v);
            setError(null);
          }}
          fullWidth
          options={[
            ...PRESETS.map((h) => ({
              value: `${h}` as Preset,
              label: `${h} h`,
              ariaLabel: h === 1 ? '1 hour' : `${h} hours`,
            })),
            { value: 'custom', label: 'Other' },
          ]}
        />
        {preset === 'custom' ? (
          <div className="lib-timeme__custom">
            <TextField
              label="Hours"
              inputMode="numeric"
              value={hours}
              onChange={(e) => setHours(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
            <TextField
              label="Minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          </div>
        ) : null}
        {error ? (
          <p className="lib-timeme__error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="lib-timeme__note">Most papers are 2 or 3 hours: the front page says how long yours is.</p>
      </form>
    </Modal>
  );
}

/** What happens once when time is up: the tone, the buzz and the notification. */
function announce(title: string) {
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* not on this device */
  }
  try {
    const Ctx = window.AudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.3);
    });
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* no sound here */
  }
  try {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      document.visibilityState !== 'visible'
    ) {
      new Notification('Time’s up', { body: title, tag: 'hub-time-me' });
    }
  } catch {
    /* notifications need a service worker on this browser */
  }
}

/** The countdown under the toolbar: pause and resume, stop, and the report once time is up. */
export function ExamTimer({
  item,
  clock,
  report,
  onPause,
  onResume,
  onStop,
}: {
  item: LibraryItem;
  clock: ExamClock;
  report: LibraryItem | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const left = clockLeft(clock, now);
  const done = left <= 0;
  const paused = clock.endsAt === null && !done;
  const announced = useRef(false);

  // Tick each second while running; jump straight to the end when the tab comes back (timers sleep in hidden tabs).
  useEffect(() => {
    if (done || paused) return undefined;
    const tick = () => setNow(Date.now());
    const t = window.setInterval(tick, 1000);
    const end =
      clock.endsAt !== null ? window.setTimeout(tick, Math.max(0, clock.endsAt - Date.now()) + 50) : undefined;
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(end);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [done, paused, clock.endsAt]);

  // The tab's title shows the clock, then "Time's up", and goes back as it was when the timer closes.
  useEffect(() => {
    const before = document.title;
    return () => {
      document.title = before;
    };
  }, []);
  useEffect(() => {
    document.title = done
      ? `Time’s up · ${item.title}`
      : `${clockLabel(left)}${paused ? ' paused' : ''} · ${item.title}`;
  }, [done, left, paused, item.title]);

  useEffect(() => {
    if (!done || announced.current) return;
    announced.current = true;
    // A clock that ran out long ago (the page was closed) doesn't ring again.
    if (clock.endsAt !== null && Date.now() - clock.endsAt < 60_000) announce(item.title);
  }, [done, clock.endsAt, item.title]);

  return (
    <div
      className={done ? 'lib-timer is-done' : 'lib-timer'}
      role={done ? 'alert' : 'timer'}
      aria-live={done ? 'assertive' : 'off'}
      data-hub="exam-timer"
    >
      <Timer aria-hidden="true" weight="duotone" className="lib-timer__icon" />
      {done ? (
        <p className="lib-timer__text">
          <strong>Time’s up.</strong>{' '}
          {report ? (
            <>
              Put your pen down and check your answers against <Link to={itemPath(report)}>the examiners’ report</Link>.
            </>
          ) : (
            'Put your pen down and check your answers.'
          )}
        </p>
      ) : (
        <p className="lib-timer__text">
          <strong className="lib-timer__clock u-tabular" aria-label={`${clockLabel(left)} left`}>
            {clockLabel(left)}
          </strong>{' '}
          <span className="lib-timer__of">
            {paused ? 'paused' : 'left'} of {durationLabel(clock.total)}
          </span>
        </p>
      )}
      {!done ? (
        paused ? (
          <Button size="sm" leadingIcon={Play} onClick={onResume} data-hub="time-me-resume">
            Resume
          </Button>
        ) : (
          <Button size="sm" variant="ghost" leadingIcon={Pause} onClick={onPause} data-hub="time-me-pause">
            Pause
          </Button>
        )
      ) : null}
      <IconButton label={done ? 'Close' : 'Stop the timer'} icon={X} size="sm" onClick={onStop} />
    </div>
  );
}
