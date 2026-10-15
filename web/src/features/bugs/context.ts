// What a bug report carries besides the student's words: the page, the app's version and the browser. Pure, so it
// can be tested; the dialog reads them from the page it was opened on.

/** The page inside the app, path and query, without the hash: what the API stores (at most 500 characters). */
export function pageOf(loc: Pick<Location, 'pathname' | 'search'>): string {
  return `${loc.pathname}${loc.search}`.slice(0, 500) || '/';
}

const BROWSERS: [RegExp, string][] = [
  [/Edg\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/CriOS\/(\d+)/, 'Chrome'],
  [/FxiOS\/(\d+)/, 'Firefox'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[\d.]* .*Safari/, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPad|Macintosh.*Mobile/, 'iPadOS'],
  [/iPhone|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** 'Chrome 141 on macOS, 1440×900' from a user agent and the window's size; the user agent itself when unknown. */
export function browserOf(userAgent: string, width?: number, height?: number): string {
  const browser = BROWSERS.map(([re, name]) => {
    const m = re.exec(userAgent);
    return m ? `${name} ${m[1]}` : null;
  }).find(Boolean);
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  const size = width && height ? `, ${width}×${height}` : '';
  if (!browser) return `${userAgent.slice(0, 260)}${size}`;
  return `${browser}${system ? ` on ${system}` : ''}${size}`;
}
