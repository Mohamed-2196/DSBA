import type { CaptureResult } from 'posthog-js';
import { describe, expect, it } from 'vitest';
import {
  analyticsConfig,
  DEFAULT_POSTHOG_HOST,
  featuresProperty,
  prepareEvent,
  scrubEvent,
  setVisitFeatures,
  withoutQuery,
} from './analytics';

describe('analyticsConfig (security review SEC-8)', () => {
  const config = analyticsConfig();

  it('records page views and nothing a person typed or clicked', () => {
    expect(config.api_host).toBe(DEFAULT_POSTHOG_HOST);
    expect(config.capture_pageview).toBe('history_change');
    expect(config.autocapture).toBe(false);
    expect(config.rageclick).toBe(false);
    expect(config.capture_dead_clicks).toBe(false);
    expect(config.capture_heatmaps).toBe(false);
  });

  it('never records sessions, and nothing remote can turn that on', () => {
    expect(config.disable_session_recording).toBe(true);
    expect(config.advanced_disable_flags).toBe(true);
    expect(config.disable_external_dependency_loading).toBe(true);
    expect(config.disable_surveys).toBe(true);
  });

  it('keeps visitors anonymous', () => {
    expect(config.person_profiles).toBe('identified_only');
    expect(config.persistence).toBe('localStorage');
    expect(config.respect_dnt).toBe(true);
    expect(config.save_referrer).toBe(false);
    expect(config.before_send).toBe(prepareEvent);
  });

  it('uses another host when the build names one', () => {
    expect(analyticsConfig('https://eu.i.posthog.com').api_host).toBe('https://eu.i.posthog.com');
  });
});

describe('scrubEvent', () => {
  it('drops query strings and hashes from every URL an event carries', () => {
    expect(withoutQuery('https://hub.example.com/library?q=my+name#top')).toBe('https://hub.example.com/library');
    expect(withoutQuery('https://hub.example.com/forum')).toBe('https://hub.example.com/forum');
    const event: CaptureResult = {
      uuid: '1',
      event: '$pageview',
      properties: {
        $current_url: 'https://hub.example.com/library?q=sara',
        $referrer: 'https://x.example/?ref=1',
        // the URL the visit started on: the SDK keeps it for the whole session
        $session_entry_url: 'https://hub.example.com/library?q=sara#top',
        $session_entry_referrer: 'https://x.example/?ref=1',
        $pathname: '/library',
        n: 1,
      },
      $set_once: { $initial_current_url: 'https://hub.example.com/?q=sara' },
    };
    const scrubbed = scrubEvent(event);
    expect(scrubbed?.properties).toEqual({
      $current_url: 'https://hub.example.com/library',
      $referrer: 'https://x.example/',
      $session_entry_url: 'https://hub.example.com/library',
      $session_entry_referrer: 'https://x.example/',
      $pathname: '/library',
      n: 1,
    });
    expect(scrubbed?.$set_once).toEqual({ $initial_current_url: 'https://hub.example.com/' });
    expect(scrubEvent(null)).toBeNull();
  });

  it('drops page titles (a thread title is what a student wrote)', () => {
    const event: CaptureResult = {
      uuid: '2',
      event: '$pageview',
      properties: { title: 'Help with my resit, Sara A – DSBA Hub', $pathname: '/forum/abc' },
    };
    expect(scrubEvent(event)?.properties).toEqual({ $pathname: '/forum/abc' });
  });
});

describe('featuresProperty (D13)', () => {
  it('is the sorted list of known feature keys, and nothing else', () => {
    expect(featuresProperty(['noora', 'forum', 'forum', 'calendar'])).toEqual(['calendar', 'forum', 'noora']);
    expect(featuresProperty(['forum', 'newsletter.manage', 'admin'])).toEqual(['forum']);
    expect(featuresProperty([])).toEqual([]);
  });

  it('survives the scrub: page views keep it', () => {
    const event = {
      event: '$pageview',
      properties: { features: ['forum'], $current_url: 'https://hub.example.com/forum?q=x' },
    } as unknown as CaptureResult;
    expect(scrubEvent(event)?.properties.features).toEqual(['forum']);
  });
});

describe('the features list on events (D13)', () => {
  const page = () =>
    ({
      event: '$pageview',
      properties: { $current_url: 'https://hub.example.com/forum?q=x' },
    }) as unknown as CaptureResult;

  it('gives every event the current list, and follows setVisitFeatures', () => {
    setVisitFeatures(['noora', 'forum']);
    expect(prepareEvent(page())?.properties.features).toEqual(['forum', 'noora']);
    expect(prepareEvent(page())?.properties.$current_url).toBe('https://hub.example.com/forum');
    setVisitFeatures([]);
    expect(prepareEvent(page())?.properties.features).toEqual([]);
  });

  it('never carries unknown keys', () => {
    setVisitFeatures(['forum', 'admin', 'newsletter.manage']);
    expect(prepareEvent(page())?.properties.features).toEqual(['forum']);
  });

  it('passes a dropped event on as dropped', () => {
    expect(prepareEvent(null)).toBeNull();
  });
});
