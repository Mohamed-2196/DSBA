// Shared Playwright helper: Google Fonts is blocked in this sandbox, so we
// intercept fonts.googleapis.com / fonts.gstatic.com and serve local
// @fontsource files instead. Also aborts analytics calls (PostHog) that would
// otherwise hang or spam errors.
import fs from 'fs';
import path from 'path';

const FS_ROOT = '/home/claude/launch-video/node_modules/@fontsource';

const FAMILIES = [
  { family: 'Playfair Display', pkg: 'playfair-display', weights: [400, 500, 600, 700, 800, 900], italic: true },
  { family: 'Roboto', pkg: 'roboto', weights: [100, 300, 400, 500, 700, 900], italic: true },
  { family: 'Inter', pkg: 'inter', weights: [300, 400, 500, 600, 700, 800, 900], italic: false },
  { family: 'JetBrains Mono', pkg: 'jetbrains-mono', weights: [400, 500, 700, 800], italic: false },
  { family: 'Fredoka', pkg: 'fredoka', weights: [400, 500, 600, 700], italic: false },
  { family: 'Caveat', pkg: 'caveat', weights: [400, 500, 600, 700], italic: false },
  { family: 'Space Grotesk', pkg: 'space-grotesk', weights: [300, 400, 500, 600, 700], italic: false },
];

function buildCss() {
  let css = '';
  for (const f of FAMILIES) {
    const styles = f.italic ? ['normal', 'italic'] : ['normal'];
    for (const w of f.weights) {
      for (const s of styles) {
        const file = `${f.pkg}-latin-${w}-${s}.woff2`;
        if (!fs.existsSync(path.join(FS_ROOT, f.pkg, 'files', file))) continue;
        css += `@font-face{font-family:'${f.family}';font-style:${s};font-weight:${w};font-display:block;` +
          `src:url(https://fonts.gstatic.com/__local/${f.pkg}/${file}) format('woff2');}\n`;
      }
    }
  }
  return css;
}

const CSS = buildCss();

export async function installFontRoutes(page) {
  await page.route(/fonts\.googleapis\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: CSS, headers: { 'access-control-allow-origin': '*' } }));
  await page.route(/fonts\.gstatic\.com\/__local\//, (route) => {
    const u = new URL(route.request().url());
    const [, , pkg, file] = u.pathname.split('/');
    const p = path.join(FS_ROOT, pkg, 'files', file);
    if (!fs.existsSync(p)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(p), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route(/posthog\.com/, (route) => route.abort());
}
