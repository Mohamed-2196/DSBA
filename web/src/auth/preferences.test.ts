import { describe, expect, it } from 'vitest';
import type { Me } from '../api/types';
import { applyPreferences } from './preferences';

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
    expect(applyPreferences(prefs, { trackProgress: true, emailReplies: null })).toEqual({ ...prefs, trackProgress: true });
  });
  it('sets Home’s blocks, and null goes back to the default', () => {
    expect(applyPreferences(prefs, { homeBlocks: ['modules', 'todo'] }).homeBlocks).toEqual(['modules', 'todo']);
    expect(applyPreferences(prefs, { homeBlocks: null }).homeBlocks).toBeNull();
    expect(applyPreferences(prefs, {}).homeBlocks).toEqual(['todo']);
  });
});
