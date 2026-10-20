import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (no Google Fonts): Bricolage Grotesque (display, with its optical sizes), Figtree (the interface),
// JetBrains Mono (codes and timers).
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/figtree/wght.css';
import '@fontsource-variable/figtree/wght-italic.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
// Arabic only (unicode-range subsets): forum posts written in Arabic. Two weights: 500 falls back to 400, 600 to 700.
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App';
import { indexedDbStore, startOfflineCache } from './api/offline';
import { queryClient } from './api/queryClient';
import { startPwa } from './lib/pwa';
import { preloadPage } from './routes';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

// The page's own code starts downloading now, alongside the app's first API calls, not after them.
preloadPage(window.location);

// The installed app: the install prompt and, in a production build, the service worker (lib/pwa.ts).
startPwa();

// What was kept for reading offline (api/offline.ts) is read before the first render, so a page opened offline has it
// at once. IndexedDB answers in milliseconds; a stuck one holds the app back for half a second at most.
const offlineReady =
  'indexedDB' in window ? startOfflineCache(queryClient, indexedDbStore()).catch(() => undefined) : null;
void Promise.race([offlineReady, new Promise((resolve) => setTimeout(resolve, 500))]).then(() =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);

// Product analytics only when the build has a key (VITE_POSTHOG_KEY): the SDK then loads on its own, after the app,
// with privacy-safe settings (lib/analytics.ts). Without a key nothing is loaded or sent.
const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
if (posthogKey) {
  import('./lib/analytics')
    .then(({ startAnalytics }) => startAnalytics(posthogKey, import.meta.env.VITE_POSTHOG_HOST))
    .catch(() => undefined); // analytics never gets in the way of the app
}
