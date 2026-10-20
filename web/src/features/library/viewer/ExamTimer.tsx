// "Time me": sit a past paper against the clock. Any duration (1, 2 or 3 hours, or hours and minutes of your own),
// pause and resume. One paper is timed at a time, kept in this browser (timeMe.ts), so the clock follows the student:
// a bar under the paper's toolbar on its page, and a small floating timer everywhere else in the Hub, the notebook
// included. The clock runs on timestamps, so it keeps time while the tab is hidden, the phone sleeps or the page
// reloads; when time is up it says so in the page and the tab's title, vibrates, plays a short tone and, if allowed,
// shows a notification. Ending an attempt is deliberate (ST-67): it asks "End this attempt?" first, then "How did it
// go?" to keep the score; skipping the score keeps the stopped clock, which Resume carries on. On a phone the floating
// timer has no end control at all, so a thumb reaching for the tab bar can't end a mock: it ends on the paper's page.
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LibraryItem } from '../../../api/types';
import { useAuth } from '../../../auth';
import { BREAKPOINTS, useLocalStorage, useMediaQuery } from '../../../state';
import { Button, ConfirmDialog, Icon, IconButton, Modal, SegmentedControl, TextField, cx, glyph } from '../../../ui';
import { PaperScoreDialog } from '../../board/public';
import { itemPath } from '../api';
import { clockLabel, clockLeft, clockStart, durationLabel, parseDuration } from '../papers';
import {
  cleanTimer,
  closeAsksFirst,
  elapsedLabel,
  endTimer,
  pauseTimer,
  resumeTimer,
  TIME_ME_KEY,
  timedPaperPath,
  timerPhase,
  type RunningTimer,
  type TimedPaper,
} from '../timeMe';
import './TimerPill.css';

const PRESETS = [1, 2, 3] as const;
type Preset = `${(typeof PRESETS)[number]}` | 'custom';

/** The paper being timed, and the clock's controls. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTimeMe() {
  const [raw, setRaw] = useLocalStorage<unknown>(TIME_ME_KEY, null);
  const timer = cleanTimer(raw, Date.now());
  const update = useCallback(
    (change: (t: RunningTimer, now: number) => RunningTimer) =>
      setRaw((prev: unknown) => {
        const t = cleanTimer(prev, Date.now());
        return t ? change(t, Date.now()) : undefined;
      }),
    [setRaw],
  );
  const start = useCallback(
    (paper: TimedPaper, total: number) =>
      setRaw({ paper, clock: clockStart(total, Date.now()), ended: false } satisfies RunningTimer),
    [setRaw],
  );
  const pause = useCallback(() => update(pauseTimer), [update]);
  const resume = useCallback(() => update(resumeTimer), [update]);
  const end = useCallback(() => update(endTimer), [update]);
  const stop = useCallback(() => setRaw(undefined), [setRaw]);
  return { timer, start, pause, resume, end, stop };
}

/** The paper as the timer keeps it. */
// eslint-disable-next-line react-refresh/only-export-components
export const timedPaper = (item: LibraryItem, title: string): TimedPaper => ({
  id: item.id,
  slug: item.slug,
  title,
  moduleId: item.moduleId ?? null,
});

/** The toolbar's button. */
export function TimeMeButton({ onClick, compact }: { onClick: () => void; compact: boolean }) {
  return compact ? (
    <IconButton label="Time me" icon={<Icon glyph={glyph.timer} />} onClick={onClick} data-hub="time-me" />
  ) : (
    <Button leadingIcon={<Icon glyph={glyph.timer} />} onClick={onClick} data-hub="time-me">
      Time me
    </Button>
  );
}

/** Pick how long: 1, 2 or 3 hours, or any hours and minutes. `replacing` names a paper already being timed. */
export function TimeMeDialog({
  open,
  onClose,
  onStart,
  replacing = null,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (ms: number) => void;
  replacing?: string | null;
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
      description="Sit the paper as in the exam. The clock stays with you around the Hub, keeps going if you lock your phone, and tells you when time’s up."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="time-me-form"
            leadingIcon={<Icon glyph={glyph.timer} />}
            data-hub="time-me-start"
          >
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
        {replacing ? <p className="lib-timeme__note">This stops the clock on {replacing}.</p> : null}
        <p className="lib-timeme__note">The paper’s front page says how long it is: most are 2 or 3 hours.</p>
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

/**
 * The clock as it stands: what's left, done or paused. Ticks each second while running, and jumps straight to the
 * end when the tab comes back (timers sleep in hidden tabs). Rings once when time runs out, and shows the clock in
 * the tab's title (only one clock is ever on screen: the paper's bar, or the floating timer elsewhere).
 */
function useClock(timer: RunningTimer) {
  const { clock, paper } = timer;
  const [now, setNow] = useState(() => Date.now());
  const left = clockLeft(clock, now);
  const phase = timerPhase(timer, now);
  const done = phase === 'done';
  const ended = phase === 'ended';
  const paused = phase === 'paused' || ended;
  const announced = useRef(false);

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

  // A resumed clock reads the time at once rather than on the next tick.
  useEffect(() => {
    setNow(Date.now());
  }, [clock.endsAt, clock.pausedLeft]);

  // The tab's title shows the clock, then "Time's up", and goes back as it was when the clock closes.
  useEffect(() => {
    const before = document.title;
    return () => {
      document.title = before;
    };
  }, []);
  useEffect(() => {
    document.title = done
      ? `Time’s up · ${paper.title}`
      : `${clockLabel(left)}${ended ? ' ended' : paused ? ' paused' : ''} · ${paper.title}`;
  }, [done, ended, left, paused, paper.title]);

  useEffect(() => {
    if (!done || announced.current) return;
    announced.current = true;
    // A clock that ran out long ago (the page was closed) doesn't ring again.
    if (clock.endsAt !== null && Date.now() - clock.endsAt < 60_000) announce(paper.title);
  }, [done, clock.endsAt, paper.title]);

  return { left, done, paused, ended };
}

/** Whether "How did it go?" can keep a score: signed in, with the board on (practice scores live there). */
function useKeepsScores(): boolean {
  const { status, featureOn } = useAuth();
  return status === 'signed-in' && featureOn('board');
}

/**
 * Ending an attempt, deliberately (ST-67). `close` asks "End this attempt?" while the clock is still on, and just
 * closes an attempt already ended or out of time. Ending keeps the stopped clock and, when scores can be kept, asks
 * "How did it go?": saving the score closes the timer, and skipping it leaves the clock to resume. Render `dialog`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useEndAttempt({ end, stop }: { end: () => void; stop: () => void }): {
  close: (timer: RunningTimer) => void;
  score: (paper: TimedPaper) => void;
  dialog: ReactNode;
} {
  const scores = useKeepsScores();
  const [confirming, setConfirming] = useState<{ timer: RunningTimer; elapsed: string } | null>(null);
  const [asking, setAsking] = useState<TimedPaper | null>(null);
  const close = useCallback(
    (timer: RunningTimer) => {
      const now = Date.now();
      if (closeAsksFirst(timerPhase(timer, now))) setConfirming({ timer, elapsed: elapsedLabel(timer.clock, now) });
      else stop();
    },
    [stop],
  );
  const confirmEnd = () => {
    if (!confirming) return;
    if (scores) {
      end();
      setAsking(confirming.timer.paper);
    } else {
      stop();
    }
    setConfirming(null);
  };
  const dialog = (
    <>
      <ConfirmDialog
        open={confirming !== null}
        title="End this attempt?"
        body={
          confirming
            ? `You’re ${confirming.elapsed} into ${durationLabel(confirming.timer.clock.total)} on ${confirming.timer.paper.title}. ${
                scores
                  ? 'The clock stops, and you can save your score. Skip it to keep the clock: Resume carries on.'
                  : 'The clock stops and closes.'
              }`
            : null
        }
        confirmLabel="End attempt"
        cancelLabel="Keep going"
        tone="danger"
        onConfirm={confirmEnd}
        onClose={() => setConfirming(null)}
      />
      {asking ? (
        <PaperScoreDialog
          key={asking.id}
          itemId={asking.id}
          title={asking.title}
          onSaved={stop}
          onClose={() => setAsking(null)}
        />
      ) : null}
    </>
  );
  return { close, score: setAsking, dialog };
}

interface ClockProps {
  timer: RunningTimer;
  onPause: () => void;
  onResume: () => void;
  /** close the timer: "End this attempt?" first while it is still on */
  onClose: () => void;
  /** "How did it go?", once ended or out of time */
  onScore: () => void;
}

function PauseResume({
  paused,
  onPause,
  onResume,
  compact,
}: { paused: boolean; compact: boolean } & Pick<ClockProps, 'onPause' | 'onResume'>) {
  if (compact)
    return paused ? (
      <IconButton
        label="Resume"
        icon={<Icon glyph={glyph.play} />}
        size="sm"
        onClick={onResume}
        data-hub="time-me-resume"
      />
    ) : (
      <IconButton
        label="Pause"
        icon={<Icon glyph={glyph.pause} />}
        size="sm"
        onClick={onPause}
        data-hub="time-me-pause"
      />
    );
  return paused ? (
    <Button size="sm" leadingIcon={<Icon glyph={glyph.play} />} onClick={onResume} data-hub="time-me-resume">
      Resume
    </Button>
  ) : (
    <Button
      size="sm"
      variant="ghost"
      leadingIcon={<Icon glyph={glyph.pause} />}
      onClick={onPause}
      data-hub="time-me-pause"
    >
      Pause
    </Button>
  );
}

/** The countdown under the paper's toolbar: pause and resume, end the attempt, and the score once ended or out of
 *  time. */
export function ExamTimer({
  timer,
  report,
  onPause,
  onResume,
  onClose,
  onScore,
}: ClockProps & { report: LibraryItem | null }) {
  const { left, done, paused, ended } = useClock(timer);
  const scores = useKeepsScores();
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  return (
    <div
      className={done ? 'lib-timer is-done' : 'lib-timer'}
      role={done ? 'alert' : 'timer'}
      aria-live={done ? 'assertive' : 'off'}
      data-hub="exam-timer"
    >
      <Icon glyph={glyph.timer} className="lib-timer__icon" />
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
            {ended ? 'left, ended' : `${paused ? 'paused' : 'left'} of ${durationLabel(timer.clock.total)}`}
          </span>
        </p>
      )}
      {!done ? (
        <PauseResume paused={paused} onPause={onPause} onResume={onResume} compact={phone && ended && scores} />
      ) : null}
      {(done || ended) && scores ? (
        <Button size="sm" variant="primary" onClick={onScore} data-hub="time-me-score">
          Save my score
        </Button>
      ) : null}
      <IconButton
        label={done || ended ? 'Close the timer' : 'End this attempt'}
        icon={<Icon glyph={glyph.close} />}
        size="sm"
        onClick={onClose}
        data-hub="time-me-stop"
      />
    </div>
  );
}

/**
 * The floating timer: the clock of the paper being timed on every page but the paper's own (which has the full
 * bar), with the way back to the paper. The shell mounts it once.
 */
export function TimerPill() {
  const { timer, pause, resume, end, stop } = useTimeMe();
  const { pathname } = useLocation();
  const { close, score, dialog } = useEndAttempt({ end, stop });
  const onPaper = timer ? pathname === timedPaperPath(timer.paper) : false;
  return (
    <>
      {timer && !onPaper ? (
        <PillClock
          key={timer.paper.id}
          timer={timer}
          onPause={pause}
          onResume={resume}
          onClose={() => close(timer)}
          onScore={() => score(timer.paper)}
        />
      ) : null}
      {dialog}
    </>
  );
}

/** A phone on its side: the clock folds to a chip, so it covers as little of a short screen as it can. */
const SHORT_SCREEN = '(max-height: 500px)';

function PillClock({ timer, onPause, onResume, onClose, onScore }: ClockProps) {
  const { left, done, paused, ended } = useClock(timer);
  const scores = useKeepsScores();
  const short = useMediaQuery(SHORT_SCREEN);
  // Phones: the pill sits just above the tab bar, in the thumb's path, so it has no way to end a running attempt
  // (ST-67). The paper's own bar, at the top of its page, does.
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const [unfolded, setUnfolded] = useState(false);
  // Folding swaps the button pressed for another: keep the keyboard's place on the one that takes its place.
  const toggled = useRef(false);
  const toggle = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    toggle.current?.focus();
  }, [unfolded]);
  const fold = (open: boolean) => {
    toggled.current = true;
    setUnfolded(open);
  };
  const state = ended ? ' ended' : paused ? ' paused' : '';
  // Time's up is an alert with its own action: it never hides in the chip.
  if (short && !unfolded && !done) {
    return (
      <div className="lib-pill-lane">
        <button
          type="button"
          className={cx('lib-pill', 'lib-pill--chip', paused && 'is-paused')}
          aria-expanded={false}
          aria-label={`Time me, ${clockLabel(left)} left${state ? `,${state}` : ''}. Show the timer`}
          ref={(el) => {
            toggle.current = el;
          }}
          onClick={() => fold(true)}
          data-hub="timer-pill-toggle"
        >
          <Icon glyph={glyph.timer} className="lib-pill__icon" />
          <span className="lib-pill__clock u-tabular" aria-hidden="true">
            {clockLabel(left)}
            {state ? <span className="lib-pill__state">{state}</span> : null}
          </span>
        </button>
      </div>
    );
  }
  const finished = done || ended;
  return (
    <div className="lib-pill-lane">
      <div
        className={cx('lib-pill', done && 'is-done', paused && 'is-paused')}
        role={done ? 'alert' : 'timer'}
        aria-live={done ? 'assertive' : 'off'}
        aria-label={`Time me, ${timer.paper.title}`}
        data-hub="timer-pill"
      >
        <Link to={timedPaperPath(timer.paper)} className="lib-pill__paper">
          <Icon glyph={glyph.timer} className="lib-pill__icon" />
          <span className="lib-pill__clock u-tabular">
            {done ? 'Time’s up' : clockLabel(left)}
            {state ? <span className="lib-pill__state">{state}</span> : null}
          </span>
          <span className="lib-pill__title">
            <span className="visually-hidden">Back to </span>
            {timer.paper.title}
          </span>
          <Icon glyph={glyph.forward} className="lib-pill__go" />
        </Link>
        {!done ? <PauseResume paused={paused} onPause={onPause} onResume={onResume} compact /> : null}
        {finished && scores ? (
          <Button
            size="sm"
            variant="primary"
            onClick={onScore}
            className="lib-pill__score"
            aria-label={done ? undefined : 'Save my score'}
          >
            {done ? 'Save my score' : 'Score'}
          </Button>
        ) : null}
        {finished || !phone ? (
          <IconButton
            label={finished ? 'Close the timer' : 'End this attempt'}
            icon={<Icon glyph={glyph.close} />}
            size="sm"
            onClick={onClose}
            data-hub="timer-pill-stop"
          />
        ) : null}
        {short && !done ? (
          <IconButton
            label="Fold the timer"
            icon={<Icon glyph={glyph.chevronLeft} />}
            size="sm"
            aria-expanded
            ref={toggle}
            onClick={() => fold(false)}
            data-hub="timer-pill-toggle"
          />
        ) : null}
      </div>
    </div>
  );
}

/** '1:23:45 left', '1:23:45 left, paused', '1:23:45 left, ended' or 'Time’s up', ticking: for a list that shows the
 *  paper being timed. */
export function ClockText({ timer }: { timer: RunningTimer }) {
  const { clock, ended } = timer;
  const [now, setNow] = useState(() => Date.now());
  const left = clockLeft(clock, now);
  const running = clock.endsAt !== null && left > 0;
  useEffect(() => {
    setNow(Date.now());
    if (!running) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running, clock.endsAt, clock.pausedLeft]);
  if (left <= 0) return <>Time’s up</>;
  return (
    <span className="u-tabular">
      {clockLabel(left)} left{ended ? ', ended' : clock.endsAt === null ? ', paused' : ''}
    </span>
  );
}
