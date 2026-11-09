import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kwgtFormula, SCRIPTABLE_SCRIPT } from './widgetScript';

// Stand-ins for Scriptable's API (docs.scriptable.app): enough to run the script and read what the widget shows.
interface Shown {
  texts: string[];
  url: string | null;
  set: boolean;
  fetched: string[];
  refreshAfter: Date | null;
}

async function run(
  parameter: string | null,
  answer: { status: number; body?: unknown } | Error,
  family = 'medium',
): Promise<Shown> {
  const shown: Shown = { texts: [], url: null, set: false, fetched: [], refreshAfter: null };
  class Color {
    static dynamic() {
      return new Color();
    }
  }
  const Font = { systemFont: () => ({}), semiboldSystemFont: () => ({}) };
  class ListWidget {
    backgroundColor: unknown;
    set refreshAfterDate(d: Date) {
      shown.refreshAfter = d;
    }
    set url(u: string) {
      shown.url = u;
    }
    setPadding() {}
    addSpacer() {}
    addText(text: string) {
      shown.texts.push(text);
      return {};
    }
    presentMedium() {
      return Promise.resolve();
    }
  }
  class Request {
    response = { statusCode: 0 };
    constructor(readonly url: string) {
      shown.fetched.push(url);
    }
    loadJSON() {
      if (answer instanceof Error) return Promise.reject(answer);
      this.response.statusCode = answer.status;
      return Promise.resolve(answer.body);
    }
  }
  const Script = {
    setWidget: () => {
      shown.set = true;
    },
    complete: () => {},
  };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    ...args: string[]
  ) => (...values: unknown[]) => Promise<void>;
  const body = new AsyncFunction(
    'args',
    'config',
    'Color',
    'Font',
    'ListWidget',
    'Request',
    'Script',
    SCRIPTABLE_SCRIPT,
  );
  await body(
    { widgetParameter: parameter },
    { runsInWidget: true, widgetFamily: family },
    Color,
    Font,
    ListWidget,
    Request,
    Script,
  );
  return shown;
}

const LINK = 'https://hub.example/api/v1/feeds/widget/abc.json';
const NOW = new Date('2026-11-09T20:40:00Z'); // 23:40 in Bahrain
const FEED = {
  today: '2026-11-09',
  url: 'https://hub.example/',
  nextExam: { title: 'Statistics exam', daysLeft: 12, text: 'Statistics exam in 12 days' },
  todayEvents: [{ text: '09:30 Dentist' }, { text: '10:00 Careers talk' }, { text: '18:00 Gym' }],
  todayText: '…',
  carryOn: { text: 'ST2134: Regression' },
};
const DOWN = "Couldn't reach the Hub. It tries again soon.";

describe('the Scriptable widget', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the next exam, today and the lesson to carry on with', async () => {
    const shown = await run(` ${LINK} `, { status: 200, body: FEED });
    expect(shown.fetched).toEqual([LINK]);
    expect(shown.set).toBe(true);
    expect(shown.url).toBe('https://hub.example/');
    expect(shown.texts).toEqual([
      'Next exam',
      'Statistics exam in 12 days',
      'Today',
      '09:30 Dentist',
      '10:00 Careers talk',
      '18:00 Gym',
      'Carry on',
      'ST2134: Regression',
    ]);
  });

  it('leads a small widget with the days left, and keeps today to two lines', async () => {
    const shown = await run(LINK, { status: 200, body: FEED }, 'small');
    expect(shown.texts).toEqual(['Next exam', '12 days', 'Statistics exam', 'Today', '09:30 Dentist', '+2 more']);
    const tomorrow = { ...FEED, nextExam: { ...FEED.nextExam, daysLeft: 1 } };
    expect((await run(LINK, { status: 200, body: tomorrow }, 'small')).texts[1]).toBe('Tomorrow');
    const today = { ...FEED, nextExam: { ...FEED.nextExam, daysLeft: 0 } };
    expect((await run(LINK, { status: 200, body: today }, 'small')).texts[1]).toBe('Today');
  });

  it('counts what has no room', async () => {
    const busy = { ...FEED, todayEvents: [...FEED.todayEvents, { text: 'Reading week' }] };
    expect((await run(LINK, { status: 200, body: busy })).texts.slice(2, 6)).toEqual([
      'Today',
      '09:30 Dentist',
      '10:00 Careers talk',
      '+2 more',
    ]);
  });

  it('says so on a quiet day', async () => {
    const quiet = { ...FEED, nextExam: null, todayEvents: [], todayText: 'Nothing on today.', carryOn: null };
    const shown = await run(LINK, { status: 200, body: quiet });
    expect(shown.texts).toEqual(['Next exam', 'No exam in the next 4 months', 'Today', 'Nothing on today.']);
  });

  it('comes back just after midnight, else every 30 minutes', async () => {
    const late = await run(LINK, { status: 200, body: FEED });
    expect(late.refreshAfter?.toISOString()).toBe('2026-11-09T21:01:00.000Z'); // 00:01 in Bahrain
    vi.setSystemTime(new Date('2026-11-09T08:00:00Z'));
    const day = await run(LINK, { status: 200, body: FEED });
    expect(day.refreshAfter?.toISOString()).toBe('2026-11-09T08:30:00.000Z');
  });

  it("doesn't show yesterday as today", async () => {
    const old = { ...FEED, today: '2026-11-08' };
    expect((await run(LINK, { status: 200, body: old })).texts).toEqual([
      'DSBA Hub',
      'Updating…',
      'Carry on',
      'ST2134: Regression',
    ]);
  });

  it('asks for the link, and says when it stopped working or the Hub is out of reach', async () => {
    expect((await run(null, { status: 200, body: FEED })).texts).toEqual([
      'DSBA Hub',
      "Add your widget link as this widget's Parameter.",
    ]);
    expect((await run(LINK, { status: 404, body: { error: {} } })).texts[1]).toBe(
      "This link doesn't work any more. Copy your new one from the Hub.",
    );
    expect((await run(LINK, { status: 503, body: { error: {} } })).texts[1]).toBe(DOWN);
    expect((await run(LINK, { status: 429, body: { error: {} } })).texts[1]).toBe(DOWN);
    expect((await run(LINK, new Error('offline'))).texts[1]).toBe(DOWN);
  });

  it('tells a calendar link from a widget link', async () => {
    const calendar = await run('https://hub.example/api/v1/feeds/calendar/abc.ics', { status: 200, body: FEED });
    expect(calendar.fetched).toEqual([]);
    expect(calendar.texts[1]).toBe("That's your calendar link. Paste your widget link from the Hub.");
    expect((await run('https://example.com/x', { status: 200, body: FEED })).texts[1]).toBe(
      "That isn't a widget link. Copy yours from the Hub.",
    );
  });
});

describe('the KWGT formula', () => {
  it('reads one part of the feed', () => {
    expect(kwgtFormula(LINK, '.todayText')).toBe(`$wg("${LINK}", json, ".todayText")$`);
  });
});
