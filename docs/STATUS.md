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
  - The end-to-end suite hasn't run since round 2. Two of its setup steps were fixed without being run.
- **Removed from this branch:** `launch-film/` (still on `feature/dsba-pulse` and in the history) and an unused
  demo picture.

## In flight

**Round 3.** Started 2026-10-12, about 23:55. Three agents work in parallel, each on its own branch and worktree.
The lead merges them.

| Branch | Agent | Worktree | Covers ("Next" below) |
| --- | --- | --- | --- |
| `round3/e2e-docker` | student-tester | `../dsba-e2e` | 1: the e2e suite on Docker, one command, a rerun |
| `round3/drive-import` | api-builder | `../dsba-drive` | 3: `import-drive`, its wrapper and tests; then the CQ-15 nits |
| `round3/web-leftovers` | web-builder | `../dsba-web` | 4, and 5 on the web side (the data router for the leave guard) |

- **The re-review round (2) waits** until these three are merged, so the reviewers and the student tester see
  the finished round rather than a moving target.
- **The Docker stack** runs from the main checkout (compose project `dsba-hub`).
  - The student tester owns it while round 3 runs: it may recreate `api`, `mail` and `web` with its e2e override.
  - Nobody runs `docker compose down`: the API's pytest uses its Postgres.
- **The local API environment** uses Python 3.12, pinned in `api/.python-version` to match the image and CI. uv
  had picked 3.15.
- **Mohamed's part.** `api/app/services/exam_names.py`: `exam_meta_from_name()` reads a past paper's exam year,
  zone and examiners'-report marker from its file name.
  - It's a stub for Mohamed to write, because he knows how the real files are named.
  - Until then, imported papers have no year or zone. The import calls it already.

**Standards review.** A separate cloud session started at 23:40 on 2026-10-12. Its job:
- check the coding standards in the docs against the official sources;
- add project skills under `.claude/skills/` and write a CLAUDE.md;
- refresh the README;
- add a pre-push hook (`.githooks/pre-push`, enabled with `scripts/install-hooks.sh`).

It pushes the branch `round3/standards` (or a `claude/...` branch if that name is refused) and writes
`docs/reviews/standards.md`. Its run appears in Mohamed's scheduled tasks as "DSBA Hub standards review (one-off)".

What Mohamed asked for, so the branch can be checked against it, or the job redone locally if no branch arrives:
1. **Audit the standards.** Check the coding standards and quality rules in the docs (`ARCHITECTURE.md`'s
   conventions and security baseline, the README's checks) against the official sources:
   - FastAPI, SQLAlchemy 2, Pydantic v2 and Alembic;
   - OWASP ASVS and the cheat sheets;
   - react.dev, TanStack Query, the tsconfig strict options, typescript-eslint and ruff.

   Use web search and cite the sources. Fix the docs where they're wrong or vague, and check that the code
   follows them.
2. **Port useful skills** into `.claude/skills/`. Look for existing good ones online first (FastAPI, React and
   others), keep their licence notices, and fit them to this repo. Suggested: `fastapi-endpoint`, `react-feature`,
   `db-migration`, `e2e-test` and `review-checklist`.
3. **CLAUDE.md**, merged with this one.
4. **A refreshed README** for a new contributor.
5. **A pre-push hook** for the standard checks.
   - It lives at `.githooks/pre-push`, is enabled with `git config core.hooksPath .githooks` through
     `scripts/install-hooks.sh`, and works on macOS (bash 3.2) and Linux.
   - It runs only what the pushed commits touch:
     - `api/**` gets ruff, ruff format, mypy and pytest;
     - `web/**` gets both tsc projects, ESLint, the unit tests and the schema drift check.
   - A typical push takes under about two minutes. The full API suite runs with `FULL_CHECKS=1`, and CI runs
     everything.
   - `SKIP_CHECKS=1 git push` (or `--no-verify`) skips it in an emergency.

To bring it in:
1. Review the branch and merge it into `feature/backend`.
2. It started before this CLAUDE.md existed, so merge the two files by hand. Keep "Working with Mohamed", the hard
   rules and the link to this file.

## Next, in order

1. **Run the e2e suite on Docker** (student-tester).
   - `web/e2e/support.ts` defaults to the old cloud dev paths. Make it run against `docker compose`:
     - the API writes mail and texts to files (`DSBA_EMAIL_BACKEND=file`, `DSBA_SMS_BACKEND=file`, with directories
       mounted from the host);
     - set `E2E_BASE_URL=http://localhost:5173`, `E2E_MAIL_DIR`, `E2E_SMS_DIR`, and
       `E2E_DEV_LOGIN="docker compose exec -T api python -m app.cli dev-login"`.
   - Add a compose override or a script so it's one command, then run the suite and fix what fails.
2. **Re-review round.** The security, code-quality and UI/UX reviewers check that their findings are fixed and
   review what round 2 added. The student tester re-tests every feature as a guest, a student in each year, a rep
   and an admin. Run all four in the background, in parallel.
3. **Import the Google Drive files into the library** (`python -m app.cli import-drive`), and add
   `scripts/seed-real.sh`, which fills a fresh install with the real content in one command. The plan is below.
4. **Adopt the shared helpers everywhere** (left over from round 2):
   - The forum uploads images through `src/api/uploads.ts`: `uploadFile('forum_image', …)`, `checkUpload`,
     `formatSize`, `canRetryUpload` and `UPLOAD_RULES.forum_image`.
   - The forum and library copy-link actions use `copyText(appUrl(…))` and `hostOf` from `src/lib/share.ts`.
   - `career/api.ts` and `noora/knowledge.ts` use `moduleDetailQuery` from `features/modules/public.ts`.
   - `modules/exams.ts` uses `src/lib/dates.ts` instead of its own `todayKey`.
   - Three imports bypass `public.ts`:
     - `library/FileViewerPage` imports `forum/ReportButton`;
     - `moderation/ModerationPage` imports `forum/ReportsQueue` and `library/UploadsQueue`.
5. **Small leftovers:**
   - Touch targets under 44 px on touch screens:
     - `yr-compact` is 48×32 and `.ui-search__clear` 36×36;
     - `home-trace__label` is too small;
     - forum rows are 42 px, and the forum hot links are too small;
     - the forum `ui-tab` is too small at 1024×768.
   - `AuthProvider.isModerator` ignores suspension.
   - The Badge's numbers: check tabular figures and thousands separators.
   - The newsletter editor's leave guard misses palette navigation and Back. `BrowserRouter` has no `useBlocker`;
     a data router would.
   - `--measure` is 72ch, too wide; use 58–60ch.
   - The CQ-15 index and column nits that remain.
6. **Clean-up.** Delete the merged branches `round2/fe-forum`, `round2/fe-library` and `round2/fe-content`, and
   `wip/accounts-round2`, which was superseded.

## Waiting on Mohamed

- **Product calls:**
  - Should notification emails stay on by default?
  - Should there be a site-wide daily upload budget?
  - Is it right that the author of a hidden post can read it but not delete it?
  - Should we build a "shared computer" sign-in with a shorter session?
  - Should an "I'm not a student" mode show all years?
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
  `student-tester`, `api-builder` and `web-builder`.
- Builders own folders and work on their own branch in their own worktree. The lead merges.
- Reviewers write numbered findings to `docs/reviews/` (SEC-, CQ-, UX- and ST-) and re-check them later. The same
  files record what was fixed.
- Product decisions go at the end of `docs/backend/ARCHITECTURE.md` (D1, D2, …).

## Other branches

- `master` and `gh-pages` run the live v1 site. Never touch them.
- `feature/dsba-pulse` holds the v2 prototype the app grew from, and the launch film. The film is never published.
  It must not say how many tutors there are or use the word "tutors", name individual teachers, or draw or imitate
  third-party logos.
