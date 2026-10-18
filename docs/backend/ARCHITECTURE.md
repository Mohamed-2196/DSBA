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

## Layout

```
api/                          Python backend
  app/main.py                 app factory and middleware (body caps, control characters, CSRF, CORS, headers)
  app/config.py, db.py        settings (DSBA_*; every one is in DEPLOYMENT.md, section 12), engine and session
  app/models/                 SQLAlchemy models, the schema: user access activity outbox content forum library
                              requests seniors newsletter notes board my_calendar noora daily daily_content bugs
  migrations/                 Alembic, one file per change (the drift test compares them with the models)
  app/schemas/                Pydantic models: the API contract
  app/core/                   errors, security (sessions, CSRF, client IP), access (boxes, features), headers,
                              pagination, text (slugs), links (link rules), time (UTC, Bahrain's today),
                              limits (a body cap a route sets itself), logs (the feed secret kept out of logs)
  app/routers/                thin HTTP layer, one file per area (mounted in routers/__init__.py):
                              health auth me progress notifications admin access features
                              forum reports requests seniors suggestions summary bugs
                              modules library uploads newsletter calendar feeds content site grades
                              notes board noora mini_noora daily daily_content
  app/services/               the logic:
                              accounts identifiers otp sessions mailer sms outbox notify notifications summary
                              ratelimit audit access roles reports bugs
                              forum/ (threads, replies, votes, follows, search, views, visibility, notices,
                              taxonomy, settings, ...)
                              requests seniors suggestions gaps polls
                              library uploads storage search content modules module_editor
                              newsletter newsletter_settings newsletter_images calendar my_calendar career
                              past_questions exam_names paper_text text_extract drive drive_import
                              documents (the documents edited whole in Manage) site grades
                              notes note_doc board/ (boards, cards, plans, files, reminders, export, common)
                              noora/ (ask, prompt, paper, settings)
                              daily/ (plays, content, editor, bundle, streaks, badges, sudoku_engine, games/)
  app/seed/                   the seed loader and the starting content (data/*.json; data/daily: the Daily themes
                              and the word game's guess list)
  app/cli.py                  openapi, seed, set-role, backup, sweep, setup-bucket, mail-worker, weekly-summary,
                              import-drive, exam-meta, text-worker, extract-texts, make-covers, texts-role,
                              daily-content, dev-login, enable-features (`python -m app.cli --help` says what each does)
  tests/conftest.py           shared harness (each run makes its own database)
  tests/core|accounts|community|content|notes|board|noora|daily/   each area's tests
  Dockerfile, requirements.txt   the API image; requirements.txt is uv.lock exported with hashes
web/                          React + TypeScript
  src/api/                    client.ts (openapi-fetch + CSRF), errors, keys, paging, uploads, pictures,
                              queryClient, schema.d.ts (generated) and types.ts (its names)
  src/main.tsx, src/lib/      entry point; dates, share and useCopyLink, exams (zones and sittings), modules, pwa,
                              version, analytics (PostHog, only when built with a key), ink/ (the notebook's pen
                              strokes)
  src/auth/                   AuthProvider, useAuth, sign-in, access (boxes and features), preferences
  src/ui/                     the design system; ui/docEditor/ is the kit every document edited whole in Manage
                              uses (below)
  src/shell, src/state, src/styles, src/sw   app shell, shared state, tokens, the service worker
  src/features/               about access account board bugs calendar career daily forum grades home library
                              manage modules newsletter noora notes notifications onboarding papers requests
                              search site start; each meets the others only through its public.ts
  e2e/, playwright.config.ts  the end-to-end suite (Playwright, against the Docker stack: scripts/e2e.sh)
  Dockerfile, deploy/         the production image: the built app in Caddy (Caddyfile, CSP hashes)
compose.yaml, .env.example    local stack
compose.e2e.yaml              what scripts/e2e.sh changes for the end-to-end suite
compose.prod.yaml             production
scripts/                      check.sh (every check CI runs), e2e.sh, seed-real.sh, check-deploy.sh, install-hooks.sh
.github/workflows/            ci.yml (check.sh on every push), railway.yml (checks each dev deploy)
private/                      git-ignored: content kept out of the public repository (the Daily content file, below)
docs/backend/                 this brief, CMS.md (what students see and where it is edited), DEPLOYMENT.md
docs/reviews/                 reviewers' reports
```

Builders work on their own branch in their own git worktree and commit there; the lead merges. A builder that
needs a change in an area another builder holds says so in its report (file, what, why). Don't change
`package.json`, `pyproject.toml` or lockfiles without saying why in the report.

### Where each area lives

| Area | Routers | Services | Tables | Web |
|---|---|---|---|---|
| Accounts, sign-in, sessions | `auth`, `me`, `progress`, `notifications` | `accounts`, `identifiers`, `otp`, `sessions`, `notifications`, `notify`, `outbox`, `mailer`, `sms` | `users`, `otp_challenges`, `user_sessions`, `notifications`, `lesson_views`, `lesson_resume`, `email_outbox` | `src/auth`, `account`, `notifications`, `onboarding` |
| Access, people, reports, the activity log | `access`, `admin`, `features`, `reports` | `access`, `roles`, `audit`, `reports` | `roles`, `role_boxes`, `user_roles`, `feature_switches`, `feature_switch_roles`, `reports`, `audit_log` | `access`, `manage` |
| Forum, with its categories, tags, guidelines and tips | `forum` | `forum/` (`taxonomy` and `settings` for Manage → Forum) | `forum_*` | `forum` (`forum/settings` is Manage → Forum) |
| Library, past papers, the Drive import, the text worker | `library`, `uploads` | `library`, `uploads`, `storage`, `past_questions`, `exam_names`, `drive`, `drive_import`, `paper_text`, `text_extract` | `library_items`, `library_texts`, `library_stars`, `paper_questions`, `paper_question_flags`, `drive_folders`, `uploads` | `library`, `papers` |
| Requests, "You asked, we did", the reps' gaps | `requests` | `requests`, `gaps` | `requests`, `request_me_toos` | `requests` |
| Modules and lessons, their editor and pictures, suggested videos | `modules`, `suggestions` | `modules`, `module_editor`, `suggestions` | `modules` (with `art`), `chapters`, `lessons`, `video_suggestions` | `modules` (`modules/editor`) |
| Newsletter, its settings and pictures, polls | `newsletter` | `newsletter`, `newsletter_settings`, `newsletter_images`, `polls` | `newsletter_*`, `content_docs` | `newsletter` (`newsletter/settings`) |
| Programme calendar, each student's own calendar and private feed | `calendar`, `feeds` | `calendar`, `my_calendar` | `calendar_events`, `personal_events`, `calendar_prefs` | `calendar` (`mine.ts`, `MyEventDialog`) |
| Career Navigator and its editor, seniors who answer | `content`, `seniors` | `career`, `content`, `documents`, `seniors` | `content_docs` (`career`), `uploads` (logos), `senior_profiles` | `career` (`career/editor`) |
| Site settings and the guides | `site` | `site`, `documents` | `content_docs` | `site`, `start` (`start/editor`) |
| Grades calculator's rules | `grades` | `grades`, `documents` | `content_docs` | `grades` (`grades/editor`) |
| Sunday summary, its words and time | `summary` | `summary`, `outbox` | `weekly_summaries`, `content_docs` | `manage` (`SummaryWords`) |
| Notebook (typed text, ink, pictures, PDFs) | `notes` | `notes`, `note_doc` | `notebooks`, `notes`, `note_ink`, `uploads` | `notes`, `src/lib/ink` |
| Boards (columns, labels, cards, checklists, files, comments, reminders, plans) | `board` | `board/` | `boards`, `board_*` | `board` |
| Mini Noora, her settings and script | `noora`, `mini_noora` | `noora/` (`settings` for Manage → Mini Noora) | `noora_limits`, `noora_usage`, `content_docs` | `noora` (`noora/page`, `noora/settings`) |
| Daily puzzles and their content | `daily`, `daily_content` | `daily/` (`editor`, `bundle` for Manage → Daily puzzles) | `daily_plays`, `daily_profiles`, `daily_themes`, `daily_theme_weeks`, `daily_items`, `daily_sets`, `daily_set_items`, `daily_seed`, `daily_guess_words`, `daily_nearest_words` | `daily` (`daily/editor`) |
| Bug reports | `bugs` | `bugs` | `bug_reports`, `uploads` (screenshots) | `bugs` |
| Search | `content` (`/search`) | `search` | the `search_vector` columns | `search` |

**Documents edited whole.** Site settings, the guides, the grades calculator's rules, Mini Noora's words, the
newsletter's settings, the Sunday summary's words and the forum's settings are each one JSON document in
`content_docs`, read and saved through `services/documents.py` (a `documents.Kind` each): the saved document, or its
starting content (`app/seed/data/<name>.json`) until the first save; a save that names the version it was edited from
(409 with the document's own code, such as `site_changed`, when someone saved first); and an audit entry with what
changed, before and after. The forum's categories and tags are tables of their own, saved with its document. Career
Navigator is a document of the same kind with a service of its own (`services/career.py`: it attaches logos when it
saves). The seven editors in Manage are built on `src/ui/docEditor` (`DocFrame` with its save bar and the "Load it
again" banner, `ListEditor`, `RowsEditor`, `docErrors` for the API's field errors); Career Navigator's editor
(`career/editor`) and the modules editor have their own. What each document holds, who edits it and where it starts
from is `docs/backend/CMS.md`, kept current, so this brief doesn't repeat it.

**Site settings** (`features/site`): `useSite()` reads GET /site once for the footer, About, the sidebar's links to
MyClass and the University, search's other words, the grades calculator's note and the guides' saved links; About
(`/about`) is a page of this feature, and `SiteEditor` is Manage → Site settings.

**Private content.** `private/` at the top of the repository is git-ignored. `private/daily-content.json` holds every
Daily puzzle with its answer; it never goes into the repository or a chat. A new environment gets it from Manage →
Daily puzzles → Load a content file (admins), or `python -m app.cli daily-content import FILE`; `daily-content export
FILE` writes one back (CMS.md, "Daily puzzles").

## The contract

`app/schemas/*` define every request and response. FastAPI turns them into `api/openapi.json`, and the web
app's types are generated from it (`web/src/api/schema.d.ts`). On the wire, fields are camelCase.

- Nothing is released, so shapes change directly: rename, remove or retype a field when that keeps the code
  simpler, with no aliases or deprecated fields (CLAUDE.md). Note every change in your report.
- After any change to a shape, regenerate both files together:
  `cd api && uv run --no-sync python -m app.cli openapi > openapi.json && cd ../web && npm run api:types`. CI fails while either file is stale: `tests/core/test_drift.py` compares
  `openapi.json` with what the app serves, `scripts/check.sh` compares `schema.d.ts` with `openapi.json`.
- Errors always look like `{"error": {"code", "message", "fields"?, "retryAfter"?}}`. Raise
  `ApiError` / `not_found()` / `forbidden()` / `conflict(code, msg)` / `invalid(field, msg)` /
  `rate_limited(seconds)` from `app.core.errors`. Codes are snake_case and stable; the web app branches on
  them. Messages are short, plain, and shown to students as they are. Every code is listed in
  `schemas/common.py` `ErrorCode`: a new one goes there first, mypy refuses any other,
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
- **Shared rules:** slugs and ids from titles with `core.text.insert_with_unique_slug()`
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
  browser, with CSRF handled), `make_user(email=, phone=, name=, roles=, year=)` (`roles` is a sequence of slugs, `("student",)` by default), `db`, `storage` (moto: a
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
  server keeps.
- **Browser storage** holds device settings (the theme, Mini Noora's place, a guest's cohort and lesson progress,
  imported on sign-in) and a person's own unsent or private things: drafts, recent searches, the grades calculator's
  marks, practice scores on past papers, Mini Noora's chats, Daily's pencil marks. Every key of the second kind starts
  with `hub.mine.`, so signing out removes it from localStorage and sessionStorage (`auth/queries.ts`,
  `clearPersonalStorage`): lab and library computers are shared.
- **Routing** is a data router at `/`: `createBrowserRouter` in `App.tsx`, the page table in `routes.tsx` (each page
  lazy), React Router 7 (`react-router-dom`; v6 had open-redirect advisories). The newsletter's issue editor blocks
  navigation away from unsaved edits with `useLeaveGuard` (`useBlocker`) and reloads with `beforeunload`; Manage's
  other editors only warn on a reload so far (`docs/reviews/code-quality.md`, CQ-60). React Router allows one blocker
  at a time. Pages are read by slug (`/forum/:threadId`, `/library/:fileId`, `/newsletter/:slug` take the slug the API
  gives). Links from user content go through `ui/safeHref.ts`.
- **Analytics** (PostHog) load only in a build with `VITE_POSTHOG_KEY` (`src/lib/analytics.ts`): page views only,
  anonymous. Never call `identify()` or send anything a student typed.
- **Keep the design.** Reuse `src/ui` and the CSS tokens; new UI (sign-in, upload, moderation queues) must
  look like it was always part of the app. Copy is plain, short and in sentence case. Errors say what
  happened and what to do. Keep it accessible: labels, focus management in dialogs, visible keyboard focus.
- **Progressive Web App (PWA):** `/manifest.webmanifest` and `/sw.js` (`web/src/sw/`, `web/src/lib/pwa.ts`).
  The service worker caches the app shell, fonts and static assets, and prompts "Reload" when an update is deployed.
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
- **Seed the dev DB:** `python -m app.cli seed` (the Docker stack's `api` service runs the migrations and the seed
  when it starts). `python -m app.cli enable-features` switches every feature on (development only, audited).
- **The mail worker** (`python -m app.cli mail-worker`; Docker starts one) sends notification emails, queues the
  Sunday summaries at the time set in Manage → Sunday summary, and turns board cards' and personal events'
  reminders into notifications. Sign-in codes don't need it; reminders do.
- **The text worker:** `python -m app.cli text-worker` reads the words and makes the cover of each published PDF and
  Word file, for search inside papers. `extract-texts` and `make-covers` do the files already there.
- **Mini Noora AI:** `DSBA_ANTHROPIC_API_KEY` and `DSBA_NOORA_MODEL` (default: `claude-haiku-4-5-20251001`) power
  rich AI answers when the `noora.ai` feature switch is turned on; without the key or when off, Noora answers in
  script mode.
- **Drive import pacing:** `python -m app.cli import-drive` imports linked Google Drive folders into S3/MinIO,
  pacing downloads (2 s apart) and handling Google automated-query rate-limit blocks.
- **Daily puzzles:** a fresh database has the themes and the guess list only. Load the private content file
  (`private/daily-content.json`, "Private content" above) to get puzzles.
- Keep test runs targeted and run long ones in the background; stop the dev servers you started when you finish.

## Access: boxes, admin powers and switches

The Access screen (`/admin/access`, admins) edits roles and switches; the rules are decision D11 and D12 below, and
the lists are `app/core/access.py` (`BOXES`, `FEATURES`), which the screen shows as they are written there.

| Box | What it allows | Held from the start by |
|---|---|---|
| `forum.post` | start threads, reply, vote, accept answers, edit your own posts | Student |
| `library.upload` | upload files for review | Student |
| `newsletter.react` | react to issues and vote in their polls | Student |
| `reports.create` | report a post or a file | Student |
| `forum.moderate` | hide, lock and remove threads and replies, forum reports; Manage → Forum (categories, tags, guidelines, tips) | Rep |
| `library.manage` | review uploads, add links, edit and remove items, library reports | Rep |
| `newsletter.manage` | write, edit, publish and delete issues; the newsletter's line and pictures | Rep, Newsletter manager |
| `calendar.manage` | add, edit and delete programme dates | Rep, Content manager |
| `career.edit` | Manage → Career Navigator | Content manager |
| `content.edit` | modules, chapters and lessons; suggested videos; Manage → Daily puzzles | Content manager |
| `guides.edit` | Manage → Guides: Start here, Results day, Choosing your electives | Rep, Content manager |
| `requests.manage` | answer and remove requests, and their reports | Rep |
| `summary.share` | a year's Sunday summary to paste into its group; its words and the time it goes out | Rep |
| `stats.view` | the hub's numbers | Rep |
| `people.suspend` | the people list; suspend and restore accounts | Admin only |
| `audit.read` | the activity log | Admin only |

Admin holds every box. These powers belong to Admin and are no box: roles and what each may do, giving roles, the
switches, account recovery, who reported something, suspending an admin, Site settings, the grades calculator's
rules, Mini Noora's words and her limits (Manage → Numbers), bug reports (Manage → Bugs) and loading a Daily content
file. Roles, people's roles, the switches, account recovery, Mini Noora's words and her limits also need a recent
confirmation: a session more than ten minutes old is asked for a step-up code (`SteppedUpAdmin` in
`routers/_base.py`, `sessions.require_step_up()`).

Every feature is a switch: off, on for some roles, or on for everyone. The baseline migration turns on the forum,
the library and its uploads, the newsletter, the calendar, Career Navigator, the grades calculator and Mini Noora;
every feature added since arrives off (`python -m app.cli enable-features` turns them all on in development).

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
- The text worker opens files anyone could have uploaded, so it holds the least: in production it connects as its
  own database role, `dsba_texts`, which may only read `library_items` (and note a file's hash) and keep the words in
  `library_texts` (`paper_text.WORKER_GRANTS`; the `migrate` service runs `python -m app.cli texts-role` after every
  migration, with `DSBA_TEXTS_DB_PASSWORD`), and its own bucket key, which may only read `library/*` and write
  `covers/*`. It gets no secret key, mail, texts or AI key (`Settings.texts_problems` checks only the database and the
  bucket). Each file is read in a child process with a time and memory limit, an environment without settings, and a
  non-dumpable parent. DEPLOYMENT.md, sections 2 and 3, has the role, the key's policy and the settings.
- No personal data in public responses: `UserPublic` is `{id, displayName, year, badge}`, never an email or a
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
- **D4 Sign-in lockout:** wrong-code lockouts apply to the pair of address and
  network (IP, or /64 for IPv6); per-address limits only slow down, they never lock the owner out for a day.
- **D5 The newsletter editor is a form.** Sections and their blocks get real schemas, and reps edit them
  with fields, not JSON. It must work on a phone.
- **D6 Contribute means upload.** "Contribute" opens the library upload (sign-in first for guests). GitHub stays
  only as "Report a problem" on About.
- **D7 The year prompt never blocks.** A first-time visitor on any link sees the page, with a small prompt to pick
  a year, say they're not a student, or sign in.
- **D8 Titles without Latin letters** get a short id slug (`t-<6 chars>`), not `thread-2`.
- **D9 The library accepts images** (jpg, png, webp) for photos of handwritten notes, previewed inline.
- **D10 Kept as built:** reporters are visible to admins only; grades are cleared on sign-out; reading never
  needs an account.

Migrations: a builder that changes `app/models` adds one migration with the number it was given; the lead
re-chains them at merge.

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
