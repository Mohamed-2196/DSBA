import { describe, expect, it } from 'vitest';
import { shownSections, type ServicesQuery } from './privacy';

const ON = { nooraAnswers: true, forumCheck: false, aiApps: true };
const ALL = { nooraAnswers: true, forumCheck: true, aiApps: true };
const NONE = { nooraAnswers: false, forumCheck: false, aiApps: false };
const q = (over: Partial<ServicesQuery> = {}): ServicesQuery => ({
  data: undefined,
  isError: false,
  fetchStatus: 'idle',
  ...over,
});

describe('shownSections', () => {
  it('shows what the API says is in use, and analytics as the build says', () => {
    expect(shownSections(q({ data: ON }), false)).toEqual({ ...ON, analytics: false });
    expect(shownSections(q({ data: ON }), true)).toEqual({ ...ON, analytics: true });
  });

  it('shows none of the API sections while the first answer is on its way', () => {
    expect(shownSections(q({ fetchStatus: 'fetching' }), true)).toEqual({ ...NONE, analytics: true });
  });

  it('shows all of them when the answer cannot be read', () => {
    expect(shownSections(q({ isError: true }), false)).toEqual({ ...ALL, analytics: false });
  });

  it('shows all of them when a refresh fails, even with an older answer kept (COM-280 I5)', () => {
    expect(shownSections(q({ data: NONE, isError: true }), false)).toEqual({ ...ALL, analytics: false });
  });

  it('shows all of them while offline, with or without an older answer', () => {
    expect(shownSections(q({ fetchStatus: 'paused' }), false)).toEqual({ ...ALL, analytics: false });
    expect(shownSections(q({ data: NONE, fetchStatus: 'paused' }), false)).toEqual({ ...ALL, analytics: false });
  });
});
