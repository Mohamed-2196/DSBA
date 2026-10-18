# Code quality review

Four passes live in this file, newest first. **Round 13 re-review** (at `25234ed`) covers rounds 11 and 12, re-checks
the open findings and CQ-30 to CQ-46, and adds CQ-47 onwards. **Round 10 re-review** (at `6c90aa9`) covered rounds 5
to 9 and added CQ-30 to CQ-46. **Round 3 re-review** (at `8c4164d`) added CQ-19 to CQ-29. **Round 1** (at `525962c`)
holds the original findings CQ-1 to CQ-18 as they were written. Line numbers refer to each pass's commit.

# Round 13 re-review (rounds 11 and 12)

Reviewer: code quality. Scope: everything rounds 11 and 12 changed, `33ea157..25234ed` less `c887f02` (Prettier
only): 837 files, +116,910/−18,405 lines, of which about 55,000 added lines are `openapi.json`, `schema.d.ts` and the
word game's guess list. Reviewed on `round13/quality`.

Round 11 was finished by another AI tool and round 12 repaired it, so this pass looked hardest for that tool's habits:
compatibility code for data nobody has, helpers written again, logic in the wrong layer, unchecked casts, effects
that should be state, tests that can't fail, dead code, and comments that cite reviews. Eight read-only helpers each
took one area: Daily (API and web); the notebook, boards, the calendar and bug reports (API); Manage's documents and
the library (API); the notebook (web); boards, the calendar, Home and the shell (web); Manage's editors (web); Mini
Noora, the library and the e2e suite (web). Every major finding was checked again by reading the code, and "Probe"
marks the ones reproduced with a scratch test, a statement counter or a build. No application code was changed.

## Checks run

| check | result |
|---|---|
| `PATH=/opt/homebrew/opt/libpq/bin:$PATH scripts/check.sh api` | **all passed**: lock and requirements in sync, ruff and ruff format clean (343 files), mypy strict clean (313 files), **1,520 API tests passed, 1 skipped** (a Linux-only `/proc` test) in 73 s on four workers |
| `scripts/check.sh web` | **all passed**: both `tsc` configs, ESLint, Prettier, knip, **882 Vitest tests in 118 files**, `schema.d.ts` matches `openapi.json`, build. The build warns that two chunks are over 500 kB (CQ-61) |
| slowest API tests (`--durations=30`, four busy workers) | the drift test's OpenAPI comparison 40 s (6 s alone) and the migration round trip 24 s; two own-app error tests 14-17 s; `board/test_cards.py::test_many_moves_into_one_gap_number_the_column_again` 15 s; the Sudoku solve 9-10 s (CQ-75) |
| bundle (`vite build --sourcemap`, bytes attributed by source map) | entry `index` **811 kB, 239 kB gzip** (round 3: 611/182); `NotePage` **562 kB, 177 kB gzip**; `pdf` 438 kB and `katex` 262 kB already load lazily; `ManagePage` 181 kB |
| `npx knip` in `web/` | nothing reported. Checked by hand: features reach each other only through `public.ts` (one test, `auth/secReviewR10.test.ts`, reads `features/noora/saved` directly) |
| `type: ignore` in `api/app` | 5: the three old library edges, and two new in Daily that hide loose annotations (CQ-72). In the tests: 21, nine of them on `db.get(...)` (`db.get_one` removes those) |
| `any` in `web/src` | none. `as unknown as` outside tests: 3, one new (`career/editor/CareerEditor.tsx:184`) |
| review and idea numbers | `IDEA-`: 41 → 0 in app code. Review IDs: 197 → 189 in `api/app`, `api/migrations` and `web/src`, 131 → 109 in the tests; rounds 11 and 12 added some, and 8 test files and 22 test names carry them (CQ-74) |
| N+1 | a statement counter over the new list endpoints: one N+1, the Daily leaderboard (CQ-54). Boards, notes, the calendar feed, Daily's day and the editor's lists stay flat; the account export is 40-45 statements |

## Earlier findings: status

| ID | Status | What is there now |
|---|---|---|
| CQ-1 to CQ-16, CQ-19, CQ-21, CQ-23 to CQ-25, CQ-28, CQ-29 | as in round 10 | fixed, or folded into later IDs |
| CQ-17 | **open** | Before Prettier: `library/LibraryPage.tsx` 594 lines (568 in round 10), `account/AccountPage.tsx` 507, `newsletter/editor/Editor.tsx` 642, `library/components/UploadDialog.tsx` 438. Rounds 11 and 12 added larger ones (CQ-69) |
| CQ-18 | **open** | Type-aware lint is still off (`web/eslint.config.js:36`, `tseslint.configs.recommended`); S-1 |
| CQ-20 | see CQ-41 | |
| CQ-22 | **open** | `web/src/api/uploads.ts:76-120` still states 50 MB and 8 MB beside `DSBA_MAX_UPLOAD_MB` and `DSBA_MAX_IMAGE_MB`. DEPLOYMENT.md, section 12, now says to change both |
| CQ-26 | **open** | The `module` fixture is declared four times (`accounts/conftest.py:180`, `board/conftest.py:27`, `notes/conftest.py:22`, `noora/conftest.py:111`) and the personas three times; the e2e `api<T>()` cast is unchanged and now has 94 callers (CQ-68) |
| CQ-27 | **open** | `career/lib/fit.ts` and `home/session.ts` still have no tests |
| CQ-30 | **fixed** | `hub.mine.noora.chat` (sessionStorage) and `hub.mine.noora.chats` (`noora/saved.ts:12-13`); `clearPersonalStorage` clears both storage areas (`auth/queries.ts:57-65`), with a test |
| CQ-31 | **fixed in the API only** | `Zone` in every request schema (`schemas/requests.py:34,53,80`). The web app's request dialog still offers only zones A and B, so a student still can't ask for an RTC paper (CQ-63); no API test of an RTC request either |
| CQ-32 | **mostly fixed** | API: `Zone` everywhere, CHECKs on the three columns, one `zone_label` and `sitting_key` (`services/exam_names.py:113,125`), `PAST_PAPER` and `EXAMINERS_REPORT` beside `LibraryKind`. Web: `src/lib/exams.ts`. The copies left are in CQ-63 |
| CQ-33 | **fixed** | `requests/api.ts:32-39` invalidates the done list with the others |
| CQ-34 | **fixed** | Each block names its features in `home/blocks.ts`; `offeredBlocks()` computes the offer and is tested |
| CQ-35 | **open, in progress** | 29 migrations now, ids out of order (… 0026 → 0028 → 0031 → 0029 → 0030 → 0033); `round13/squash` squashes them this round. CQ-52 lists the data upgrades the squash should drop, and CQ-54 the partial-index check |
| CQ-36 | **partly fixed** | `FEATURE_KEYS` is checked against `Feature` at compile time (`auth/access.test.ts:165-172`). Open: the `video_suggestions` switch (`core/access.py:77`); "Help the year below" (`core/access.py:165`, `forum/HelpBelow.tsx:35`) against "Help the years below" (`home/blocks.ts:71`); `HomeBlock` in `schemas/auth.py:60`; and a fifth copy of the list in the e2e suite, already missing `daily` (CQ-68) |
| CQ-37 | **fixed** | `module_editor.add_lesson()` (`:114`) is the one way to add a lesson; `suggestions.py:248` uses it; `Video` is a `NamedTuple` |
| CQ-38 | **mostly fixed** | The papers rules are in `accounts.update_profile`; no service imports inside functions; `close_for_date` reads the audience once (`requests.py:564`). Open: `routers/calendar.py:85` still sorts and silently cuts `modules` to 20; `employer_id` is still checked only against the slug pattern (`services/calendar.py:162`); the slug pattern is now written four times (`schemas/auth.py:33`, `schemas/calendar.py:19,97`, `routers/calendar.py:39`) |
| CQ-39 | **mostly fixed** | The request export has `found_item_id` and `found_at` (`accounts.py:744-745`) and uses keyword arguments. Round 11 added one more dict: `ExportCalendarSettings.model_validate({...})` (`accounts.py:885`) |
| CQ-40 | **partly fixed** | The MiniNoora effects are gone (`MiniNoora.tsx:223,431`) and `ChatPanel.tsx:177-178` sets `newFrom` during render. `noora/useChat.ts:184-214` still copies six values into refs with effects, and the pattern spread (CQ-67, CQ-77) |
| CQ-41 | **partly fixed** | `IDEA-` references: 41 → 0 in app code. Review IDs: 197 → 189 in app code and 131 → 109 in the tests; rounds 11 and 12 added new ones (CQ-74) |
| CQ-42 | **partly fixed** | Tested now: `noora/open.ts`, `grades/record.ts`. Still untested: `noora/useDrag.ts`, `home/layout.ts`, `papers/usePapers.ts`, `modules/tracking.ts`, `career/lib/fit.ts`, `home/session.ts`; no API test of an RTC request |
| CQ-43 | **fixed** | Prettier 3.6.2 with a check in `scripts/check.sh` (`c887f02`, skipped by `git blame` through `.git-blame-ignore-revs`); the nine dead classes are gone. New dead CSS is in CQ-78 |
| CQ-44 | **fixed** | The 501 handler, its error code and the seed's `except` are gone |
| CQ-45 | **open** | Still no index for the done list; it belongs in the squash |
| CQ-46 | **fixed in this pass** | ARCHITECTURE.md (the layout, where each area lives, access and the boxes, the documents edited whole, private content, the text worker, browser storage, routing), DEPLOYMENT.md (every setting, the mail worker's schedule, the sweep, Mini Noora, the summary, bug reports, the Railway dev environment) and README.md now match the code. STATUS.md's header still says "when round 12 started"; it is the lead's file |

## New findings (CQ-47 onwards)

| ID | Severity | Side | Title |
|---|---|---|---|
| CQ-47 | major | API | A picture copied into a second note is deleted with the first; deleted files keep using the room |
| CQ-48 | major | API, web | Ink on pages a note doesn't have; deleting a page is one save per later page |
| CQ-49 | major | API | Daily: Data Mine can fail on a day the editor calls ready |
| CQ-50 | major | API, web | The Year 2 option and the electives are written in four places, and Manage edits one |
| CQ-51 | major | API | Deleting a module leaves the documents that name it unsaveable |
| CQ-52 | major | both | Compatibility code for data that only earlier rounds made |
| CQ-53 | major | both | The documents edited whole are built three ways |
| CQ-54 | major | API | Queries and indexes: the leaderboard's N+1, the content file, the reminder index |
| CQ-55 | major | API | Room checks re-serialise every note on each save; quotas are checked eight ways |
| CQ-56 | major | API | Daily's editor is one 1,255-line module, and its items are untyped dicts |
| CQ-57 | major | API | Upload purposes live in eight parallel tables; claiming an upload is written four ways |
| CQ-58 | major | API | Mini Noora's list of pages is a stale copy of the app's |
| CQ-59 | major | web | The notebook can lose or overwrite writing in five ways; its autosave loops are untested |
| CQ-60 | major | web | Manage throws unsaved edits away on any in-app navigation |
| CQ-61 | major | web | The first download is 811 kB, with Manage's editors and the palette in it; `NotePage` is 562 kB |
| CQ-62 | major | web | Manage's field errors never reach their fields; a reused id picks up students' marks |
| CQ-63 | major | web | Students still can't ask for an RTC paper in the app; zones still written by hand |
| CQ-64 | major | both | Daily: a guest's progress never reaches the hub, and the hub can stop at midnight |
| CQ-65 | major | web | Home: hidden dates come back, "Ask Noora anything" loses the question, To-do counts the wrong days |
| CQ-66 | major | web | Boards: one failure shows two alerts, and a ticked card can stay stuck |
| CQ-67 | major | web | Mini Noora: switching chats loses the last question, and the card and the page drift apart |
| CQ-68 | major | web | The end-to-end suite: two specs can't pass, and Daily has none |
| CQ-69 | minor | web | Components that hold their logic (`BoardPage.tsx` 939 lines, ten more over 500) |
| CQ-70 | major | web | The same shape written again inside a feature (Daily's six games and editor, the calendar, boards) |
| CQ-71 | major | web | Notebook pages: a link that drops its filter, a dialog with the wrong name, failures that say nothing |
| CQ-72 | minor | both | Types: ignores that hide loose annotations, strings where a type exists, needless casts |
| CQ-73 | minor | web | Shared homes bypassed: helpers written again across features |
| CQ-74 | minor | both | Review numbers and history in code and tests |
| CQ-75 | minor | both | Tests that can't fail, restate the code, or are slow |
| CQ-76 | minor | API | Small API helpers and rules written again |
| CQ-77 | minor | web | Effects that should be a key, derived state or an event |
| CQ-78 | minor | both | Dead code and dead CSS |
| CQ-79 | minor | both | Copy in code |
| CQ-80 | minor | API | Personal data, the audit log and step-up |
| CQ-81 | minor | API | Seeds, and a rule applied in some places only |
| CQ-82 | minor | both | Docs inside the code that no longer match it |

### CQ-47. A picture copied into a second note is deleted with the first; deleted files keep using the room (major, M)

- **Where:** `api/app/services/notes.py:432-454` (`_attach`), `:280-286` (`_let_go_of_files`), `:108-115`
  (`files_used`); `api/app/cli.py:269-273` (the sweep).
- **What:**
  - An upload belongs to one note (`uploads.note_id`). `_attach` takes a file only when it is free or already the
    note's (`or_(Upload.note_id.is_(None), Upload.note_id == note.id)`), but the editor copies a picture between notes
    with its upload id (`web/src/features/notes/text/nodes.tsx:286`). Deleting note A, or the picture in A, frees the
    file, and the next sweep deletes it while note B still shows it. Probe: after the delete and a sweep,
    `GET /notes/files/{id}` answers 404 and B still points at the file.
  - `files_used` adds up every `note_file` upload, freed ones included. Deleting notes frees no room until the sweep,
    and then only for files over a day old, so a student at 25 MB keeps getting 409 `notes_full`. Boards don't have
    this problem: a freed board file stays `attached` with `card_id` NULL and stops counting
    (`board/boards.py:128-136`).
  - The sweep's rule for unused files knows board files off their card, but not note files whose note row is gone.
- **Why it matters:** a picture disappears from a note the student never touched, and the room the app shows is
  wrong exactly when they are trying to make some.
- **Fix:** keep each note's upload ids (`notes.uploads uuid[]`, filled from `note_doc.check().uploads`, GIN-indexed)
  and free a file only when none of the student's notes lists it. Give freed note files a state of their own, left out
  of `files_used`, with a sweep rule like the board's. Test both with one picture in two notes.

### CQ-48. Ink is accepted on pages a note doesn't have, and deleting a page is one save per later page (major, M)

- **Where:** `api/app/services/notes.py:608-638` (`save_ink`), `:572-605` (`update_note`);
  `web/src/features/notes/NotePage.tsx:382-386`.
- **What:** `save_ink` checks only `0 <= sheet < MAX_SHEET_INDEX`. Probe: a one-page note without a PDF took ink on
  sheets 0, 5 and 1299; those rows are exported and count against the student's room. `update_note` never removes ink
  past the new page count. The web app deletes a page by sending every later page again, one PUT each: 300 for a long
  note, against `SAVES_PER_MINUTE = 240`.
- **Why it matters:** a tab closed half way through a page delete leaves pages shifted or doubled, and rows the
  notebook can no longer show still use the student's room.
- **Fix:** refuse sheets at or past `PAPER_SHEETS_FROM + note.sheets`, and PDF pages on a note without a PDF; delete
  ink past the new count in `update_note`; add one "delete page" and one "move page" call that renumber the rows in a
  single UPDATE.

### CQ-49. Daily: Data Mine can fail on a day the editor calls ready (major, M)

- **Where:** `api/app/services/daily/games/search.py:88-92` (`_fits` and its 60-letter cap),
  `services/daily/content.py:216-239` (`spread`: greedy, never backtracks), `services/daily/editor.py:117,322-336`
  (the readiness check tries one fixed order: "any order does").
- **What:** the greedy choice can fill seven words to 57-59 letters and then find no word short enough, where another
  seven would leave room. Probe with the real content file: the stats theme fails on 4 days of 365; a made-up
  nine-word theme passes the editor's check and fails on 26 days of 60.
- **Why it matters:** that day's Data Mine answers 404 `not_out_yet` for everyone, all day, while Manage says the
  theme is ready (`editor.py:9-10` promises "every day can be made").
- **Fix:** in `SearchGame.choose`, take a word only if the shortest words left can still fill the remaining places (or
  try a few seeded orders before giving up); make the readiness check independent of order; test a tight theme.

### CQ-50. The Year 2 option and the electives are written in four places, and Manage edits one (major, M)

- **Where:** `api/app/services/my_calendar.py:71-76` (`CHOICES`, for the private feed);
  `web/src/features/papers/papers.ts:15-26` (`CHOICES`, `NOT_ON_HUB`, for "Your papers" and the calendar);
  `api/app/seed/data/grades.json` (`year2Options`, `electives`: the grade rules, edited in Manage); `guides.json`
  (`electives.pick`).
- **What:** which modules are the option and the electives, and how many a student picks, is copied by hand. An admin
  who adds an elective in Manage → Grades calculator changes the calculator only: "Your papers", the calendar and the
  private feed keep the old list, with no error. The one API test (`tests/content/test_my_calendar.py:419-421`)
  checks only the half that would pass with no filtering at all.
- **Fix:** make the grade rules the one source (they are already edited in Manage): serve the option and the
  electives with GET /grades/rules, have `papers.ts` and `my_calendar.papers_of` read them, and drop both `CHOICES`.
  Test that a choice the student didn't pick leaves the feed.

### CQ-51. Deleting a module leaves the documents that name it unsaveable (major, S)

- **Where:** `api/app/services/module_editor.py:446-462` (`uses_of`); `services/grades.py:39-41`, `site.py:43-45`,
  `career.py:146-148`.
- **What:** `uses_of` counts a module's lessons, files, threads, notebooks, cards, requests and dates, but not the
  grade rules, Site settings' contributors or Career Navigator, which name modules by id. Probe: DELETE
  `/content/modules/asset-pricing` answers 204; an admin who then changes only the First band's floor gets 422
  "There is no module “asset-pricing”".
- **Why it matters:** public documents keep dangling ids, and the error blames a part the editor never touched.
- **Fix:** count each document's `module_refs()` in `uses_of` ("named in the grades calculator's rules"), with a test.

### CQ-52. Compatibility code for data that only earlier rounds made (major, M)

Nothing is released (CLAUDE.md), yet these exist only to upgrade older data:
- **Migrations:**
  - 0033's `SITE_ADDITIONS` and `CAREER_ADDITIONS` (`20261018_0033_cms2.py:52-118,159-160`) are frozen copies of parts
    of `site.json` and `career.json`, written into documents saved before. `tests/core/test_migrations.py:137-187`
    asserts they equal the seed, so editing the tour or search's words in `site.json` now fails a migration test.
  - 0028's `SEEDED_ART` (`20261017_0028_cms.py:28-45,69-71`) repeats `modules.json`'s pictures and matches nothing on
    a fresh database (the seed runs after the migrations); its docstring narrates ("until now").
  - 0024 rewrites existing rows (`:73-105`), and 0021 turns old Markdown notes into editor documents
    (`20261014_0021_notebook.py:65-90`).
- **Backfills:** `paper_text.without_cover` and `make_cover` (`paper_text.py:328-360`); the text worker's idle loop
  (`:413-431`), whose `attempted_covers` lives in the process, so every restart renders every PDF without a cover again;
  `make-covers` (`cli.py:377-391`) and `text_extract`'s `--no-text`. None is tested beyond one `== []`.
- **Old titles:** `drive_import.tidy_imported_titles` (`:953-971`) re-implements the title rule round 12 removed, to
  find titles it made; untested.
- **A test-only fallback in production code:** `services/noora/ask.py:100-107` creates the `noora_limits` row for "a
  test database emptied by hand". The migration makes the row, no test empties it, and the branch writes from a GET.
- **In the web app:** `calendar/EventFormDialog.tsx:115,118` maps the field names `end_date` and `module_id`, which the
  API never sends (its field errors are camelCase, `core/errors.py:84-91`); `board/board.ts:35-36` hides the API's
  "revision" board template instead of the API dropping it (`services/board/boards.py:65`, `schemas/board.py:17`);
  `forum/types.ts:47-52` keeps generated types under their old names (`ForumCategory = ForumCategoryOut`).
- **Why it matters:** each copy has to be kept equal to the real thing (one test already forces it), and they hide the
  real gap: `documents.current()` (`documents.py:74-76`) validates stored JSON with no rule for a new field, so a
  required field added to `SiteDoc` turns GET /site, search and Mini Noora into 500s wherever the document was saved.
- **Fix:** drop all of the above in the squash (CQ-35) and rebuild local data instead; keep `extract-texts` (the
  worker's own job) and let the worker make each cover as it reads the file. Write the rule in
  `docs/backend/CMS.md`: a new document field gets a default.

### CQ-53. The documents edited whole are built three ways (major, L)

`services/documents.py` is the shared helper: the seed until the first save, the version checked under a lock with
`populate_existing`, the first row by ON CONFLICT, a size cap, no-op saves skipped, every save audited. Site
settings, the guides, Mini Noora, the grade rules, the newsletter's settings and the summary's words use it.
- **Career Navigator** (`services/career.py`) copies it: its own `stored()` (`:47-50`), `editable()` (`:106-117`) and
  `save()` (`:139-165`). Its `_row()` (`:93-94`) has no `populate_existing`, which `tests/content/test_site.py:96`
  proves is needed; two first saves at once end in an IntegrityError and a 500 (`:156-158`); its first audit entry's
  "before" is `{}`; and the seed loader writes it (`seed/loader.py:168-175`), so a fresh database has no Career
  Navigator at all (`data: CareerDoc | None`, `schemas/career.py:333,340`). The reason given (`documents.py:7-8`: it
  attaches logos) is what `newsletter_settings.save` already does after `documents.save` (`:73-82`).
- **The forum's settings** (`services/forum/settings.py:104-120`) reuse half of the helper and write the version bump,
  stamp, flush and audit again, without the size cap.
- **Around them:**
  - eight `*Editable` and eight `*Save` schemas with the same fields, and eight `*_changed` error codes for one
    condition (`schemas/common.py:113-120`, against its own "one code per condition");
  - `_unique` six times with three messages; the slug-id type nine times;
  - three URL patterns (`/site` with `/site/edit`, `/summary/settings`, `/forum/meta` with `/forum/settings`);
  - site and guides converted to schemas in the router (`routers/site.py:34,45,57,68`), the others in their services.
- **The web side:** seven editors use the kit (`DocFrame`, `ListEditor`, `RowsEditor`, `docErrors`), yet each repeats
  the loader (`isError`, `isPending`, `key={version}`; `site/SiteEditor.tsx:94-117`), the draft with its JSON compare
  and a 30-line submit (`SiteEditor.tsx:150-183`, `start/editor/GuidesEditor.tsx:133-159`,
  `noora/settings/NooraEditor.tsx:196-229`, `forum/settings/ForumSettingsEditor.tsx:129-160`,
  `newsletter/settings/NewsletterSettingsEditor.tsx:108-134`, `grades/editor/GradeRulesEditor.tsx:164-196`,
  `manage/SummaryWords.tsx:66-90`); every `api.ts` repeats `useXForEditing`, `useSaveX` and `useReloadX`. Career
  Navigator's editor has its own frame (`career/editor/CareerEditor.tsx:199-284`), its own copy of the kit's CSS
  (`Editor.css`), of `ListEditor` (`ItemList.tsx`, 186 lines) and of `docErrors` (`career/editor/doc.ts:212-247`);
  the modules editor has its own banner, save bar and checks (`modules/editor/ModuleForm.tsx:206-219,262-278`).
- **Fix:**
  - API: one `documents.Kind` per document with `check` and `after_save` hooks (logos, pictures, the forum's tables),
    generic `Editable[D]` and `Save[D]` (subclasses keep the OpenAPI names), and one `document_changed` code. Career
    and the forum become kinds; Career reads its seed until the first save, like the others. One test parametrised
    over every kind (seed, version 0, a stale save's 409, a no-op save, the audit) replaces about 25 copies, and would
    have caught Career's differences.
  - Web: a `useDocEditor({ loaded, save, what, lists, sections })` hook that returns the draft, `dirty`, the errors,
    `submit`, `undo` and the frame's props; a `DocLoader`; a `docQueries()` factory for the three hooks. Split
    `DocFrame` into a status line, a banner and a save bar, so the modules editor can use them, and move Career onto
    the kit (`ListEditor` with a controlled `open`).

### CQ-54. Queries and indexes (major, S each)

- **The Daily leaderboard is an N+1** (`services/daily/plays.py:434-436` → `_board_row` → `accounts.public_user` →
  `access.access_of`). Probe: 15 statements for 5 rows, 75 for 35; a full board of 50 is about 105 per GET, on a
  public page with no rate limit. Call `access.prefetch(db, users.values())` after line 434, as every other list does.
- **The Daily content file costs about six statements per item** (`services/daily/bundle.py:167-187`; the paste import
  at `editor.py:1165-1183` likewise). Probe: the real file (702 items) took 4,202 statements and 23 s, which on Railway
  runs inside a web request. Load the keys, the guess list and the vocabulary once, `add_all`, and flush once.
- **Documents read again and again:** PUT /forum/settings reads `content_docs` three times and each list three times,
  with 17 single-row gets (`services/forum/settings.py:91,96`); search validates the whole `SiteDoc` on every keystroke
  (`search.py:215`). Cache the validated document per session in `documents.current`.
- **The reminder query can't use its index:** `models/my_calendar.py:25` indexes `date WHERE remind IS NOT NULL`, but
  `services/my_calendar.py:526-536` asks for `date <= soon AND (date >= recent OR repeat …)`. Probe on 200,000 past
  events: a sequential scan of 45 ms, every minute, on a table that only grows. Store each event's last day and
  index it.
- **The drift test can't see partial-index predicates:** `models/daily_content.py:78-92` builds them from tuples and
  migration 0029 writes the strings by hand; a changed predicate passes `compare_metadata`. Compare
  `pg_get_indexdef` for partial indexes in `tests/core/test_drift.py`.

### CQ-55. Room checks: every save re-serialises every note, and quotas are checked eight ways (major, M)

- **Where:** `services/notes.py:95-105` (`writing_used`: `sum(octet_length(doc::text))` over all the student's notes, on
  every text and ink save, about once a second while they write); `board/boards.py:139-156` (the same shape);
  `board/cards.py:285-289`, `boards.py:266,339`, `files.py:98`, `notes.py:172`.
- **What:** probe on 2,000 notes (37 MB as text): one check took 135-185 ms, where summing a stored size took 4.6 ms.
  The check also measures jsonb's spaced text while the limit and the amount added use compact JSON (about 4% apart).
  The locks differ: notes take `notes:{uid}`, board text `board-text:{uid}`, `check_room` relies on its caller's lock
  (a card and a plan made at once can both pass `MAX_CARDS`), and labels, columns, attachments and notebooks count
  with no lock. There are eight different "full" error codes.
- **Fix:** a `doc_bytes` column, like `note_ink.size_bytes`, so the check adds two integer columns; one quota helper
  that takes the student's lock and raises one code with the area's message.

### CQ-56. Daily's editor is one 1,255-line module, and its items are untyped dicts (major, L)

- **Where:** `services/daily/editor.py`; `services/daily/content.py:189` (`Entry.data: dict[str, Any]`).
- **What:** `games/__init__.py:1` says a new game is "a module here and one line in GAMES", but the editor branches per
  game in `key_of` (`:147-155`), `_DUPLICATE` and `_KEY_FIELD` (`:256-263`), `check_item` and five `_check_*`
  (`:277-291`), `_problem` (`:301-319`), the paste parser (`:1011-1025,1137-1142`), `_preview` (`:1209-1228`, an
  isinstance chain that ends in a cast) and three `== "nearest"` tests. Item data is read by 34 string keys
  (`games/groups.py:77-93`, `quiz.py:50-55`, `search.py:90-91`, `editor.py:197,270,304,394,1174`), and the camelCase
  keys are written by hand (`editor.py:237-243`).
- **Why it matters:** renaming a schema field splits writers from readers without mypy noticing, and every new game
  means edits all over the editor.
- **Fix:** `ContentGame` gains `check()`, `key()`, `problem(pool)`, `preview(puzzle)` and `paste_row()`; item data is
  parsed once into the schema's models; `editor.py` becomes a package (`rules`, `items`, `themes`, `words`, `paste`,
  `preview`; the bundle imports `rules`).

### CQ-57. Upload purposes live in eight parallel tables, and claiming an upload is written four ways (major, M)

- **Where:** `services/uploads.py:100-109` (`ALLOWLISTS`), `:113` (`IMAGE_PURPOSES`), `:117-126` (`FINAL_PREFIXES`),
  `:128-137` (`PURPOSE_BOXES`), `:176-179` (`limit_bytes`), `:217-239`, `:256-268`, `:340-349` (`PURPOSE_FEATURES`),
  plus `cli.py:269-272` and `accounts.py:962-967`. Claiming and freeing: `career._logos` (`career.py:123-136`),
  `module_editor._check_art` and `sync_art` (`:206-235`), `newsletter_settings.save` (`:63-82`), `newsletter_images`
  (`:40-94`), each with its own locking and its own error field (`art`, `logo`, a path); `NOT_A_PICTURE` twice.
- **Why it matters:** rounds 11 and 12 added five purposes, and each touched all of these; a purpose missing from
  `FINAL_PREFIXES` is a 500 when the upload completes, and no test would catch it.
- **Fix:** one `PurposeRules` per purpose and a test that every `UploadPurpose` has one; `uploads.claim(...)` and
  `uploads.release_unused(...)` for the four callers.

### CQ-58. Mini Noora's list of pages is a stale copy of the app's (major, S)

- **Where:** `services/noora/prompt.py:57-75` (`PAGES`) and `:79-84` (`ROUTE_PATH`, which cites `web/src/routes.tsx`).
- **What:** `/start-here`, `/results-day`, `/career/electives` and every `/daily` page are missing: `prompt.page()`
  returns None for them, and `FIXED_RULES` tells her to link only to the pages listed.
- **Why it matters:** Noora can't send a student to Start here or Results day, and isn't told when they are on one.
- **Fix:** add them with their features, and a test that reads the paths in `routes.tsx` and checks each against
  `ROUTE_PATH`.

### CQ-59. The notebook can lose or overwrite writing in five ways, and its autosave loops are untested (major, M)

- **Where and what:**
  1. Deleting a note drops the copy on the device before the server answers: `features/notes/NotePage.tsx:541-544`
     (`editor.discard(); remove.mutate(…)`). Offline the delete fails at once (`networkMode: 'always'`), and anything
     typed afterwards is neither saved nor kept (`useNoteEditor.ts:210-211,245-250`, `text/useNoteText.ts:152-156`).
  2. A student's own save can come back as a conflict. On a 409 the client never compares the server's copy with what
     it sent (`useNoteEditor.ts:115-118`, `useInkSync.ts:106-110`), and the check on opening compares with
     `JSON.stringify` (`draft.ts:60`) while jsonb reorders keys, so a kept copy that says what the server says is still
     offered as "changed on another device". Copies that match are never removed, so the list keeps saying "Not saved
     yet". `draft.test.ts:54-61` builds both sides the same way and can't catch it.
  3. A note reopened within five minutes is the cached copy (`api.ts:99-107`, `staleTime: Infinity`), and "Keep mine",
     the main button, then saves it over the newer one.
  4. Undo after "Load the other one" writes a page from before the load over the other device's
     (`useInkSync.ts:220-226`, `useTimeline.ts:68-81`).
  5. A new note deleted for being empty stays in the cache and can show as a ghost "Untitled note"
     (`NotePage.tsx:325-338`: a bare `deleteNote` that skips `useDeleteNote`'s cache updates).
  - Also: the text resets, with the caret at the end and an invisible undo step, whenever the `doc` prop is a new object
    (`useNoteText.ts:151-156`); unsent copies are sent only when their note is opened, and sign-out deletes them;
    storage-full errors are swallowed (`state/storedValue.ts:70-74`) while the page says the writing is kept on this
    device; two tabs share one key per note.
- **Tests:** the two autosave loops (`useNoteEditor.ts:87-187`, `useInkSync.ts:88-187`) repeat the busy flag, the
  debounce, the retries and the error handling, and neither is tested; the e2e step "nothing is saved over it" also
  passes after a needless save (`e2e/notes.spec.ts:33-38`).
- **Why it matters:** these are the moments a student believes their writing is safe.
- **Fix:** first the small ones: discard in `onSuccess`; compare with a key-order-independent stringify, and on
  `note_changed` or `ink_changed` adopt the server's version when it equals what was sent; drop matching copies on
  open; `gcTime: 0` for the open note; prune the undo steps of sheets loaded from elsewhere; a `discardNote(qc, id)`
  in `api.ts`. Then (L) one pure `createAutosave({ send, keepCopy, … })` with injected timers for both hooks, tested
  for a change during a save, a 409 with equal and with different copies, offline and back, a 429 with `retryAfter`, and
  discard.

### CQ-60. Manage throws unsaved edits away on any in-app navigation (major, M)

- **Where:** `web/src/ui/docEditor/doc.ts:6-13` (`useWarnBeforeLeaving`, which `DocFrame` uses at `kit.tsx:55`),
  `features/career/editor/CareerEditor.tsx:137-143`, `features/modules/editor/ModuleForm.tsx:78-84`: three copies of a
  `beforeunload` listener. The guard with `useBlocker`, `features/newsletter/editor/useLeaveGuard.ts`, serves only the
  issue editor. `features/manage/ManagePage.tsx:214-223` (`KEEP_DRAFTS`).
- **What:** reloading and closing the tab ask; the sidebar, ⌘K, a notification, Back and the kit's own "Open the page"
  (a same-tab `Link` with an "opens elsewhere" icon, `kit.tsx:68-72`) leave /manage, unmount every editor and drop every
  draft without a word. Switching Manage tabs drops a module's draft (`'content'` isn't in `KEEP_DRAFTS`), and
  ModuleForm's "All modules" and Back discard silently. A refetch that brings a newer version remounts the editor on
  `key={version}` and replaces the draft with no banner (`auth/queries.ts:12-14` refetches everything after signing in
  again).
- **Why it matters:** one click can lose an hour of work on the guides or the grade rules. ARCHITECTURE ("Routing")
  says `useLeaveGuard` covers unsaved edits; only one editor has it.
- **Fix:** move `useLeaveGuard` to `src/state`. React Router 7 allows one blocker at a time and Manage keeps several
  editors mounted, so ManagePage owns the blocker, fed by a small registry that `DocFrame`, the career editor and
  `ModuleForm` report their dirty state to; it blocks only a change of pathname, so tabs keep their drafts. Add
  `'content'` to `KEEP_DRAFTS`, open "Open the page" in a new tab, delete the three `beforeunload` copies, and keep the
  loaded version in state, replaced only on a save or a reload.

### CQ-61. The first download is 811 kB, with Manage's editors and the palette in it; the notebook's chunk is 562 kB (major, M)

- **Where:** the production build: entry `index` 811 kB minified, 239 kB gzip (611/182 in round 3), and 176 kB of
  CSS; `NotePage` 562 kB, 177 kB gzip. Vite's warning prints on every build and is ignored.
- **What, from the source maps:**
  - Phosphor icons are 269 kB of the entry: 91 icons, each with all six weights (the app uses four). The command
    palette alone imports 53 (`features/search/CommandPalette.tsx`, and 43 in `PaletteRow.tsx`).
  - Admin-only code every visitor downloads: `noora/settings/NooraEditor.tsx` (12 kB),
    `forum/settings/ForumSettingsEditor.tsx` (10 kB), `ui/docEditor/kit.tsx` (5 kB), `site/HomeAndSearch.tsx`
    (5 kB), with the CSS of the forum's pages, the new-thread page and Noora's page. The cause: `noora/public.ts:23`
    and `forum/public.ts:25` re-export the editors; the shell imports those `public.ts` files (`shell/AppShell.tsx:9`,
    `search/CommandPalette.tsx:12,14`); and a module that imports CSS or runs code at the top (`NooraEditor.tsx:115`,
    `ForumSettingsEditor.tsx:70`, `HomeAndSearch.tsx:13`) can't be left out. `ui/index.ts:37-39` re-exports the kit.
    The other editors' CSS is merged into chunks that Home, the calendar, Account and the notebook preload.
  - `NotePage`: ProseMirror, Tiptap and linkifyjs about 416 kB, the notes code 83 kB, its icons 55 kB. `LessonNotes`
    imports `Notes.css`, so every lesson page loads the notebook's stylesheet (27 kB).
- **Probe** (a scratch copy of `web/`):
  - `NooraEditor`, `ForumSettingsEditor` and the palette exported with `lazy()`: entry 677 kB (202 kB gzip), CSS
    146 kB. All nine editors exported lazily: entry 704 kB, CSS 150 kB, and no editor CSS left in students' chunks.
  - Then `manualChunks` for `vendor` (react, react-dom, scheduler, react-router, TanStack Query, openapi-fetch) and
    `editor` (Tiptap, ProseMirror, linkifyjs, orderedmap, rope-sequence, w3c-keyname, fast-equals): entry 397 kB
    (112 kB gzip), vendor 283 kB (91 kB gzip, cached across deploys), `NotePage` 145 kB (45 kB gzip), editor 417 kB.
    No chunk is over 500 kB, and the warning is gone.
- **Why it matters:** every student's first page waits on this, often over mobile data, and a deploy that changes one
  line makes everyone download all of it again.
- **Fix:** each `public.ts` exports its editor with `lazy()` (as `library/public.ts` does with `LazyModuleFiles`) and
  ManagePage puts each tab in `Suspense`; the editors import the kit from `ui/docEditor`, not the `ui` barrel; the
  palette mounts on first use (⌘K or a click); the two `manualChunks` in `vite.config.ts`; `Notes.css` split so
  lessons load only `LessonNotes`' part. Keep the 500 kB warning as the alarm. Later: the ink layer, pictures, the
  pages drawer and the print view loaded lazily (about 34 kB of `NotePage`), and only the four icon weights the app
  uses.

### CQ-62. Manage's editors: field errors never reach their fields, and a reused id picks up students' marks (major, S)

- **Where:** `web/src/ui/docEditor/errors.ts:19`
  (`const whole = path === '' || !path.includes('.') || lists.includes(path);`); `career/editor/CareerEditor.tsx:150`;
  `ui/docEditor/doc.ts:16-22` (`newItemId` counts from `used.size + 1`).
- **What:**
  - Every one-segment field (`data.tagline` → `tagline`) goes to the banner, so 19 field-error lookups never match:
    `SiteEditor.tsx:223,233,314,325,334,347,356`, `HomeAndSearch.tsx:30,237`, `SummaryWords.tsx:124,145,156`,
    `NewsletterSettingsEditor.tsx:175`, `GradeRulesEditor.tsx:345,396,404,424,433`, `ForumSettingsEditor.tsx:209`.
    Clear "Copyright holder" and save: the banner says "String should have at least 1 character", no field is marked,
    and the editor doesn't go to the section. `errors.test.ts:22-34` pins the bug.
  - Career's step and checklist links are discriminated unions (`api/app/schemas/career.py:153,200`), so Pydantic's
    path carries the tag (`…close.lesson.chapter`) while the field looks up `…close.chapter`. Career doesn't use
    `docErrors`.
  - `newItemId` hands a removed id out again (`subject-14`). The grades calculator keeps a removed subject's marks
    (`grades/record.ts:55-65`) and the guides keep ticks by step id, so a new subject shows an old one's marks and a new
    step shows as done, against CMS.md's "a change to the subjects never moves anyone's marks".
  - Visited editors stay mounted and hidden, so `id="dedit-section-title"` (`kit.tsx:111-113`) repeats, and
    `focusDocStatus` (`doc.ts:26-28`) can focus a hidden panel's status.
  - `Number(e.target.value)` turns a cleared number field into 0 (`SiteEditor.tsx:346`,
    `GuidesEditor.tsx:307,318,409,464`).
- **Fix:** `whole = path === '' || lists.includes(path)`, each editor listing its whole parts; union tags stripped once
  in the API's `field_name()`, and Career moved onto `docErrors`; ids that never repeat (a random suffix) for anything
  students keep marks or ticks against; `useId()` for the heading and a ref for the status; one number field in
  `src/ui` (the grades editor's `WholeField`).

### CQ-63. Students still can't ask for an RTC paper in the app, and zones are still written by hand (major, S)

- **Where:** `features/requests/components/NewRequestDialog.tsx:238-247` offers only zones A and B and narrows by hand;
  `requests/labels.ts:104` writes `` `Zone ${r.zone}` `` ("Zone RTC"); `library/itemForm.ts:15-16,33,47,50` and
  `library/components/ItemFields.tsx:96-117` list sessions and zones by hand and cast;
  `library/ChapterQuestions.tsx:10-14` and `DailyQuestion.tsx:39-41` rebuild `examLabel`;
  `manage/gapLabels.ts:6,17-21` copy `moduleLabel` and `sittingLabel`.
- **Why it matters:** CQ-31's API fix reaches no student: the request it was for still can't be made, and the next
  zone or sitting is again a hunt across the app.
- **Fix:** type the fields `'' | Zone` and `'' | ExamSession`, build the options from `ZONES.map(zoneLabel)`, narrow
  with `isZone`, use `examLabel(p) ?? p.title` and `zoneLabel`; an e2e step that asks for an RTC paper.

### CQ-64. Daily: a guest's progress never reaches the hub, and the hub can stop at midnight (major, M)

- **Where:** `api/app/services/daily/plays.py:292-322` (`today_of`: every game is "new" without an account);
  `web/src/features/daily/DailyPage.tsx:34,109,138`, `components/GameCard.tsx`, `DailyCard.tsx:28`,
  `DailyGamePage.tsx:58,166`, `components/Countdown.tsx:11-21`, `api.ts:66,114-115,137`, `editor/api.ts:43-46,76-78`,
  `lib/storage.ts:6`.
- **What:**
  - A guest who finished The Word sees "Play" and "Six new puzzles"; "Next" can offer a finished game; a Hard Sudoku
    reopens as Easy. Guests keep playing by Mohamed's choice, so this is what most first-time visitors see.
  - At zero the countdown stops its interval and refetches `today` once; if the answer still has the same `nextAt` (a
    clock a few seconds fast), it never starts again and yesterday's set stays until a remount, and the calendar, the
    week's leaderboard and `me` aren't refreshed. The hub and the card test `isError` before data, so a failed
    background refetch replaces what was loaded with an error.
  - Every move refetches `today` (`api.ts:137`), dozens of times in a Sudoku, guests included; the editor invalidates
    the overview it has just set; three keys are written inline.
  - Guest moves sit under `hub.daily.guest.` for 14 days: on a lab computer the next guest carries on with the last
    one's plays, and signing out doesn't clear them.
- **Fix:** keep each guest play's last status with its moves and lay it over `today` with `select` when signed out;
  keep refetching while `nextAt` is past, invalidating the whole Daily key; render data whenever it is there;
  invalidate `today` only when a play's status changes; `dailyKeys.leaderboards()` and `dailyKeys.calendars()`; guest
  moves under `hub.mine.`.

### CQ-65. Home: hidden dates come back, "Ask Noora anything" loses the question, and To-do counts the wrong days (major, S)

- `features/home/YourModules.tsx:95` reads `useCalendarEvents`, not `useMyCalendarEvents` (which "Up next" uses,
  `HomePage.tsx:90`), so My modules still shows exams the student hid, though the drawer promises "Hidden dates leave
  your list, month, Home and private link" (`calendar/EventDrawer.tsx:375`).
- `home/AskNoora.tsx:14` sends the question as `/noora?q=…`, but nothing in `features/noora` reads `?q=`.
  `openNoora(prompt)` (`noora/public.ts:5`, `open.ts:101-103`) exists for this and nothing calls it, so the page
  opens on its welcome with an empty box.
- `board/BoardTodo.tsx:44` counts 14 days and its "N more" opens a 7-day view (`board/TodayView.tsx:13`);
  `home/blocks.ts:44` and `board/public.ts:8-9` still describe the block as it was before round 11.
- **Fix:** `useMyCalendarEvents({ from, type: 'exam' }, { enabled })`; Home calls `openNoora(q)`; `TODAY_DAYS` in both
  places, and the two descriptions updated; e2e steps for the first two.

### CQ-66. Boards: one failure shows two alerts, and a ticked card can stay stuck (major, S)

- `features/board/api.ts:367-370` now shows "The card wasn’t added" on every failure, and `AddToBoard.tsx:51-54` adds
  its own; its silence for `already_on_board` only covers its own toast, so a card already on the board (added in
  another tab) shows as a failure, twice. Before round 11 the hook left link adds to the button.
- `board/TodayView.tsx:36,82,93-99` keys the ticks on the identity of `agenda.data`. After a failed move the refetch
  returns equal data, TanStack keeps the same object, and the row stays struck through and disabled until the page
  remounts. Key on `agenda.dataUpdatedAt`.
- `board/board.ts:197-226` (`afterIdBefore`, `lastIn`, `nudge`) can name a card still being added (`new-N`) as
  `afterId`; the API answers 422 and the student sees "The card wasn’t moved". Skip unsaved cards.
- A deleted label stays in the filter (`BoardPage.tsx:155,236`, `board.ts:362`): its chip goes, and the board shows
  "Showing 0 of N cards".
- Revision plans join the card writes' scope but not `mutationKey: CARD_WRITE` (`api.ts:565-584`), so their reload
  races pending card writes; `touched` and `unsavedCount` (`:46,305`) are module-level state shared by every client.
- `refetchOnMount: 'always'` on every board query (`api.ts:55,65,74,83`) needs its reason written down for the board
  and the agenda, and can go from `useBoardLinks`, which every paper row mounts.

### CQ-67. Mini Noora: switching chats loses the last question, and the card and the page drift apart (major, M)

- `features/noora/useConversation.ts:53-68`: while she answers, saving waits; `switchTo` stops her, loads the next
  chat and changes the id in one batch, so the question just asked and the stopped answer are never stored, though
  `:25` says "The one left is saved first". "New chat" stays enabled while she answers (`page/NooraPage.tsx:460`,
  `ChatPanel.tsx:282`).
- Two ways to keep her off a page: `daily/DailyGamePage.tsx:30` calls `useMiniNooraAway()`, so `MiniNoora.tsx:189`
  renders nothing there. That makes the Daily routes in `noora/away.ts:7` and their tests dead and its comment wrong,
  and ⌘/ on a game opens the card on the next page.
- The card and the page each have their own drop handlers, context builder and `NOTE_MAX`, chat switching, "edit
  last", suggestions, live region and delete-all dialog (`ChatPanel.tsx:40,90-103,200-206,242-259,374-382` against
  `NooraPage.tsx:62,126-136,183-190,375-392,588-602`), and they already differ: the card's delete-all keeps the draft,
  even an edit of a deleted chat.
- Effects that copy state into refs remain in `useChat.ts:184-214` (six), `useNooraAi.ts:30-33`,
  `MiniNoora.tsx:285-289` and `useDrag.ts:64-67`; `NooraPage.tsx:216` keeps its exhaustive-deps disable, and
  `:261-282` is a keydown effect with no dependency list that subscribes again on every keystroke and streamed chunk.
- On /noora every keystroke re-renders every message, KaTeX included: `NooraPage.tsx:499` passes `pageChips={[]}`,
  `:514` a new no-op, and `:239-250` depends on an object made on each render.
- Opening a saved chat moves it to the top (`useConversation.ts:53-57`, `saved.ts:86-96`), so "newest first" is "last
  opened first", and the trim follows that order. The chats list's group ids contain spaces
  (`page/ChatsSidebar.tsx:114-115`), which breaks `aria-labelledby`.
- **Fix:** save the chat being left inside `switchTo`, with a test; one away mechanism (`restsAway`); a `useChatHost`
  hook and an `askContextOf()` that owns `NOTE_MAX`; a reducer for useChat's messages, pending and paused, and one
  `useLatest` in `src/state` for the rest; stable props on the page; chats ordered by their last message.

### CQ-68. The end-to-end suite: two specs can't pass, and Daily has none (major, M)

- `web/e2e/home.spec.ts:15` looks for the switch "Coming up"; the block has been "Up next" since round 11
  (`home/blocks.ts:37`), and a switch's name is its label.
- `e2e/noora-page.spec.ts:76,83` uses `[data-hub="noora-sidebar-chat"]`, which no component has (the sidebar's hooks
  are `noora-chat-item` and `noora-chat-open`); at 1366 px `:79`'s "New chat" matches two buttons; `:73` selects a CSS
  class; the requests `standIn()` captures are never read.
- No spec plays a Daily game, loads the content file or edits Daily content. `support.ts:340-364` (`FEATURES`, "every
  feature with a switch") lacks `daily`, so the teardown never switches it back on; it is the fifth copy of the
  feature list (CQ-36).
- `api<T>()` (`support.ts:286-311`) still casts to whatever the caller names (CQ-26); the new specs read bodies without
  checking the status first (`calendar-mine.spec.ts:52-58,68-77,92`, `career.spec.ts:13,55`).
- `career.spec.ts:52` also matches earlier runs' activity entries, so it can't fail, and its restore PUT isn't checked;
  `board.spec.ts:28-29` branches on what an earlier spec left; `support.ts:434-445` still clicks "Try again" to get past
  a bug fixed in `f115586`, which would now hide its return.
- **Why it matters:** the suite was last recorded green in round 10 (85 passed); two specs that can't pass mean it
  hasn't been green since rounds 11 and 12 merged, and the feature Mohamed is least happy with has no end-to-end test.
- **Fix:** correct the two specs; one Daily spec (a guest finishes The Word, Sara plays and the hub and Home follow, she
  joins the leaderboard, a content manager adds an item); the teardown takes the switch list from GET /admin/features;
  `api()` typed over `paths` from `src/api/schema.d.ts`, or `T` defaulting to `unknown` with the status checked first.

### CQ-69. Components that hold their logic (minor, L; continues CQ-17)

- **Sizes after Prettier:** `board/BoardPage.tsx` 939 lines, one 760-line component with 17 `useState`, 8 mutations,
  routing, moves, focus, the filter, tabs and nine dialogs (the "after-id one step on" sum is written three times,
  `:333-341`, `:416-421` and `board.ts:218-226`, and the score prompt three times, `:284,374,786`);
  `start/editor/GuidesEditor.tsx` 752; `notes/surface/Surface.tsx` 702; `noora/page/NooraPage.tsx` 666;
  `career/editor/sections/Others.tsx` 651; `noora/settings/NooraEditor.tsx` 648; `grades/editor/GradeRulesEditor.tsx`
  628; `site/SiteEditor.tsx` 611; `notes/NotePage.tsx` 603; `noora/MiniNoora.tsx` 564;
  `forum/settings/ForumSettingsEditor.tsx` 531; and in Daily `DailyGamePage.tsx` 377, `editor/ItemDialog.tsx` 367,
  `editor/ThemesPart.tsx` 358, `games/sudoku/SudokuGame.tsx` 343.
- **Logic in them that wants a pure, tested module:** the board's one-step moves (`stepAfter(list, id, by)`); the
  notebook's page steps (`NotePage.tsx:371-395`), Surface's bar placement and `lineAt`, PictureView's geometry;
  Noora's opening plan and shortcuts (`NooraPage.tsx:69-79,200-217,261-282`) and AddContext's labels; Word's
  `spoken`, Sudoku's `cellLabel` and box table, Data Mine's arrow step, the quiz's answer re-index
  (`ItemDialog.tsx:283-287`).
- **Fix:** split each when it is next touched: `useBoardRoute()`, `useCardMoves()`, `BoardToolbar`, `BoardFilter`,
  `BoardTabs`; `useInkGestures` and `usePinchZoom`; `page/opening.ts` and `page/shortcuts.ts`; one file per section of
  Career's `Others.tsx`. The Manage editors lose about 70 lines each with CQ-53's hook.

### CQ-70. The same shape written again inside a feature (major, M)

- **Daily's six games** each rebuild their scaffolding: `isOver` recomputed in every game and five more places; a
  timers-and-`later` block five times (`WordGame.tsx:33-35`, `GroupsGame.tsx:27-29`, `NearestGame.tsx:26-27`,
  `SearchGame.tsx:35-37`, `SudokuGame.tsx:49-50`, the last never used); a window keydown listener three ways whose
  filters already disagree (`WordGame.tsx:89-106`, `QuizGame.tsx:56-77` without `isComposing`,
  `SudokuGame.tsx:132-163`); `typingInto` three times and `calm` twice; three shake animations. Each game narrows its
  view and makes up defaults for a kind it can't be (`WordGame.tsx:22-25` `?? 5`, `NearestGame.tsx:17` `?? 500`,
  `SearchGame.tsx:23` `|| 10`, `SudokuGame.tsx:35-38` 81 zeros), and `GroupsGame.tsx:20` copies the server's mistake
  limit.
- **Daily's editor** repeats the check-then-load dialog (`ImportDialog.tsx:27-42`, `ContentFileDialog.tsx:34-55`,
  `GuessList.tsx:113-118`), the delete confirm (`ThemesPart.tsx:106-130`, `ItemsPart.tsx:232-256`,
  `Vocabulary.tsx:133-157`) and the field-error split three times; `GAMES` and `countsLine` are defined twice;
  `.dy-chip` (`daily.css:113-146`) rebuilds `Badge`; `Vocabulary.tsx:263` (`WordChips`) is career's `WordList`.
- **The calendar and boards:** the drawer's date block and "Also on this day" list are written twice
  (`calendar/EventDrawer.tsx:217-237` and `442-456`, `299-316` and `491-508`); `formatDay(x, { weekday: 'short', month:
  'short', year: false })` seven times in boards; `toast.push({ tone: 'alert', … errorMessage(e) })` 17 times in
  `board/api.ts`.
- **Fix:** `games/useGame.ts` with `useLater()` and `useGameKeys(handler, { enabled })`; `GameProps` generic over the
  view's kind, narrowed once in the registry and throwing on a mismatch; a `useDryRun` hook; `Badge`; one `GAMES`; one
  word-list field in `src/ui`; `formatShort(day)`; a `useAlert()`.

### CQ-71. Notebook pages: a link that drops its filter, a dialog that shows the wrong name, failures that say nothing (major, S)

- `features/notes/LessonNotes.tsx:47` links "See all N" to `/notes?module=…`, but `NotesPage.tsx:267-277` reads only
  `q` and `notebook`, so the page lists every note.
- The rename dialog is always mounted, so `useState(notebook?.title ?? '')` runs with no notebook and the field opens
  empty or with the last title typed (`NotesPage.tsx:234,476`); `DetailsDialog` resets its fields in an effect
  (`text/PictureView.tsx:152-157`).
- Creating, renaming and deleting a notebook show no error (`NotesPage.tsx:188-197,241,477-494`); a new note is created
  in an effect whose `onError` goes back to /notes without a word (`NotePage.tsx:557-575`); the page's QueryError has
  no retry (`:170`); "Try again" is offered for a 422 or a 404 (`:96-99`); `NotePage.tsx:540` and
  `LessonNotes.tsx:90` show `error.message` instead of `errorMessage()`.
- Every autosave refetches /notebooks while ink saves invalidate nothing, so the storage meter goes stale; "Show 20
  more" loads 30 (`NotesPage.tsx:466`); the default notebook is found by its title (`:350`).
- **Fix:** NotesPage reads `module` and `lesson` and the link sends both; `key={renamingBook?.id}`; a `useStartNote()`
  click handler; errors through `errorMessage()` and `ConfirmDialog`'s `error`; ink saves invalidate the storage use.

### CQ-72. Types: ignores that hide loose annotations, strings where a type exists, casts the types don't need (minor, S)

- **API:**
  - `services/daily/badges.py:42` types `*where: object`; `ColumnElement[bool]` removes the ignore. `plays.py:54-57`
    (`cast_status` and its ignore) goes once the columns are `Mapped[PlayStatus]` and `Mapped[GameId]` over
    `String(8)`, the pattern at `models/library.py:60`; typing `DailyItem.game` the same way removes the casts at
    `editor.py:121,413,1245` and `bundle.py:250`. `_counted() -> Any` (`plays.py:359`), `where: list[Any]`
    (`editor.py:438,607`).
  - `Play.result` is `str | None` (`schemas/daily.py:214`), so "found", "one-away", "correct" and "wrong" are checked
    nowhere, on either side.
  - The note and bug report enums are written twice (`models/notes.py:18` and `schemas/notes.py:31`,
    `models/bugs.py:16` and `schemas/bugs.py:13`); `ExportInk.strokes` is `list[dict[str, Any]]` beside a `Stroke` model
    (`schemas/auth.py:315`); `core/limits.py:18-19` builds the error body with `code: str` beside `errors.py:75`'s
    typed one.
  - Tests: 21 ignores; nine on `db.get(...)` go with `db.get_one`, `test_games.py:38` with `GameId`, and
    `test_exam_names.py`'s three are CQ-29's.
- **Web:**
  - `career/editor/CareerEditor.tsx:184,187` (`(doc as unknown as Record<string, unknown>)[place.section]`):
    `savedIdsOf(doc, place.section)` (`doc.ts:250`) does it typed.
  - 14 `e.target.value as X` on `Select` (`ManagePage.tsx:256`, `GuidesEditor.tsx:604,611,646,745`,
    `ForumSettingsEditor.tsx:267,276,392`, `CardDetailDrawer.tsx:197,277`, …): give `Select` a typed `onValue`, like
    `SegmentedControl<V>`.
  - `BoardPage.tsx:140` (entries as tuples need no cast), `library/papers.ts:205-217` (`num` isn't a type guard, so
    eight `as number`), `notes/draft.ts:103` (stored strokes cast unchecked), `calendar/api.ts:290` (a path cast where
    `board/api.ts:39`'s `isApiPath` guard exists).
  - With `noUncheckedIndexedAccess` off (S-4), fallbacks such as `BoardDialog.tsx:28-31` and `board.ts:109,122` never
    run.

### CQ-73. Shared homes bypassed: helpers written again across features (minor, M as one sweep)

- **Counts:** `countOf` (`ui/utils.ts:31`) is rewritten or inlined about 25 times in rounds 11 and 12
  (`daily/lib/result.ts:20`, `daily/editor/lib/items.ts:143`, `ContentFileDialog.tsx:16`, `PaperSittings.tsx:175`,
  `noora/useNooraAi.ts:76`, `papers/papers.ts:112,126`, `requests/labels.ts:87`, …).
- **Dates:** `daily/lib/days.ts:15-36` and `ArchiveView.tsx:13` rebuild the calendar's month helpers
  (`calendar/dates.ts:42-64`), and a `?day=` outside the range leaves the archive on an error Retry can't fix;
  `DATE_RE` (`EventFormDialog.tsx:87`, `MyEventDialog.tsx:70`) instead of `isDayKey`; `home/ComingUp.tsx:53` instead
  of `inDays`; `GuidesEditor.tsx:69`'s `MONTHS`; `Others.tsx:513`'s `toLocaleDateString`.
- **Modules:** `moduleTag()` (`library/display.ts:47`) written again in `home/NewFiles.tsx:22`, `HomeForum.tsx:29`,
  `calendar/EventDrawer.tsx:321,388` and `CustomiseDialog.tsx:100`; "unitCode ?? shortName" seven times;
  `noora/page/AddContext.tsx:26` rewrites `moduleLabel`.
- **State:** five hand-made window-event stores (`bugs/open.ts`, `noora/open.ts`, `noora/paper.ts`,
  `noora/visibility.ts`, `notes/current.ts`); `board/useScrollEdges.ts` is `forum/lib/useScrollFade.ts`; `isObject`
  seven times; `typingInto` and the reduced-motion check in the games, the library, the notebook, search and the
  forum; `ExamTimer.tsx:233-244` sets `document.title` itself instead of `useDocumentTitle`.
- **UI:** an array move six times (`kit.tsx:176,304`, `HomeAndSearch.tsx:104`, `career/editor/doc.ts:50`,
  `modules/editor/draft.ts:125`, `ModulesEditor.tsx:95`); an id from a label three ways (`forum/settings/ids.ts:7`,
  `career/editor/doc.ts:25-45`, `ModulesEditor.tsx:184`, which turns "Économie" into "e-conomie"); the upload button
  three times (`ArtField.tsx:35`, `career/editor/fields.tsx:394`, `NewsletterSettingsEditor.tsx:302`); a link to another
  site six times; the "copied" state twice (`Messages.tsx:50,130-136`, `RichText.tsx:40-49`); the file-icon map twice
  (`notes/text/nodes.tsx:306-320`, `board/CardFiles.tsx:36-45`); `shell/SiteFooter.tsx:37-46` rebuilds
  `usePortalLinks`; `ui/moduleArtSrc.ts:6-8` only renames `pictureSrc`, and `bugs/BugReports.tsx:42-48` uses the raw
  media URL instead.
- **Queries:** `library/viewer/QuestionTags.tsx:220-237` has no `QueryError` and says "No questions tagged yet" when
  loading failed; `forum/api.ts:307` writes career's `['career', 'seniors']` key by hand (older, seen in passing).
- **Fix:** one sweep: each helper to its home (`countOf`, `lib/dates`, `lib/modules`, a small signal store in
  `src/state`, `isObject` in `src/lib`), the copies deleted.

### CQ-74. Review numbers and history in code and tests (minor, S; continues CQ-41)

- **Test files named for review rounds:** `api/tests/{accounts,board,community}/test_sec_review_r10.py`,
  `api/tests/{board,content,core,daily}/test_sec_review_r12.py` and `web/src/auth/secReviewR10.test.ts`; 15 API tests
  named `test_secNN_…` and 7 web tests titled "SEC-NN: …". Several duplicate their area's tests
  (`daily/test_sec_review_r12.py:76-79,134-138` and `test_plays.py:194-204`, `test_content.py:90-104`;
  `content/test_sec_review_r12.py` and `test_module_art.py:141,147`), and `board/test_sec_review_r10.py` is a
  lesson-progress test filed under boards.
- **New citations in code:** `services/library.py:761` and `cli.py:277` (SEC-14), `services/summary.py:11,15`
  (SEC-17), `auth/queries.ts:54` (CQ-1), `newsletter/lib/links.ts`, `noora/Messages.tsx:341` (UX-29),
  `noora/brain.ts:386` (ST-3), `routers/notes.py:1` and `schemas/common.py:125` (R-5), `notes/public.ts:1,6`,
  `e2e/notes.spec.ts:1` and `e2e/board.spec.ts:1` (R-4 to R-6).
- **History:** `daily/test_sec_review_r12.py:1-3` ("round 12", "(Mohamed, 2026-10-17)"); migrations 0028 ("until now")
  and 0029 ("was in JSON files…"), and 0020, 0021 and 0023 whose docstrings say "Revises: 0018"; `notes/draft.ts:75`
  ("an older shape"); `test_notes.py:356` ("came down with it").
- `routers/admin.py`'s docstrings still put "security review SEC-9" into `openapi.json` and `/api/v1/docs` (CQ-20).
- **Fix:** move each review test into its area's file under a name that says the behaviour, delete the duplicates,
  and take the numbers out (the e2e skill lets a `test.fail()` title keep its finding ID). The squash removes the
  migrations' history.

### CQ-75. Tests that can't fail, restate the code, or are slow (minor, M)

- **Can't fail:** `api/tests/daily/test_games.py:66-69` (`"label" not in str(view["words"])` on upper-case words) and
  `:63`; `test_editor.py:111` (expects `""` in a message); `e2e/career.spec.ts:52` (CQ-68).
- **Restate constants:** `tests/board/test_files.py:193-194`, `board/test_sec_review_r12.py:40`,
  `tests/notes/test_notes.py:316,356`; `features/board/board.test.ts:278-283,295-304`; `home/blocks.test.ts:93-106`
  (the seed, under `describe('offeredBlocks')`); `daily/lib/result.test.ts:55`; `notes/surface/layout.test.ts:20,22`;
  `ui/moduleArtSrc.test.ts`.
- **Test something else:** `test_notes.py:488` accepts 404 or 422; `tests/board/test_boards.py:213-221` deletes the user
  row, so it tests the cascade, not `delete_account`; `test_cards.py:351` checks a board row inside an export test;
  `test_my_calendar.py:419-421` (CQ-50).
- **Slow:** `test_cards.py:64` makes 122 HTTP calls (12-15 s) to reach `position_after`'s renumbering: unit-test it
  with neighbours 2**-52 apart and keep one HTTP move. The Sudoku solve (`tests/daily/test_plays.py:90-131`, 9-10 s)
  replays the whole play on each move, and its `tooFast` check needs about 45 moves inside 40 s: store a test day's
  Sudoku with two blanks. `test_sec39` makes 20 real uploads where inserted rows would do.
- **The wall clock:** nothing freezes `bahrain_today()`, so a run across 21:00 UTC changes the day mid-test, and
  `plays.py` reads the clock up to four times in one request (`:65,127,183,194`). Read it once per request, and freeze
  it in an autouse fixture.
- **Copies:** `fields()` seven times, Daily's `today`, `move` and `puzzle` in four files, the seed files read by path
  four times; `test_newsletter_settings.py:22` imports a private helper from another test; web fixtures cast partial
  objects (six `as unknown as Play` in `daily/lib/result.test.ts`, `home/fileRows.test.ts:6-17`) where a typed builder
  compiles without casts.
- **Pure modules without tests:** `modules/resources.ts`, `grades/bands.ts`, `grades/examples.ts`, `grades/subjects.ts`,
  `noora/chat.ts`, Daily's `shareResult` and `gameLink`, and CQ-27's and CQ-42's.

### CQ-76. Small API helpers and rules written again (minor, S)

- **Helpers:** LIKE escaping three times (`services/notes.py:82`, `routers/admin.py:75`, `daily/editor.py:429-430`,
  where `icontains(..., autoescape=True)` at `editor.py:612,708` would do); JSON size two ways (`core/links.py:85`
  against `notes.py:88` and `note_doc.py:90`); `_mb` three times (`notes.py:127`, `board/files.py:35`,
  `drive_import.py:348`); `FILE_CACHE` twice (`routers/notes.py:34`, `routers/board.py:47`); the `text/calendar`
  response four times (`routers/calendar.py:73,100,154`, `feeds.py:22`); the owner-only file link twice
  (`notes.py:662-671`, `board/files.py:130-149`); `Admin = Annotated[User, requires_admin()]` in five routers beside
  `routers/_base.py`'s `SteppedUpAdmin`; the "already on this board" query twice (`board/cards.py:331-336,435-440`);
  plurals in five Daily games and `drive_import.py:352`.
- **Rules:** the Mini Noora preview rebuilds her prompt (`noora/settings.py:63-77` against `ask.py:255-277`, with
  `CHARS_PER_TOKEN` twice); `routers/daily.py:79-80` checks an active account that `plays._may_play` checks; the
  content file normalises theme ids, words and guesses with messages that differ from the editor's
  (`bundle.py:112-113,131,145-146`); `Difficulty` repeats `SudokuDifficulty`.
- **Daily's game interface:** `variant` and `seconds` in `points()` are unused by all six games; `gave_up` with "any
  other move gives up" six times; `max(FLOOR, max - cost)` four times; `_replay` (`plays.py:87-98`) never checks history
  moves against `game.moves`; `base.py:67` says "0 when lost", though groups and the quiz score lost plays.
- **Work per row:** `board/cards.py:472-481` (a query and a flush per card), `plans.py:155-156` (cards deleted one by
  one), `newsletter_images.py:90-91` (a LIKE over every issue for each picture).

### CQ-77. Effects that should be a key, derived state or an event (minor, S; continues CQ-40)

- `calendar/SubscribeDialog.tsx:38-45` and `EventFormDialog.tsx:152-160` reset their state in an effect on `open`,
  each behind an exhaustive-deps disable, though `CalendarPage.tsx:28-34,145` already resets `MyEventDialog` with a
  `key`; `papers/PapersDialog.tsx:59-65` the same; `KanbanView.tsx:364` and `LabelDialog.tsx:128` focus in an effect
  where `autoFocus` does it.
- `daily/DailyGamePage.tsx:124-127` opens the rules with `setState` in an effect when data arrives; derive
  `shown = rulesOpen || (fresh && !seen)`.
- The notebook: `PictureView.tsx:270-272` and `Surface.tsx:195-197` clear the crop and the lasso in effects on prop
  changes; `text/nodes.tsx:107` clears a formula's `fresh` flag in a second transaction, which adds an undo step and
  saves `"fresh": null` in every formula; keep the flag in the editor's storage.
- The library: `FileViewerPage.tsx:186-197` opens "Time me" from `?time=1` in an effect (an initial state does it);
  `viewer/ExamTimer.tsx:27-53` keeps a hook in a component module behind a react-refresh disable;
  `ModuleFiles.tsx:119-128` polls the DOM every 150 ms for the link's target.
- `bugs/BugReportDialog.tsx:53-61,89` revokes the screenshot's object URL on replace, remove and send, not when the
  dialog is cancelled.

### CQ-78. Dead code and dead CSS (minor, S)

- **Web:** `daily/lib/groups.ts:38` (`tryLevels`, used only by its test); `SudokuGame.tsx:49-50,70`;
  `NearestGame.tsx:97` (`best === 1 ||`); `daily/types.ts:47-74` (12 re-exported API types nobody imports);
  `daily/public.ts:5` (`useDailyToday`, which no other feature imports); `LeaderboardView.tsx:141` and
  `ItemsPart.tsx:290` (fallbacks for values that are never null); `notes/limits.ts`'s `BODY_MAX` (the limit of a
  Markdown body the API dropped in `77e69b0`); `notes/current.ts:6-7` (an `id` that is never null); `savedAt`,
  `Draft.at`, the pages drawer's `revision` and `noteKeys.all`, never read; `HomeAndSearch.tsx:102` (`adding` is always
  ''); `NewsletterSettingsEditor.tsx:189-199` (`make` is never called); `library/api.ts:297,311` fill the cache by id
  while the viewer reads by slug; `useWarnBeforeLeaving` exported from `ui/index.ts:39` for no feature.
- **CSS:** `.g-l2` to `.g-l4` (`daily/daily.css:74-82`), `.manage-list` (`manage/ManagePage.css:67-71`),
  `.mod-res__note` (`modules/ModulePage.css:279`), `.shell-brand__name` (`shell/Sidebar.css:53-59,246`,
  `TopBar.css:53-55`), `.sg-grid--3` and `.sg-lockup--lg` (the style guide), `.onb-mini__tile--lesson`,
  `.cmdk-tile--lesson`; `Button.tsx:103`'s `ui-button__spinner` has no rule.
- **API:** `sudoku_engine.solve` (`:72-95`), used only by tests; checks the path parameter already makes
  (`notes.py:611-612,643-644`, `my_calendar.py:408`); `board/boards.py:226` places a board that `create_board`
  already placed; `main.py:55` writes the ink route's pattern away from the route (`routers/notes.py:128`).
- **Keys:** `library/components/coverStyle.ts:6` stores `dsba:library-cover-style`; every other key is `hub.*`.

### CQ-79. Copy in code (minor, S)

- **One feature, two names:** the nav (`shell/nav.ts:46`), the sign-in reasons (`AddToBoard.tsx:66`,
  `PlanDialog.tsx:42`), `home/blocks.ts:44` and Home's line for guests (`HomePage.tsx:296-297`) say "study board"; the
  page, its tabs and Home's button say "Boards".
- **Daily:** the editor names three games differently from what players see: "Groups", "Word search" and "Quiz"
  against "Correlations", "Data Mine" and "The Daily Query" (`daily/editor/lib/items.ts:22-67`).
  `ResultDialog.tsx:77` offers "Sign in to keep your points" after a guest's play, but guest plays are never kept
  ("Sign in to play for points", as `LeaderboardView.tsx:55` says). Counts are written into the copy where the data has
  them ("six" at `DailyPage.tsx:109,151`, "five-letter" at `WordGame.tsx:50`, "four groups" at `lib/result.ts:54,57`).
- **Manage:** `GuidesEditor.tsx:83-86,651` builds feature names from their keys ("While Noora ai is on", "While Requests
  autoclose is on"), where the Access screen has the API's labels; the Access screen's `content.edit` says "Add, edit,
  reorder, hide and remove modules, chapters and lessons" (`api/app/core/access.py:128-132`), though it also opens
  suggested videos and Manage → Daily puzzles; Career's blocker dialog is titled "Not yet", with "OK".
- **Elsewhere:** "Help the year below" and "Help the years below" (CQ-36); "Practice past questions organized by topic"
  (`library/viewer/QuestionTags.tsx:216`); "Tag a question" and "Tag this question" (`:211,233`); "e.g. Exam
  Revision", and "It cannot be undone" beside "This can't be undone", in the notebook; `MarksSheet` says "Averaged
  modules’" where `rulesText` says "4 modules".
- **For the UI review:** Sudoku's grid puts its gridcells in presentation boxes with no rows (`SudokuGame.tsx:190-207`),
  and Word's rows hide every cell (`WordGame.tsx:112-136`).

### CQ-80. Personal data, the audit log and step-up (minor, S)

- `services/bugs.py:181` keeps `ip` for signed-in reporters too, though the model keeps it for guests' limits
  (`models/bugs.py:25`) and the export leaves it out: `ip=ip if reporter is None else None`.
- `bugs.py:284` writes the report's page into the audit entry, which outlives the account and the report, though
  migration 0031 treats the page as personal data: leave it out.
- Guess words a paste import adds aren't audited (`daily/editor.py:1156-1160`, against `add_guesses` at `:734-744`),
  and `test_editor.py:286-289` pins that.
- PUT /mini-noora/settings needs a step-up, but PUT /site and PUT /grades/rules don't (`routers/site.py:21`,
  `grades.py:18`), though Site settings set every student's links to MyClass and the portal. For the security review.

### CQ-81. Seeds, and a rule applied in some places only (minor, S)

- `seed/data/daily/themes.json` repeats the content file's five themes. The seed adds them first and the import keeps
  what exists, so theme edits in the file never reach a new install; and `seed/loader.py:273` skips the guess list
  whenever any theme exists, so loading the file before `seed` leaves the word game with only its answers. Keep the
  themes in one place, and guard themes and guesses separately. The guess list (12,560 words) is the only public part
  and stays in the repository unless the content file takes it.
- Manage → Forum starts from two places: categories and tags from migration 0033 (`:30-50,143-150`), the default
  category, guidelines and tips from `forum.json`. Load both from `forum.json` into empty tables, as modules are.
- "No Google Drive links": Career's `HttpsUrl` and `HubLink` fields and Site settings' About text accept
  `drive.google.com` and `docs.google.com` links, though CMS.md says they are refused, and `services/library.py:601-606`
  checks it again with a second message instead of `is_google_file` and `DRIVE_RULE`.

### CQ-82. Docs inside the code that no longer match it (minor, S)

- `services/documents.py:1` names two of the seven documents it serves; `models/content.py:180,185` describe
  `ContentDoc` as Career Navigator's.
- `routers/modules.py:55,82-84` still lists "a link that isn't https://" (module resources are gone) and leaves out
  the picture errors; this text is in `openapi.json`.
- `cli.py:13-15` says the mail worker queues the summaries "from 08:00"; the time is set in Manage, and the worker also
  sends the reminders of board cards and of students' own events.
- `noora/away.ts`'s comment and `useConversation.ts:25` are untrue (CQ-67); `board/public.ts:8-9` and
  `home/blocks.ts:44` describe To-do as it was (CQ-65); `daily/lib/storage.ts:70` and `daily/api.ts:89` blame "another
  puzzle" for moves a day can't replay, but a day keeps its puzzle.
- `daily/editor.py`'s `PREVIEW_DAYS = 400` bounds a week whose message says "a year".

## Summary

Rounds 11 and 12 added about 61,000 lines beyond the generated contract and the word list: the Daily puzzles, the
notebook, boards, a personal calendar, bug reports and nine Manage editors. The checks hold: 1,520
API tests and 882 Vitest tests pass, mypy is strict and clean, knip finds nothing, there is no `any`, features meet only
through `public.ts`, routers stay thin, every error code is typed and every document save is audited. Round 12's
`services/documents.py` and `ui/docEditor` are the right shape. The findings sit where those checks can't see:
- **Work that can be lost:** a picture deleted from a note the student never touched (CQ-47), pages shifted by a
  half-done delete (CQ-48), five paths in the notebook's sync (CQ-59), every Manage draft on one stray click (CQ-60),
  a question to Mini Noora on a chat switch (CQ-67).
- **Screens that disagree with their data:** a Daily game that answers 404 on a day Manage calls ready (CQ-49), a
  guest's finished games shown as new (CQ-64), hidden dates on Home (CQ-65), a stuck tick and doubled alerts on boards
  (CQ-66), field errors that never reach their field (CQ-62).
- **Round 11's habits:** compatibility code for data nobody has (CQ-52); one thing built three ways (CQ-53, CQ-57,
  CQ-70); lists copied by hand that have already drifted (CQ-50, CQ-58, CQ-63); tests named after reviews (CQ-74); and
  an end-to-end suite that can't pass (CQ-68).

This pass found **no blocker, 24 major and 12 minor findings**. Of the earlier ones, CQ-30, CQ-33, CQ-34, CQ-37, CQ-43
and CQ-44 are fixed, CQ-31's fix stopped at the API, and the squash (CQ-35) is under way on `round13/squash`.

### Top five changes worth making, in order

1. **Stop losing students' and admins' work** (CQ-47, CQ-48, CQ-59, CQ-60).
   - Note files kept per note, and freed only when no note uses them.
   - Ink checked against the note's pages; deleting or moving a page is one call to the server.
   - The notebook's five small sync fixes.
   - One leave guard owned by Manage; the three `beforeunload` copies deleted.
2. **Fix the screens that show the wrong thing** (CQ-49, CQ-62 to CQ-67). Data Mine's word choice and readiness; the
   kit's field errors and ids; the RTC request; the guest's Daily hub and the countdown; Home's hidden dates and Ask
   Noora; the board's alerts and ticks; saving a chat when switching. Most are an hour each.
3. **Make the end-to-end suite green, and give Daily a spec** (CQ-68), so the next merges are checked in a browser and
   not only by unit tests.
4. **Drop the compatibility code in the squash** (CQ-52 with CQ-35, CQ-45 and CQ-54's partial-index check): no frozen
   copies of the seeds, no backfills or upgrades of round 11's data, and one written rule for a document's new fields.
5. **One source for each list that drifted** (CQ-50, CQ-58, CQ-53): the option and the electives from the grade rules;
   Mini Noora's pages checked against `routes.tsx`; one `documents.Kind` and one `useDocEditor` for every document,
   Career Navigator's included.

### Fix list for round 13

**API, now:**
1. CQ-47 and CQ-48 (the notebook's files and ink), with tests for one picture in two notes and ink past the last page.
2. CQ-49 (Data Mine's choice and readiness), with a test of a tight theme.
3. CQ-51 and CQ-58 (a module deletion counts the documents; Mini Noora's pages): small.
4. CQ-54: the leaderboard's prefetch (one line), then the content file's batching.
5. CQ-50 (the option and the electives from the grade rules), with its web half.
6. CQ-52 in the squash, with CQ-45's index and the drift check for partial indexes.

**Web, now:**
1. CQ-60 (Manage's leave guard) and CQ-62 (field errors, ids that never repeat).
2. CQ-59's small fixes: discard after the delete succeeds, a compare that ignores key order, `gcTime: 0`, pruning the
   undo steps after a load, `discardNote`.
3. CQ-63, CQ-65, CQ-66 and CQ-71: the RTC request, Home, boards and the notebook pages, an hour or less each.
4. CQ-67's chat switch and one away mechanism; CQ-64's guest status and countdown.
5. CQ-68: the two broken specs, the teardown's switch list from the API, and a Daily spec.
6. CQ-61: lazy editors and palette, the two `manualChunks`, `Notes.css` split (measured above; an afternoon).

**Can wait**, each when its files are next touched: CQ-53's shared `Kind` and `useDocEditor` (L), CQ-55's stored sizes
and one quota helper, CQ-56's editor package, CQ-57's purpose rules, CQ-59's shared autosave controller (L), the splits
in CQ-69 and CQ-70, and the minors CQ-72 to CQ-82 (CQ-74's renames are mechanical and can go with the squash). Still
open from earlier rounds: CQ-17, CQ-18, CQ-22, CQ-26, CQ-27, CQ-36, and the leftovers of CQ-32 and CQ-38 to CQ-42.

---

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
