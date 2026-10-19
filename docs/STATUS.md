# Status

This is the handoff between sessions: where the work stands, what's next and what Mohamed still has to decide.
Update it whenever you finish or start something. Last updated 2026-10-18, when round 13 started.

## Where things stand

`feature/backend` holds the real product: the API and the strict-TypeScript web app built on it. Every push to it
deploys to the Railway **dev** environment (https://web-dev-254f.up.railway.app, all features on); production is not
deployed.

- **Rounds 1 to 4.** The API and the web app for accounts, the forum, the library on S3, the newsletter, the
  calendar, Career Navigator, search, notifications and Manage; roles and feature switches (R-1, R-10), notes,
  the study board, requests, editing modules in Manage, and Mini Noora on Claude. Decisions D1-D10 are at the end
  of `docs/backend/ARCHITECTURE.md`.
- **Round 5.** Fifteen approved ideas (papers by sitting, search inside papers, past questions by topic, follows,
  anonymous questions, date-change notices, revision plans, polls, the Sunday summary, seniors who answer, and
  more) and the round 4 security fixes.
- **Round 6.** Asking Mini Noora about a past paper's question, help for the year below, your papers and zone,
  exam details and application windows on the calendar, suggested videos, requests that close themselves, and RTC
  as a zone of its own beside A and B.
- **Round 7.** The daily past question, results day explained, the projected class, "You asked, we did", and the
  reps' Gaps screen. Noora's budget defaults to $25 a month.
- **Round 8.** Home is blocks a student can show, hide and reorder; lesson progress is opt in; the draggable Mini
  Noora is back with a compact chat card.
- **Round 9.** The Hub lockup and app icon, nine module icons, four empty-state illustrations; Noora's chat gained
  rich answers with formulas, stop, regenerate, recent chats and context chips.
- **Round 10.** Reviews of rounds 5 to 9: security (SEC-30 to SEC-35), code quality (CQ-30 to CQ-46) and UI/UX
  (UX-28 to UX-43), in `docs/reviews/`. No blockers. Mohamed's own test feedback is
  `docs/feedback/2026-10-14-mohamed.md` (F-1 to F-14).
- **Round 11 (merged 2026-10-15/16).** Started by Claude builders, cut off by the usage limit, then finished and
  merged by Antigravity (Gemini): sidebar and Home dashboard grid, report a bug, newsletter pictures, no Drive in the
  UI and papers with real covers, the notebook (ink, PDF annotation), the full /noora page, the Career Navigator
  editor, each student's own calendar, boards for everyday tasks, the Daily puzzles with Sudoku (migration 0025).
  Antigravity also added module art uploads (0026), picture editing in notes, real library covers by default, the
  MyClass and UoL logos on the sidebar links (Mohamed's request), the seven missing module icons, the Railway dev
  deploy and an `enable-features` command. Mohamed is not happy with the result, the Daily games most of all.
- **Last checks (2026-10-18, 25234ed).** 1,520 API tests (39 seconds) and 882 Vitest tests green; CI and the
  Railway dev deploy green. `web/` is formatted with Prettier, and the check fails on unformatted files.

## Round 12 (review and finish round 11): merged 2026-10-18

Every builder reviewed its area against Mohamed's requests, fixed what was wrong and reported FIXED/OPEN.

| Branch | What landed |
| --- | --- |
| `round12/speed` | one FastAPI app per test run, pytest-xdist, `check.sh --fail-fast`; deploys report their commit and the Railway check waits for it |
| `round12/rev-sec` | security review of round 11: SEC-36 to SEC-48 (all fixed except SEC-43, accepted) |
| `round12/cms` | module pictures as data, Manage → Guides and Site settings, About without Drive, the newsletter section (0028) |
| `round12/secfix` | SEC-11, 19, 33, 40, 44, 47; the text worker has its own database role and S3 key in production (0031) |
| `round12/notebook` | notes no longer open empty and overwrite themselves; one scaled page layout; pictures move, resize, crop and turn; A4 export with ink; SEC-36, SEC-48 |
| `round12/daily-cms` | Daily content in the database, editable in Manage, loaded from `private/daily-content.json` (git-ignored) via Manage or `daily-content import`; days stored when first made (0029) |
| `round12/polish` | Noora keeps clear of content (phones: the tab bar, Mohamed's choice); the /noora welcome fits; real video thumbnails; clean file titles; board templates; one day of a repeat; SEC-37/38/39 (0030) |
| `round12/daily` | Daily hub redesign; every game fits phones; today's puzzles count; drag in Data Mine; SEC-41 flow and SEC-45 |
| `round12/cms2` | Manage for forum categories and guidelines, Noora's instructions and script, Home defaults, search, career, summary and newsletter copy, library links, grade rules (0033) |

Migrations chain 0026 → 0028 → 0031 → 0029 → 0030 → 0033. Mohamed's calls this round: the Railway dev site stays
open with made-up accounts only (SEC-43); guests keep playing today's Daily (the leaderboard says it's for fun); Noora
sits in the tab bar on phones; the Daily games keep their names.

## Round 13 (verify, review, polish): started 2026-10-18

The full e2e suite hasn't run since round 10, so this round tests everything rounds 11 and 12 built, reviews the
code and the look of every screen, then fixes what the reviews find.

| Branch | Agent | What |
| --- | --- | --- |
| `round13/e2e` | student-tester | the full e2e suite (stale specs updated, specs for rounds 11-12 added), and every feature by hand as each kind of student, Daily first |
| `round13/quality` | code-quality-reviewer | rounds 11-12 (CQ-47 on), CQ-30 to CQ-46 re-checked, ARCHITECTURE and DEPLOYMENT brought up to date |
| `round13/uiux` | ui-ux-reviewer | every screen at every size and in dark mode (UX-44 on), UX-28 to UX-43 re-checked |
| `round13/squash` | api-builder | the migrations squashed into a baseline with id 0033 (existing databases need nothing), then 0034: zone and sitting CHECKs, the `/requests/done` index, `modules.video-suggestions`; two races from round 12 |
| `round13/dailyfix` | api-builder | Daily: "fix today's puzzle" in Manage, Correlations groups of four to eight words (four a day), then the reviews' Daily findings |
| `round13/pictures` | web-builder | the notebook: pictures in line or free anywhere on the page (moved, resized, cropped, turned, layered, under the ink, in the export), then the reviews' notebook findings |

Mohamed's calls (2026-10-18), D14 and D15 in ARCHITECTURE: storage, the library and the Daily puzzles on the
Railway dev site (done by the lead); a "fix today's puzzle" button; Correlations groups of four to eight words; no
4-second rule in Daily; notebook pictures that float anywhere on the page; fortnightly and monthly repeats; sign-up
asks about notification emails; practice scores saved to the account; To-do shows dated cards only; Site settings and
the grade rules need no fresh code.

Merged (checks green: 1,668 API and 982 web tests):
- `round13/quality`: CQ-47 to CQ-82; ARCHITECTURE, DEPLOYMENT and README current.
- `round13/squash`: baseline 0033 plus 0034; then CQ-50/51/52/54/58/63/74, board templates (0039, "revision"
  becomes "study"), the index drift check, guarded module deletion.
- `round13/repeats`: fortnightly and monthly repeats (0036), feeds in Bahrain time, sign-up's email question.
- `round13/uiux`: UX-44 to UX-65 with screenshots; UX-28 to UX-43 re-checked.
- `round13/pictures`: free pictures anywhere on a page (0037), formulas from a paste (UX-58), the storage meter
  only near the limit and a notebook picker on phones (UX-57), CQ-47/48/59/61/71.
- `round13/dailyfix`: fix today's puzzle (0035), groups of four to eight, one hub of six tiles (UX-45), result
  pictures (UX-55), game colours that pass contrast with a live table in the style guide (UX-48), the guess list
  topped up to the shipped one (UX-47), the hub's game names in Manage (UX-64), Daily's prose and labels (UX-59/60).
- `round13/fixweb`: one leave guard in Manage (CQ-60), fields that show their errors (CQ-62), practice scores in
  the account (0038), the first download down from 239 to 101 kB gzip (CQ-61), Home, boards and Mini Noora
  (CQ-65/66/67), the year prompt off the Daily games, UX-50/51/52/54/56/57/59/60/63.

Migration chain: 0033 → 0034 → 0035 → 0036 → 0039 → 0037 → 0038 (one head).

Still running: `round13/e2e` (tester), `round13/uxfix` (UX-44 paper toolbar first, then focus, chips and the "New"
badges, which stay until a student first opens the section), `round13/errors` (plain sentences for the API's
validation errors instead of Pydantic's wording).

Daily game art: six prompts in `docs/design/asset-prompts-round3.md`, matched to the module icons' style; the drawn
shapes stay until Mohamed's images arrive.

## Round 14 (the study core first)

- `round14/library` (web-builder): the library as one piece (UX-66, 67, 68, 71, 72; ST-34). Phones get search,
  Filters (a sheet) and Sort, so files start at 278 px of 844; papers are named by their sitting ("ST2133 · May
  2019 · Zone A") everywhere and open at the newest sitting (`sort=sitting`); sittings are a compact table on the
  Files tab and in the library; notes say who shared them; a paper's page has one Download and "Ask about this
  paper". One rule counts a module's files, so the count, the shelves (now with links and "Other files") and the list
  agree. Open from UX-72: the module's threads that link a paper (needs the API).

## Operating notes

- **New features arrive switched off.** Turn them on in Manage → Access.
- **The Docker stack** runs from the main checkout (compose project `dsba-hub`). `scripts/e2e.sh` switches it to
  e2e mode and `--restore` switches it back. Nobody runs `docker compose down`: the API's pytest uses its Postgres.
- **Drive import:** done locally: 747 files served from MinIO, 3 links left. Google blocks the network for
  "automated queries" after bursts; the importer paces itself and waits the block out. Skipped: 8 IS2184 videos and
  one 60 MB PDF.
- **Local database:** keep it (it holds the import). When a migration was edited in place, apply the change by
  hand instead of rebuilding.
- **Test accounts (local):** mohamed.admin@example.com (admin), rami.rep@example.com (rep),
  sara.student@example.com (Year 2); codes in Mailpit, or `python -m app.cli dev-login <email>` for a session token.
  `python -m app.cli enable-features` switches everything on (development only).
- **Local data:** the database holds leftovers from e2e runs (titles with `[e2e …]`); harmless.
- **Daily content** is loaded on each new environment from `private/daily-content.json` (git-ignored): Manage →
  Daily puzzles → Load a content file, or `daily-content import` (`docs/backend/CMS.md`). Done locally.
- **Railway dev storage:** a Railway bucket, `dsba-files` (EU West), in the dev environment only. The api service's
  `DSBA_S3_*` are variable references (`${{dsba-files.ENDPOINT}}` and so on) with `DSBA_S3_FORCE_PATH_STYLE=false`,
  and web's `DSBA_BUCKET_ORIGIN` is the bucket's own host. Never print the bucket's credentials. Nobody changes
  Railway's settings without asking Mohamed.
- **Railway dev content (2026-10-18):** the library copied from the local hub (694 items, their search text and
  1,386 files and covers; same ids, Drive folders matched by address) and the Daily puzzles loaded from
  `private/daily-content.json`. A shell on the dev API: `railway ssh -i ~/.ssh/railway_dsba -s api -e dev` (the key
  "dsba-hub mac" on Mohamed's Railway account); for piped input use plain `ssh` with the host and user that
  `railway ssh config -s api -e dev --dry-run` prints.
- **Local MinIO** allows uploads from any localhost port (each builder's Vite has its own).
- **Formatting:** `cd web && npm run format` (Prettier); `.git-blame-ignore-revs` keeps the formatting commit out
  of `git blame`.
- **Module icons:** all 16 are in (the last seven generated by Antigravity, reviewed 2026-10-17: same flat style,
  compressed to 10-21 KB).
- **Python 3.12** is pinned in `api/.python-version`, matching the image and CI.
- **Workers:** in production, the `mail` worker sends queued notifications and Sunday summaries; the `texts` worker (`python -m app.cli text-worker`) extracts text from published PDFs and Word files for search.
- **Noora AI env:** `DSBA_ANTHROPIC_API_KEY` and `DSBA_NOORA_MODEL` power AI answers; without the key Noora runs in script mode.
- **PWA:** installs via `/manifest.webmanifest` and `/sw.js`; the service worker caches the app shell and static assets.
- **Bug reports:** anyone can report a bug with an optional screenshot; admins triage them in Manage → Bugs.

## Next

1. Round 13: merge the reviews and the squash, then builders fix what the reviews found.
2. Still open from earlier reviews: review numbers in comments and tests (CQ-20); SEC-14; the standards review's
   S-1 typed linting, S-3 re-encoding uploaded pictures, S-4 `noUncheckedIndexedAccess`, and S-5 to S-7.

## Waiting on Mohamed

- **Content gaps:** the six Year 3 modules have no unit codes; none of the 10 October exams has a time or place;
  each VLE MCQ window is two one-day events; IS2184 and every Year 3 module have no lessons.
- **`exam_meta_from_name()`:** the real past-paper name patterns, in `api/app/services/exam_names.py`.
- **Roadmap questions:** each feature in `docs/ROADMAP.md` lists what he needs to decide. R-1 (roles) comes first.
- **Ideas to approve:** 24 proposals in `docs/ideas.md` (IDEA-1 to IDEA-24), merged 2026-10-13.
- **Product calls:**
  - Noora's programme facts start with one: add more in Manage → Mini Noora (her starter cards come in fours).
  - The notebook: is 25 MB of text and handwriting per student enough?
  - Boards: no hourly cap on card saves yet.
  - Bug reports (defaults chosen 2026-10-18): deleted with the reporter's account rather than kept anonymised;
    screenshots kept 90 days after a report closes. Names that spell a staff word across spaces or dots ("A. D.
    Minhas") are refused.
  - Should there be a site-wide daily upload budget (SEC-14)?
  - Should a rep confirm seniors, beyond the 30-day rule?
  - A "shared computer" sign-in with a shorter session, and sessions that end after some days without use (S-2)?
  - Should an "I'm not a student" mode show all years?
  - Students' notes now show "Shared by <display name> · Year N" (UX-71, as the forum shows names). The other option
    was "Shared by a Year 3 student" without the name.
- **To deploy:** a server, a domain, an S3 bucket with its keys (plus a second key for the text worker), an SMTP account, Twilio for texts, and an Anthropic
  API key for Noora. `docs/backend/DEPLOYMENT.md` has the full list.

## How the team works

- Agents live in `.claude/agents/`: `security-reviewer`, `code-quality-reviewer`, `ui-ux-reviewer`,
  `student-tester`, `student-user`, `api-builder` and `web-builder`.
- `student-user` proposes features in `docs/ideas.md`. Nothing is built until Mohamed approves it.
- Builders work on their own branch in their own worktree; the lead merges. A merged or finished branch loses its
  worktree and its branch, locally and on GitHub.
- Reviewers write numbered findings to `docs/reviews/` (SEC-, CQ-, UX- and ST-) and re-check them later. Code
  comments describe the code, never those numbers.
- Product decisions go at the end of `docs/backend/ARCHITECTURE.md` (D1, D2, …).

## Other branches

- `master` and `gh-pages` run the live v1 site. Never touch them.
- `feature/dsba-pulse` holds the v2 prototype the app grew from, and the launch film. The film is never published.
  It must not say how many tutors there are or use the word "tutors", name individual teachers, or draw or imitate
  third-party logos.
