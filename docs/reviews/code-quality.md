# Code quality review (round 1)

Reviewer: code quality. Scope: all of `api/` and `web/` at commit `525962c` (the integrated state of `44f4c28` plus
the Playwright runner), with the backend-core files (`app/core/*`, `config.py`, `db.py`, `services/{storage,notify,audit}.py`,
`models/*`, `cli.py`, compose, `web/src/api/client.ts`) rechecked at the end (see "Recheck of the core files").
No application code was changed. Line numbers refer to `525962c`. Scratch tools and raw outputs are in
`/tmp/claude-0/-home-claude-dsba/331caa53-7cba-5bfe-8500-672e2c76573d/scratchpad/quality/` (route probe, CSS audit,
knip, typed lint, migration drift, bundle build).

## Summary

The codebase is in better shape than most first integrations: strict typing holds on both sides (mypy strict on
`app/`; 0 `any` and 0 non-null assertions in `web/src`), every list endpoint batch-loads its relations (no N+1 found:
reads run 5–11 SQL statements, session bookkeeping included), counters move in SQL, the models match the
migration exactly, the generated `openapi.json`/`schema.d.ts` are in sync, and 81 of 82 API operations have tests.
What will hurt a small student team is **the same thing written several times by different agents**: three
`UserPublic` serializers with three different fallback names, three rate limiters, three "is this person staff"
rules, four debounce hooks, three confirm dialogs, two upload pipelines, three module-detail queries on one cache
key, and about 930 lines of hand-written TypeScript types and parsers for JSON the API declares as `dict[str, Any]`.
Two things are wrong today: signing out leaves the previous person's recent searches live in the always-mounted
command palette, which shows them and writes them back (reproduced in a browser), and a NUL byte in a path or query
parameter gives a 500 on five public endpoints outside the forum. There are no frontend unit tests. No blockers;
7 majors, 11 minors. The backend-core changes in progress at the end of this round already resolve most of CQ-2 and
CQ-8 and add one small new duplication (the CSRF cookie set in two places); see "Recheck of the core files".

| ID | Severity | Owner | Title |
|---|---|---|---|
| CQ-1 | major | frontend-accounts (+ frontend-community) | Sign-out leaves the previous person's stored state live in mounted hooks |
| CQ-2 | major | lead, accounts, community, content | Stopgaps written while waiting for the core have diverged; delete them when it lands |
| CQ-3 | major | community | `services/forum.py` is 1,648 lines doing ten jobs, reports for library items among them |
| CQ-4 | major | lead (contract), content, frontend-content | Newsletter sections, the career document and the account export have no schema |
| CQ-5 | major | all four frontend agents | The same frontend helpers and components exist two to four times |
| CQ-6 | major | accounts, community, content | The same backend rules exist two or three times, and disagree |
| CQ-7 | major | lead (harness), content, all frontend | No frontend unit tests; brittle seed tests; missing drift tests |
| CQ-8 | minor | lead (+ content, community) | NUL bytes in parameters give 500s outside the forum; control-character guards are ad hoc |
| CQ-9 | minor | content | Content-area handlers are not thin; transaction boundaries differ by area |
| CQ-10 | minor | lead, community, content | Notification kinds and error codes are untyped strings; some codes overlap |
| CQ-11 | minor | frontend-library | Module library counts go stale after library changes |
| CQ-12 | minor | frontend-accounts, lead | PostHog is bundled into the entry chunk for everyone |
| CQ-13 | minor | frontend-library, frontend-accounts | CSS: `mod-` prefix collision and feature CSS reaching into `ui-*` internals |
| CQ-14 | minor | content, community | Check-then-insert races end as 500s; the audit log is used as state |
| CQ-15 | minor | lead | Indexes that match no query, missing ones, and column nits |
| CQ-16 | minor | lead, all backend | API naming: snake_case query vs camelCase bodies, `n` vs `limit`, hand-written query types |
| CQ-17 | minor | frontend-community, frontend-content, frontend-accounts | Oversized components; the whole app waits on `/modules` |
| CQ-18 | minor | lead | Tooling and repo hygiene: README, missing docs, ~4 MB of stray files, dead exports, no single check |

---

## Findings

### CQ-1. Sign-out leaves the previous person's stored state live in mounted hooks (major)

- **Owner:** frontend-accounts (`src/auth/queries.ts`, `src/state/useLocalStorage.ts`); frontend-community for the
  forum's duplicate of the same job.
- **Where:** `web/src/auth/queries.ts:33-41` (`clearPersonalStorage`), `web/src/state/useLocalStorage.ts:41-81`,
  `web/src/features/search/CommandPalette.tsx:150,259-265` (mounted for the app's lifetime in `shell/AppShell.tsx:38`),
  also `features/forum/NewThreadPage.tsx:136` and `features/grades/GradesPage.tsx:50`.
- **What:** `clearPersonalStorage()` calls `localStorage.removeItem()` directly. `useLocalStorage` only re-reads on
  its own `hub:storage` event or on the cross-tab `storage` event, so mounted hooks keep the old value in state and in
  `valueRef`, and their next functional update writes it back. Reproduced in Chromium against the dev server (guest
  context, key removed exactly as `clearPersonalStorage` does): the palette still listed the previous person's search
  after the removal, and after the next person searched for "calendar", storage held
  `["calendar","previous person: resit appeal"]`. Same mechanism for a forum draft or grades left open while signing
  out. This is the shared-computer case of `security-design.md` finding 23.
- **Related duplication:** `features/forum/api.ts:160-180` (`useForumViewerSync`, module-level `knownViewer`) and
  `lib/legacy.ts:34` (`forgetDraftOf`) redo what `refreshPersonalQueries`/`resetPersonalQueries`/`clearPersonalStorage`
  already do on sign-in and sign-out, and every forum widget must remember to call it (6 call sites). Two systems for
  one job means double invalidation now and a forgotten call later.
- **Fix:** in `useLocalStorage.ts` export `removeStored(key)` that removes the key and dispatches `hub:storage` with
  `source: 'external'` (every hook then re-reads and falls back to `initial`); use it in `clearPersonalStorage`.
  Delete `useForumViewerSync` and `forgetDraftOf` (the draft prefix is already in `PERSONAL_STORAGE_PREFIXES`). Add a
  unit test for `clearPersonalStorage` + a mounted hook (CQ-7).

### CQ-2. Stopgaps written while waiting for the core have diverged; delete them when it lands (major)

- **Owner:** lead (core), then accounts, community, content to delete their copies.
- **What:** while `core/security.py` and `config.py` lagged the security review, each area patched around them in its
  own way, and the patches now disagree:
  - **Who acts as staff.** `forum.moderates()` / `require_moderator()` check role *and* status
    (`services/forum.py:406-409,473-476`); `admin._require_active()` does the same for admin routes
    (`routers/admin.py:57-60`, called by hand in four handlers); content uses `core.security.is_moderator()`, role only
    (`services/library.py:102-118,160,349`, `services/newsletter.py:89-90,266-268`, `routers/newsletter.py:23`). A
    suspended rep is a student in the forum and still a rep in the library, calendar and newsletter (the security
    impact is `security.md` SEC-1; this finding is about having one definition).
  - **Client IP.** `core.security.client_ip()` (raw), `ratelimit.request_ip()` (validated, used by accounts and content),
    `forum._valid_ip()` (validated again, `services/forum.py:479-485`). Audit rows get IPs through three paths.
  - **Settings.** `services/otp.py:65-87` reads `sms_allowed_regions`, `sms_max_per_hour/day` and
    `otp_max_per_identifier_per_day` through `getattr(get_settings(), name, FALLBACK_SETTINGS[name])` + `cast`,
    untyped.
  - **Storage.** `services/uploads.py:216-251` (`_first_bytes`, `_promote`) call `st.client.get_object/copy_object`
    directly instead of going through `Storage`.
- **Fix:** when the core changes land: `get_moderator`/`get_admin` depend on `get_active_user`, and `is_moderator()`
  (or a new `acts_as_staff()`) checks the status; delete `forum.moderates`, `forum.require_moderator`,
  `admin._require_active` and replace every call with the core helper. `client_ip()` returns a validated address or
  `None`; delete `ratelimit.request_ip` and `forum._valid_ip`. Read the new settings as typed attributes and delete
  `FALLBACK_SETTINGS`, `setting` and `_int_setting`. Add `Storage.read_head(key, n)` and `Storage.copy(...)`
  and delete the two private helpers. One grep-able rule for the team: no area defines its own auth, IP or settings
  helper.

### CQ-3. `services/forum.py` is 1,648 lines doing ten jobs (major)

- **Owner:** community.
- **Where:** `api/app/services/forum.py`: taxonomy (90-175), a markdown parser and excerpts (176-375), people
  (377-398), visibility (400-491), SQL pieces (493-531), search (533-619), response building (621-746), reading
  (748-920), shared write rules and image tracking (922-1080), threads (1082-1310), replies (1312-1436) and
  **reports** (1438-1648), which also load and judge `LibraryItem`s (content's model) in `_targets` and `_reportable`.
- **Why:** nobody can hold this file in their head, merge conflicts concentrate here, and two pieces are generic
  utilities other areas re-implemented because they could not find them (plain-text extraction, CQ-6).
  Two behaviours inside deserve their own note:
  - `release_images()` (1029-1051) runs, per removed image (up to 20), an `ILIKE '%/api/v1/media/<id>%'` over every
    thread body and every reply body: up to 40 full scans per edit or delete as the forum grows.
  - `_status_before_hide()` (1054-1066) restores a post's status from `audit_log.data["from"]` (CQ-14).
- **Fix:** turn it into a package: `services/forum/{taxonomy,text,search,threads,replies,images,queries}.py` and
  move reports to `services/reports.py` (it already serves library items). Put `text.py`'s `to_plain_text`/`excerpt`
  in `app/core/text.py` for search and library to share. Track image use by row, not by text search: the lead's
  `uploads.thread_id`/`reply_id` columns (security finding 8) or a `post_images(upload_id, thread_id, reply_id)` table,
  maintained by `attach_images`/`release_images`.

### CQ-4. Newsletter sections, the career document and the account export have no schema (major)

- **Owner:** lead (contract in `app/schemas/*`), content (validation), frontend-content (types and readers).
- **Where:** `schemas/newsletter.py:28,37,46,50,58,62` (`cover: dict[str, Any]`, `sections: list[dict[str, Any]]`),
  `schemas/misc.py:33` (`CareerContent.data: dict[str, Any]`), `routers/content.py:36` (`PUT /career` body
  `dict[str, Any]`), `schemas/auth.py:87-95` (`AccountExport` lists of `dict[str, object]`, hand-built with camelCase
  keys in `services/accounts.py:297-427`).
- **Why:** the shapes live only in hand-written client code: `newsletter/lib/schema.ts` (409 lines),
  `newsletter/types.ts` (124), `career/types.ts` (151) and the readers in `career/api.ts` (~200), about 930 lines, plus
  a third copy of the block vocabulary on the server in `services/newsletter.py:315-357` (`_block_strings`,
  `section_text`). The server accepts any JSON a rep sends (only ids, links and sizes are checked), so a malformed
  section saved through the API breaks the issue page for every reader; the editor's only guard is client-side. The
  export duplicates the thread, reply and library serialisers and silently misses every field added later.
- **Fix:** model them in Pydantic: `NewsletterSection` with a discriminated union of blocks (`Field(discriminator="type")`),
  `IssueCover`, `CareerDoc` (tracks, employers, certs, roles, skills, ...), and typed `AccountExport` items that reuse
  `ThreadSummary`/`Reply`/`LibraryItem` (or small `Export*` models). FastAPI then validates writes, `openapi.json`
  carries the shapes, and `npm run api:types` replaces `newsletter/types.ts` and `career/types.ts`. Keep a thin
  "drop invalid card" guard only where old stored data may not match. This is additive for reads; do it before more
  issues are written.

### CQ-5. The same frontend helpers and components exist two to four times (major)

- **Owner:** all four frontend agents; shared homes in `src/ui`, `src/api`, `src/state` (frontend-accounts / lead).
- **What, with where it should live:**

  | duplicated | copies | one home |
  |---|---|---|
  | module detail query on key `['modules','detail',id]` with different `staleTime` (10 min vs `Infinity`) and one without `signal` | `features/modules/api.ts:11-19`, `noora/knowledge.ts:14-19`, `career/api.ts:241-248` | export `moduleDetailQuery` from `modules/public.ts` |
  | `ADMIN_STATS_KEY` | `moderation/api.ts:6` (exported), private copies in `library/api.ts:229`, `forum/api.ts:78` | import from `moderation/api.ts` (or `src/api/keys.ts`) |
  | debounce hook | `forum/lib/useDebouncedValue.ts`, `library/useDebouncedValue.ts`, `search/api.ts:24`, `admin/PeoplePage.tsx:37` | `src/state/useDebouncedValue.ts` |
  | `ConfirmDialog` (calendar and newsletter autofocus the destructive button, forum the Cancel button) | `calendar/ConfirmDialog.tsx`, `newsletter/components/ConfirmDialog.tsx`, `forum/components/ConfirmDialog.tsx` | `src/ui/ConfirmDialog.tsx`, focus on Cancel when `tone="danger"` |
  | presign, XHR POST with progress, complete, S3 XML errors, error messages, size formatter, hard-coded limits and types | `library/upload.ts:26-126`, `forum/lib/uploads.ts:41-130,250` (`formatBytes`) vs `library/kinds.ts:112-160` (`formatSize`, `MAX_UPLOAD_MB`) | `src/api/uploads.ts`: `uploadFile(purpose, file, {onProgress, signal})`, `uploadErrorMessage(e, purpose)` |
  | attach-an-image wiring (`useImageUploads` + `useImagePicker` + insert + cards filter + `removeImageLines`) | `forum/components/ReplyComposer.tsx:44-56,142`, `ThreadEditForm.tsx:32-36,125`, `NewThreadPage.tsx:201-207,383` | `forum/lib/useAttachImages.ts` |
  | offset paging `getNextPageParam` | `forum/api.ts:225,493`, `library/api.ts:97`, `notifications/api.ts:17`, `admin/api.ts` (`nextOffset`) | `src/api/paging.ts` `nextOffset(page)` |
  | calendar-day helpers: `startOfDay`, `daysBetween`, `inDays`, parse `'YYYY-MM-DD'` (`parseKey`/`parseDay`/`dayFromISO`), today's key (`toKey`/`todayKey`/`isoDay`), month names | `calendar/dates.ts`, `home/time.ts`, `newsletter/lib/text.ts:81-101`, `modules/exams.ts:25`, `ui/utils.ts` | `src/lib/dates.ts` (one `DayKey` type) |
  | copy to clipboard (only one copy has the fallback) | `newsletter/lib/links.ts:51` vs direct `navigator.clipboard` in `library/FileViewerPage.tsx:191`, `forum/ThreadPage.tsx:238`, `calendar/CalendarPage.tsx:236`, `calendar/SubscribeDialog.tsx:36` | `src/lib/share.ts` (`copyText`, `hostOf`, `appUrl`) |
  | `hostOf` | `career/lib/links.ts:35`, `library/display.ts:31`, `forum/lib/links.ts:33` | same |
  | media-path regex (one is looser: `[0-9a-f-]{36}`) | `forum/lib/links.ts:16`, `newsletter/lib/links.ts:29` | `src/ui/safeHref.ts` `isMediaPath` |
  | `problem(e)` network message (also in `SignInDialog.tsx`) | `account/AccountPage.tsx:22`, `admin/PeoplePage.tsx:32` | `errorMessage()` in `src/api/errors.ts` |
  | `CohortYear` and year guards | `lib/modules.ts` + `state/cohort.ts` (canonical), redeclared in `forum/types.ts:6`, `library/types.ts:6`, `forum/lib/taxonomy.ts:29` | import from `src/state` |
  | "couldn't load, try again" state | `forum/components/LoadStates.tsx` (`LoadError`), inline in `LibraryPage`, `NewsletterPage`, `IssuePage`, `CalendarPage`, `CareerPage`, `ModulePage`, `FileViewerPage` | `src/ui/QueryError.tsx` |
  | RFC 5545 escaping and folding | `features/calendar/ics.ts` (browser) and `api/app/services/calendar.py:90-117` | serve `GET /calendar/events/{id}.ics` (and an exams variant) from the API; delete `ics.ts` |

- **Why:** each copy drifts (the confirm dialogs already differ in focus, the upload error messages differ, the
  module query's freshness depends on which component mounted first), and a fix in one place silently misses the
  others. The date helpers also disagree with the server on what "today" is: the API uses Bahrain time
  (`services/calendar.py bahrain_today()`), the web app the device's zone (`calendar/queries.ts:100`
  `dayKeyFromToday`, no `timeZone` anywhere in `web/src`), so on a PC set to UTC countdowns and "today" are a day off
  from 00:00 to 03:00 Bahrain time. The shared `src/lib/dates.ts` should compute today with
  `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' })`.
- **Fix:** the table's last column. Do the shared homes first (frontend-accounts), then each owner switches and
  deletes their copy; `npx -y knip` (CQ-18) shows what became unused.

### CQ-6. The same backend rules exist two or three times, and disagree (major)

- **Owner:** accounts, community, content (lead for `core/`).
- **What:**
  - **How a person appears**, three serialisers with three fallbacks for an account without a name:
    `accounts.public_user` "Unnamed account" (`services/accounts.py:86-97`, used by notifications and the audit log),
    `forum.user_public` "Student" (`services/forum.py:380-390`), `library._public` hides the uploader
    (`services/library.py:141-144`). The same person shows under three names. One `public_user()` in
    `app/services/people.py` (or `UserPublic.of(user)` in `schemas/common.py`) for everyone.
  - **Rate limits:** `ratelimit.window_wait` (accounts, with advisory locks), `forum.check_rate`
    (`services/forum.py:925-943`), `uploads.check_rate` (`services/uploads.py:166-174`). Use `window_wait` everywhere.
  - **Unique slug with retry:** `forum.create_thread` loop (1116-1125, code `busy`), `library.insert_with_slug`
    (319-332, code `slug_taken`), and `calendar.new_event_id` (`services/calendar.py:76-85`) re-implements
    `core.text.unique_slug`. One `insert_with_unique_slug(db, obj, column, text)` in `core/text.py`.
  - **"Get the module or 422"** with different messages: `forum._module` ("Pick a module from the list."),
    `library._module` and `routers/calendar.py:26` ("This module doesn't exist."). One `modules.require_module()`.
  - **Markdown to plain text:** `forum.to_plain_text`/`excerpt` (parser), `search.plain_text` (regexes,
    `services/search.py:97-113`, used for forum snippets), `newsletter.plain_markup`. Search snippets and forum
    excerpts strip the same post differently. Use the forum's for forum text (CQ-3 moves it to `core/text.py`).
  - **Search dialects:** the forum list uses its own tokenizer, stop words and "every word must match somewhere"
    (`services/forum.py:533-619`); site search and the library use `search.text_query` (websearch + last-word
    prefix), as the brief prescribes. "regression R" finds different threads in the forum and in the palette. Either
    use `text_query` in the forum (plus the tag/category/module matching on top), or write down why they differ.
  - Smaller: `_bahrain()` in `services/forum.py:169-173` and `services/calendar.py:21-28` (put `BAHRAIN` and
    `bahrain_today()` in `core/time.py`, the brief's home for "today"); `search.CATEGORY_LABELS`
    (`services/search.py:51-57`) copies `forum.CATEGORIES`; `routers/content.py:16` imports `check_links`/`json_size`
    from the newsletter service (move to `core/links.py`); the media-path regex exists as `uploads.MEDIA_PATH_RE`
    (tested, unused in production) and `forum._MEDIA_REF` (used, untested) (`services/uploads.py:85-87`,
    `services/forum.py:213-215`, `tests/content/test_uploads.py:17,263`).

### CQ-7. No frontend unit tests; brittle seed tests; missing drift tests (major)

- **Owner:** lead (harness, `package.json`), content (seed tests), all frontend agents (tests for their pure modules).
- **What:**
  - **Frontend: no unit tests** for about 34,000 lines of TypeScript (only `tsc` and lint). An end-to-end Playwright
    suite is being written now (`web/e2e/`, `playwright.config.ts`, untracked at the time of writing); it covers
    flows, not the many small rules below, and neither file set is in any `tsconfig` `include` (so `npm run
    typecheck` skips them: add them to `tsconfig.node.json` or a `tsconfig.e2e.json`). The riskiest logic is pure and
    easy to test: `ui/safeHref.ts`,
    `forum/lib/{markdown,links,editing}.ts`, `newsletter/lib/{schema,text,links}.ts`, `calendar/{dates,ics,queries}.ts`,
    `modules/progress.ts` (reducers, import), `grades/{classify,whatif}.ts`, `state/useLocalStorage.ts` +
    `auth/queries.ts` (CQ-1).
    Minimal setup worth adding: `vitest` + `jsdom` (+ `@testing-library/react` for the two hooks), a
    `"test": "vitest run"` script, `src/**/*.test.ts` next to the code. Start with the security-relevant parsers
    (`safeHref`, markdown links and images, newsletter link checks) and the date helpers.
  - **Brittle seed tests:** `tests/content/test_seed.py:35-47,57-76` hard-code content (16 modules, 66 events, 51
    links, 18 sample dates, specific event ids, editors' names). Every calendar update by a rep's request breaks CI.
    Compute expected counts from `read(...)` as the test already does for links, and assert invariants (ids unique,
    every `module_id` exists, idempotent second run, no reactions copied).
  - **Untested:** `GET /modules/{module_id}` is the only operation no test calls (route probe over the full suite:
    81/82 covered). The model/migration match (0 differences today, checked with Alembic's `compare_metadata`) and the
    `openapi.json`/`schema.d.ts` sync (in sync today) are not enforced: a new migration (one is being written now) can
    drift silently. Add `tests/test_migrations.py` (upgrade a fresh DB, `compare_metadata` empty) and a test that
    `create_app().openapi() == json.load(open("openapi.json"))`.
  - **Test code quality:** `uv run --no-sync mypy tests` reports 22 errors (`app/` is clean); `make_user` returns
    `object` and callers cast; the same personas and modules are re-declared in each area's conftest (`modules`,
    `student`, `moderator`, `admin` in `tests/community/conftest.py` and `tests/content/conftest.py`, `module` in
    accounts). Move personas and a module factory to `tests/conftest.py` and type `make_user` as returning `User`.
  - What is good and should stay the pattern: tests go through the HTTP API with `client_for(user)`, check guest /
    other user / moderator for each write, check rate limits, and assert database effects (counters, audit rows).

### CQ-8. NUL bytes in parameters give 500s outside the forum; control-character guards are ad hoc (minor)

- **Owner:** lead (`app/core/errors.py`); content and community to remove local guards.
- **Where:** checked on the dev API (GET only):

  | request | answer |
  |---|---|
  | `GET /modules/%00` | 500 `internal` |
  | `GET /library/items?module_id=%00` | 500 |
  | `GET /library/items/%00` | 500 |
  | `GET /calendar/events?module_id=%00` | 500 |
  | `GET /newsletter/issues/%00` | 500 |
  | `GET /forum/threads/%00`, `?module_id=%00` | 404 / 200 (guarded) |

  The forum guards with `_CONTROL_CHARS` in four places (`services/forum.py:446,762-764,976`); no other area does.
  Every 500 also logs a full traceback, so a crawler can fill the log. The security review found the same from its
  side (`security.md` SEC-5, which adds huge `offset` values overflowing int8).
- **Fix:** handle it once, where SEC-5 puts it: a middleware in `main.py` that answers 400 `bad_request` for control
  characters in the decoded path or query, and `Offset` with an upper bound. For JSON bodies add a `NoNul` annotated
  str in `schemas/common.py` (or map `sqlalchemy.exc.DataError` to 422 in `install_error_handlers` as a backstop).
  Then delete the forum's local guards (`_param`, and the checks in `thread_by_slug` and `_module`), so there is one
  rule instead of one per area. Add one parametrised test over the public GET routes.

### CQ-9. Content-area handlers are not thin; transaction boundaries differ by area (minor)

- **Owner:** content.
- **Where:** `routers/newsletter.py:32-120` (builds the ORM object, loops over fields, audits, deletes in the
  handler), `routers/calendar.py:82-176` (same for events, plus local `_module`/`_check_dates`),
  `routers/content.py:35-61` (career), `routers/modules.py:20-50` (queries and serialisation). Forum, library and
  accounts keep handlers to "authorise, call service, commit, return".
  `services/uploads.py:203,283` commit inside the service while every other service leaves the commit to the handler
  (the OTP commits are deliberate and documented). `services/library.py:443` deletes the S3 object before the
  handler commits: if the commit fails, the item stays published with no file.
- **Fix:** `services/calendar.py` gets `create_event/update_event/delete_event`, `services/newsletter.py`
  gets `create_issue/update_issue/delete_issue`, career moves to `services/content.py`; the patch loops share one
  helper (`apply_patch(obj, body, fields, clearable)`; the same loop exists in `library.apply_update`,
  `forum.update_thread` and both content routers). Move the commits out of `uploads.py`. In `library.remove`, set the
  status and commit first, then delete the object (the sweep or a retry cleans up a failed delete).

### CQ-10. Notification kinds and error codes are untyped strings; some codes overlap (minor)

- **Owner:** lead (`services/notify.py`, `schemas/common.py`), community, content.
- **Where:** `services/notify.py:13` takes `kind: str`; `routers/notifications.py:27-31` maps unknown kinds to
  `system` at read time with a warning. `ErrorDetail.code: str` (`schemas/common.py:31`), so the web app's
  `e.code === 'slug_taken'` checks are not type-checked. Overlaps today: a failed slug retry is `busy` in the forum and
  `slug_taken` in the library, while `slug_taken` in the newsletter means "a rep chose a slug in use"; replying to a
  deleted or hidden thread answers `thread_locked`, voting on one answers `post_unavailable`; library uses `removed`
  for the same state.
- **Fix:** `notify(..., kind: NotificationKind, ...)` so mypy catches a typo at the call site, and drop the read-time
  fallback. Declare `ErrorCode = Literal[...]` in `schemas/common.py` and use it in `ErrorDetail.code` and `ApiError`;
  type `ApiError.code` in `web/src/api/errors.ts` as `ErrorDetail['code'] | 'network' | 'aborted'`. Use one code per
  condition (`post_unavailable` for deleted/hidden targets everywhere, `retry` for an exhausted slug retry).

### CQ-11. Module library counts go stale after library changes (minor)

- **Owner:** frontend-library.
- **Where:** `ModuleSummary.libraryCount` from the catalogue query (`state/modules.tsx:22-29`, `staleTime` and
  `gcTime` `Infinity`), shown in `modules/ModulePage.tsx:69,233,285`, `ModulesPage.tsx:84-86`,
  `home/YourModules.tsx:21`. None of the library mutations (`library/api.ts:232-312`) touch `['modules']`. After a rep
  publishes, rejects or deletes a file, the module's "Files" tab count disagrees with the list under it until reload.
- **Fix:** take the count from `useLibraryFacets().byModule` (already invalidated by those mutations), or invalidate
  `{ queryKey: MODULES_KEY, exact: true }` in `useCreateItem`/`useDeleteItem`/`useReviewItem`.

### CQ-12. PostHog is bundled into the entry chunk for everyone (minor)

- **Owner:** frontend-accounts (`src/main.tsx`), lead (`package.json`).
- **Where:** `web/src/main.tsx:3,21-33` imports `posthog-js/react` statically. In a production build the entry chunk
  is 837 KB (256 KB gzip), and the PostHog SDK accounts for about 97 KB gzip of it (the size of `posthog-js`'s module
  build), downloaded and parsed on every visit although nothing is sent unless `VITE_POSTHOG_KEY` is set.
- **Fix:** load it only when the key exists (`if (key) { const { PostHogProvider } = await import('posthog-js/react') }`
  before `createRoot`), or drop the dependency until analytics is decided. The privacy defaults it needs if it stays
  are in `security.md` SEC-8.

### CQ-13. CSS: `mod-` prefix collision and feature CSS reaching into `ui-*` internals (minor)

- **Owner:** frontend-library (modules), frontend-accounts (design system); `features/moderation`, `admin` and
  `account` have no owner in the brief's table: the lead should assign them.
- **Where:** `.mod-tabs` is defined in `features/moderation/ModerationPage.css:22` and
  `features/modules/ModulePage.css:88,242`; the module page patches it with `.mod-page .mod-tabs` ("scoped: /moderation
  has its own .mod-tabs"). Both features own the `mod-` prefix (`.mod-panel` vs `.mod-panels`, `.mod-stats`, `.mod-ov`,
  `.mod-res__*`). Because CSS is global and lazy chunks load in navigation order, which rule wins depends on the pages
  visited. Elsewhere, one block's rules are split across files (`.forum-vote`, `.forum-thread__title`,
  `.forum-replies__panel` in both `ThreadPage.css` and `components/forum.css`; `.career-featured`, `.career-flash` in
  two files; `.shell-profile*` in `Sidebar.css` and `ProfileMenu.css`), and feature CSS styles design-system internals
  through 141 selectors on 44 distinct `ui-*` classes (e.g. `search/CommandPalette.css:4` hides `.ui-modal__header`,
  `.ui-control__input` is restyled in five feature files, `.ui-button` in seven). Raw colours bypass tokens in
  `noora/ChatPanel.css` (`#fff`, `#0A1F44`) and `newsletter/IssuePage.css:238-254`.
- **Fix:** rename the moderation prefix (`modq-`) and drop the scoping patch. Rule for the team: a class prefix belongs
  to one folder, and a block's rules live in one file. Where a feature needs a variant of a `ui` component, add a
  prop or a modifier class in `src/ui` instead of overriding its elements. Add `--on-brand`/`--ink-on-dark` tokens for
  the white-on-colour text. Optional: `stylelint` with `selector-class-pattern` per folder, or CSS Modules for new code.

### CQ-14. Check-then-insert races end as 500s; the audit log is used as state (minor)

- **Owner:** content, community.
- **Where:** `routers/newsletter.py:36,73-74` (`check_slug_free` then insert/update) and `routers/calendar.py:92`
  (`new_event_id` then insert) raise an unhandled `IntegrityError` (500) when two reps save at once; forum and library
  already retry (CQ-6). `forum.check_rate` and `uploads.check_rate` count then insert without the advisory lock the
  OTP limits use (`services/ratelimit.py:60-62`). `forum._status_before_hide()` (`services/forum.py:1054-1066`)
  decides what "unhide" restores by reading the newest `forum.*.hide` row's `data["from"]` in `audit_log`: pruning the
  log or changing that payload changes moderation behaviour.
- **Fix:** catch `IntegrityError` around the insert and answer 409 `slug_taken` (newsletter) or retry with a suffix
  (calendar, via the shared helper from CQ-6). Take `ratelimit.lock()` before counting in the shared rate limiter.
  Store the pre-hide state on the row (`hidden_from` or a separate `hidden` flag next to `deleted`), so the audit log
  stays a record.

### CQ-15. Indexes that match no query, missing ones, and column nits (minor)

- **Owner:** lead (models and migrations).
- **What:**
  - Unused by any query: `ix_forum_threads_status_activity (status, last_activity_at)` (lists sort by `pinned`, then
    `created_at`, `vote_count` or the hot expression); `ix_library_items_status_published` is only a status filter
    (lists sort by `coalesce(published_at, created_at)`).
  - Missing for filters actually used: `uploads(user_id, created_at)` (the upload rate limit, account deletion),
    `library_items(uploaded_by)` ("Your uploads", deletion), `forum_replies(parent_id)` (an FK with `ON DELETE
    CASCADE`), `reports(target_type, target_id)`. Several `SET NULL` foreign keys to `users` are unindexed, so
    deleting an account scans those tables; fine at today's size, worth one migration.
  - `User.updated_at` has `onupdate=func.now()`, and `get_current_session` writes `last_seen_at` every 5 minutes, so
    `updated_at` means "last seen" (seen in the SQL trace); it is read nowhere. Drop it or stop the touch from going
    through the ORM row.
  - Enum-like columns without the `str_enum` CHECK the project defined: `Report.reason`, `Report.target_type`,
    `Notification.kind`, `LibraryItem.kind`, `CalendarEvent.type`; `Report.status` has no `server_default`;
    `ForumThread.author_year`, `ForumReply.author_year` and `LibraryItem.year` lack the 1-3 CHECK that `users.year` has,
    which is why `forum.py` re-checks `in (1, 2, 3)` when serialising.

### CQ-16. API naming: snake_case query vs camelCase bodies, `n` vs `limit`, hand-written query types (minor)

- **Owner:** lead (contract), all backend areas; frontend agents for the types.
- **What:** JSON is camelCase but query parameters are snake_case (`module_id`, `include_drafts`), so the web app keeps
  camelCase copies of each filter set and maps them by hand: `ThreadListParams` (`forum/types.ts:27-37`, mapped in
  `forum/api.ts:202-216`), `LibraryQuery` (`library/types.ts:12-23`, mapped in `library/api.ts:63-85`), `EventFilters`
  (`calendar/types.ts:16-27`). Counts are `n` on `/forum/threads/hot`, `/forum/threads/{id}/related` and
  `/calendar/upcoming`, `limit` elsewhere. Lookups by slug or id differ: forum tries slug then id, library id then slug,
  newsletter slug only, and the path parameters are named `{slug}` and `{item}`. `POST /reports` answers `Ok`, while
  every other create returns the created resource. Small arrays (`/modules`, `/newsletter/issues`,
  `/calendar/events`) are unpaginated; reasonable, but the rule is not written down.
- **Fix:** write the conventions into the brief (query parameters snake_case, counts are `limit`, which lists page).
  Derive the frontend's query types from the generated schema
  (`NonNullable<paths['/api/v1/forum/threads']['get']['parameters']['query']>`) instead of redeclaring them. Add
  `limit` as an alias on the `n` endpoints (additive). Return `ReportOut` (or 204) from `POST /reports`.

### CQ-17. Oversized components; the whole app waits on `/modules` (minor)

- **Owner:** frontend-community, frontend-content, frontend-accounts.
- **Where:** `forum/ThreadPage.tsx` (`ThreadView` alone is lines 143-567), `calendar/CalendarPage.tsx`
  (`CalendarBody`, 19 hooks), `newsletter/IssueEditorPage.tsx` (`Editor`, 144-408), `search/CommandPalette.tsx` (14
  hooks), `library/LibraryPage.tsx` (541 lines), `account/AccountPage.tsx` (455). `about/StyleGuidePage.tsx` (1,112
  lines) ships as a public route. `App.tsx:20` renders nothing but a loader or "The Hub can't reach its server" until
  `GET /modules` answers, so one failing endpoint takes down every page (grades and about included), against the
  per-route error boundaries in `routes.tsx`.
- **Fix:** split along the existing sections (thread header, reply list, moderation bar; calendar grid vs agenda vs
  editor; editor form vs JSON panes). Gate `/styleguide` behind `import.meta.env.DEV` or a moderator check. Let pages
  that need the catalogue wait for it (a `useModules()` that can be pending) instead of the provider blocking the shell.

### CQ-18. Tooling and repo hygiene (minor)

- **Owner:** lead.
- **What:**
  - **Docs:** the root `README.md` is the v1 GitHub Pages readme, with no word on running the API, the web app,
    seeding, tests or type generation. `compose.yaml:7,47,106` points to `docs/DEPLOYMENT.md` and `compose.prod.yaml`,
    `web/vite.config.ts:5` to `docs/backend/DEPLOYMENT.md`; none exist. The brief says Postgres 16, compose runs 17.
    `web/src/data/people.ts:106` comments that `brain.js` and `StyleGuidePage.jsx` still import the demo people.
  - **Files that should not ship or be in the repo:** `file_0000000008e061fa9990948d4882bdf5.png` (1.2 MB) and
    `file_000000006c247230820669c06184de02.png` (1.6 MB) at the repo root, referenced nowhere;
    `web/public/demo/library/*` and `web/public/demo/noora/laplace-question.png` (1.1 MB, prototype mock files, copied
    into every build); `web/public/vite.svg`, `web/src/assets/react.svg` (Vite template); `DUMMY_STUDENTS`,
    `CURRENT_USER` (`src/data/people.ts:111-129`) and `NEWSLETTER_COVER_ART` (`src/data/brand.ts:31`), all dead.
  - **Dead code** (knip, then checked by hand): never used anywhere: `calendar/dates.ts monthKeyOf`,
    `grades/classify.ts atLeast`, `library/kinds.ts byKindOrder`, and the data above; the other 41 of knip's 47
    unused exports are used only inside their own file or are barrel re-exports nobody imports (list in the scratch
    `knip.txt`). `public.ts` barrels export `ReportButton`, `ReportsQueue`,
    `UploadsQueue`, which `moderation/ModerationPage.tsx:6-7` and `library/FileViewerPage.tsx:23` import from the
    feature internals instead.
  - **Checks:** `uv run --no-sync ruff check .` fails today (E501, `app/seed/loader.py:1`); `npx eslint .` reports 4
    `react-refresh` warnings in `src/state/modules.tsx`. Type-aware lint is off: with `recommendedTypeChecked` it
    reports 33 unnecessary assertions (the `as number` casts in `calendar/DayStrip.tsx:56-101` assume
    `noUncheckedIndexedAccess`, which is off), 5 promise-returning `onSubmit` handlers and 3 non-exhaustive switches;
    small enough to turn on now. There is no single command that runs everything and no CI; add
    `scripts/check.sh` (ruff, ruff format --check, mypy app tests, pytest, `openapi.json` drift, `tsc` both configs,
    eslint, vite build, vitest) and run it in a GitHub Actions workflow. `api/requirements.txt` matches `uv.lock` today
    (`uv export`); the check should keep it that way.
  - **Ownership gaps:** `features/account`, `features/admin`, `features/moderation`, `src/lib`, `src/data`,
    `src/main.tsx`, `src/routes.tsx` are not in the brief's table.

---

## What is done well (keep as the pattern)

- **Thin forum and library routers** (`routers/forum.py`, `routers/library.py`): authorise, call one service function,
  commit once, return. This is the template for CQ-9.
- **One error shape** (`core/errors.py`) used everywhere, and **one page shape** (`schemas/common.py Page[T]`) for
  every paginated list; the web client turns both into `ApiError` in one place (`api/client.ts call()`).
- **No N+1 queries.** Lists batch their relations (`forum._summary_select` joins authors and computes `voted` as an
  `EXISTS`; `library.to_out` loads uploaders and stars in one query each; reports load targets per type). Measured over
  the whole suite: list and detail reads run 5 to 11 statements, about 5 of them the session lookup and touch
  (`/me/export`, 18, is the exception).
- **Counters and idempotent writes in SQL:** votes and stars use `INSERT ... ON CONFLICT DO NOTHING RETURNING` and
  `UPDATE ... SET n = greatest(n + d, 0) RETURNING`; account deletion takes back the deleted voter's votes; the newsletter
  notifies readers with one `INSERT ... SELECT`.
- **OTP service** (`services/otp.py`): atomic attempt counting before comparison, advisory locks in a fixed order,
  every rule documented at the top of the file. A good model for any future security-sensitive service.
- **Schema hygiene:** naming conventions, `str_enum()` for extensible enums, generated `search_vector` columns with GIN
  indexes, timezone-aware datetimes everywhere (ruff `DTZ` on), and a migration that matches the models exactly.
- **Frontend typing:** strict TypeScript with `verbatimModuleSyntax`, API models only from the generated schema, 0 `any`,
  0 non-null assertions; most of the 112 `as` casts are CSS custom properties and DOM events.
- **Query key factories** (`forumKeys`, `libraryKeys`, `calendarKeys`, `newsletterKeys`) with documented cache shapes;
  optimistic votes with a per-target sequence so a fast vote-unvote never flickers (`forum/api.ts:142-154`);
  optimistic stars with snapshot and rollback (`library/api.ts:232-251`); progress writes where only the last write
  in flight updates the cache (`modules/progress.ts:322-341`).
- **Sign-out resets every query except the shared catalogue** (`auth/queries.ts`, a deny-list, so new features are
  safe by default), and every page has a skeleton, an empty state and an error state with "Try again".
- **Security helpers are central** (`ui/safeHref.ts`, used by the renderers), and lazy routes each sit in their own
  error boundary.

## Appendix: what was run

| check | result |
|---|---|
| `uv run --no-sync ruff check .` | 1 error (E501 `app/seed/loader.py:1`) |
| `uv run --no-sync mypy app` / `mypy tests` | clean / 22 errors |
| full API suite with a route/SQL probe plugin (`-p route_probe`, once) | all passed; 81/82 operations called; max statements per request 27 (`POST /me/identifiers/otp`), reads ≤ 18 (`/me/export`) |
| Alembic `compare_metadata` on a fresh migrated database | 0 differences |
| `python -m app.cli openapi` vs `api/openapi.json`; `openapi-typescript` vs `src/api/schema.d.ts` | both in sync |
| `npx tsc -p tsconfig.json`, `-p tsconfig.node.json` | clean |
| `npx eslint .` | 0 errors, 4 warnings |
| ESLint with `recommendedTypeChecked` (scratch config) | 33 unnecessary assertions, 5 misused promises, 3 non-exhaustive switches |
| `npx -y knip` | 0 unused files, 47 unused exports (6 dead), 113 unused exported types (mostly props: fine) |
| CSS audit script | 74 classes defined in more than one file (44 of them `ui-*` classes restyled from features); one prefix shared by two features |
| `vite build` to a scratch dir | entry chunk 837 KB / 256 KB gzip, PostHog ~97 KB gzip of it |
| NUL probes (GET, dev API) | 5 public endpoints answer 500 |
| Playwright, recent-search leak (guest context, dev server) | reproduced (CQ-1) |

## Recheck of the core files

Rechecked at the end of this round against the working tree (the backend-core builder's changes were not committed
yet, so this describes work in progress: 33 modified files, a new `core/headers.py`, migration `0002_upload_posts`,
`tests/core/`, `compose.prod.yaml`, `docs/backend/DEPLOYMENT.md`, `web/Dockerfile`, `web/deploy/`). On that tree:
`ruff check` and `ruff format --check` pass, `mypy app` is clean, `openapi.json` matches the code, and the models
match migrations `0001`+`0002` exactly (Alembic `compare_metadata` on a fresh database: 0 differences).

| finding | status in the working tree |
|---|---|
| CQ-2 stopgaps | **Mostly resolved.** `is_moderator()`/`is_admin()` now check the status and `get_moderator`/`get_admin` depend on `get_active_user`; `forum.moderates`, `forum.require_moderator`, `forum._valid_ip`, `admin._require_active`, otp's `FALLBACK_SETTINGS` and uploads' `_first_bytes`/`_promote` are gone (`Storage.read_head`, `Storage.copy`, strict `presigned_get`); `client_ip()` validates. Left: `ratelimit.request_ip` is now a one-line alias of `client_ip` with 26 callers (import `client_ip` and delete it). |
| CQ-8 NUL bytes | **Resolved centrally:** `ControlCharactersMiddleware` (400 for control characters in path or query), a `DataError` handler (422), `Offset` capped at 100,000, with tests in `tests/core/test_errors.py`. Left: the forum's local guards are now dead weight: `_param` (`services/forum.py:739-741`), the check in `thread_by_slug` (438) and in `_module` (953). |
| CQ-3 forum images | `release_images` now looks only at the uploader's own posts (`_post_showing`, using the author indexes) and `uploads.thread_id`/`reply_id` record the post. The ILIKE remains, but bounded by one author's posts: no longer a scaling concern. The file-size and split points stand. |
| CQ-15 indexes | `ix_uploads_user_created (user_id, created_at)` added. The others stand. |
| CQ-18 hygiene | The ruff error is fixed; `docs/backend/DEPLOYMENT.md` and `compose.prod.yaml` now exist. `compose.yaml:47` still points to `docs/DEPLOYMENT.md`. |
| CQ-7 drift tests | Still missing (no migration or `openapi.json` test in `tests/core/`); worth adding now that `0002` exists. |
| CQ-10 typed kinds | `notify()` now keeps only in-Hub URLs (`hub_path`), but `kind` is still `str`. |

New duplication the core change created (small, worth removing while it is fresh):

- **The CSRF cookie is managed in two places.** `CSRFMiddleware` (`core/security.py`, `_in_step`) now sets the
  session-bound token at sign-in and a fresh one at sign-out by reading the response's `Set-Cookie` headers, so
  `sessions.rotate_csrf()` (`services/sessions.py:52`, called at `routers/auth.py:56,69`) is overwritten at sign-in
  and redundant at sign-out. Delete `rotate_csrf` and its two calls (accounts). More generally, the middleware infers
  sign-in and sign-out by parsing cookie strings; that works and is tested (`tests/core/test_csrf.py`), but an
  explicit call from `sessions.create()`/`revoke()` would be easier for the next student to follow.
- **Audit name snapshots:** `audit.record()` now adds `actorName` (and `targetName` for user targets) itself, so the
  names that `routers/admin.py:138` and `services/accounts.py:167` still build by hand are redundant.
- `services/storage.py` adds one `# type: ignore[typeddict-item]` (the `LocationConstraint` in `ensure_bucket`);
  `cli.py` adds two `cast(CursorResult[Any], ...)` for `rowcount`. Both are acceptable boto3/SQLAlchemy typing gaps.

`web/src/api/client.ts` (CSRF cookie name from `VITE_CSRF_COOKIE`, one retry on `csrf_failed` from an untouched
copy of the request) is clean: no casts, the retry cannot loop, and it only replays requests the server refused before
handling them.
