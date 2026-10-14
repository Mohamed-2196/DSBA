import { createHash } from 'node:crypto';
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

// The app is served from the same origin as the API: in development Vite proxies /api to the backend,
// in production a reverse proxy does (see compose.yaml and docs/backend/DEPLOYMENT.md).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000';
  return {
    base: env.VITE_BASE || '/',
    plugins: [react(), serviceWorker()],
    server: {
      host: env.VITE_DEV_HOST || '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: api } },
    },
    preview: { port: 4173, proxy: { '/api': { target: api } } },
  };
});
