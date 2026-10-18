import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { progressKey } from '../api/keys';
import type { Me } from '../api/types';
import { applyPreferences, preferencesSaved } from './preferences';
import { ME_KEY } from './queries';

const prefs: Me['preferences'] = {
  emailReplies: true,
  emailAnswerAccepted: true,
  emailUploadReviews: true,
  emailNewIssues: true,
  emailDateChanges: true,
  emailWeeklySummary: false,
  trackProgress: false,
  homeBlocks: ['todo'],
};

describe('applyPreferences', () => {
  it('changes the switches sent and keeps the rest', () => {
    expect(applyPreferences(prefs, { trackProgress: true, emailReplies: null })).toEqual({
      ...prefs,
      trackProgress: true,
    });
  });
  it('sets Home’s blocks, and null goes back to the default', () => {
    expect(applyPreferences(prefs, { homeBlocks: ['modules', 'todo'] }).homeBlocks).toEqual(['modules', 'todo']);
    expect(applyPreferences(prefs, { homeBlocks: null }).homeBlocks).toBeNull();
    expect(applyPreferences(prefs, {}).homeBlocks).toEqual(['todo']);
  });
});

describe('preferencesSaved', () => {
  const me = { preferences: prefs } as Me;
  const withProgress = () => {
    const qc = new QueryClient();
    qc.setQueryData(progressKey('u1'), { watched: {}, last: {} });
    return qc;
  };
  it('fetches lesson progress again when tracking is turned on or off', () => {
    for (const trackProgress of [true, false]) {
      const qc = withProgress();
      preferencesSaved(qc, me, { trackProgress });
      expect(qc.getQueryState(progressKey('u1'))?.isInvalidated).toBe(true);
      expect(qc.getQueryData(ME_KEY)).toBe(me);
    }
  });
  it('leaves lesson progress alone for the other switches', () => {
    const qc = withProgress();
    preferencesSaved(qc, me, { emailReplies: false, trackProgress: null });
    expect(qc.getQueryState(progressKey('u1'))?.isInvalidated).toBe(false);
  });
});
