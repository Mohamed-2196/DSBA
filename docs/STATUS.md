# Status

This is the handoff between sessions: where the work stands, what's next and what Mohamed still has to decide.
Update it whenever you finish or start something. Last updated 2026-10-12 at about 23:58, when round 3 started on
Mohamed's Mac.

## Where things stand

`feature/backend` holds the real product: the API and the strict-TypeScript web app built on it. Nothing is
deployed yet.

- **Round 1.** The API covers accounts, the forum, the library on S3, the newsletter, the calendar, Career Navigator,
  search, notifications and admin. The whole web app moved from the prototype onto it.
- **Reviews.** Security, code quality and UI/UX, plus a student test of every feature, all in `docs/reviews/`. None
  found a blocker.
- **Round 2.** The planned review fixes are merged on both sides, along with decisions D1–D10 (end of
  `docs/backend/ARCHITECTURE.md`). They include:
  - email notifications through an outbox and a mail worker;
  - step-up sign-in before changing an address or deleting an account;
  - the newsletter form editor and images in the library;
  - lockouts per address and per network;
  - a responsive pass over every screen at 17 sizes.
- **Last checks.**
  - The API suite (598 tests) passed at `e96121a`. The API hasn't changed since.
  - `scripts/check.sh web` passed at `5c3617d`.
  - The end-to-end suite passed 41/41 on the merged round 3 (`1274e81`, 2026-10-13).
  - `scripts/check.sh web` passed on `round3/web-leftovers` at `99bfa3f`: 347 unit tests and the TanStack Query lint.
  - `scripts/check.sh api` passed on `feature/backend` at `401174a`: 655 tests, with the tighter ruff rules.
- **Removed from this branch:** `launch-film/` (still on `feature/dsba-pulse` and in the history) and an unused
  demo picture.

## In flight

**Round 4.** Each builder on its own branch and worktree; one review per branch, just before it merges.

| Branch | Agent | Worktree | Covers |
| --- | --- | --- | --- |
| `round4/access` | SDD, task by task | `../dsba-access` | R-1 roles and R-10 feature switches: API done, web Task 7 (e2e) running; then one final review and a fix wave with the must-fix minors |
| `round4/calendar` | web-builder | removed | R-3 calendar redesign: merged 2026-10-13 (`2ffd145`) |
| `round4/polish` | web-builder | `../dsba-polish` | ST-13, ST-14, ST-16, ST-17, UX-18 to UX-22, SEC-17, SEC-18, SEC-20, the CQ minors, `e2e.sh --restore` restores web |

- **Round 3 is complete**, and so is the re-review round after it.
- **R-3 open points:** events have no zone, so the calendar answers per year only; every exam reads "Time not set
  yet" until reps add times; Mini Noora still covers parts of the page (R-7). The e2e suite runs on it with the
  access merge.
- **The Docker stack** runs from the main checkout (compose project `dsba-hub`), on its normal mail backends.
  - `scripts/e2e.sh` switches it to e2e mode, and `--restore` switches it back.
  - Nobody runs `docker compose down`: the API's pytest uses its Postgres.
- **The local API environment** uses Python 3.12, pinned in `api/.python-version` to match the image and CI. uv
  had picked 3.15.
- **Mohamed's part.** `api/app/services/exam_names.py`: `exam_meta_from_name()` reads a past paper's exam year,
  zone and examiners'-report marker from its file name.
  - It's a stub for Mohamed to write, because he knows how the real files are named.
  - Until then, imported papers have no year or zone. The import calls it already.

**Standards review: done 2026-10-13** (in the cloud session, after its own run hit the usage limit).
- **What's in:**
  - the audit, in `docs/reviews/standards.md`;
  - the skills in `.claude/skills/`;
  - CLAUDE.md;
  - the README;
  - the pre-push hook (`scripts/install-hooks.sh`).
- **Applied in the audit:**
  - ruff also selects `FAST`, `ASYNC`, `PERF`, `PIE` and `FURB`;
  - ESLint runs TanStack Query's recommended rules (`@tanstack/eslint-plugin-query`);
  - `ARCHITECTURE.md`'s development section now describes Docker and the setup without it, instead of the old
    cloud machine.
- **For `round3/web-leftovers`.** When it merges, the new query lint may flag a query function that reads
  something its key doesn't hold. The fix is to add that thing to the key, or, for the query client, use
  `queryFn: ({ client }) => …`.

## Next, in order

1. **Done: the e2e suite on Docker.** `scripts/e2e.sh` runs it in about 3 minutes. It passed 41/41 twice.
   - Three tests were updated for deliberate round 2 changes.
   - Open: no test covers step-up before changing an email or phone number.
2. **Done: the re-review round (2026-10-13).** No blockers. The findings are in `docs/reviews/`:
   - **Security:** SEC-16 to SEC-20, and AD-1 to AD-9, which are adopted into the access work.
   - **Code quality:** CQ-19 to CQ-29. CQ-19 and CQ-21 are fixed.
   - **UI/UX:** UX-18 to UX-27.
   - **Student test:** ST-13 to ST-18, 46/46 e2e, and a new step-up test.
   - **Queued after the access work, as a polish branch:**
     - double clicks that act twice: ST-13, ST-14 and ST-16 (publish with a guard), and ST-17 (offline posting);
     - UX-18 to UX-22 and the CQ minors;
     - SEC-17, SEC-18 and SEC-20;
     - `scripts/e2e.sh --restore` should also put `web` back on the main checkout.
3. **Done: the Drive import and `scripts/seed-real.sh`** (DEPLOYMENT.md section 10).
   - Migration 0005 adds `library_items.import_key`, so a removed file never comes back.
   - Imported files are `source=file`.
   - Only a run with Mohamed's Google key can check the real folders, resource keys and quotas.
   - Open:
     - 3 links to single Drive files and 1 Google Doc stay links;
     - `--retire-links` isn't built;
     - `load_modules` must stop overwriting modules before R-9 lands.
4. **Done: the shared helpers** are used everywhere (round 3), and features meet only through `public.ts`.
5. **Done: the small leftovers** (round 3):
   - 44 px touch targets;
   - suspended reps have no powers in the web app;
   - counts with thousands separators;
   - the data router, whose `useBlocker` covers the editor's leave guard;
   - `--measure` at 58ch;
   - the CQ-15 indexes and CHECKs.
   - Open:
     - Mini Noora's hint still covers "Continue learning" on phones for up to 12 s, though it can now be closed;
     - "I'm not a student" still shows Year 1 (Mohamed's call).
6. **Done: the clean-up (2026-10-13).** Mohamed deleted the eight finished branches on GitHub.
   - The merged ones: `round2/fe-*`, `round3/student-ideas`, `round3/e2e-docker` and `round3/drive-import`.
   - `claude/zen-cerf-7e5mbj`.
   - `wip/accounts-round2`, whose one unmerged commit was `140fd8e`.
   - From now on, finished branches go as soon as they're merged (CLAUDE.md).
7. **No backward compatibility** (Mohamed, 2026-10-13: the app isn't released, see CLAUDE.md). A clean-up branch
   runs once `round3/web-leftovers` is merged:
   - **API:** remove the deprecated `emailNotifications` and `newsletterEmails` preferences and
     `DEPRECATED_SWITCHES`. The newsletter's subscribe box then uses `emailNewIssues`.
   - **Web:** remove the grades calculator's `LEGACY_KEY` storage migration.
   - **Comments and docstrings** in `api/` and `web/` that narrate history ("v1", "legacy", "deprecated", "used to",
     "previously", "replaces", "moved from") are rewritten to describe the code as it is. The grades feature has
     the most.
   - **Migrations.** The access work (item 9) squashes them into one baseline, and the local database is rebuilt.
8. **From the standards review** (`docs/reviews/standards.md`, ranked):
   - S-1 typed linting: fix the 24 unhandled or misused promises, then switch to `recommendedTypeChecked`;
   - S-3 re-encode uploaded pictures, so they don't carry the student's location;
   - S-4 `noUncheckedIndexedAccess`, folder by folder;
   - S-5 to S-7: a `Permissions-Policy` header, a Fetch Metadata CSRF layer, malware scanning, and effects that
     copy props into state.
9. **Round 4: Mohamed's requests** in `docs/ROADMAP.md` (R-1 to R-8): roles, requests, the calendar, a study board,
   notes, Noora with context, a new Noora and favourite apps.
   - Each is designed with him first, then built.
   - **R-1 and R-10 (access):** the spec is approved and has no compatibility layer.
     - The API plan (`docs/superpowers/plans/2026-10-13-access-api.md`) is approved, to be built subagent-driven.
     - The web plan is being written.
     - The work runs on `round4/access` (API and web together) after item 7 and the re-reviews, because Task 2
       rebuilds the local database.

## Waiting on Mohamed

- **Roadmap questions:** each feature in `docs/ROADMAP.md` lists what he needs to decide. R-1 (roles) comes
  first.
- **Ideas to approve:** 24 proposals in `docs/ideas.md` (IDEA-1 to IDEA-24), merged 2026-10-13.
- **Content gaps the ideas run found:**
  - the six Year 3 modules have no unit codes;
  - none of the 10 October exams has a time or place;
  - each VLE MCQ window is two one-day events, though events can have an end date;
  - IS2184 and every Year 3 module have no lessons.
- **`exam_meta_from_name()`:** the past-paper name patterns, in `api/app/services/exam_names.py`.
- **Product calls:**
  - Should notification emails stay on by default?
  - Should there be a site-wide daily upload budget?
  - Is it right that the author of a hidden post can read it but not delete it?
  - Should we build a "shared computer" sign-in with a shorter session?
  - Should an "I'm not a student" mode show all years?
  - Should sessions end after some days without use (standards review S-2)? For example 7–14 days, plus the
    "shared computer" option with a short session.
  - Newsletter pictures: uploads need an issue id first, so for now the editor offers only the app's own pictures.
- **To deploy:** a server, a domain, an S3 bucket with its keys, an SMTP account and, for texts, Twilio.
  `docs/backend/DEPLOYMENT.md` has the full list.
- **For the Drive import:** a Google API key with the Drive API enabled, kept in `.env` as `DSBA_GOOGLE_API_KEY`.
  Create it in the Google Cloud console:
  1. Create a project.
  2. Enable the Google Drive API.
  3. Create an API key under Credentials and restrict it to the Drive API.

## The Drive import, planned

- **Sources.** The seeded library has 56 links to 49 Drive folders, from `api/app/seed/data/modules.json`:
  - `resources.materials`, `exercises`, `vle` and `olderExams`;
  - `notes[].url`, credited to the student who shared them.

  Their kinds are course-materials, exercises, vle-materials, past-paper and notes.
- **Access.** The folders look shared with "anyone with the link": fetched while signed out, Drive shows their
  names. An API key is therefore enough.
  - Support a service account as a fallback (`DSBA_GOOGLE_SERVICE_ACCOUNT_FILE`, the folder shared with its email).
    It needs the `google-auth` package.
  - Folders restricted to BIBF's Google domain can't be shared with an outside account. Report those instead.
- **Command:** `python -m app.cli import-drive [--dry-run] [--module ID] [--limit N] [--yes]`. For every published
  link item whose URL is a Drive folder:
  1. Walk the folder with Drive API v3 (`files.list` with `'<id>' in parents`, `supportsAllDrives`, resource keys,
     shortcuts followed).
  2. Download each file (`alt=media`). Export Google Docs and Slides as PDF and Sheets as XLSX; exports are capped
     at 10 MB.
  3. Skip what the library doesn't take: types outside `uploads.LIBRARY_TYPES`, or files over
     `DSBA_MAX_UPLOAD_MB`. Check each file's first bytes as uploads do.
  4. Store it at `library/drive/<module>/<driveFileId>/<name>`. The key makes a rerun skip what's already there,
     even if a rep has since removed it.
  5. Create a published file item:
     - its kind comes from the link, and notes keep their author;
     - past papers get their exam year and zone from the file name;
     - the description names the folder path.
  - Print a plan and ask before importing unless `--yes` is given. Keep the link items; `--retire-links` could
    remove a link once its whole folder is in.
- **Seeding the real thing.** Mohamed asked for a script that fills a fresh install with the real content in one
  go: `scripts/seed-real.sh [--prod] [--dry-run]`. It runs in the compose stack, locally into MinIO or on the
  server into S3, and does three things in order:
  1. applies the migrations;
  2. loads the reference content (`python -m app.cli seed`: modules, calendar, newsletter, career, library links);
  3. runs `import-drive`.

  It's safe to run again: the seed and the import both skip what's already there.
- **Tests.** Use a fake Drive (`httpx.MockTransport`) and moto.

## How the team works

- Agents live in `.claude/agents/`: `security-reviewer`, `code-quality-reviewer`, `ui-ux-reviewer`,
  `student-tester`, `student-user`, `api-builder` and `web-builder`.
- `student-user` uses the hub as a student and proposes features in `docs/ideas.md` (IDEA-1 onwards). Nothing is
  built until Mohamed approves it. Approved ideas join "Next".
- A merged or finished branch loses its worktree and its branch, locally and on GitHub.
- Builders own folders and work on their own branch in their own worktree. The lead merges.
- Reviewers write numbered findings to `docs/reviews/` (SEC-, CQ-, UX- and ST-) and re-check them later. The same
  files record what was fixed.
- Product decisions go at the end of `docs/backend/ARCHITECTURE.md` (D1, D2, …).

## Other branches

- `master` and `gh-pages` run the live v1 site. Never touch them.
- `feature/dsba-pulse` holds the v2 prototype the app grew from, and the launch film. The film is never published.
  It must not say how many tutors there are or use the word "tutors", name individual teachers, or draw or imitate
  third-party logos.
