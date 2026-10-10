# DSBA Hub: real backend, TypeScript frontend

This is the brief every builder and reviewer works from. The lead (main session) owns this file, the models,
the migrations, the shared test harness and `package.json`/`pyproject.toml`; ask for changes in your final
report instead of making them.

## What we are building

DSBA Hub was a front-end prototype: every page ran on demo data in the browser. This branch
(`feature/backend`, off `feature/dsba-pulse`) makes it real:

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2 (synchronous, psycopg 3), Alembic, Pydantic v2.
- **Database:** PostgreSQL on a named Docker volume (`compose.yaml`), backed up daily into the bucket.
- **Files:** S3 API. MinIO locally, AWS S3 or Cloudflare R2 in production. The bucket is private. Browsers
  upload and download directly with presigned URLs; the API never streams file bodies.
- **Frontend:** the existing React app moved to `web/` and converted to strict TypeScript, talking to the API
  through a client generated from the OpenAPI document.

### Product rules (from Mohamed)

- **Public, no login:** reading is open, as it is today. That covers modules and lessons, the library (browse
  and download published files), the forum (read), the newsletter, the calendar, the Career Navigator,
  search and the grades calculator.
- **Needs an account:** posting, replying, voting, accepting answers, reporting, uploading, starring,
  reactions, notifications, synced lesson progress and account settings.
- **Sign-in:** a phone number **or** an email address gets a 6-digit one-time code. There are no passwords,
  and anyone can create an account. After the first sign-in the person picks a display name and their
  cohort (Year 1/2/3, or none). An account can carry both an email and a phone number.
- **Roles:** `student` (default), `moderator` (student reps: moderate the forum and library, edit the
  calendar and newsletter), `admin` (also people and roles). `DSBA_ADMIN_IDENTIFIERS` bootstraps admins.
  `python -m app.cli set-role` changes a role from the shell.
- **The grades calculator stays in the browser.** Students' marks are not sent to the server (privacy).

## Layout and ownership

```
api/                          Python backend
  app/main.py                 app factory, middleware                        lead
  app/config.py, db.py        settings (DSBA_*), engine/session              lead
  app/models/                 SQLAlchemy models (THE schema)                 lead: report needed changes
  migrations/                 Alembic                                        lead
  app/schemas/                Pydantic models = the API CONTRACT             see "Contract" below
  app/core/                   errors, security (sessions, roles, CSRF), text, pagination, time   lead
  app/services/storage.py     S3 (presigned POST/GET, head, delete)          lead
  app/services/notify.py      notify(db, user_id, kind, title, ...)          lead
  app/services/audit.py       record(db, actor, action, ...)                 lead
  app/services/identifiers.py normalise email / phone                        accounts
  app/services/{otp,sessions,mailer,sms,ratelimit}.py                       accounts
  app/routers/auth.py me.py progress.py notifications.py admin.py           accounts
  app/routers/forum.py reports.py                                            community
  app/routers/library.py uploads.py modules.py newsletter.py calendar.py content.py   content
  app/seed/                   seed loader + data exported from the prototype content
  app/cli.py                  openapi, seed, set-role, backup, sweep-uploads, dev-login   lead (seed: content)
  tests/conftest.py           shared harness                                 lead
  tests/accounts|community|content/   each area's tests (+ its own conftest.py if needed)
web/                          React + TypeScript
  src/api/                    client.ts (openapi-fetch + CSRF), errors.ts, queryClient.ts, schema.d.ts (generated)   lead
  src/auth/                   AuthProvider, useAuth, SignInDialog        frontend-accounts
  src/ui, src/shell, src/state, src/styles   design system + app shell   frontend-accounts
  src/features/forum, notifications                                       frontend-community
  src/features/library, modules                                           frontend-library
  src/features/newsletter, calendar, career, grades, home, search, noora, about, onboarding   frontend-content
compose.yaml, .env.example    local stack                                     lead
docs/reviews/                 reviewers' reports
```

Stay inside your files. If you need something from a file you don't own, put it in your final report as a
precise request (file, what, why). Never run git commands that change state: no add, commit, checkout,
stash or reset. Don't change `package.json`, `pyproject.toml` or lockfiles. If a dependency is truly
missing, say so in your report.

## The contract

`app/schemas/*` define every request and response. FastAPI turns them into `api/openapi.json`, and the web
app's types are generated from it (`web/src/api/schema.d.ts`). On the wire, fields are camelCase.

- Backend agents implement the routes exactly as declared in `app/routers/*`. Each stub raises
  `NotImplementedError`, which answers 501 until it is built.
- Changing a shape is allowed only additively: a new optional field or a new endpoint. Note every change in
  your report. The lead regenerates `openapi.json` and the TypeScript types:
  `cd api && uv run --no-sync python -m app.cli openapi > openapi.json && cd ../web && npm run api:types`.
  Backend agents may run that themselves after adding an endpoint. Frontend agents may run
  `npm run api:types` at any time.
- Errors always look like `{"error": {"code", "message", "fields"?, "retryAfter"?}}`. Raise
  `ApiError` / `not_found()` / `forbidden()` / `conflict(code, msg)` / `invalid(field, msg)` /
  `rate_limited(seconds)` from `app.core.errors`. Codes are snake_case and stable; the web app branches on
  them. Messages are short, plain, and shown to students as they are.

## Backend conventions

- Handlers take dependencies from `app.core.security`: `DB`, `OptionalUser`, `CurrentUser` (401 if signed
  out), `ActiveUser` (also 403 when suspended or without a profile; use it for every write), `Moderator`,
  `Admin`. `is_moderator(user)` covers moderators and admins.
- **Authorization is checked in every write handler.** Owner or moderator, and never trust ids from the
  client. Return 404 (not 403) for things a person may not see, such as hidden posts or someone else's
  pending upload.
- **Transactions.** The request's session commits only when the handler calls `db.commit()`. Do the whole
  change, then commit once. Counters (`vote_count`, `reply_count`, `download_count`) are updated in the same
  transaction with SQL expressions (`Model.count + 1`), not read-modify-write in Python.
- **Time.** `app.core.time.utcnow()` returns UTC-aware datetimes. "Today" in Bahrain means
  `ZoneInfo("Asia/Bahrain")`.
- **Notifications** go through `app.services.notify.notify(...)`. It never notifies an actor about their own
  action. **Audit** every moderation and admin action with `app.services.audit.record(...)`.
- **Files.** Use `app.services.storage.get_storage()` for presigned POST (with `content-length-range` and an
  exact Content-Type), presigned GET (attachment, or inline only for PDF and images), `head()` and `delete()`.
  Object keys are `library/<uuid>/<safe name>` and `forum/<uuid>/<safe name>`. On `complete`, check what was
  actually stored: the size limit, and an extension that matches an allowlisted content type. Never trust
  the type the browser declared.
- **Rate limits** live in the database: count rows in a time window (OTP challenges per identifier and per
  IP, threads/replies/uploads per user per hour). No Redis.
- **Search** uses the generated `search_vector` columns (`simple` config, GIN). Use
  `websearch_to_tsquery` for full queries, plus a prefix match on the last word for search-as-you-type.
- **Markdown** is stored raw and rendered by the web app, which must escape HTML. The server limits lengths
  and derives plain-text excerpts.
- Type everything (mypy strict: `uv run --no-sync mypy app`). Keep handlers thin: queries and rules live
  in small functions or a `services/<area>.py` you own.
- **Tests** (pytest) cover each endpoint's happy path, auth (guest / other user / moderator), validation
  errors and rate limits. Fixtures from `tests/conftest.py`: `client_for(user=None)` (each call is a separate
  browser, with CSRF handled), `make_user(email=, phone=, name=, role=, year=)`, `db`, `storage` (moto: a
  browser upload in a test is `storage.client.put_object(Bucket=storage.bucket, Key=..., Body=..., ContentType=...)`).
  Run `uv run --no-sync pytest tests/<your area> -q`. Every test run gets its own database.

## Frontend conventions

- Strict TypeScript, `.ts`/`.tsx`, with no `any`: use `unknown` and narrow. Use `import type` for types.
  Imports carry no extensions. Components take typed props, and shared shapes live next to their feature
  (`features/<x>/types.ts`). API models come from `src/api/types.ts`
  (`import type { ThreadSummary } from '../../api/types'`).
- **Data.** `api` + `call()` from `src/api/client.ts` inside TanStack Query hooks in `features/<x>/api.ts`
  (query keys as constants, mutations that invalidate or update the cache, optimistic updates for votes and
  stars). Every query has a loading, an empty and an error state, all in the existing design-system style.
- **Accounts.** `useAuth()` gives `{ me, status, isModerator, isAdmin, requireAuth, openSignIn, signOut }`.
  Guard actions with `if (!requireAuth('Sign in to reply', retry)) return;`. Never hide public content
  behind sign-in.
- **Remove prototype-only code** as you take over a feature: seed or demo data, simulated classmates, mock
  file contents, the film hooks (`hub.forum.hidden`, frozen clocks), and localStorage stores for anything the
  server now keeps. localStorage stays only for guest conveniences: theme, a guest's chosen cohort, and a
  guest's lesson progress, which is imported on sign-in.
- **Routing** is `BrowserRouter` at `/`. Keep every existing URL working: `/forum/:slug`,
  `/library/:idOrSlug`, `/newsletter/:slug`, `/modules/:id`.
- **Keep the design.** Reuse `src/ui` and the CSS tokens; new UI (sign-in, upload, moderation queues) must
  look like it was always part of the app. Copy is plain, short and in sentence case. Errors say what
  happened and what to do. Keep it accessible: labels, focus management in dialogs, visible keyboard focus.
- Check your work with `npx tsc -p tsconfig.json`, `npx eslint src/<your area>` and
  `npx vite build --logLevel error`. Look at your pages in a browser (Playwright) on your own dev-server port.

## Development environment (already running; don't restart shared services)

| what | where |
|---|---|
| Postgres 16 | `127.0.0.1:5432`, user `dsba` / `dsba`, database `dsba` (the shared dev DB). Tests create their own databases. |
| S3 (moto, stands in for MinIO) | `http://127.0.0.1:9000`, bucket `dsba-hub`, keys `dsba` / `dsba-dev-secret` |
| SMTP sink (stands in for Mailpit) | `127.0.0.1:1025`; each email is saved in `/home/claude/devsvc/mail/*.eml` |
| SMS (file backend) | each text is saved in `/home/claude/devsvc/sms/` |
| Shared dev API | `http://127.0.0.1:8000` (`/api/v1/docs`), auto-reloads on changes under `api/app`; log in `/home/claude/devsvc/api.log` |
| Web dev servers | the lead's at `:5173`; frontend agents run their own: `cd web && npx vite --port <yours>` (accounts 5174, community 5175, library 5176, content 5177, tester 5178). All proxy `/api` to `:8000`. |

- **Sign in without a code** (development only):
  `cd api && uv run --no-sync python -m app.cli dev-login you@example.com --name "Test Student" --year 2 [--role moderator]`.
  It prints a token; set it as the `dsba_session` cookie for `127.0.0.1` (Playwright:
  `context.add_cookies([{name:'dsba_session', value: token, domain:'127.0.0.1', path:'/'}])`).
- **Seed the dev DB** once the loader exists: `uv run --no-sync python -m app.cli seed`.
- Python: `cd api && uv run --no-sync <cmd>`. Node: `cd web && npx <cmd>`. Playwright and Chromium are
  installed (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).
- The machine has 2 CPUs and others share it. Keep test runs targeted, and don't leave watchers running
  when you finish (stop the dev servers you started).

## Security baseline (builders apply it from the start; the security reviewer checks it)

- One-time codes: 6 digits from `secrets`, stored only as an HMAC with `DSBA_SECRET_KEY`, compared in
  constant time. They expire after 10 minutes and allow 5 attempts per challenge. Codes are rate-limited per
  identifier and per IP. "Start sign-in" answers the same whether or not an account exists, and codes are
  never logged in production.
- Sessions: a random token in an HttpOnly cookie, stored only as a SHA-256. Rotate on sign-in, revoke on
  sign-out, and let people revoke other sessions. CSRF uses the double-submit cookie (middleware, already done).
- Authorization on every object: owner or moderator. Hidden, pending and removed things are 404 to others.
- Uploads: allowlisted extensions and types per purpose, size-capped in the presigned policy, verified with
  HEAD on `complete`, keys generated by the server. Downloads are attachments, except PDF and images, which
  are shown inline from a short-lived URL. Redirect only to the bucket or to a stored link URL (`https`
  only, validated when it is created).
- Output: the web app renders user markdown without raw HTML and allows only `http`, `https`, `mailto` and
  relative links, plus images from `/api/v1/media/`. Never use `dangerouslySetInnerHTML` with user
  content.
- No personal data in public responses: `UserPublic` is `{id, displayName, year, role}`, never an email or a
  phone number.
- Errors don't leak internals, and logs carry no codes, tokens or full phone numbers.

## Reviews and how the team works together

- Reviewers write to `docs/reviews/<role>.md`: `security-design.md`, `security.md`, `code-quality.md`,
  `ui-ux.md`, `student-test.md`. Each finding has a severity (blocker / major / minor), the file and
  line, what is wrong, and the fix.
- **Builders: check `docs/reviews/security-design.md` when it appears during your work and apply what
  concerns your area.** Note in your report which findings you addressed.
- Every agent ends with a report covering what it built, how it verified it (commands and results), any
  deviations from this brief or the contract, requests for the lead (schema or contract changes,
  dependencies), and open issues.
