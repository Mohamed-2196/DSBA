import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { MY_CALENDAR_SETTINGS_KEY } from '../../api/keys';
import { refreshAfterPasswordChange, SESSIONS_KEY } from './api';

describe('refreshAfterPasswordChange', () => {
  it('reads the sessions, the AI apps and the calendar links again, and nothing else', async () => {
    const qc = new QueryClient();
    const aiApps = ['account', 'ai-apps'] as const;
    const events = ['calendar', 'mine', 'events'] as const;
    for (const key of [SESSIONS_KEY, aiApps, MY_CALENDAR_SETTINGS_KEY, events]) qc.setQueryData(key, []);

    await refreshAfterPasswordChange(qc);

    expect(qc.getQueryState(SESSIONS_KEY)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(aiApps)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(MY_CALENDAR_SETTINGS_KEY)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(events)?.isInvalidated).toBe(false);
  });
});
