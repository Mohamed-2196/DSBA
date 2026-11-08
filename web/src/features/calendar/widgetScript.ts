// The home-screen widget's setups, copied from the Add a widget page (WidgetsPage.tsx). Each one reads the student's
// widget feed (GET /api/v1/feeds/widget/<secret>.json, api/app/services/widget.py): the setups only lay out the
// lines the feed already words.

/**
 * The Scriptable script (iPhone and iPad; on a Mac, through iPhone widgets on the desktop). It holds no secret: the
 * student's widget link goes in the widget's own Parameter field, so the script can be shared and synced freely.
 * Scriptable's API: https://docs.scriptable.app (Request, ListWidget, Color, Font, args, config, Script).
 */
export const SCRIPTABLE_SCRIPT = `// DSBA Hub widget for Scriptable.
// Your widget link goes in the widget's Parameter (long-press the widget, then Edit Widget), not in this script.
const link = (args.widgetParameter || "").trim();
const ink = Color.dynamic(new Color("#0a1f44"), new Color("#eaf0ff"));
const soft = Color.dynamic(new Color("#3e4e6e"), new Color("#a9b8d9"));
const accent = Color.dynamic(new Color("#2445c2"), new Color("#8da6ff"));
const w = new ListWidget();
w.backgroundColor = Color.dynamic(new Color("#ffffff"), new Color("#111e3e"));
w.setPadding(14, 14, 14, 14);
const small = config.widgetFamily === "small";

function line(text, size, color, bold) {
  const t = w.addText(text);
  t.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = small ? 2 : 1;
  return t;
}

function label(text) {
  const t = line(text.toUpperCase(), 10, accent, true);
  t.lineLimit = 1;
}

async function load() {
  if (!link) return "Add your widget link as this widget's Parameter.";
  try {
    const req = new Request(link);
    const data = await req.loadJSON();
    if (req.response.statusCode !== 200) return "This link doesn't work any more. Copy your new one from the Hub.";
    return data;
  } catch (e) {
    return "Couldn't reach the Hub. It tries again soon.";
  }
}

const data = await load();
if (typeof data === "string") {
  label("DSBA Hub");
  w.addSpacer(4);
  line(data, 13, ink, false);
} else {
  w.url = data.url;
  label("Next exam");
  line(data.nextExam ? data.nextExam.text : "No exam in the next 4 months", small ? 14 : 15, ink, true);
  w.addSpacer(8);
  label("Today");
  const today = data.todayEvents.slice(0, small ? 2 : 3);
  if (today.length === 0) line(data.todayText, 13, soft, false);
  for (const e of today) line(e.text, 13, soft, false);
  if (!small && data.carryOn) {
    w.addSpacer(8);
    label("Carry on");
    line(data.carryOn.text, 13, ink, false);
  }
}
w.addSpacer();
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;

/** The parts of the feed a KWGT text can show, each from one formula. */
export const KWGT_LINES = [
  { label: 'Next exam', path: '.nextExam.text' },
  { label: 'Today', path: '.todayText' },
  { label: 'Carry on', path: '.carryOn.text' },
] as const;

/** A KWGT text formula that shows one part of the feed at `url` (KWGT's wg function: docs.kustom.rocks). */
export const kwgtFormula = (url: string, path: string): string => `$wg("${url}", json, "${path}")$`;
