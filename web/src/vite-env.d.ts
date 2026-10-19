/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API when it is not the app's own origin ('' or unset = same origin). */
  readonly VITE_API_ORIGIN?: string;
  /** PostHog project key; analytics are off without one (src/lib/analytics.ts). */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog API host (default https://us.i.posthog.com; https://eu.i.posthog.com keeps the data in the EU). */
  readonly VITE_POSTHOG_HOST?: string;
  /** Name of the API's CSRF cookie: dsba_csrf (the default) in development, __Host-dsba_csrf in production. */
  readonly VITE_CSRF_COOKIE?: string;
}

/** The build's version (vite.config.ts): in the footer, in index.html and sent with bug reports. */
declare const __APP_VERSION__: string;

/** Where pdf.js's decoders, character maps and fonts are served, ending in '/' (vite.config.ts, pdfjsAssets()). */
declare const __PDFJS_ASSETS__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
