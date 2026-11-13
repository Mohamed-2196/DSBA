import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { PRIVACY_KEY } from '../../api/keys';
import type { FeatureOut } from '../../api/types';
import { switchChanged } from './api';

describe('switchChanged', () => {
  it('makes the privacy notice ask again, so a service switched on after it was read is named (COM-280 I5)', () => {
    const qc = new QueryClient();
    qc.setQueryData(PRIVACY_KEY, { nooraAnswers: false, forumCheck: false, aiApps: false });
    expect(qc.getQueryState(PRIVACY_KEY)?.isInvalidated).toBe(false);
    switchChanged(qc, { feature: 'noora.ai' } as FeatureOut);
    expect(qc.getQueryState(PRIVACY_KEY)?.isInvalidated).toBe(true);
  });
});
