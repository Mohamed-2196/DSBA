import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, featureIsOn } from './access';
import { readGuestFeatures } from './guestFeatures';

const query = (over: Partial<{ data: readonly string[] | undefined; isPending: boolean; isError: boolean }> = {}) => ({
  data: undefined,
  isPending: false,
  isError: false,
  ...over,
});

describe('readGuestFeatures', () => {
  it('keeps a guest loading while the list is pending', () => {
    expect(readGuestFeatures(false, query({ isPending: true }))).toEqual({ loading: true, list: undefined });
  });

  it('uses the list once it has loaded', () => {
    const got = readGuestFeatures(false, query({ data: ['forum'] }));
    expect(got).toEqual({ loading: false, list: ['forum'] });
    expect(featureIsOn(null, got.list, 'calendar')).toBe(false);
  });

  it('fails open for a guest when the list does not load: every feature is on', () => {
    const got = readGuestFeatures(false, query({ isError: true }));
    expect(got).toEqual({ loading: false, list: FEATURE_KEYS });
    expect(featureIsOn(null, got.list, 'calendar')).toBe(true);
  });

  it('keeps the last list a guest had when a refetch fails', () => {
    expect(readGuestFeatures(false, query({ data: ['forum'], isError: true })).list).toEqual(['forum']);
  });

  it('never makes a signed-in person wait, and gives an admin no list when it fails', () => {
    expect(readGuestFeatures(true, query({ isPending: true }))).toEqual({ loading: false, list: undefined });
    expect(readGuestFeatures(true, query({ isError: true }))).toEqual({ loading: false, list: undefined });
  });
});
