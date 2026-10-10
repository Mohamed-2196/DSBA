/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API when it is not the app's own origin ('' or unset = same origin). */
  readonly VITE_API_ORIGIN?: string;
  /** PostHog project key; analytics are off without one. */
  readonly VITE_POSTHOG_KEY?: string;
  /** Name of the API's CSRF cookie: dsba_csrf (the default) in development, __Host-dsba_csrf in production. */
  readonly VITE_CSRF_COOKIE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
