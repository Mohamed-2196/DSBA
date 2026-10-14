# Code quality review

Three passes live in this file, newest first. **Round 10 re-review** (at `6c90aa9`) covers rounds 5 to 9, re-checks
every earlier finding and adds CQ-30 onwards. **Round 3 re-review** (at `8c4164d`) added CQ-19 to CQ-29. **Round 1**
(at `525962c`) holds the original findings CQ-1 to CQ-18 as they were written. Line numbers refer to each pass's
commit.

# Round 10 re-review (rounds 5 to 9)

Reviewer: code quality. Scope: everything merged on `feature/backend` since `581d5b5` (Merge round4/review-security)
up to `6c90aa9` (round 9 merged): 23 merges, 349 files, +17,354/−3,292 lines. Reviewed on `round10/rev-cq`. Many of
those branches were merged in parallel and their conflicts resolved by hand, so this pass looked hardest at
duplication across features, code the merges left stale or contradictory, the migration chain, switch naming, size,
tests and docs. No application code was changed, and Docker and the e2e suite were not run.

## Checks run

| check | result |
|---|---|
| `PATH=/opt/homebrew/opt/libpq/bin:$PATH scripts/check.sh` | **all passed**: lock and requirements in sync, ruff and ruff format clean (249 files), mypy strict clean on 232 files, **1,096 API tests** passed (drift, reversibility and baseline-seed tests included), both `tsc` configs, ESLint, knip clean, **655 Vitest tests in 81 files**, `schema.d.ts` matches `openapi.json`, build passed |
| `npx knip` in `web/` | nothing reported. Checked by hand anyway: no feature imports another except through `public.ts`, and neither do `shell`, `auth`, `ui`, `lib`, `state` or `api` |
| `type: ignore` in `api/app` | 3, all at untyped library edges (google-auth twice, boto3). None added in rounds 5 to 9. In `api/tests`, `content/test_exam_names.py:12,16,20` ignore `arg-type` because the helpers take `str` where `ExamMeta` wants the `Zone` and `ExamSession` literals: type the helpers instead |
| `any` in `web/src` | none added |
| N+1 | read, not probed: the new list endpoints (`/requests/done`, gaps, the suggestions queue, past questions, papers by sitting, seniors, follows) load their related rows in one batch per list. One loop does a query per row: CQ-38 |

## Earlier findings: status

| ID | Status | What is there now |
|---|---|---|
| CQ-1 to CQ-16 | as in round 3 | Fixed or folded into later IDs. CQ-1's rule ("every per-person key starts with `hub.mine.`") was broken again in round 9: see CQ-30 |
| CQ-17 | **open** | Some large components grew: `newsletter/editor/Editor.tsx` 642 lines (441 in round 3), `library/LibraryPage.tsx` 568 (551), `account/AccountPage.tsx` 500 (454), `UploadDialog.tsx` 438. Noora and Home were split well as they grew (Noora's largest is `brain.ts` at 537 lines, then `ChatPanel.tsx` 414 and `MiniNoora.tsx` 413; `HomePage.tsx` is 277). Split the four when they're next touched |
| CQ-18 | **open** | Type-aware lint is still off (`web/eslint.config.js:36`, `tseslint.configs.recommended`); S-1 |
| CQ-19 | fixed | |
| CQ-20 | **open, growing** | 162 review-ID references remain in `api/app`, `api/migrations` and `web/src` (about 290 in round 3), and rounds 5 to 9 added **38 `IDEA-n` references**. See CQ-41 |
| CQ-21 | fixed | |
| CQ-22 | **open** | `web/src/api/uploads.ts:6-7,39-90` still copies the API's limits and allowlists |
| CQ-23 to CQ-25 | fixed | |
| CQ-26 | **open, worse** | The personas are still in three conftests (`content`, `community`, `core`). A `module` fixture is now declared five times (`board/conftest.py:25`, `accounts/conftest.py:180`, `noora/conftest.py:111`, `notes/conftest.py:22`, plus `modules` in `content` and `community`), and `settings` and `set_option` are declared twice (`accounts/conftest.py:88,93`, `core/conftest.py:25,30`). The e2e `api<T>()` cast and `code as unknown as string` (`web/e2e/support.ts:135,224`) are unchanged |
| CQ-27 | **mostly fixed** | `whatif`, the calendar's `queries` and `dates`, `search` and `lessons` now have tests. Still untested: `career/lib/fit.ts` and `home/session.ts`. The new gaps are in CQ-42 |
| CQ-28 | fixed | knip runs in `check.sh` and reports nothing |
| CQ-29 | fixed | `ERRORS` is annotated, and the kinds are typed as `LibraryKind` from start to end |

## New findings (CQ-30 onwards)

| ID | Severity | Title |
|---|---|---|
| CQ-30 | major | Mini Noora's chats survive sign-out on shared computers |
| CQ-31 | major | Students can't request an RTC paper (lost in a merge) |
| CQ-32 | major | Zone and sitting are defined in many places, on both sides |
| CQ-33 | major | "You asked, we did" goes stale after a request is answered, confirmed or removed |
| CQ-34 | major | Customize Home offers blocks whose switches are off, so they render nothing |
| CQ-35 | minor | The migration chain: squash it into one baseline now |
| CQ-36 | minor | Switch and id naming is mixed: `video_suggestions`, `help_below` beside `forum.help-below` |
| CQ-37 | minor | Accepting a video suggestion edits modules outside `module_editor` |
| CQ-38 | minor | Logic in routers, import cycles inside functions, and per-row lookups |
| CQ-39 | minor | The account export is built from dicts and leaves out `found_item_id` and `found_at` |
| CQ-40 | minor | Effects that should be derived state (Noora, Home) |
| CQ-41 | minor | Comments cite idea and review numbers and narrate history |
| CQ-42 | minor | Test gaps from rounds 5 to 9 |
| CQ-43 | minor | No formatter in `web/`: merge leftovers and dead CSS |
| CQ-44 | minor | Dead 501 scaffolding |
| CQ-45 | minor | `/requests/done` has no index |
| CQ-46 | minor | STATUS, ARCHITECTURE and DEPLOYMENT are out of date |

### CQ-30. Mini Noora's chats survive sign-out on shared computers (major)

- **Where:** `web/src/features/noora/saved.ts:10-11` stores the current chat under `hub.noora.chat` (sessionStorage)
  and the recent chats under `hub.noora.recent` (localStorage). `clearPersonalStorage` (`web/src/auth/queries.ts:29-47`)
  removes only keys that start with `hub.mine.`, and only from localStorage.
- **Why it matters:** on a lab or library computer, the next person to open Noora sees the previous student's
  questions. Those can quote their notes, a paper or their marks. The comment at `auth/queries.ts:29` promises the
  opposite, and CQ-1 fixed this same class of bug.
- **Fix:** rename the keys to `hub.mine.noora.chat` and `hub.mine.noora.recent`. Have `clearPersonalStorage` clear
  the matching sessionStorage keys too, and add a case to `auth/queries.test.ts`.

### CQ-31. Students can't request an RTC paper (lost in a merge) (major)

- **Where:** `api/app/schemas/requests.py:34` has `zone: Literal["A", "B"] | None`. `schemas/library.py:30` has
  `Zone = Literal["A", "B", "RTC"]`. The model's comment at `models/requests.py:57` still reads `'A' | 'B'`.
  `round6/rtc` and `round6/calendar2` were merged side by side.
- **Why it matters:** a request for an RTC paper is refused with a 422. A request that names no zone can still be
  closed by an RTC file, but a student can't ask for one, so `match_published` (`services/requests.py:485`) never
  matches on RTC. This is the feature the RTC work was for.
- **Fix:** use `Zone` in the request schema, fix the comment, and add a test that an RTC request closes on an RTC
  file. CQ-32 stops this from happening again.

### CQ-32. Zone and sitting are defined in many places, on both sides (major)

The value lists and labels were written once per branch, and the merges kept them all.
- **API:**
  - The zone label exists twice: `services/exam_names.py:78-80` ("zone A", "RTC") and `services/noora/paper.py:119-125`.
    The second prints "zone RTC".
  - Sittings are grouped three ways:
    - `services/library.py:355-395`: by year, session and zone, with `_ZONE_ORDER`;
    - `services/noora/paper.py:50`: by year and session, then the zone or none;
    - `services/gaps.py:66-92`: by year and session only, with no zone.

    The `gaps` grouping may be what reps want, since a report usually covers every zone. It should still say so,
    not differ silently.
  - The zone values are copied by hand at `services/drive_import.py:576` (`("A", "B", "RTC")`).
  - `"past-paper"` and `"examiners-report"` are written out in `gaps.py:67-76` and `noora/paper.py:57,77`, while
    `board.py:65` and `past_questions.py:29` each define their own constant.
  - Output schemas say `zone: str | None` (`schemas/library.py:59,184`, `schemas/requests.py:53,80`,
    `schemas/auth.py:212,315`), so the web app gets a plain `string`.
  - No zone column has a CHECK (`library_items.zone`, `users.zone`, `requests.zone`), though `kind` and
    `exam_session` beside them do (`models/library.py:49-50`).
- **Web:**
  - `features/papers/papers.ts:9` has `ZONE_LABELS`, and `features/library/display.ts:63-66` has `zoneLabel`.
  - `library/components/ItemFields.tsx:115-120` hard-codes the zone options.
  - `library/itemForm.ts:16,47` hand-writes `'' | 'A' | 'B' | 'RTC'` and checks it field by field.
  - `library/ChapterQuestions.tsx:14` and `library/DailyQuestion.tsx:34` re-implement `examLabel`
    (`display.ts:72-75`).
  - `papers/usePapers.ts:17` checks `raw in ZONE_LABELS`, which matches inherited keys (`"toString"` passes), and
    then casts with `as Zone`. `home/blocks.ts:48` uses `Object.hasOwn` correctly.
- **Why it matters:** CQ-31 is what this costs. The next zone or session (a January sitting, say) has to be found
  in about twelve places, and Noora already describes papers differently from the library.
- **Fix:**
  - **API:**
    - Make `Zone` the type of every zone field, input and output.
    - Add `check_in("zone", get_args(Zone))` on the three columns, in the squash (CQ-35).
    - Keep one `zone_label` and one `sitting_key(item)` in `services/exam_names.py`, and use them in `library`,
      `noora/paper` and `gaps`, with a comment in `gaps` on why it ignores the zone.
    - Keep one `PAST_PAPER` and `EXAMINERS_REPORT` constant next to `LibraryKind`.
  - **Web:**
    - Make `library/display.ts` the home of `ZONES` (from `LibraryItem['zone']`), `zoneLabel`, `sittingLabel` and
      `examLabel`, exported through `library/public.ts`.
    - Have `papers`, `ItemFields`, `itemForm`, `ChapterQuestions` and `DailyQuestion` use them.
    - Use `Object.hasOwn` in `cleanZone`.

### CQ-33. "You asked, we did" goes stale after a request is answered, confirmed or removed (major)

- **Where:** `web/src/features/requests/api.ts:54` keys the done list as `[...REQUESTS_KEY, 'done', until, limit]`.
  `useAnswerRequest`, `useAnswerFound` and `useRemoveRequest` (`api.ts:155,175,192`) invalidate only
  `[...REQUESTS_KEY, 'list']` and the admin stats.
- **Why it matters:** a rep marks a request done and the section on `/requests`, and the newsletter's live section,
  don't show it until the cache expires. A removed request keeps showing as done.
- **Fix:** invalidate `REQUESTS_KEY` as a whole, or add `'done'`. A test with a `QueryClient` spy would keep it
  that way.

### CQ-34. Customize Home offers blocks whose switches are off, so they render nothing (major)

- **Where:** `web/src/features/home/HomePage.tsx:76-87` builds `offered`:
  - `daily_question` needs `calendar` and `library`, but `library/DailyQuestion.tsx:29` also needs
    `library.questions` and `library.daily-question`;
  - `help_below` needs a signed-in student and `forum`, but `forum/HelpBelow.tsx:21` also needs `forum.help-below`.

  All three switches arrive off (migrations 0007, 0014 and 0016).
- **Why it matters:** with the default switches, Customize Home lists "Daily question" and "Help the years below".
  A student can move them to the top, and they show nothing.
- **Fix:** give each entry in `home/blocks.ts` its list of features and the "needs an account" rule, and compute
  `offered` from that list, so `offered` and the components can't disagree. `blocks.test.ts` can then test it.
  At the same time, replace the join-and-split at `HomePage.tsx:88-89` (`as HomeBlock[]`) with a `useMemo` over
  the list.

### CQ-35. The migration chain: squash it into one baseline now (minor)

- **Where:** `api/migrations/versions/`: 16 files. Their ids run out of order along the chain:
  0001 → … → 0006 → 0008 → 0009 → 0011 → 0010 → 0007 → 0012 → 0014 → 0015 → 0016 → 0018, with no 0013 or 0017.
  - 0001 to 0006 have been edited in place several times (0006 three times: `125b394`, `40f19d6`, `08f4323`).
  - Five migrations exist only to seed one or two switch rows (0016 and 0018 are under 35 lines each).
  - 0014 seeds `forum.help-below`, which has nothing to do with requests.
  - The migrations hold frozen copies of value lists: `LIBRARY_KINDS` (0014:24-36), the event types (0012), the
    notification kinds (0015) and `FEATURES` (0001:38).
  - They seed in three styles: `op.execute`, `get_bind().execute(text)`, and parameterised.
  - The docstrings narrate the rounds (0016 cites IDEA-27).

  The chain works: the drift test, the reversibility test and `test_migrations.py:42-89` all pass.
- **Why it matters:** the order of the ids no longer says the order of the changes, so every parallel round needs
  the chain re-wired by hand at merge (`bb3bc1c`). Edits in place have already meant applying a column by hand to
  the local database (STATUS: "SEC-26 edited migration 0006"). Nothing is released, and CLAUDE.md allows a squash.
  It gets dearer with each round.
- **Fix:** squash now, between rounds, while no builder holds a migration:
  1. Write a new `0001_baseline` from the models: autogenerate against an empty database, then add the seeds
     (roles, boxes, every switch with its first mode) as one data block.
  2. Add the zone CHECKs from CQ-32 and the index from CQ-45.
  3. Prove it with the drift test and `test_migrations.py` (it already pins the seeded roles and switches), and
     compare `pg_dump --schema-only` of the old head with the new baseline.
  4. Keep Mohamed's local data (the 105 imported Drive files): when the dumps match, `alembic stamp 0001` on the
     local database instead of rebuilding it.

  From then on, each builder adds `0002_<what>` on top. The lead renumbers at merge, which is one line.

### CQ-36. Switch and id naming is mixed (minor)

- **Where:**
  - `video_suggestions` (`core/access.py:76`, `schemas/access.py:54`, `web/src/auth/access.ts:50`, migration
    0015:111) is the only snake_case switch. Every other switch is `area.kebab-name` (`library.daily-question`,
    `forum.help-below`).
  - Home's block ids are snake_case (`help_below`, `daily_question`, `schemas/auth.py:56-68`), which is fine as
    data, but sit next to dotted switches of the same names.
  - The copy disagrees: the block is "Help the years below" (`home/blocks.ts:22`), and the switch
    (`core/access.py:156`) and the card are "Help the year below".
  - The feature list is written four times: `Feature` (`core/access.py:53-76`), `FeatureKey`
    (`schemas/access.py:31-55`), `FEATURE_KEYS` (`auth/access.ts:27-51`) and the migrations. A test checks that
    the first two are equal and that the database is seeded. `FEATURE_KEYS` is checked only with `satisfies`,
    which doesn't catch a missing key.
  - `HomeBlock` lives in `schemas/auth.py:55-68`, among the sign-in schemas.
- **Fix:**
  - Rename the switch to `modules.video-suggestions` (no compatibility to keep). Do it in the squash.
  - Pick one copy, "Help the years below" or "Help the year below", for both the block and the switch.
  - Derive `FeatureKey` from the enum (`Literal[tuple(Feature)]` doesn't type-check, so keep the test), and add a
    Vitest that `FEATURE_KEYS` covers every `Feature`: `satisfies Record<Feature, true>` over an object does it at
    compile time.
  - Move `HomeBlock` to a `schemas/home.py`.

### CQ-37. Accepting a video suggestion edits modules outside `module_editor` (minor)

- **Where:** `services/suggestions.py:233-284` builds the `Lesson` and bumps `m.version` itself (`:250`, `:262`).
  `module_editor` does the same job for Manage, with its own placement and audit. `parse_video` returns an untyped
  `dict[str, str]` (`module_editor.py:62`), and `_same_video` builds a stand-in dict from the row
  (`suggestions.py:246`).
- **Why it matters:** there are two ways to add a lesson. The next rule that applies to lessons (an order, a cap or
  a check) goes into one of them.
- **Fix:** add a single `module_editor.add_lesson(db, module, chapter, video, title)` and have both callers use it.
  Make the parsed video a `NamedTuple`.

### CQ-38. Logic in routers, import cycles inside functions, and per-row lookups (minor)

- `routers/me.py:50-75`: `update_me` holds the papers rules: clearing papers when the year changes, and dropping
  repeats. Move them into `accounts.update_profile`.
- `routers/calendar.py:76`: the feed splits, sorts and silently cuts `modules` to 20. Move this into the service,
  or answer 422 when more than 20 are sent, as the docstring promises a limit.
- `services/library.py:442-445`: `from app.services.requests import match_published` inside the function, to break
  `requests → search → library`. The same happens at `services/calendar.py:199`.
  - It runs for every file the Drive import publishes, with two `access.audience` queries each time.
  - Fix: call `match_published` from the router and CLI layer after publishing, or pass it in. Match the import's
    files in one batch.
- `services/requests.py:543-579`: `close_for_date` calls `_tell`, and so `access.audience`, once per request. Compute
  the audience once.
- `services/calendar.py:162` and `models/content.py:169`: `employer_id` is checked only against the slug pattern,
  never against Career Navigator's employers, so a typo saves. Check it in `_check`.
- The slug pattern `^[a-z0-9][a-z0-9-]{0,63}$` is written three times (`schemas/auth.py:31` `PaperId`,
  `schemas/calendar.py:17` `EmployerId`, `routers/calendar.py:30` `PAPERS_PATTERN`). One `Slug` type belongs in
  `schemas/common.py`.
- The lesson-kind tuple appears twice in `models/content.py:86,123`, though `VideoKind` exists in
  `schemas/modules.py:10`. Use `get_args(VideoKind)`.

### CQ-39. The account export is built from dicts and leaves out `found_item_id` and `found_at` (minor)

- **Where:** `services/accounts.py:676-690` builds `ExportRequest.model_validate({...})`. The same happens at
  `:747`, `:764` and `:787` for the board, follows and seniors, and `services/suggestions.py:74` builds
  `SuggestionOut` the same way.
  - mypy can't check the field names in a dict. The CQ-4 rule, that a field reaches the export only on purpose,
    rests on the constructor's keyword arguments.
  - The request export leaves out `found_item_id` and `found_at`, which hold data about the person (the file the hub
    offered them). Every other column added in rounds 5 to 9 is exported: papers, zone, `track_progress`,
    `home_blocks` and the video suggestions.
- **Fix:** call the constructors with keyword arguments, and add the two fields.

### CQ-40. Effects that should be derived state (minor)

- `web/src/features/noora/useChat.ts:124-155`: six effects only copy state into refs. One shared `useLatest` in
  `src/state` does this.
- Some `MiniNoora.tsx` effects only set state from other state:
  - `:131` (`if (open) setChatWanted(true)`);
  - `:244` (`if (!open) setMood(null)`): render `open ? mood : null` instead;
  - `ChatPanel.tsx:212` (`setNewFrom` while closed).

  `ChatPanel.tsx:118` already uses the render-phase pattern these should follow.
- **Why it matters:** each one costs an extra render with the stale value first. That is the S-7 pattern from the
  standards review, and the files that grew in rounds 8 and 9 added more.

### CQ-41. Comments cite idea and review numbers and narrate history (minor; continues CQ-20)

- Rounds 5 to 9 added 38 `IDEA-n` references, for example:
  - `models/requests.py:30`, `services/suggestions.py:1`, `services/gaps.py:1`, `routers/suggestions.py:1`;
  - `features/papers/papers.ts:1`;
  - migration 0016's docstring.

  Some of them are in route docstrings, which `/api/v1/docs` shows.
- The review IDs are still there: "code quality review CQ-15" at `models/content.py:152` and `models/library.py:49`,
  CQ-4 at `services/accounts.py:568`, CQ-1 at `auth/queries.ts:38`, and "security review AD-3" at
  `core/access.py:49`.
- `features/papers/papers.ts:2` ends "…all its modules, as before.", which narrates history and breaks CLAUDE.md's
  rule.
- **Fix:** state the reason in words, drop the numbers, and keep `docs/ideas.md` as the place that maps ideas to
  code. Do it in one sweep: `grep -rnE "\b(IDEA|CQ|SEC|AD|UX|ST|R)-[0-9]+" api/app api/migrations web/src`.

### CQ-42. Test gaps from rounds 5 to 9 (minor)

- **API:**
  - No test for a request for an RTC paper, or for an RTC sitting in the gaps (CQ-31, CQ-32).
  - No test of `noora/paper._sitting`'s output.
  - No test of what happens when a published item's kind, year or zone is edited. Editing doesn't call
    `_match_requests`; if that is intended, a test should say so.
- **Web:**
  - Pure or nearly pure modules added without tests:
    - `noora/useDrag.ts` (153 lines: clamping, snapping);
    - `noora/open.ts`;
    - `home/layout.ts`;
    - `papers/usePapers.ts` (a test would have caught `cleanZone`, CQ-32);
    - `modules/tracking.ts`;
    - `grades/record.ts`.
  - Still untested from CQ-27: `career/lib/fit.ts` and `home/session.ts`.
- **Fixtures:** see CQ-26. One `module` fixture and the personas belong in `tests/conftest.py`.

### CQ-43. No formatter in `web/`: merge leftovers and dead CSS (minor)

- **Where:** `web/` has no Prettier config and no format check, unlike the API's `ruff format`. `knip --fix` (`13a7b36`)
  and the hand-merged conflicts left gaps:
  - stray `;` lines (`auth/index.ts:3`, `ui/index.ts:51`, `features/forum/public.ts:17,19,22,26,28`,
    `calendar/public.ts:15`);
  - `{  X,  }` gaps (`ui/index.ts:3-50`, `state/index.ts:5-11`, `auth/index.ts:2,7,8`);
  - lines over 200 characters (`library/DailyQuestion.tsx:29`).

  Dead CSS classes with no user: `.cal-confirm`, `.forum-hot__count`, `.forum-hot__votes`,
  `.forum-modthreads__foot`, `.forum-side__more`, `.nl-loading`, `.cmdk-new`, `.cmdk-doc__fmt` and
  `.forum-reply__nested-line`. The Noora, Home, library, requests and papers CSS is clean.
- **Why it matters:** with parallel builders, formatting differences turn into merge conflicts, and knip doesn't
  look at CSS.
- **Fix:** add Prettier with a `--check` step in `check.sh`, and format once in a commit of its own. Delete the nine
  classes.

### CQ-44. Dead 501 scaffolding (minor)

- **Where:**
  - `core/errors.py:124-126` turns `NotImplementedError` into 501 `not_implemented` "This endpoint is not built yet."
  - `schemas/common.py:43` lists the code.
  - `seed/loader.py:315-316` catches `NotImplementedError` as "not built yet".

  No route or seed section raises it any more. The only `raise NotImplementedError` is the abstract
  `Credential.headers` in `services/drive.py:294`.
- **Why it matters:** if a programming error reached the base class, the client would see "not built yet" and no
  500 would be logged. ARCHITECTURE still describes routes as stubs (CQ-46).
- **Fix:** delete the handler, the error code and the `except`, and make `Credential` a `Protocol` or an `abc.ABC`.

### CQ-45. `/requests/done` has no index (minor)

- **Where:** `services/requests.py:204-221` filters on `status = 'done'`, `removed_at IS NULL` and a range of
  `answered_at`. No index on `requests` covers this, and the newsletter's live section runs the same query.
- **Fix:** a partial index `ix_requests_done (answered_at) WHERE status = 'done' AND removed_at IS NULL`, in the
  squash. The suggestions queue, ordered by `decided_at`, can wait until it grows.

### CQ-46. STATUS, ARCHITECTURE and DEPLOYMENT are out of date (minor)

- **`docs/STATUS.md`:**
  - It says "Last updated 2026-10-12 … when round 3 started" (`:4-5`), and "Last checks" (`:23-28`) cites round 3
    numbers (598 and 655 API tests; today it's 1,096 API tests and 655 Vitest).
  - `round4/content` appears twice, as "removed, merged" (`:72`) and as "pushed, waiting to merge" (`:78`).
  - It names the switch `noora_ai` (`:73`); it is `noora.ai`.
  - "Round 9" is a bullet inside Round 8 (`:48`).
  - The migration chain (`:36`, `:41`) stops at 0015.
  - Item 7, the no-compatibility clean-up (`:157-165`), is done but still listed as to do.
- **`docs/backend/ARCHITECTURE.md`:**
  - The layout and ownership table (`:42-83`) lists only round 1's routers, services, tests and features. Missing:
    access, board, notes, requests, seniors, suggestions, summary and noora; `services/noora/`, `past_questions`,
    `exam_names`, `gaps`, `polls` and `drive_import`; `tests/board`, `noora` and `notes`; and the web features
    access, board, notes, papers, requests, start and manage.
  - The CLI list (`:62`) is missing `weekly-summary`, `import-drive`, `exam-meta`, `text-worker` and
    `extract-texts`.
  - "The contract" (`:95-98`) still says routes are `NotImplementedError` stubs and that shapes change "only
    additively". That contradicts the no-backward-compatibility rule in CLAUDE.md.
  - "Migrations in round 2" (`:319-320`) is history.
- **`docs/backend/DEPLOYMENT.md`:**
  - The intro (`:3-12`) lists the API, the database, the mail worker and two daily jobs, but `compose.prod.yaml`
    also runs the `texts` worker.
  - Nothing tells a deployer about `DSBA_ANTHROPIC_API_KEY` and `DSBA_NOORA_MODEL` (which `compose.prod.yaml:41-42`
    reads), switching on `noora.ai`, or the Sunday summary that the mail worker queues.
- **Fix:**
  - Rewrite STATUS's head around round 10 and drop the finished items.
  - Regenerate ARCHITECTURE's layout table from `ls`, and replace "The contract" rules with CLAUDE.md's.
  - Add a "Mini Noora and the Sunday summary" section to DEPLOYMENT.

## Summary

Rounds 5 to 9 roughly doubled the product: 23 merges and 17,000 lines. On the whole it holds up:
- Every check passes: 1,096 API tests, 655 Vitest tests in 81 files, mypy strict, knip clean.
- The routers stay thin, the list endpoints load their rows in batches, every new error code is typed, and no
  `type: ignore` or `any` was added.
- Every feature reaches another only through `public.ts`.
- Noora's chat grew into a set of small, mostly tested modules, not one component.
- Home became a tested block model.

This pass found **no blocker, 5 major and 12 minor findings**. The majors come from the way these rounds were built:
parallel branches that each defined zones, sittings, switches and query keys their own way.
- One branch's change was lost: students can't ask for an RTC paper (CQ-31).
- Two features don't agree on which switches gate a block (CQ-34).
- A cache key family missed an invalidation (CQ-33).
- Round 9 brought back the bug CQ-1 fixed, with Noora's chats kept past sign-out (CQ-30).

### Top five changes worth making, in order

1. **CQ-30: put Noora's chats under `hub.mine.`, and clear them on sign-out.** Two key names, the sessionStorage
   key and one test. This is the only finding that exposes one student's data to another.
2. **CQ-31 with CQ-32: make zone one type from start to end.**
   - Use `Zone` in the request schema and every output schema, so RTC requests work.
   - One zone and sitting label and one sitting key on each side: `exam_names` in the API, `library/display.ts` in
     the web app.
   - CHECK constraints on the three zone columns.
3. **CQ-33 and CQ-34: fix the two places where a screen and its data disagree.**
   - Invalidate the whole `REQUESTS_KEY` after request mutations.
   - Give each Home block its features in `home/blocks.ts`, and compute "offered" from them.
4. **CQ-35 (with CQ-36 and CQ-45): squash the migrations into one baseline now, between rounds.**
   - In the same change: rename `video_suggestions` to `modules.video-suggestions`, add the zone CHECKs and the
     `requests` done index.
   - Prove it with the drift test, the seeded-state test and a schema dump diff.
   - `alembic stamp` the local database so the Drive import's data stays.
5. **CQ-46 with CQ-41: bring the docs back in line with the code, and strip the IDEA and review numbers from it.**
   STATUS is the next session's starting point, and it currently contradicts itself.

The rest (CQ-37 to CQ-40, CQ-42 to CQ-44, and the open CQ-17, CQ-22 and CQ-26) are local fixes. Do each when its file
is next touched. CQ-43, Prettier with a check, is worth doing before the next parallel round, since it removes a
whole class of merge conflict.

---

# Round 3 re-review

Reviewer: code quality. Scope: `feature/backend` at `8c4164d` (round 3 and the no-compatibility clean-up merged),
reviewed on `round3/review-quality`. Left alone, because the approved access work replaces them: the roles code
(`core/security.py` role checks, `routers/admin.py`, `features/admin`, `features/moderation`, the bootstrap admin in
`services/accounts.py`) and the migrations, which the access plan squashes into one baseline
(`docs/superpowers/plans/2026-10-13-access-*.md`). No application code was changed.

## Checks run

| check | result |
|---|---|
| `PATH=/opt/homebrew/opt/libpq/bin:$PATH scripts/check.sh` | **all passed**: uv.lock and requirements.txt in sync, ruff and ruff format clean, mypy strict clean on 150 files (`app` and `tests`), 652 API tests passed (drift and migration tests included), both `tsc` configs clean, ESLint clean, 347 Vitest tests in 36 files passed, `schema.d.ts` matches `openapi.json`, build passed |
| `npx knip` in `web/` | 3 "unused files" (all false positives: Playwright's setup and teardown projects and the Docker build's `deploy/csp-hashes.mjs`), 86 unused exports. Checked by hand: 1 dead function, 19 public or barrel exports nobody imports through the barrel, the rest used only in their own file (CQ-28), 60+ unused exported types (props types re-exported from `src/ui/index.ts`: fine) |
| `vite build` with source maps | entry chunk 611 KB, 182 KB gzip (round 1: 837 KB / 256 KB). By source size it is mostly React Router, Phosphor icons, React DOM and TanStack Query; PostHog is now a lazy chunk |
| `type: ignore` in `api/app` | 4, all at untyped library edges (boto3's `LocationConstraint`, two in google-auth, and one in `routers/_base.py` that a type annotation would remove, CQ-29) |

## Earlier findings: status

| ID | Status | What is there now |
|---|---|---|
| CQ-1 | **fixed** | `removeStored()` (`web/src/state/storedValue.ts:39`) dispatches to every holder; `clearPersonalStorage` uses it (`auth/queries.ts:46`); `useForumViewerSync` and `forgetDraftOf` are gone; `auth/queries.test.ts` covers it. |
| CQ-2 | **fixed** | One staff rule, one `client_ip()`, typed settings, `Storage` methods; `request_ip`, `rotate_csrf` and the forum's and admin's local checks are gone. |
| CQ-3 | **fixed** | `services/forum/` is a package of 12 modules (1,794 lines in all, the largest 252); reports moved to `services/reports.py`. The bounded per-author `ILIKE` in `forum/images.py:55,63` stays, as the round 1 recheck accepted. |
| CQ-4 | **fixed** | Issue sections and covers are discriminated Pydantic unions (`schemas/newsletter.py:114,142`), `CareerContent.data` is `CareerDoc`, `AccountExport` has typed items; `newsletter/types.ts` is 30 lines of aliases over the generated types. Left: `AuditOut.data: dict[str, Any]` (`schemas/moderation.py:86`), which the access work rewrites. |
| CQ-5 | **fixed** | One `useDebouncedValue`, `ConfirmDialog`, `QueryError`, `nextOffset`, `src/api/uploads.ts`, `src/lib/dates.ts` (Bahrain day), `src/lib/share.ts` (`copyText`, `hostOf`), `isMediaPath`, one `CohortYear`. No `navigator.clipboard` outside `lib/share.ts`. The browser-side `ics.ts` is gone. |
| CQ-6 | **fixed** | One `public_user`, one rate limiter (`ratelimit.enforce`/`window_wait`), `core/text.insert_with_unique_slug`, `modules.require_module`, `core/time.bahrain_today`, `core/links.MEDIA_PATH`; site search uses the forum's `to_plain_text`. The forum's own search dialect stays and is now written down (`services/forum/search.py:9-11`). |
| CQ-7 | **mostly fixed** | 36 Vitest files over the pure modules, drift and migration tests (`tests/core/test_drift.py`, `test_migrations.py`), `mypy tests` clean, seed tests compute counts. **Open:** the personas and module fixtures are still declared three times with different names and modules (`tests/content/conftest.py:24-48`, `tests/community/conftest.py:15-54`, `tests/core/conftest.py:65-80`); `community/conftest.py:42` still takes `Callable[..., Any]` and re-annotates. Folded into CQ-26. |
| CQ-8 | **fixed** | `ControlCharactersMiddleware`, the `DataError` handler and the `Offset` cap; the forum's `_param` and local guards are gone (`forum/text.py:21` only strips control characters out of stored text, which is a different job). |
| CQ-9 | **fixed** for the content areas | Calendar, newsletter, content and modules routers call services and commit. `uploads.py` no longer commits. **Not re-raised:** `routers/admin.py` and `routers/notifications.py` still query in the handler; admin is replaced by the access work, notifications is CQ-24. |
| CQ-10 | **fixed** | `NotificationKind` on `notify()`, `ErrorCode = Literal[...]` (`schemas/common.py:32`), `ApiErrorCode` on the web side; `post_unavailable` for removed targets everywhere. |
| CQ-11 | **fixed** | The library mutations invalidate `MODULES_KEY` exactly (`features/library/api.ts:229-235`). |
| CQ-12 | **fixed** | PostHog loads only when `VITE_POSTHOG_KEY` is set, through a dynamic import (`main.tsx:30-33`, `lib/analytics.ts:72`). |
| CQ-13 | **fixed** | Moderation uses `modq-`; the module page's scoping patch is gone. The noora panel keeps raw `#fff` as a local custom property (`noora/ChatPanel.css:27`): acceptable. |
| CQ-14 | **fixed** | Newsletter inserts in a savepoint and answers 409 (`services/newsletter.py:185-190`), slugs retry through the shared helper, rate limits lock first, and the pre-hide state lives on the row (`models/forum.py:51`), not in the audit log. |
| CQ-15 | **fixed** | Migrations 0004 and 0006: the unused indexes dropped, the missing ones added (`ix_library_items_status_newest` on the sort expression, `uploads(user_id, created_at)`, `library_items(uploaded_by)`, `forum_replies(parent_id)`, `reports(reporter_id, created_at)`, the `SET NULL` foreign keys), the CHECKs on kind, type, reason and cohort columns, `reports.status` default, `User.updated_at` gone. The models declare the same (`check_in`, `year_range`), and the drift test proves it. Comments in 0006 narrate history: see CQ-20. |
| CQ-16 | **mostly fixed** (see CQ-25) | `n` is still the count on `/forum/threads/hot`, `/forum/threads/{thread_id}/related` and `/calendar/upcoming` (`limit` everywhere else); `ThreadListParams` (`features/forum/types.ts:27`) still redeclares the forum list's query in camelCase; `POST /reports` still answers `Ok`. With no compatibility to keep, the fix is now a rename, not an alias: see CQ-25. |
| CQ-17 | **mostly fixed** | `ThreadPage`, `CalendarPage` and the issue editor are split; `/styleguide` is gated (`routes.tsx:28-40`); the shell no longer waits for `/modules` (`App.tsx:12-20`, each page waits in `RouteFrame`). **Open:** `library/LibraryPage.tsx` (551 lines) and `account/AccountPage.tsx` (454) are as large as before; `library/components/UploadDialog.tsx` (438) and `newsletter/editor/Editor.tsx` (441) joined them. Minor; split when next touched. |
| CQ-18 | **mostly fixed** | README, CI (`.github/workflows/ci.yml`), `scripts/check.sh`, the pre-push hook; stray files and dead data gone; `compose.yaml` points at `docs/backend/DEPLOYMENT.md`. **Open:** type-aware lint is still off (`web/eslint.config.js:36` uses `tseslint.configs.recommended`); tracked as standards review S-1. |

## New findings (CQ-19 onwards)

| ID | Severity | Title |
|---|---|---|
| CQ-19 | major | `insert_with_unique_slug` reads every integrity error as a slug clash (**fixed** `149c166`) |
| CQ-20 | minor | Comments still narrate history and cite review IDs (**partly fixed** `ce0674f`: the "Split out of" and "one copy for every area" comments are gone; the review-ID references remain, since most sit in code the access work rewrites) |
| CQ-21 | minor | Two script and doc commands that don't do what they say (**fixed** `8f6bffe`) |
| CQ-22 | minor | The web app hard-codes the upload limits the API reads from settings (open: needs a choice between serving the rules and fixed limits) |
| CQ-23 | minor | Small helpers written again in several places (**fixed** `5a19218` `countOf`, `ce0674f` `useCopyLink`, `e4b805f` `clip`, one `import_key`, one exam-year range) |
| CQ-24 | minor | Logic left in the notifications and `me` routers; a service that commits (**fixed**: `services/notifications.py`, `accounts.change_identifier`, `delete_account` leaves the commit to the router) |
| CQ-25 | minor | API names and lookups to settle before release (CQ-16, now as renames) (**fixed**: `limit` not `n`, reads by slug only, the forum list's query type from the schema, `POST /reports` answers 204) |
| CQ-26 | minor | Test fixtures declared three times; the e2e suite restates API shapes by hand (open: the three persona sets differ in names and modules that tests rely on; the typed e2e `api()` needs a run of the suite) |
| CQ-27 | minor | Pure modules without Vitest tests, grade arithmetic among them |
| CQ-28 | minor | knip has no config, so dead public exports and barrel bypasses go unnoticed (**fixed**: `web/knip.json`, knip in `check.sh`, the public exports trimmed, `ACCOUNT_KEY` in `src/api/keys.ts`, `auth` imports the state barrel) |
| CQ-29 | minor | Typing nits in the API: one avoidable `type: ignore`, library kinds passed as `str` (**fixed** `e4b805f`) |

What rounds 2 and 3 added was checked as asked. Most of it is good work, and it led to no finding:
- **The Drive client and import** (`services/drive.py`, `services/drive_import.py`): small typed records, one
  transaction per file, a dry run that changes nothing, refusals collected and not fatal, and 1,104 lines of tests
  over a fake Drive and moto. The only points are under CQ-19, CQ-23 and CQ-29.
- **The data router** (`App.tsx`, `routes.tsx`, `shell/RouteFrame.tsx`): one layout route. Each page is lazy, has
  its own error boundary and waits for the catalogue only if it needs it. `useLeaveGuard` is the router's only
  blocker, and it lets the editor's own navigations through.
- **The shared upload and share helpers:** one pipeline (`src/api/uploads.ts`) used by the library dialog and the
  forum (`forum/lib/uploads.ts`, `useAttachImages`). There is no other `XMLHttpRequest` or `navigator.clipboard` in
  the app, and no feature reaches into another except through `public.ts` (checked with a script over every
  import).
- **The e2e harness** (`compose.e2e.yaml`, `scripts/e2e.sh`): explicit about what it changes, never touches `db`,
  `minio` or `mailpit`, and puts things back with `--restore`.
- **The CQ-15 migration** matches the models; the drift test proves it.
- **No N+1 queries.** A scratch probe (not committed) counted the statements per request at 2 and at 12 rows of
  data. Every list stays flat: `/forum/threads` 8 then 4, `/library/items` 5, `/notifications` 4,
  `/admin/reports` 5, `/search` 6, `/me/export` 14.
- **No backward compatibility.** The deprecated email switches, `DEPRECATED_SWITCHES` and the grades
  `LEGACY_KEY` are gone, and no API field alias, storage-key migration or redirect is left. Searching for "legacy",
  "deprecated", "previously", "used to", "moved from", "no longer used" and "v1" in `api/app`, `api/tests`,
  `web/src`, `web/e2e` and `scripts` finds nothing that narrates history. The leftovers are the comments in CQ-20
  and the two lookups in CQ-25. Migration 0003 is a data migration of the old preference keys, and
  `tests/core/test_migrations.py:54-55` tests it; both go in the access work's squash (plan Task 2 rewrites that
  test).

### CQ-19. `insert_with_unique_slug` reads every integrity error as a slug clash (major)

- **Where:** `api/app/core/text.py:61-77`. Callers: `services/library.py:379,411,452` (uploads, links, the Drive
  import) and `services/calendar.py:147` (event ids).
- **What:** the helper catches every `IntegrityError` from the insert as "another request took this slug". It
  retries with a random suffix three times, then answers 409 `retry`: "Someone saved something with the same name
  at the same moment. Try again." That includes errors that have nothing to do with the slug:
  - a CHECK violation (`ck_library_items_kind` and the other CHECKs added in 0006);
  - a foreign key violation (a module deleted while a rep saves);
  - another unique column (`library_items.import_key`, which `drive_import.py:574` notes in a comment).

  Reproduced with a scratch test: a `LibraryItem` with `kind="not-a-kind"` passed to the helper comes back as
  `409 retry`, after three savepoints.
- **Why it matters:** a real bug, such as a schema that lets a value through which the database refuses, shows up as
  a message telling the student to try again, which never helps. It isn't logged as an error, so nobody hears of
  it. It costs three round trips before failing. And the Drive import can't tell a race on `import_key` from a
  title clash.
- **Fix:** retry only when the violated constraint is the slug's own:
  `isinstance(e.orig, psycopg.errors.UniqueViolation) and e.orig.diag.constraint_name == <the column's unique
  constraint>`. For the calendar id that is the primary key. Re-raise anything else; the error handler then
  answers 500 and logs it, or the existing `DataError` mapping applies. Add two tests to `tests/core/`: a CHECK
  violation propagates, and a clash on the slug retries.

### CQ-20. Comments still narrate history and cite review IDs (minor)

- **Where:**
  - **"Split out of …" comments, 8 files** (history, against CLAUDE.md's rule):
    - `features/career/{FeaturedCompetition.tsx:1,EmployerCard.tsx:2,SkillRow.tsx:2}`;
    - `features/calendar/{useCalendarView.ts:2,MonthExtras.tsx:2,CalendarToolbar.tsx:2}`;
    - `features/search/PaletteRow.tsx:2`;
    - `features/onboarding/TourArt.tsx:1`.
  - **"The one copy for every area" comments,** which are the same history in other words:
    - `ui/ConfirmDialog.tsx:26`, `state/useDebouncedValue.ts:4`;
    - `lib/dates.ts:1`, `lib/share.ts:1`;
    - `features/home/time.ts:2`, `features/calendar/dates.ts:2`;
    - `api/uploads.ts:2`.
  - **Review references:** about 290 in 159 files under `api/app`, `api/tests`, `web/src` and `web/e2e`, such as
    "(code quality review CQ-5)", "(security review, finding 5)" or "(UX review UX-3)". They use two numbering
    schemes for the same security findings: `security-design.md`'s "finding 5" and `security.md`'s "SEC-5".
  - **Two in the public API docs:** `routers/admin.py`'s docstrings put "security review SEC-9" into
    `api/openapi.json:2785,9911` and so into `/api/v1/docs`.
  - **Migration 0006's docstring:** "what 0004 left", "replaces (status, published_at)", "every value the API has
    ever written". Left alone here, because the squash replaces it.
- **Why it matters:**
  - A comment should say why the code is as it is. "Split out of X" says where it came from, which is git's job.
  - Review IDs point at documents that get renumbered and rewritten (this file now has two rounds). A reader then
    needs the review to understand the code, and the comment goes stale when the review does.
- **Fix:**
  - Delete the "Split out of …" sentences, and reword "the one copy/home for every area" as what the module is
    for.
  - Where a review ID stands in for a reason, write the reason in a few words and drop the ID. Keep IDs only in
    tests that pin a reported bug, where they help.
  - Take review references out of route docstrings, because they are public.
  - When the access work writes the baseline migration, its docstring describes the schema only.

### CQ-21. Two script and doc commands that don't do what they say (minor)

- **Where and what:**
  - `scripts/seed-real.sh:27`: `--help` prints lines 2 to 18 with a fixed `sed -n '2,18p'`, and line 18 is
    `set -euo pipefail`, so the help ends with that line (tried). `scripts/e2e.sh` does the same job robustly with
    `sed -n '2,/^set -euo/p' … | sed '$d; …'`.
  - `scripts/check.sh:11` says the e2e suite runs with `cd web && npm run e2e`, "see README.md". That runs
    Playwright against whatever is on :5173, without the file mail backends or the raised limits, so the sign-up
    setup can't read its codes. CLAUDE.md and the README say `scripts/e2e.sh`.
- **Why it matters:** these are the first commands a new team member copies.
- **Fix:** use e2e.sh's help pattern in seed-real.sh, and point check.sh's comment at `scripts/e2e.sh`. Every other
  command checked works: each `python -m app.cli` command and flag that README, CLAUDE.md, ARCHITECTURE.md,
  DEPLOYMENT.md and the skills name, every `scripts/*.sh` flag, and every `npm run` script.

### CQ-22. The web app hard-codes the upload limits the API reads from settings (minor)

- **Where:** `web/src/api/uploads.ts:39-89`: the type allowlists, `maxMb: 50` and `maxMb: 8`, and the copy "Up to
  50 MB". The API reads `DSBA_MAX_UPLOAD_MB` and `DSBA_MAX_IMAGE_MB` (`api/app/config.py:111-112`) and its own
  allowlists (`services/uploads.py`). The file's header says it "mirrors" them.
- **Why it matters:** a deployer who changes either setting gets a web app that refuses files the API would take, or
  promises a limit the API then refuses. The first presign already carries `maxBytes`, so the app finds out only
  after the person has chosen the file. Two allowlists also have to change together every time a type is added
  (decision D9 added pictures to both).
- **Fix:** with nothing released, pick one:
  - serve the rules, with `GET /uploads/rules` returning per purpose the extensions, content types and `maxBytes`,
    typed in `openapi.json`, and have `UPLOAD_RULES` come from a long-lived query;
  - or drop the two settings and make the limits constants that the API states in its schema. The messages stay in
    the web app.

### CQ-23. Small helpers written again in several places (minor)

- **Web:**
  - **`plural`, six private copies:** `calendar/dates.ts:71`, `about/AboutPage.tsx:13`,
    `newsletter/editor/Editor.tsx:60`, `modules/ModulePage.tsx:24`, `modules/ModulesPage.tsx:19` and
    `newsletter/components/sections/LiveLists.tsx:9`. None of them uses `formatCount` (`ui/utils.ts:23`), so
    "1250 files" shows without the thousands separator that round 3 added elsewhere. Five more call sites format
    numbers with their own `toLocaleString('en-GB')`. Add `countOf(n, one, many?)` to `ui/utils.ts` on top of
    `formatCount`, and use it everywhere.
  - **Copy a link, then show a toast, five times:** `calendar/SubscribeDialog.tsx:33`, `calendar/EventDrawer.tsx:36`,
    `library/FileViewerPage.tsx:187`, `forum/ThreadPage.tsx:130` and `newsletter/components/ShareActions.tsx:22`.
    They give three different failure messages: the URL, "Select the link and copy it yourself" and "Copy it from
    the address bar instead". Add a `useCopyLink()` next to `copyText` that takes the success line, with one
    failure message.
- **API:**
  - **The Drive import builds `import_key` twice:** the `Planned.import_key` property
    (`services/drive_import.py:153-155`) and the f-string in `_plan_file` (`:496`). Build it in one function.
  - **`EXAM_YEARS = (1990, 2100)`** (`drive_import.py:84`) restates the `exam_year` bounds of
    `schemas/library.py:80,103`. Put the bounds in one constant that both use.
  - **Cutting text with an ellipsis, five ways:** `drive.printable`, `drive_import._fit`, `notify.py:51`,
    `search.py:105` and `forum/notices.py:38`, each cutting at words or characters differently. Add a
    `core/text.clip(text, n, at_word=False)`.

### CQ-24. Logic left in the notifications and `me` routers; a service that commits (minor)

- **Where:**
  - `api/app/routers/notifications.py:39-85`: the list, the unread count, mark-read and mark-all-read are queries and
    updates in the handlers, with the serialiser `_out` beside them.
  - `routers/me.py:180-223`: adding and removing an identifier both repeat "set it, flush (409 on a race), sign out
    the other sessions, queue the notice, commit, send the text".
  - `services/accounts.py:675`: `delete_account` commits. Every other service leaves that to the handler, and its
    docstring doesn't say otherwise.
- **Why it matters:** these are the patterns CQ-9 removed from the content routers. The two identifier handlers have
  to stay in step on a security-relevant sequence.
- **Fix:**
  - Add `services/notifications.py` with `list_page`, `mark_read` and `mark_all_read`.
  - Add `accounts.change_identifier(db, user, sess, kind, value) -> TextNotice | None`, used by both handlers.
  - Move the commit out of `delete_account`, or say in its docstring that it commits and why.
  - `routers/admin.py` is left alone: the access work replaces it.

### CQ-25. API names and lookups to settle before release (minor)

CQ-16 suggested aliases; with no compatibility to keep, these are now plain renames.
- **Counts:** `n` → `limit` on `/forum/threads/hot`, `/forum/threads/{thread_id}/related` and `/calendar/upcoming`.
- **Query types:** take the forum list's parameters from the generated schema
  (`NonNullable<paths['/api/v1/forum/threads']['get']['parameters']['query']>`). Today `ThreadListParams`
  (`features/forum/types.ts:27-37`) redeclares them in camelCase and `forum/api.ts` maps them by hand. The same goes
  for the library's and the calendar's filter types.
- **`POST /reports`** answers `Ok`, and every other create returns what it made. Return `ReportOut`, or 204.
- **Read by slug or by id:**
  - `library.find` (`services/library.py:133-141`) tries an id, then a slug.
  - `forum.thread_by_slug` (`services/forum/visibility.py:97-107`) does the same. Its docstring needs SEC-12 to
    explain why a slug can't stand in for another thread's id.
  - Every link the API and the web app make uses the slug: `notices.py`, `reports.py`, `search.py`, the
    `library.py:521` notification, and `itemPath` (`features/library/api.ts:173-175`). `itemPath`'s
    `item.slug || item.id` also falls back on a value that is never empty (the column is `NOT NULL`).
  - Read by slug only, and drop the id path and the fallback. The id-based write routes stay as they are.

### CQ-26. Test fixtures declared three times; the e2e suite restates API shapes by hand (minor)

- **API tests (the open part of CQ-7):** `student`, `moderator`, `admin` and the module fixtures are declared in
  `tests/content/conftest.py:24-48`, `tests/community/conftest.py:15-54` and `tests/core/conftest.py:65-80`, with
  different names ("Sara Student" and "Sara M.") and different modules: four hand-made modules in community, the
  seed's 16 in content. `community/conftest.py:42` takes `Callable[..., Any]` and re-annotates the result. The
  access plan rewrites `make_user` in `tests/conftest.py` (Task 2). Move the personas and one `modules` fixture
  there at the same time.
- **e2e typing:**
  - `api<T>()` (`web/e2e/support.ts:195-206`) casts the parsed body to whatever `T` the caller names. The specs
    restate API shapes inline, for example `api<{ preferences: { emailNewIssues: boolean } }>`
    (`accounts.spec.ts:30,32`).
  - The specs read `resp.json()` (typed `any`) 10 times (`forum.spec.ts:20,48,89,185`, `calendar.spec.ts:73`,
    `library.spec.ts`, `auth.setup.ts`).
  - `support.ts:132` ends with `code as unknown as string`.

  When an API field is renamed, `tsc` still passes and the suite fails three minutes into a Docker run.
- **Fix:** type `api()` by path and method with `paths` from `src/api/schema.d.ts`, the way openapi-fetch does, or
  use an openapi-fetch client with Playwright's request context. Replace the `as unknown as string` with a check that
  throws.

### CQ-27. Pure modules without Vitest tests, grade arithmetic among them (minor)

- **Where:** these modules have no React imports and no tests:
  - `features/grades/whatif.ts`, 211 lines: `targetsForRemaining`, `improvementPlan`, `holdingFloors` and
    `resitOutlook`, the marks a student is told they need. Its sibling `classify.ts` is tested.
  - `features/calendar/queries.ts`: `examsFor`, `nextExam`, `examSession` and `eventDays`.
  - `features/calendar/dates.ts`: `monthMatrix`, `daysBreakdown` and `gapLabel`.
  - `features/career/lib/fit.ts`: `evaluateSkill` and the role fit.
  - `features/modules/lessons.ts`: recording dates and lesson info.
  - `features/home/session.ts`.
  - `features/search/search.ts`, 352 lines; the access web plan adds `search.test.ts`.
- **Why it matters:** a wrong "you need 68 in the exam" or a wrong "next exam" is the kind of bug a student acts on.
  The modules are pure, so the tests are cheap.
- **Fix:** add `whatif.test.ts` first, with each target class, a target that can't be reached, blank marks and a resit. Then test the
  calendar queries, with an exam spanning days and one on the last day of a month, then career fit. Write them the
  way the 36 existing test files are written.

### CQ-28. knip has no config, so dead public exports and barrel bypasses go unnoticed (minor)

- **What:** with no `web/knip.json`, `npx knip` reports false positives: 3 "unused files", 86 exports and about 60
  types. Nobody reads it, and it isn't in `scripts/check.sh`. A minimal config
  (`entry: ["e2e/*.setup.ts", "e2e/*.teardown.ts", "deploy/*.mjs"]`, `ignoreExportsUsedInFile: true`, types
  excluded) brings the output down to 20 lines, all real:
  - **Dead code:** `newestText` (`web/e2e/support.ts:136`).
  - **`public.ts` exports no other feature imports:**
    - calendar: `CALENDAR_KEY`, `feedUrl`, `useUpcomingEvents` (`features/calendar/public.ts:17`);
    - modules: `useProgress` and `moduleKeys` (`modules/public.ts:10,13`);
    - newsletter: `NEWSLETTER_KEY` and `useLatestIssue` (`newsletter/public.ts:5`);
    - notifications: `NOTIFICATIONS_KEY` (`notifications/public.ts:3`).

    A public surface wider than its use invites the coupling `public.ts` exists to limit.
  - **Barrels bypassed:** `src/state/index.ts` exports `removeStored`, as CLAUDE.md says, but `auth/queries.ts:2`
    imports it from `../state/storedValue`. Features import `safeHref`, `isMediaPath` and `initials` from
    `../../../ui/safeHref` and `ui/utils` rather than from `src/ui`. `auth/index.ts` exports `canModerate`,
    `canAdminister` and `refreshPersonalQueries`, and nothing imports them from there.
  - **Related:** `auth/AuthProvider.tsx:159` invalidates the literal key `['account']`, which belongs to
    `features/account/api.ts:7` (`SESSIONS_KEY`). By `src/api/keys.ts`'s own rule ("more than one area reads or
    invalidates"), that key belongs in `keys.ts`.
- **Fix:** commit the config, fix the 20 lines and add `npx knip` as a step in `check.sh` and CI, so CQ-18's dead-code
  pass doesn't need a reviewer every round. Move the account key to `src/api/keys.ts`.

### CQ-29. Typing nits in the API: one avoidable `type: ignore`, library kinds passed as `str` (minor)

- **Where:**
  - `api/app/routers/_base.py:12`: `responses=ERRORS  # type: ignore[arg-type]`. The ignore exists only because
    `ERRORS` is inferred as `dict[int, dict[str, type[ErrorResponse]]]`; annotating it
    `dict[int | str, dict[str, Any]]` removes it. The other three ignores are at untyped library edges (boto3 and
    google-auth) and are fine.
  - `services/drive_import.py`: `Source.kind`, `Planned.kind` and the return of `exam_kind` are `str`.
  - `services/library.py:416`: `create_imported(kind: str)`. `schemas/library.py:11` already has
    `LibraryKind = Literal[...]`. Only the 0006 CHECK keeps a wrong kind out, and through CQ-19 a wrong kind
    reaches the person as a "try again".
- **Fix:** annotate `ERRORS`, and type the kinds as `LibraryKind` end to end, so mypy catches a typo in the import's
  kind mapping.

## Summary

The codebase has moved a long way since round 1:
- Of the 18 earlier findings, 13 are fixed and 4 mostly fixed (CQ-7, CQ-9, CQ-17, CQ-18). Only CQ-16, the API
  naming, is still open.
- The duplication that defined round 1 is gone: one upload pipeline, one confirm dialog, one date module, one rate
  limiter, one `public_user`.
- The contract is typed end to end. The forum service is a package. The shell no longer waits on `/modules`.
- Every check passes: 652 API tests, 347 Vitest tests, mypy strict on `app` and `tests`, the drift tests, the build.
- List endpoints stay at a fixed number of statements as the data grows.
- Rounds 2 and 3 added the Drive import, `seed-real.sh`, the data router, the e2e harness and the CQ-15 migration.
  They are well structured and tested.

This round found **no blocker, 1 major and 10 minor findings**. The major one is a shared helper that turns any
database integrity error into "try again" (CQ-19, reproduced). The no-compatibility clean-up worked: no aliases,
storage migrations or deprecated fields are left. What remains of the rule is comments: 8 that narrate where code
came from, and about 290 review-ID references (CQ-20).

### Top five changes worth making, in order

1. **CQ-19: retry `insert_with_unique_slug` only on the slug's own unique constraint.** Re-raise everything else.
   Today a CHECK or foreign key violation, in the library, the calendar or the Drive import, reaches the person
   as a 409 "try again" and is never logged. A small change with two tests.
2. **CQ-20: take the history and the review IDs out of the comments.**
   - Delete the 8 "Split out of …" lines and the "one copy for every area" phrasing.
   - Replace review IDs with the reason in words.
   - Keep review IDs out of route docstrings, which are public in `/api/v1/docs`.

   This is CLAUDE.md's own rule. Have the access work's baseline migration describe the schema only.
3. **CQ-28: commit a `web/knip.json` and run knip in `scripts/check.sh`.** Then fix the 20 real lines: one dead
   function, the `public.ts` exports no feature uses, the bypassed `src/state` and `src/ui` barrels, and the
   `['account']` key, which belongs in `src/api/keys.ts`. After that, dead code is caught on every push instead of
   once per review.
4. **CQ-27: add Vitest tests for `grades/whatif.ts`, then `calendar/queries.ts` and `calendar/dates.ts`, then
   `career/lib/fit.ts`.** These are pure modules whose answers students act on: the marks they need, and their
   next exam.
5. **CQ-25 (with CQ-22): settle the API's names before release, while renaming is still free.**
   - `n` becomes `limit`.
   - The forum, library and calendar query types are derived from the generated schema.
   - `POST /reports` returns the report.
   - Reads go by slug only.
   - The upload rules are served by the API, not copied into the web app.

The rest (CQ-21, CQ-23, CQ-24, CQ-26 and CQ-29) are small, local fixes. Do each when its file is next touched.
CQ-26's personas belong with the access plan's `make_user` rewrite.

---

# Round 1

Reviewer: code quality. Scope: all of `api/` and `web/` at commit `525962c` (the integrated state of `44f4c28` plus
the Playwright runner), with the backend-core files (`app/core/*`, `config.py`, `db.py`, `services/{storage,notify,audit}.py`,
`models/*`, `cli.py`, compose, `web/src/api/client.ts`) rechecked at the end (see "Recheck of the core files").
No application code was changed. Line numbers refer to `525962c`. Scratch tools and raw outputs are in
`/tmp/claude-0/-home-claude-dsba/331caa53-7cba-5bfe-8500-672e2c76573d/scratchpad/quality/` (route probe, CSS audit,
knip, typed lint, migration drift, bundle build).

## Round 1 summary

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
