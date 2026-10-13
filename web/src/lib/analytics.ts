// Product analytics (PostHog). Off unless the build sets VITE_POSTHOG_KEY, and then loaded on its own after the
// app has rendered, so the SDK is never part of the entry chunk (code-quality review CQ-12).
//
// It records as little as it can (security review SEC-8): page views only, no autocapture of clicks or inputs, no
// session recordings, surveys, heatmaps or feature flags, nothing loaded from PostHog's CDN, no cookies, anonymous
// visitors only (never identify() anyone, least of all with an email or a phone number), Do Not Track and Global
// Privacy Control respected, URLs without their query string or hash (search terms stay in the browser) and no page
// titles (a thread's title is what a student wrote). In PostHog's project settings, also turn on "Discard client IP
// data". The CSP needs the API host in connect-src, nothing else (docs/backend/DEPLOYMENT.md).
import type { CaptureResult, PostHog, PostHogConfig, Properties } from 'posthog-js';
import { FEATURE_KEYS } from '../auth/access';

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

// Every property the SDK fills with a URL: $current_url, $referrer, $session_entry_url, $initial_referrer, ...
const URL_PROPERTY = /(?:^|[$_])(?:url|referrer)$/;
// Properties that can carry what students wrote.
const DROPPED_PROPERTIES = new Set(['title']);

/** 'https://hub.example.com/library?q=my+name#top' -> 'https://hub.example.com/library'. */
export function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function scrubProperties(properties: Properties): Properties {
  const out: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (DROPPED_PROPERTIES.has(key)) continue;
    out[key] = typeof value === 'string' && URL_PROPERTY.test(key) ? withoutQuery(value) : value;
  }
  return out;
}

/** Drops page titles, and the query string and hash of every URL an event carries (person properties included). */
export function scrubEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  const scrubbed: CaptureResult = { ...event, properties: scrubProperties(event.properties) };
  if (event.$set) scrubbed.$set = scrubProperties(event.$set);
  if (event.$set_once) scrubbed.$set_once = scrubProperties(event.$set_once);
  return scrubbed;
}

/** The settings analytics starts with (a pure function: the unit test checks every privacy setting). */
export function analyticsConfig(apiHost: string = DEFAULT_POSTHOG_HOST): Partial<PostHogConfig> {
  return {
    api_host: apiHost,
    capture_pageview: 'history_change', // one page view per route change (the app is a single page)
    capture_pageleave: true,
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    advanced_disable_flags: true, // no remote settings: nothing can turn recordings on from PostHog's side
    disable_external_dependency_loading: true, // no scripts from PostHog's CDN (and no script-src exception)
    person_profiles: 'identified_only',
    persistence: 'localStorage', // no cookies
    respect_dnt: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    save_referrer: false,
    ip: false,
    before_send: scrubEvent,
  };
}

/** The features on during a visit, as page views carry them (decision D13): feature keys only, never roles or boxes. */
export function featuresProperty(on: readonly string[]): string[] {
  const known = new Set<string>(FEATURE_KEYS);
  return [...new Set(on.filter((f) => known.has(f)))].sort();
}

let client: PostHog | null = null;
let pending: string[] | null = null;

/** Every event from now on carries `features`. Before analytics has started, it's kept until it does. */
export function setVisitFeatures(on: readonly string[]): void {
  const features = featuresProperty(on);
  if (client) client.register({ features });
  else pending = features;
}

/** Fetches the SDK (its own chunk) and starts it. Call only when the build has a key. */
export async function startAnalytics(key: string, apiHost?: string): Promise<void> {
  const { default: posthog } = await import('posthog-js');
  posthog.init(key, analyticsConfig(apiHost || DEFAULT_POSTHOG_HOST));
  client = posthog;
  if (pending) posthog.register({ features: pending });
}
