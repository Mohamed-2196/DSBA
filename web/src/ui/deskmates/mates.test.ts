import { describe, expect, it } from 'vitest';
import { MATE_POSES } from './art';
import { SECTION_MATE, mateLabel, motionTimings } from './mates';

describe('mateLabel', () => {
  it('names the idle pose with what the deskmate is', () => {
    expect(mateLabel('stacks', 'idle')).toBe('Stacks, the stack of papers');
    expect(mateLabel('pip-pod', 'idle')).toBe('Pip and Pod, the forum’s speech bubbles');
  });
  it('says the state for the others', () => {
    expect(mateLabel('jot', 'sleepy')).toBe('Jot, asleep');
    expect(mateLabel('pip-pod', 'happy')).toBe('Pip and Pod, happy');
    expect(mateLabel('lumen', 'wave')).toBe('Lumen waving hello');
    expect(mateLabel('loupe', 'searching')).toBe('Searching');
  });
});

describe('the cast', () => {
  it('draws every section’s deskmate in idle, happy and sleepy', () => {
    for (const mate of Object.values(SECTION_MATE)) {
      expect(MATE_POSES[mate]).toEqual(expect.arrayContaining(['idle', 'happy', 'sleepy']));
    }
  });
  it('has the special poses', () => {
    expect(MATE_POSES.lumen).toContain('wave');
    expect(MATE_POSES.blink).toContain('countdown');
    expect(MATE_POSES.loupe).toContain('searching');
  });
});

describe('motionTimings', () => {
  it('blinks every 6 to 11 seconds, starting within 4', () => {
    expect(motionTimings(() => 0)).toEqual({ every: 6, delay: 0 });
    expect(motionTimings(() => 0.999)).toEqual({ every: 11, delay: 4 });
  });
});
