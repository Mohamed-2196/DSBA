---
name: react-feature
description: Build or change a feature in DSBA Hub's web app (web/src/features) the way this repo does it — strict TypeScript on the generated API types, TanStack Query hooks in api.ts, the shared homes in src/ui, src/api, src/state and src/lib, public.ts between features, the design system, copy rules, responsive checks and Vitest. Use for any change under web/src.
---

# Build or change a web feature

Performance rules are in the `react-best-practices` skill. This skill is about how this repo is put together.
Before you start, read the feature you're changing and one well-kept neighbour; `features/notifications` is small
and typical.

## Where things go: `web/src/features/<x>/`
| File | Holds |
|---|---|
| `api.ts` | TanStack Query hooks and query keys for this feature |
| `public.ts` | the only thing other features may import from this one |
| `types.ts` | shapes the UI needs that the API doesn't define |
| `components/`, `lib/` | components, and pure logic with its `*.test.ts` next to it |
| `<Name>Page.tsx` | routed pages, registered lazily in `src/routes.tsx` |

## Data
- **Calls.** Use `call(api.GET('/api/v1/...', { params: { path, query } }))` from `src/api/client.ts`. Paths and
  types are generated from the API, so a typo is a compile error.
- **Types.** Take them from `src/api/types.ts`, which is generated, and never write `any`. If the API lacks a field,
  change the API first (the `fastapi-endpoint` skill).
- **Query keys** are constants: `export const NOTIFICATIONS_KEY = ['notifications'] as const`. Lists that page use
  `useInfiniteQuery` with `getNextPageParam: nextOffset` (`src/api/paging.ts`).
- **Mutations** update or invalidate exactly the queries they change. Votes and stars update optimistically and
  roll back on error. Cross-feature keys, like the admin stats, live in `src/api/keys.ts`.
- **States.** Every query has loading, empty and error states. Errors use `QueryError` (`src/ui`), titled "<The
  thing> didn’t load". For mutation errors use `errorMessage(e)` (`src/api/errors.ts`), and branch on the typed
  `ApiError.code`, not on the message text.

## Accounts
- `useAuth()` gives `{ me, status, isModerator, isAdmin, requireAuth, openSignIn, signOut }`.
- Guard actions with `if (!requireAuth('Sign in to reply', retry)) return;`.
- Reading never needs an account, so never hide public content behind sign-in.

## Shared homes: use them, never copy them
- **`src/ui`:** `ConfirmDialog` (`tone="danger"` opens on Cancel), `QueryError`, and the design-system parts.
- **`src/api`:**
  - `errors.ts`, `paging.ts` and `keys.ts`;
  - `uploads.ts`: `uploadFile(purpose, file, { onProgress, signal })` and the upload rules.
- **`src/state`:** `useDebouncedValue`, `useLocalStorage` and `removeStored`. localStorage is only for guest
  conveniences.
- **`src/lib`:**
  - `dates.ts`: `DayKey`, and today in Asia/Bahrain;
  - `share.ts`: `copyText`, `appUrl` and `hostOf`.
- **Links from user content** go through `ui/safeHref.ts`. Never use `dangerouslySetInnerHTML` with user content.

## Looks and words
- **Design system.** Keep it: reuse `src/ui` and the CSS tokens. Feature CSS must not reach into `.ui-*`
  internals.
- **Copy:** plain, short and in sentence case. Buttons say what happens ("Publish", then "Published"). Errors say
  what happened and what to do.
- **Accessibility:** labels on every field, focus moved into dialogs and back, keyboard paths, visible focus.
- **Responsive.** Check every screen you touch:
  - phones from 360×780, plus 844×390 landscape;
  - tablets (768×1024, 1024×768, 1366×1024);
  - laptops (1280×800, 1366×768, 1440×900);
  - monitors up to 3440×1440.

  At each size:
  - nothing scrolls sideways (`document.documentElement.scrollWidth > clientWidth` is false);
  - dialogs fit short screens;
  - touch targets are at least 44 px where `(pointer: coarse)`;
  - prose stays under about 75 characters per line.

  Script it with Playwright and look at the screenshots.

## Tests and checks
- **Vitest** covers pure modules: a `name.test.ts` next to the module (`src/ui/safeHref.test.ts` is the pattern).
  Keep logic out of components so it can be tested.
- **E2E.** If you change a flow, fix the e2e spec whose selectors you broke (the `e2e-test` skill).
- **Checks.** Run `scripts/check.sh web` in the background: both tsc projects, ESLint, Vitest, the schema drift
  check and the build.
