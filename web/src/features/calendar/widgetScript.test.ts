import { describe, expect, it } from 'vitest';
import { kwgtFormula, SCRIPTABLE_SCRIPT } from './widgetScript';

// Stand-ins for Scriptable's API (docs.scriptable.app): enough to run the script and read what the widget shows.
interface Shown {
  texts: string[];
  url: string | null;
  set: boolean;
  fetched: string[];
}

async function run(
  parameter: string | null,
  answer: { status: number; body?: unknown } | Error,
  family = 'medium',
): Promise<Shown> {
  const shown: Shown = { texts: [], url: null, set: false, fetched: [] };
  class Color {
    static dynamic() {
      return new Color();
    }
  }
  const Font = { systemFont: () => ({}), semiboldSystemFont: () => ({}) };
  class ListWidget {
    backgroundColor: unknown;
    refreshAfterDate: Date | null = null;
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
const FEED = {
  url: 'https://hub.example/',
  nextExam: { text: 'Statistics exam in 12 days' },
  todayEvents: [{ text: '10:00 Careers talk' }, { text: 'Reading week' }, { text: '18:00 Gym' }, { text: 'Fourth' }],
  todayText: '…',
  carryOn: { text: 'ST2134: Regression' },
};

describe('the Scriptable widget', () => {
  it('shows the next exam, today and the lesson to carry on with', async () => {
    const shown = await run(` ${LINK} `, { status: 200, body: FEED });
    expect(shown.fetched).toEqual([LINK]);
    expect(shown.set).toBe(true);
    expect(shown.url).toBe('https://hub.example/');
    expect(shown.texts).toEqual([
      'NEXT EXAM',
      'Statistics exam in 12 days',
      'TODAY',
      '10:00 Careers talk',
      'Reading week',
      '18:00 Gym',
      'CARRY ON',
      'ST2134: Regression',
    ]);
  });

  it('keeps a small widget to the exam and two lines of today', async () => {
    const shown = await run(LINK, { status: 200, body: FEED }, 'small');
    expect(shown.texts).toEqual([
      'NEXT EXAM',
      'Statistics exam in 12 days',
      'TODAY',
      '10:00 Careers talk',
      'Reading week',
    ]);
  });

  it('says so on a quiet day', async () => {
    const quiet = { ...FEED, nextExam: null, todayEvents: [], todayText: 'Nothing on today.', carryOn: null };
    const shown = await run(LINK, { status: 200, body: quiet });
    expect(shown.texts).toEqual(['NEXT EXAM', 'No exam in the next 4 months', 'TODAY', 'Nothing on today.']);
  });

  it('asks for the link, and says when it stopped working or the Hub is out of reach', async () => {
    expect((await run(null, { status: 200, body: FEED })).texts).toEqual([
      'DSBA HUB',
      "Add your widget link as this widget's Parameter.",
    ]);
    expect((await run(LINK, { status: 404, body: { error: {} } })).texts[1]).toBe(
      "This link doesn't work any more. Copy your new one from the Hub.",
    );
    expect((await run(LINK, new Error('offline'))).texts[1]).toBe("Couldn't reach the Hub. It tries again soon.");
  });
});

describe('the KWGT formula', () => {
  it('reads one part of the feed', () => {
    expect(kwgtFormula(LINK, '.todayText')).toBe(`$wg("${LINK}", json, ".todayText")$`);
  });
});
