# DSBA Hub: real backend, TypeScript frontend

This is the brief every builder and reviewer works from. The lead (main session) owns this file, the models,
the migrations, the shared test harness and `package.json`/`pyproject.toml`; ask for changes in your final
report instead of making them.

## What we are building

DSBA Hub was a front-end prototype: every page ran on demo data in the browser. This branch
(`feature/backend`, off `feature/dsba-pulse`) makes it real:

- **Backend:** Python 3.11+ (the image runs 3.12), FastAPI, SQLAlchemy 2 (synchronous, psycopg 3), Alembic,
  Pydantic v2.
- **Database:** PostgreSQL 16 or newer (the shared dev server and CI run 16; `compose.yaml` and production run
  17) on a named Docker volume, dumped daily into a backup bucket of its own (`python -m app.cli backup`).
- **Files:** S3 API. MinIO locally (moto on the shared dev machine and in the tests), AWS S3 or MinIO behind
  HTTPS in production. Cloudflare R2 is not supported: it has no presigned POST, which the upload policy needs.
  The bucket is private. Browsers upload and download directly with presigned URLs; the API never streams file
  bodies.
- **Frontend:** the existing React app moved to `web/` and converted to strict TypeScript, talking to the API
  through a client generated from the OpenAPI document.
- **Production:** one server running Docker Compose (`compose.prod.yaml`): Caddy (TLS, the built app, security
  headers) in front of the API, PostgreSQL, a daily backup and a daily sweep. `docs/backend/DEPLOYMENT.md` is the
  guide.

### Product rules (from Mohamed)

- **Public, no login:** reading is open, as it is today. That covers modules and lessons, the library (browse
  and download published files), the forum (read), the newsletter, the calendar, the Career Navigator,
  search and the grades calculator.
- **Needs an account:** posting, replying, voting, accepting answers, reporting, uploading, starring,
  reactions, notifications, synced lesson progress and account settings.
- **Sign-in:** a phone number **or** an email address gets a 6-digit one-time code. There are no passwords,
  and anyone can create an account. After the first sign-in the person picks a display name and their
  cohort (Year 1/2/3, or none). An account can carry both an email and a phone number.
- **Roles:** every account holds `student`; `rep` (student reps: moderate the forum and library, edit the
  calendar and newsletter) and `admin` (also people, roles and switches) come on top, and admins can add custom
  roles. `DSBA_ADMIN_IDENTIFIERS` bootstraps admins.
  `python -m app.cli set-role ID ROLE...` sets someone's roles from the shell (slugs, such as `student admin`).
- **The grades calculator stays in the browser.** Students' marks are not sent to the server (privacy).

## Layout and ownership

```
api/                          Python backend
  app/main.py                 app factory, middleware                        lead
  app/config.py, db.py        settings (DSBA_*), engine/session              lead
  app/models/                 SQLAlchemy models (THE schema)                 lead: report needed changes
  migrations/                 Alembic                                        lead
  app/schemas/                Pydantic models = the API CONTRACT             see "Contract" below
  app/core/                   errors, security (sessions, roles, CSRF, client IP), headers, pagination,
                              text (slugs), links (link rules), time (UTC, Bahrain's today)   lead
  app/services/storage.py     S3 (presigned POST to incoming/, copy, presigned GET, head, delete)   lead
  app/services/notify.py      notify(db, user_id, kind, title, ...)          lead
  app/services/audit.py       record(db, actor, action, ...)                 lead
  app/services/identifiers.py normalise email / phone                        accounts
  app/services/{otp,sessions,mailer,sms,ratelimit,outbox}.py                accounts
  app/routers/auth.py me.py progress.py notifications.py admin.py           accounts
  app/routers/forum.py reports.py                                            community
  app/routers/library.py uploads.py modules.py newsletter.py calendar.py content.py   content
  app/seed/                   seed loader + data exported from the prototype content
  app/cli.py                  openapi, seed, set-role, backup, sweep, setup-bucket, mail-worker, dev-login
                              lead (seed: content)
  tests/conftest.py           shared harness                                 lead
  tests/core/                 settings, proxies, CSRF, headers, storage, /media, CLI, drift checks   lead
  tests/accounts|community|content/   each area's tests (+ its own conftest.py if needed)
  Dockerfile, requirements.txt   the API image; requirements.txt is uv.lock exported with hashes   lead
web/                          React + TypeScript
  src/api/                    client.ts (openapi-fetch + CSRF), errors.ts, queryClient.ts, schema.d.ts (generated)   lead
  src/main.tsx, src/lib/analytics.ts   entry point; PostHog, loaded only when built with a key   lead
  src/auth/                   AuthProvider, useAuth, SignInDialog        frontend-accounts
  src/ui, src/shell, src/state, src/styles   design system + app shell   frontend-accounts
  src/features/forum, notifications                                       frontend-community
  src/features/library, modules                                           frontend-library
  src/features/newsletter, calendar, career, grades, home, search, noora, about, onboarding   frontend-content
  e2e/, playwright.config.ts  the end-to-end suite (Playwright, against a running stack)
  Dockerfile, deploy/         the production image: the built app in Caddy (Caddyfile, CSP hashes)   lead
compose.yaml, .env.example    local stack                                     lead
compose.prod.yaml             production                                      lead
scripts/check.sh, .github/    every check in one command, and CI running it   lead
docs/backend/                 this brief, DEPLOYMENT.md (production)          lead
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
  `npm run api:types` at any time. CI fails while either file is stale: `tests/core/test_drift.py` compares
  `openapi.json` with what the app serves, `scripts/check.sh` compares `schema.d.ts` with `openapi.json`.
- Errors always look like `{"error": {"code", "message", "fields"?, "retryAfter"?}}`. Raise
  `ApiError` / `not_found()` / `forbidden()` / `conflict(code, msg)` / `invalid(field, msg)` /
  `rate_limited(seconds)` from `app.core.errors`. Codes are snake_case and stable; the web app branches on
  them. Messages are short, plain, and shown to students as they are. Every code is listed in
  `schemas/common.py` `ErrorCode` (code quality review CQ-10): a new one goes there first, mypy refuses any other,
  and the web app's `ApiError.code` is typed from it. One code per condition: `post_unavailable` for a deleted,
  hidden or removed target, `retry` when two writes collide, `thread_locked` only for a locked thread.
- Notification kinds are `schemas/notifications.py` `NotificationKind`; `notify()` takes nothing else and the
  database checks it (a new kind needs a migration).

## Backend conventions

- Handlers take dependencies from `app.core.security`: `DB`, `OptionalUser`, `CurrentUser` (401 if signed
  out), `ActiveUser` (also 403 when suspended or without a profile; use it for every write), `requires(box)`,
  `requires_any(...)` and `requires_admin()` (all need an active account with a profile), and `needs_feature(feature)`
  for the switches. A suspended account holds no boxes: a suspended rep sees and does what any student does.
- **Path operations are plain `def`.** The database layer (SQLAlchemy with psycopg) is synchronous, so FastAPI runs
  each handler in its threadpool; an `async def` handler would block the event loop while it waits on the
  database. Use `async def` only where everything inside awaits (FastAPI's own skill, `.claude/skills/fastapi`).
- **Client addresses** (rate limits, sessions, the audit log) come from `app.core.security.client_ip(request)`.
  It reads `X-Forwarded-For` only when the connection comes from `DSBA_TRUSTED_PROXIES` (production: Caddy).
  Never read the header yourself.
- **Authorization is checked in every write handler.** Owner or the box's holder, and never trust ids from the
  client. Return 404 (not 403) for things a person may not see, such as hidden posts or someone else's
  pending upload.
- **Transactions.** The request's session commits only when the handler calls `db.commit()`. Do the whole
  change, then commit once. Counters (`vote_count`, `reply_count`, `download_count`) are updated in the same
  transaction with SQL expressions (`Model.count + 1`), not read-modify-write in Python.
- **Time.** `app.core.time.utcnow()` returns UTC-aware datetimes. "Today" is `core.time.bahrain_today()`, and
  calendar days are days in `core.time.BAHRAIN`.
- **Notifications** go through `app.services.notify.notify(...)` (or `notify_all()` for every account). It never
  notifies an actor about their own action. The in-app notification always comes; for the kinds in
  `outbox.EMAIL_SWITCHES` an email is queued in the same transaction when the person has an email address and
  keeps that switch on (decision D1). The mail worker (`python -m app.cli mail-worker`) sends queued emails with
  retries; never send mail inside a request, except sign-in codes. **Audit** every moderation and admin action
  with `app.services.audit.record(...)`; actions on an account carry its name (`targetName`).
- **Shared rules** (code quality review CQ-6): slugs and ids from titles with `core.text.insert_with_unique_slug()`
  (a free one, retried on a race; a title without Latin letters gets a short id, decision D8), link and picture
  rules from `core.links`, a module from a request with `modules.require_module()`, how a person appears with
  `accounts.public_user()`, simple rate limits with `ratelimit.enforce()`.
- **Files.** Use `app.services.storage.get_storage()`. Browsers upload with a presigned POST (with
  `content-length-range` and an exact Content-Type) to `incoming/<uuid>`, which the bucket deletes after a day. On
  `complete`, the API checks what arrived (size, and an extension that matches an allowlisted type), copies it
  with `copy(..., if_match=<etag>)` to its final key (`library/<uuid>/<safe name>`, `forum/<uuid>/<safe name>`;
  `safe_file_name()`) under the allowlist's type, then checks the copy (size, and its first bytes against the
  type): no presigned policy can write a final key, so what passes is exactly what is served. Never trust the
  type the browser declared. Downloads are presigned GETs: attachments, or inline only for PDF and images
  (`presigned_get` refuses anything else inline).
- **Forum images** are served by `/api/v1/media/<id>` (a redirect to a short-lived link): to everyone only while
  the image is attached to a visible post (`Upload.thread_id` / `reply_id`), and always to its uploader and to
  moderators. Hiding or deleting the post hides its images too.
- **Clean-up** that can wait goes into the daily sweep (`python -m app.cli sweep`): uploads never attached to
  anything, old sign-in codes, ended sessions, files of rejected or removed library items. Add to it instead of
  running clean-up inside a request.
- **Rate limits** live in the database: count rows in a time window (OTP challenges per identifier and per
  IP, threads/replies/uploads per user per hour), counted under an advisory lock. No Redis.
- **Search** uses the generated `search_vector` columns (`simple` config, GIN). Use
  `websearch_to_tsquery` for full queries, plus a prefix match on the last word for search-as-you-type.
- **Markdown** is stored raw and rendered by the web app, which must escape HTML. The server limits lengths
  and derives plain-text excerpts.
- Type everything, tests included (mypy strict: `uv run --no-sync mypy app tests`). Ruff's rule sets include
  `FAST` (dependencies and parameters in `Annotated`), `DTZ` (no naive datetimes), `S` (bandit), `ASYNC`, `PERF`,
  `PIE` and `FURB`; see `[tool.ruff.lint]` in `api/pyproject.toml`. Keep handlers thin: queries
  and rules live in small functions or a `services/<area>.py` you own.
- **Tests** (pytest) cover each endpoint's happy path, auth (guest / other user / rep), validation
  errors and rate limits. Fixtures from `tests/conftest.py`: `client_for(user=None)` (each call is a separate
  browser, with CSRF handled), `make_user(email=, phone=, name=, role=, year=)`, `db`, `storage` (moto: a
  browser upload in a test is `storage.client.put_object(Bucket=storage.bucket, Key=..., Body=..., ContentType=...)`).
  Run `uv run --no-sync pytest tests/<your area> -q`. Every test run gets its own database. `scripts/check.sh`
  runs everything CI runs (ruff, ruff format, mypy, the whole suite with the drift checks, and the web checks).

## Frontend conventions

- Strict TypeScript, `.ts`/`.tsx`, with no `any`: use `unknown` and narrow. Use `import type` for types.
  Imports carry no extensions. Components take typed props, and shared shapes live next to their feature
  (`features/<x>/types.ts`). API models come from `src/api/types.ts`
  (`import type { ThreadSummary } from '../../api/types'`).
- **Data.** `api` + `call()` from `src/api/client.ts` inside TanStack Query hooks in `features/<x>/api.ts`
  (query keys as constants, mutations that invalidate or update the cache, optimistic updates for votes and
  stars). Every query has a loading, an empty and an error state, all in the existing design-system style.
- **TanStack Query's ESLint rules** (`@tanstack/eslint-plugin-query`, `flat/recommended`) run with the lint:
  everything a query function reads goes in its key. A query function that needs the client takes it from its
  context (`queryFn: ({ client }) => …`) rather than from a closure.
- **Effects are for syncing with things outside React** (react.dev, "You Might Not Need an Effect"). Derive values
  during render, put interaction logic in event handlers, and reset a component's state with a `key` instead of
  an effect that calls `setState`.
- **Accounts.** `useAuth()` gives `{ me, status, isModerator, isAdmin, requireAuth, openSignIn, signOut }`.
  Guard actions with `if (!requireAuth('Sign in to reply', retry)) return;`. Never hide public content
  behind sign-in.
- **Remove prototype-only code** as you take over a feature: seed or demo data, simulated classmates, mock
  file contents, the film hooks (`hub.forum.hidden`, frozen clocks), and localStorage stores for anything the
  server now keeps. localStorage stays only for guest conveniences: theme, a guest's chosen cohort, and a
  guest's lesson progress, which is imported on sign-in.
- **Routing** is a data router at `/`: `createBrowserRouter` in `App.tsx`, the page table in `routes.tsx`, React
  Router 7 (`react-router-dom`; v6 had open-redirect advisories). `useLeaveGuard` blocks navigation away from unsaved
  edits with `useBlocker`, and reloads with `beforeunload`.
  Keep every existing URL working: `/forum/:slug`, `/library/:idOrSlug`, `/newsletter/:slug`, `/modules/:id`.
  Links from user content go through `ui/safeHref.ts`.
- **Analytics** (PostHog) load only in a build with `VITE_POSTHOG_KEY` (`src/lib/analytics.ts`): page views only,
  anonymous. Never call `identify()` or send anything a student typed.
- **Keep the design.** Reuse `src/ui` and the CSS tokens; new UI (sign-in, upload, moderation queues) must
  look like it was always part of the app. Copy is plain, short and in sentence case. Errors say what
  happened and what to do. Keep it accessible: labels, focus management in dialogs, visible keyboard focus.
- **Unit tests** (Vitest, `npm test`) sit next to the code as `<name>.test.ts` and cover pure modules: parsers,
  link checks, dates, reducers (`ui/safeHref.test.ts` is the pattern). Keep logic you want to test out of
  components.
- Check your work with `npm run typecheck` (the app, and the configs and e2e suite), `npx eslint src/<your area>`,
  `npm test` and `npx vite build --logLevel error`. Look at your pages in a browser (Playwright) on your own
  dev-server port.

## Development environment

With Docker (the usual setup, Mohamed's Mac): `docker compose up --build`. Without Docker: README, "Run it without
Docker". Either way:

| what | where |
|---|---|
| PostgreSQL | `127.0.0.1:5432`, user `dsba` / `dsba`, database `dsba`. Tests create their own databases (`DSBA_TEST_ADMIN_URL`). |
| S3 | MinIO in Docker (`http://localhost:9000`, console `:9001`), or moto without Docker; bucket `dsba-hub`, keys `dsba` / `dsba-dev-secret` |
| Email | Mailpit in Docker (`http://localhost:8025`); without Docker, the API's log (`DSBA_EMAIL_BACKEND=console`) or files (`file`) |
| Texts | the API's log (`console`) or files (`DSBA_SMS_BACKEND=file`, `DSBA_SMS_FILE_DIR`) |
| API | `http://127.0.0.1:8000` (`/api/v1/docs`); it reloads when a file under `api/app` changes |
| Web | `:5173`. Parallel agents each run their own Vite from their own worktree (`npx vite --port 5174` … `5178`); all pass `/api` to `:8000`. |

- **Sign in without a code** (development only):
  `cd api && uv run --no-sync python -m app.cli dev-login you@example.com --name "Test Student" --year 2 [--role rep]`
  (in Docker: `docker compose exec api python -m app.cli dev-login …`). It prints a token; set it as the
  `dsba_session` cookie for the app's host (Playwright:
  `context.add_cookies([{name:'dsba_session', value: token, domain:'127.0.0.1', path:'/'}])`).
- **Seed the dev DB:** `python -m app.cli seed` (the API also seeds when it starts).
- **Notification emails** go out when the mail worker runs (`python -m app.cli mail-worker`; Docker starts one).
  Sign-in codes don't need it.
- Keep test runs targeted and run long ones in the background; stop the dev servers you started when you finish.

## Security baseline (builders apply it from the start; the security reviewer checks it)

- One-time codes: 6 digits from `secrets`, stored only as an HMAC with `DSBA_SECRET_KEY`, compared in
  constant time. They expire after 10 minutes and allow 5 attempts per challenge. Codes are rate-limited per
  identifier and per IP. "Start sign-in" answers the same whether or not an account exists, and codes are
  never logged in production. Wrong codes lock the pair of address and network for a day, never the address
  (decision D4); after many wrong codes for an address, its codes are 10 letters and digits instead. A deleted
  account's codes stay, anonymised, so the limits keep counting them.
- Changing how one signs in (adding, changing or removing an email or phone) and deleting the account need a
  recent confirmation: a session less than 10 minutes old, or a step-up code sent to an identifier the account
  already has (decision D2; `sessions.require_step_up()`). Admins can recover an account
  (`PATCH /admin/users/{id}` with `email`/`phone`, audited).
- Sessions: a random token (256 bits) in an HttpOnly, SameSite=Lax cookie, stored only as a SHA-256. A session
  lasts `DSBA_SESSION_DAYS` (30) at most; there is no idle timeout yet (`docs/reviews/standards.md`, S-2). Rotate
  on sign-in, revoke on sign-out, and let people revoke other sessions. CSRF: the middleware checks every unsafe
  request for an `X-CSRF-Token` header equal to the CSRF cookie, and with a session the token must be the one bound
  to it (an HMAC of the session token: set at sign-in, replaced at sign-out), so a CSRF cookie planted by someone
  else fails. This is OWASP's signed double-submit pattern; SameSite=Lax is defense in depth on top, never instead.
  In production both cookies are `__Host-` cookies (Secure, `Path=/`, no `Domain`).
- Client addresses: `client_ip()` trusts `X-Forwarded-For` only from `DSBA_TRUSTED_PROXIES`, so nobody picks
  their own address for the rate limits.
- Authorization on every object: owner or the box's holder. Hidden, pending and removed things are 404 to others.
  A suspended rep or admin has no powers.
- Uploads: allowlisted extensions and types per purpose, size-capped in the presigned policy, uploaded to
  `incoming/` and checked again after the server-side copy to the final key, keys generated by the server.
  Downloads are attachments, except PDF and images, which are shown inline from a short-lived URL. Forum images
  are public only while their post is visible. Redirect only to the bucket or to a stored link URL (`https`
  only, validated when it is created).
- Output: the web app renders user markdown without raw HTML and allows only `http`, `https`, `mailto` and
  relative links, plus images from `/api/v1/media/`. Never use `dangerouslySetInnerHTML` with user
  content.
- Headers: the API sends `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, a deny-all CSP and
  `Cache-Control: no-store` unless a handler sets its own (always `no-store` for signed-in JSON;
  `app/core/headers.py`). In production Caddy adds HSTS and the web app's CSP (scripts only from the app, the one
  inline script by hash): `docs/backend/DEPLOYMENT.md`, section 6.
- Production fails closed: the API refuses to start while any setting is unsafe (`Settings.production_problems`:
  secret key, cookies, origins, proxies, storage, email, SMS) and lists every problem at once.
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

## Round 2 decisions (fix round after the reviews)

The reviews are in `docs/reviews/` (security, code-quality, ui-ux, student-test). The lead settled the product
questions they raised:

- **D1 Email notifications are real.** Notifications that matter go out by email to people who have an email
  address and keep the matching switch on: replies to your thread or reply, your answer accepted, your upload
  published or rejected, account security notices (already sent), and new newsletter issues. Delivery uses an
  outbox table drained by a worker, so a slow mail server never slows a request and failures retry. The
  switches on Your account map one-to-one to these kinds, and the in-app notification is never silenced by an
  email switch.
- **D2 Step-up for account changes.** Changing or removing an email or phone, and deleting the account, need a
  fresh code sent to an identifier the account already has (or, for deletion, any of them). A session alone
  is not enough.
- **D3 Hidden threads stay visible to their author.** The author can still open a hidden thread, with a banner
  saying a student rep hid it, and is notified when it is hidden. Everyone else gets a 404, as before;
  moderators see it with the hidden marker. No schema change: the reason travels in the notification.
- **D4 Sign-in lockout.** Follow SEC-2's recommended fix: wrong-code lockouts apply to the pair of address and
  network (IP, or /64 for IPv6); per-address limits only slow down, they never lock the owner out for a day.
- **D5 The newsletter editor is a form.** Sections and their blocks get real schemas (CQ-4), and reps edit them
  with fields, not JSON. It must work on a phone.
- **D6 Contribute means upload.** "Contribute" opens the library upload (sign-in first for guests). GitHub stays
  only as "Report a problem" on About.
- **D7 The year prompt never blocks.** A first-time visitor on any link sees the page, with a small prompt to pick
  a year, say they're not a student, or sign in.
- **D8 Titles without Latin letters** get a short id slug (`t-<6 chars>`), not `thread-2`.
- **D9 The library accepts images** (jpg, png, webp) for photos of handwritten notes, previewed inline.
- **D10 Kept as built:** reporters are visible to admins only; grades are cleared on sign-out; reading never
  needs an account.

Migrations in round 2: only the accounts builder adds one (0003, the email outbox) in the first wave; the core
builder adds index changes after it (0004). Nobody else changes `app/models` or `migrations/`.

## Round 4 decisions

- **D11 Access is by boxes, and roles are data.**
  - A box is one power, such as `newsletter.manage`. The code checks boxes, never role names.
  - A role is a named set of boxes that admins edit on the Access screen. A person may hold several roles.
  - Admin holds every box. A few powers stay with Admin and are no box: editing roles, giving roles, flipping
    switches, account recovery, seeing who reported something, and suspending an admin.
  - A suspended account holds no boxes. The last active admin can't lose Admin: the check locks the admins' role
    rows, and deleting your own account is refused while you're the last admin.
  - Admin powers need a fresh step-up (`step_up_required` otherwise). That covers roles, people's roles, switches,
    and changing someone's email or phone. Account recovery on an account holding Admin answers 403.
  - The Student role holds only its four student-level boxes; adding any other answers 422 on `boxes`.
  - A role's badge passes the staff-words check, and only holders of Admin or Rep may use staff words in names.
  - Changing your own roles, suspension or account through the admin routes answers 409 `cannot_change_self`.
  - Without Admin, the people list searches display names only, and no people response carries an email or phone.
    Reports are listed and resolved by their area's box, and the excerpt shows only to a holder of that box.
  - Publishing a newsletter issue sends its cohort email only if none went out in the last 24 hours; otherwise it
    publishes without the email and the response says so.
- **D12 Feature switches live in the hub.** Each feature is off, on for some roles, or on for everyone, and admins
  flip it on the Access screen. The API enforces it: a switched-off feature answers 404 `feature_off`, and search
  leaves it out. Media, uploads, downloads, calendar feeds, stats, reports and queued emails follow their feature
  too. A test fails on any route that neither declares a feature nor is listed as feature-free. Admins see every
  feature, so they can try one before switching it on.
- **D13 PostHog stays anonymous analytics.** Its own feature flags stay off. Switches reach it only as the list of
  features on during a visit, set by the web app.
