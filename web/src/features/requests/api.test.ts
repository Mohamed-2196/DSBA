import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ADMIN_STATS_KEY } from '../../api/keys';
import { REQUESTS_KEY, requestsChanged } from './api';

describe('requestsChanged', () => {
  it('refreshes the lists, "You asked, we did" and Manage’s counts', () => {
    const qc = new QueryClient();
    const keys = [[...REQUESTS_KEY, 'list', {}], [...REQUESTS_KEY, 'done', null, 6], [...REQUESTS_KEY, 'done', '2026-10-11', 20], ADMIN_STATS_KEY];
    for (const key of keys) qc.setQueryData(key, {});
    qc.setQueryData([...REQUESTS_KEY, 'similar', 'x'], {});
    requestsChanged(qc);
    for (const key of keys) expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    expect(qc.getQueryState([...REQUESTS_KEY, 'similar', 'x'])?.isInvalidated).toBe(false);
  });
});
