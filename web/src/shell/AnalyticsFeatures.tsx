// Tells analytics which features are on for this visit (D13). Only when the build has a PostHog key.
import { useEffect } from 'react';
import { FEATURE_KEYS, useAuth } from '../auth';

export function AnalyticsFeatures() {
  const { featureOn, status } = useAuth();
  const on = status === 'loading' ? '' : FEATURE_KEYS.filter((f) => featureOn(f)).join(',');
  useEffect(() => {
    if (!import.meta.env.VITE_POSTHOG_KEY) return;
    void import('../lib/analytics').then(({ setVisitFeatures }) => setVisitFeatures(on ? on.split(',') : [])).catch(() => undefined);
  }, [on]);
  return null;
}
