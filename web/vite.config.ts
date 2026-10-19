import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const SW_ENTRY = 'src/sw/sw.ts';
// The offline spot is shown when the network is gone, so it is cached up front.
const OFFLINE_ART = '/illustrations/empty-offline.png';
const SW_PLACEHOLDER = '__DSBA_SW_MANIFEST__';

/**
 * Builds the service worker (src/sw/sw.ts) to /sw.js beside the app, and writes into it the build's version and the
 * files to keep from the start: the page itself ('/'), the entry script, the scripts it imports at once and their
 * styles. Pages loaded later are kept as they are first used. Production builds only: the dev server has no worker.
 */
function serviceWorker(): Plugin {
  return {
    name: 'dsba-service-worker',
    apply: 'build',
    config: () => ({
      build: {
        rollupOptions: {
          input: { index: 'index.html', sw: SW_ENTRY },
          output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
        },
      },
    }),
    generateBundle(_options, bundle) {
      const sw = bundle['sw.js'];
      if (sw?.type !== 'chunk') return this.error('The service worker (sw.js) is missing from the build.');
      const entry = Object.values(bundle).find((f) => f.type === 'chunk' && f.isEntry && f.name === 'index');
      if (entry?.type !== 'chunk') return this.error('The app’s entry script is missing from the build.');
      const files = new Set<string>([entry.fileName, ...entry.imports]);
      for (const name of [...files]) {
        const chunk = bundle[name];
        if (chunk?.type === 'chunk') for (const css of chunk.viteMetadata?.importedCss ?? []) files.add(css);
      }
      const assets = [...files].sort().map((f) => `/${f}`);
      const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
      const json = JSON.stringify({ version, precache: ['/', OFFLINE_ART, ...assets] });
      if (!sw.code.includes(SW_PLACEHOLDER)) return this.error('The service worker has no manifest placeholder.');
      // The placeholder sits inside a string literal, quoted either way by the minifier: escape for both.
      sw.code = sw.code.replace(SW_PLACEHOLDER, JSON.stringify(json).slice(1, -1));
    },
  };
}

/**
 * The build's version, shown in the footer and sent with bug reports: VITE_APP_VERSION when set (the Docker image sets
 * it from the commit Railway builds), else the commit, else 'dev'.
 */
function appVersion(env: Record<string, string>): string {
  if (env.VITE_APP_VERSION) return env.VITE_APP_VERSION.slice(0, 40);
  try {
    return (
      execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim() || 'dev'
    );
  } catch {
    return 'dev';
  }
}

/** The version in index.html as well (<meta name="app-version">), where a deploy check reads which build is live. */
function versionMeta(version: string): Plugin {
  return {
    name: 'dsba-version-meta',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'app-version', content: version }, injectTo: 'head' }],
  };
}

const PDFJS = 'node_modules/pdfjs-dist';
const PDFJS_VERSION = (JSON.parse(readFileSync(`${PDFJS}/package.json`, 'utf8')) as { version: string }).version;
/** pdf.js's own files, fetched by its worker as a page needs them (src/features/notes/pdf.ts). */
const PDFJS_FILES: Record<string, (name: string) => boolean> = {
  // The image decoders scanned pages need (JBIG2, JPEG 2000) and colour profiles, as wasm with plain-JS fallbacks.
  // quickjs-eval is left out: it runs a PDF's own scripts, which the notebook never does.
  wasm: (name) => /^(jbig2|openjpeg|qcms)/.test(name),
  cmaps: (name) => name.endsWith('.bcmap'),
  standard_fonts: (name) => /\.(pfb|ttf)$/.test(name),
  iccs: (name) => name.endsWith('.icc'),
};
const PDFJS_DIR = `assets/pdfjs-${PDFJS_VERSION}/`;
const CONTENT_TYPES: Record<string, string> = { wasm: 'application/wasm', js: 'text/javascript' };

/**
 * pdf.js's decoders, character maps, standard fonts and colour profiles at /assets/pdfjs-<version>/: copied into the
 * build, and served from node_modules by the dev server. The version in the path lets them be cached for good.
 */
function pdfjsAssets(base: string): Plugin {
  const files = Object.entries(PDFJS_FILES).flatMap(([dir, keep]) =>
    readdirSync(`${PDFJS}/${dir}`)
      .filter(keep)
      .map((name) => `${dir}/${name}`),
  );
  const prefix = `${base}${PDFJS_DIR}`;
  return {
    name: 'dsba-pdfjs-assets',
    config: () => ({ define: { __PDFJS_ASSETS__: JSON.stringify(prefix) } }),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        const file = path.startsWith(prefix) ? path.slice(prefix.length) : '';
        if (!files.includes(file)) return next();
        res.setHeader('Content-Type', CONTENT_TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream');
        res.end(readFileSync(`${PDFJS}/${file}`));
      });
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({ type: 'asset', fileName: `${PDFJS_DIR}${file}`, source: readFileSync(`${PDFJS}/${file}`) });
      }
    },
  };
}

const VENDOR =
  /\/node_modules\/(?:react|react-dom|scheduler|react-router|react-router-dom|@tanstack\/react-query|@tanstack\/query-core|openapi-fetch)\//;
const EDITOR =
  /\/node_modules\/(?:@tiptap\/[^/]+|prosemirror-[^/]+|linkifyjs|orderedmap|rope-sequence|w3c-keyname|fast-equals)\//;

/**
 * Two chunks of libraries, apart from the app's code: what every page runs on (React, the router, TanStack Query, the
 * API client), and the notebook's text editor (Tiptap and ProseMirror, only the notebook loads it). They change only
 * when the libraries are updated, so a deploy leaves them in the browser's cache. Every other chunk stays under
 * Vite's 500 kB warning, which is kept as the alarm.
 */
function libraryChunk(id: string): string | undefined {
  if (VENDOR.test(id)) return 'vendor';
  if (EDITOR.test(id)) return 'editor';
  return undefined;
}

// The app is served from the same origin as the API: in development Vite proxies /api to the backend,
// in production a reverse proxy does (see compose.yaml and docs/backend/DEPLOYMENT.md).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000';
  const version = appVersion(env);
  return {
    base: env.VITE_BASE || '/',
    plugins: [react(), serviceWorker(), versionMeta(version), pdfjsAssets(env.VITE_BASE || '/')],
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: { rollupOptions: { output: { manualChunks: libraryChunk } } },
    server: {
      host: env.VITE_DEV_HOST || '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: api } },
    },
    preview: { port: 4173, proxy: { '/api': { target: api } } },
  };
});
