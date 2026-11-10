import { describe, expect, it } from 'vitest';
import { shownSections } from './privacy';

const ON = { nooraAnswers: true, forumCheck: false, aiApps: true };

describe('shownSections', () => {
  it('shows what the API says is in use, and analytics as the build says', () => {
    expect(shownSections(ON, false, false)).toEqual({ ...ON, analytics: false });
    expect(shownSections(ON, false, true)).toEqual({ ...ON, analytics: true });
  });

  it('shows none of the API sections before the answer arrives', () => {
    expect(shownSections(undefined, false, true)).toEqual({
      nooraAnswers: false,
      forumCheck: false,
      aiApps: false,
      analytics: true,
    });
  });

  it('shows all of them when the answer cannot be read', () => {
    expect(shownSections(undefined, true, false)).toEqual({
      nooraAnswers: true,
      forumCheck: true,
      aiApps: true,
      analytics: false,
    });
  });
});
