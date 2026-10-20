import { describe, expect, it } from 'vitest';
import { clockStart } from './papers';
import {
  TIME_ME_KEY,
  cleanTimer,
  closeAsksFirst,
  elapsedLabel,
  endTimer,
  pauseTimer,
  resumeTimer,
  timedPaperPath,
  timerPhase,
} from './timeMe';

const paper = { id: 'p1', slug: 'st2134-may-2025', title: 'ST2134 · May 2025 · Zone A', moduleId: 'st2134' };

describe('the paper being timed', () => {
  it('is personal, so it goes on sign-out', () => {
    expect(TIME_ME_KEY.startsWith('hub.mine.')).toBe(true);
  });

  it('reads back what was stored', () => {
    const clock = clockStart(2 * 3600_000, 1000);
    expect(cleanTimer({ paper, clock }, 2000)).toEqual({ paper, clock, ended: false });
    const ended = endTimer({ paper, clock, ended: false }, 5000);
    expect(cleanTimer(ended, 6000)).toEqual(ended);
    expect(cleanTimer({ paper: { ...paper, moduleId: null }, clock }, 2000)?.paper.moduleId).toBeNull();
  });

  it('throws out anything else', () => {
    const clock = clockStart(2 * 3600_000, 1000);
    expect(cleanTimer(null, 0)).toBeNull();
    expect(cleanTimer({ clock }, 0)).toBeNull();
    expect(cleanTimer({ paper: { ...paper, slug: '' }, clock }, 0)).toBeNull();
    expect(cleanTimer({ paper: { ...paper, moduleId: 3 }, clock }, 0)).toBeNull();
    expect(cleanTimer({ paper, clock: { total: 5 } }, 0)).toBeNull();
    // ran out more than six hours ago
    expect(cleanTimer({ paper, clock }, 1000 + 2 * 3600_000 + 7 * 3600_000)).toBeNull();
  });

  it('never reads a running clock as ended', () => {
    const clock = clockStart(2 * 3600_000, 1000);
    expect(cleanTimer({ paper, clock, ended: true }, 2000)?.ended).toBe(false);
    expect(cleanTimer({ paper, clock: { ...clock, endsAt: null, pausedLeft: 5000 }, ended: 'yes' }, 2000)?.ended).toBe(
      false,
    );
  });

  it('links back to the paper', () => {
    expect(timedPaperPath(paper)).toBe('/library/st2134-may-2025');
  });
});

describe('ending an attempt (ST-67)', () => {
  const H = 3600_000;
  const start = { paper, clock: clockStart(2 * H, 0), ended: false };

  it('asks first while the clock is going or paused, not once ended or out of time', () => {
    expect(timerPhase(start, 1000)).toBe('running');
    expect(closeAsksFirst(timerPhase(start, 1000))).toBe(true);
    const paused = pauseTimer(start, 1000);
    expect(timerPhase(paused, 5 * H)).toBe('paused');
    expect(closeAsksFirst('paused')).toBe(true);
    expect(closeAsksFirst('ended')).toBe(false);
    expect(timerPhase(start, 2 * H)).toBe('done');
    expect(closeAsksFirst('done')).toBe(false);
  });

  it('keeps the clock where it stopped, so skipping the score loses nothing', () => {
    const ended = endTimer(start, 1.5 * H);
    expect(timerPhase(ended, 3 * H)).toBe('ended');
    expect(elapsedLabel(ended.clock, 9 * H)).toBe('1:30:00');
  });

  it('resumes an ended attempt from where it stopped', () => {
    const back = resumeTimer(endTimer(start, 1.5 * H), 4 * H);
    expect(back.ended).toBe(false);
    expect(timerPhase(back, 4 * H)).toBe('running');
    expect(back.clock.endsAt).toBe(4.5 * H);
  });

  it('says how far in the student is', () => {
    expect(elapsedLabel(start.clock, 90 * 60_000 + 12_000)).toBe('1:30:12');
    expect(elapsedLabel(pauseTimer(start, 60_000).clock, 5 * H)).toBe('0:01:00');
  });
});
