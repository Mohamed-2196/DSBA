# Status

This is the handoff between sessions: where the work stands, what's next and what Mohamed still has to decide.
Update it whenever you finish or start something. Last updated 2026-10-17, when round 12 started.

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
- **Last checks (2026-10-17, c25b735).** 1,253 API tests and 749 Vitest tests green after fixing a stale test and
  a dev-login bug Antigravity introduced; the API suite now takes about 11 minutes (round 12 speeds it up).

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
- **Module icons:** all 16 are in (the last seven generated by Antigravity, reviewed 2026-10-17: same flat style,
  compressed to 10-21 KB).
- **Python 3.12** is pinned in `api/.python-version`, matching the image and CI.
- **Workers:** in production, the `mail` worker sends queued notifications and Sunday summaries; the `texts` worker (`python -m app.cli text-worker`) extracts text from published PDFs and Word files for search.
- **Noora AI env:** `DSBA_ANTHROPIC_API_KEY` and `DSBA_NOORA_MODEL` power AI answers; without the key Noora runs in script mode.
- **PWA:** installs via `/manifest.webmanifest` and `/sw.js`; the service worker caches the app shell and static assets.
- **Bug reports:** anyone can report a bug with an optional screenshot; admins triage them in Manage → Bugs.

## Next

1. Merge round 11, then a review round on it.
2. Squash the migrations into one baseline between rounds (CQ-35), with the zone CHECKs (CQ-32), the
   `/requests/done` index (CQ-45) and the `modules.video-suggestions` switch name (CQ-36).
3. Prettier with a check in `scripts/check.sh`, formatted once in a commit of its own (CQ-43), while no builder is
   running.
4. Still open from the reviews: review numbers in comments and tests (CQ-20); SEC-11, SEC-14 and SEC-19; the
   standards review's S-1 typed linting, S-3 re-encoding uploaded pictures, S-4 `noUncheckedIndexedAccess`, and
   S-5 to S-7.

## Waiting on Mohamed

- **Content gaps:** the six Year 3 modules have no unit codes; none of the 10 October exams has a time or place;
  each VLE MCQ window is two one-day events; IS2184 and every Year 3 module have no lessons.
- **`exam_meta_from_name()`:** the real past-paper name patterns, in `api/app/services/exam_names.py`.
- **Roadmap questions:** each feature in `docs/ROADMAP.md` lists what he needs to decide. R-1 (roles) comes first.
- **Ideas to approve:** 24 proposals in `docs/ideas.md` (IDEA-1 to IDEA-24), merged 2026-10-13.
- **Product calls:**
  - Noora's programme facts start with one: add more in Manage → Mini Noora (her starter cards come in fours).
  - The notebook: free-floating pictures (a data-model change)? Is 25 MB of text and handwriting per student enough?
  - Calendar repeats: fortnightly or monthly needs a migration. Boards: no hourly cap on card saves yet.
  - Daily: a win within 4 seconds of opening scores nothing. Right limit?
  - Bug reports (defaults chosen 2026-10-18): deleted with the reporter's account rather than kept anonymised;
    screenshots kept 90 days after a report closes. Names that spell a staff word across spaces or dots ("A. D.
    Minhas") are refused.
  - Daily puzzles: edits apply from tomorrow, so today's puzzle can't be corrected. Add an admin "fix today's
    puzzle" button? And should a connections group hold exactly four words, or 4 to 8 with a day showing four?
  - Should notification emails stay on by default?
  - Should there be a site-wide daily upload budget (SEC-14)?
  - Should a rep confirm seniors, beyond the 30-day rule?
  - A "shared computer" sign-in with a shorter session, and sessions that end after some days without use (S-2)?
  - Should an "I'm not a student" mode show all years?
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
