---
name: e2e-test
description: Write, run and fix DSBA Hub's Playwright end-to-end tests in web/e2e — the setup project that signs students up with real one-time codes, the persona fixtures (sara, ali, rep, admin, guest), the api() and remember() helpers, and pointing the suite at a running stack. Use when a flow changes, a spec fails, or a feature needs an end-to-end test.
---

# End-to-end tests (Playwright, `web/e2e`)

## How the suite is built
- **`playwright.config.ts`** has three projects:
  - `setup` (`*.setup.ts`) signs up two new students with real codes;
  - `app` (`*.spec.ts`) depends on it;
  - `cleanup` (`*.teardown.ts`) removes what the run created.
- **`fixtures.ts`** exports `test` with one page per persona, each in its own browser context:

  | Persona | Who |
  |---|---|
  | `sara` | Year 2, signed up by phone |
  | `ali` | Year 1, signed up by email |
  | `rep` | a student rep, via dev-login |
  | `admin` | an admin, via dev-login |
  | `guest` | nobody signed in |

  `run` holds this run's tag and ids. Import `test` from `./fixtures`, never straight from `@playwright/test`.
- **`support.ts`** holds the settings and helpers:
  - `env`, read from `E2E_*` variables;
  - `api(page, method, url, data)`, a request with the page's cookies and CSRF;
  - `remember(kind, id)`, so cleanup deletes what you made;
  - `waitForCode`, `makeFiles(tag)` for upload fixtures, and `trackErrors(page)` for console errors.

## Running it
- **The stack must be running,** and the suite needs to read the codes the API sends. Point it at your stack:
  - `E2E_BASE_URL` (default `http://127.0.0.1:5178`);
  - `E2E_MAIL_DIR` and `E2E_SMS_DIR`: where the API writes emails and texts, with `DSBA_EMAIL_BACKEND=file` and
    `DSBA_SMS_BACKEND=file`;
  - `E2E_DEV_LOGIN`: the command that prints a session token, e.g.
    `docker compose exec -T api python -m app.cli dev-login`.
- **Docker isn't wired up yet.** The defaults still point at the old cloud dev machine; `docs/STATUS.md` has the
  plan.
- **Commands.** `cd web && npx playwright test` runs everything (in the background: it takes minutes).
  `npx playwright test e2e/forum.spec.ts` runs one area; the setup project runs first. `--headed` or `--ui` help
  while debugging.

## Writing a test
- **Behaviour, not structure.**
  - Prefer `getByRole` and `getByLabel` with the real copy.
  - Use `[data-hub="..."]` hooks where the text is dynamic or repeated.
  - Never use CSS classes.
- **Make what you need.** Tag titles with `run.tag`, and `remember()` every id you create. Use made-up people only
  (`*@example.com`, random +973 numbers from `support.ts`).
- **Waits.** Wait for the request with `waitForResponse`, or for the visible result. Never `waitForTimeout`.
- **Dialogs.** Confirm them explicitly: `page.getByRole('dialog').getByRole('button', { name: 'Hide reply' })`.
  Toasts are checked with `getByText('Reply hidden')`.
- **A known bug** stays visible: `test.fail()` with the finding's ID (`// ST-4: …`). Remove it when the fix lands.
- **Copy changes.** When you change copy on purpose, update the selectors in the same commit. When a selector
  breaks unexpectedly, find out why before you change the test.

## When a spec fails
Use the `systematic-debugging` skill.
1. Read the trace, which is kept for failures. Results are written under `E2E_STATE_DIR` (by default a temp
   folder, `dsba-e2e-<port>`): `npx playwright show-trace <that folder>/test-results/<test>/trace.zip`.
2. Decide which it is: the test is out of date, the app is wrong, or the environment is off (codes not found, the
   stack not running).
3. Fix only what's wrong. If it's the app, report the finding instead of weakening the test.
