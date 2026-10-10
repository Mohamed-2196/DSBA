// Prints the Content-Security-Policy sources for the inline <script> blocks of a built index.html, e.g.
//   'sha256-Abc...='
// web/Dockerfile runs it after `vite build`; deploy/Caddyfile puts the result in script-src, so the inline theme
// script (applied before first paint) keeps working while every other inline script is refused.
//
//   node deploy/csp-hashes.mjs dist/index.html
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'dist/index.html';
const html = readFileSync(file, 'utf8');
const sources = [];
for (const [, attributes = '', body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/\bsrc\s*=/i.test(attributes)) continue; // external scripts are allowed by 'self'
  sources.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
}
process.stdout.write(sources.join(' '));
