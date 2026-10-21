# Status

This is the handoff between sessions: where the work stands, what's next and what Mohamed still has to decide.
Update it whenever you finish or start something. Last updated 2026-10-21, after round 17 (Mohamed's dev review).

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

Merged, round 13 (all on `feature/backend`):
- `round13/quality`: CQ-47 to CQ-82; ARCHITECTURE, DEPLOYMENT and README current.
- `round13/squash`: baseline 0033 plus 0034; CQ-50/51/52/54/58/63/74, board templates (0039), the index drift
  check, guarded module deletion.
- `round13/repeats`: fortnightly and monthly repeats (0036), feeds in Bahrain time, sign-up's email question.
- `round13/uiux`: UX-44 to UX-65; UX-28 to UX-43 re-checked.
- `round13/pictures`: free pictures anywhere on a page (0037), formulas from a paste, CQ-47/48/59/61/71.
- `round13/dailyfix`, `round13/dailyart`: fix today's puzzle (0035), one hub of six tiles with the game art, a
  guest's win kept on sign-in with guards (0041, D17), contrast, ST-24/25/26/29/30.
- `round13/fixweb`: Manage's leave guard, practice scores in the account (0038), a smaller first download.
- `round13/errors`, `round13/fields`: validation errors in plain sentences, shown on their fields.
- `round13/uxfix`, `round13/measure`: the paper toolbar on phones (UX-44), "New" until first opened, prose
  held to the measure.
- `round13/limits`: the notebook upload limit an admin setting, 60 an hour, with numbers in Manage (0040, D16); a
  released file must fit the room again (security).
- `round13/pdfscan`: scanned papers draw in the notebook (`'wasm-unsafe-eval'` in the CSP), Career keeps focus.
- `round13/e2e`: the suite follows rounds 11-13; last full run 103 passed, 0 failed (before round 14).

Artwork decision (2026-10-19): Mohamed cancelled the older Mini Noora refresh and confirmed the existing character
assets are good. Keep the current Noora artwork. Daily's six game pictures are integrated; the AI-generated
originals and prompts are in `docs/design/generated/2026-10-19/` (not committed yet).

## Round 14 (the study core first): merged 2026-10-19

Mohamed (2026-10-19): too much went into Daily; the work now goes to the sections students live in. Reviews:
`docs/reviews/ui-ux.md` UX-66 to UX-79 and `docs/reviews/student-test.md` ST-40 to ST-57, round 14 sections.
His calls: notes reflow on phones; ink moves with its text; IDEA-40 to IDEA-43 approved.

Merged (checks green: 1,776 API and 1,141 web tests):
- `round14/library`: papers named by sitting and sorted newest first, a compact sittings table, Filters as a
  sheet on phones, who shared a note, "Ask about this paper", one rule for a module's counts (ST-34).
- `round14/modulehome`: the module page is the module's home (UX-69); Home's Up next is future-only (UX-76).
- `round14/offline`: the last lists a student saw stay readable offline for a week, per account (IDEA-43).
- `round14/forum`: a Yours tab (IDEA-42), search by your year with spelling help (0044, pg_trgm), thread titles on
  phones, posting opens the thread, modules by year, formulas as text in notifications, threads that link a paper.
- `round14/carryon`: Carry on (IDEA-40), Back keeps your place, the paper timer everywhere and papers in the Hub on
  phones, a score when the timer stops, a revision plan that fits the days left, Home leads with study (0043).
- `round14/notebook`: notes reflow on phones (UX-70), ink moves with its text (ST-38), notes know their module
  (IDEA-41, 0042), notes beside the playing video with time stamps (ST-44).
- Lead: a file copied into two modules shows in both (ST-46); offline account switch fix.

Migration chain: 0033 → 0034 → 0035 → 0036 → 0039 → 0037 → 0038 → 0040 → 0041 → 0044 → 0043 → 0042 (one head).
Art handoff for the core: `docs/design/asset-prompts-round4.md` (C1 no lessons, C2 sign in, C3 not found, F1 forum).

Round 14 finished: the module page shows the student's notes and the sittings table; the e2e recheck passed 113 of
113 (ST-58 to ST-61 found, ST-59 to ST-61 fixed with ST-56); ST-46 (a file in two modules shows in both).

## Round 15 (the Deskmates look; Questions by topic filled): merged 2026-10-20

Mohamed picked direction B, "Deskmates", from three (comparison and v2 are Artifacts), asked for the existing DSBA Hub
logo, new colours and better sidebar icons, and approved v2. The package is `docs/design/deskmates/` (README has the
build order and open items; `brand/BRAND.md` maps the tokens); the Design System Artifact holds the same.

Merged:
- `round15/skin` (phase 1): v2 tokens with the renames, Bricolage Grotesque and Figtree, the `Icon` family (82),
  the sidebar and tab bar, shared components re-skinned.
- `round15/deskmates` (phase 2): the `Deskmate` component, section headers, sleepy empty states, happy toasts;
  "Notebook" and "Boards" in the copy (routes unchanged).
- `round15/noora`: Mini Noora on `claude-haiku-5-5` (adaptive thinking, medium effort, `noora_declined`), both
  price tiers in the budget; the reservation is conservative near the long-prompt line (security review).
- `round15/tagging`, `round15/sections`: Claude tags past-paper questions by chapter (0045), with sections such as
  B1 (0046); `paper_questions.json` is seed data (1,446 questions on 229 papers, tagged by Haiku agents), and the
  seed replaces a paper's stale machine tags. The broken MN1178 chapter is removed by the seed; `exam-meta` files
  MT1186 papers found in ST1215's folder under MT1186 (run on local and Railway dev).
- `round14/bugs`: several query params in one update (ST-61), the score toast (ST-60), ST-56, ST-59.

Data cleared (Mohamed's calls): local `[e2e …]` rows (201 files, 130 threads, 5 events); the import's "In <folder>."
descriptions, local and Railway dev (694 each).

Migration chain ends … → 0042 → 0045 → 0046.

Also merged: `round15/screens1` (3a: library, module page, Home), `round15/screens2` (3b: notebook, forum,
calendar, search, Noora's frame), `round15/screens3` (3c: Boards, Grades, Career, account, sign-in, onboarding),
`round15/uxreview` (UX-80 to UX-91), `round15/e2e` (117 passed, 0 failed; ST-62 to ST-66) and `round15/polish`
(all of those fixed but the notebook in dark, which stays white by Mohamed's call, and UX-90's last pages).

Mohamed's calls (2026-10-20): Mini Noora keeps her standing figure as the launcher; a note's page stays white in dark.

`round15/screens4` (3d) brought Manage, Access, Newsletter, Daily, Requests, Start here and the 404 pages into the
look (UX-90): every screen is now Deskmates. Phosphor remains only where the brand set has no glyph (Daily's flame,
snowflake, trophy and backspace; the newsletter's block icons; two Manage empty states; Career's sector and role icons;
account device icons).

## Round 16 (study core features, launch readiness, speed): merged 2026-10-20

- Reviews: student test (ST-67 to ST-82), ideas (IDEA-44 to IDEA-56; Mohamed approved 13, declined 25/28/34),
  pre-launch security audit (SEC-49 to SEC-65), icon family finished (Phosphor gone).
- Built: worked answer per question, practise a chapter, "worked answers in the report", ask about Q3 (IDEA-44 to
  47); exam week leads Home on phones as an admin setting, Asked before, chapter words in search, your notes in
  search (48 to 51); timetable in one paste, plan on the calendar, print a module's notes (53 to 55); share a note
  with your module (shown at once, reportable) and recording time stamps (29, 52); all the student-test fixes.
- Security: every finding fixed but SEC-64 (a choice for Mohamed) and part of SEC-65; Railway proxy trust, sign-in
  email budgets without an enumeration oracle, upload budgets in Manage (20 GB hub, 1 GB account a day), hidden
  modules hide their files, admin bootstrap only, posting box on every student write.
- Speed (Mohamed: "really slow"): measured locally (the Mac at load 116, out of RAM) and deployed (Bahrain to the
  sin1 edge to Amsterdam, ~0.5 s a round trip). Dev moved to Singapore; icons and deskmates bundled (Home 102 to
  38 scripts); `GET /home` gives Home's first screen in one request; Noora's sprites WebP. Deployed LCP now
  0.5-1.0 s on Library, Modules, Forum, Calendar, warm Home 0.3-0.5 s.
- Migrations: ... 0046 -> 0049 -> 0050 -> 0048 -> 0047 -> 0053 -> 0051 -> 0052 (one head). The seed also reads the
  examiners' reports for worked answers on every deploy.
- Then: SEC-64 (portal links only to BIBF and University of London hosts), the by-eye UI review and fixes (UX-92
  to UX-101: long words and names never break a layout; `web/scripts/layout-check.mjs` checks it with long content),
  and the seed reads examiners' reports for worked answers on every deploy (dev now shows them).
- Open: production waits (Mohamed, 2026-10-20: not yet; no domain yet). The go-live checklist in
  docs/reviews/security.md lists what he does (secrets, domain, mail with SPF/DKIM/DMARC, Twilio and Anthropic caps,
  monitoring) and what the lead does once he says go. The bucket is still in Amsterdam.

## Round 17 (Mohamed's dev review): merged 2026-10-21

- Resits (Mohamed: "Main sitting, resits apart"): every exam is Main or Resit (0054; Sep-Dec dates default to
  resit, reps can switch). A module's year counts down to its main sitting only; a resit counts down for the next
  year and for students who tick "I'm resitting this"; final-year resits only for those who tick. All Oct/Nov 2026
  exams, Year 2's too, are resits.
- Tagging grounded in the study guides: chapter outlines with topics (0055, 0057; `chapter_outlines.json`, 94 of 99
  chapters; MN1178 from the BMGC notes as it has no guide). Haiku subagents retagged every paper from the outlines:
  1,545 questions on 227 papers, 1,535 with topics, 1,536 with an anchor the viewer highlights. Questions group,
  filter and practise by topic. New past papers are tagged by Claude (`claude-haiku-5-5`) on publish
  (`library.autotag`; Manage → Uploads → Tagging new past papers).
- Sign-in (Mohamed: Google, plus email and password with no check; no texts): one-time codes, texts, Twilio and
  phones removed (0056 deletes phone-only accounts). Staff roles and the admin bootstrap need a Google-confirmed
  address; Google takes over an unconfirmed account with its address; notification emails wait for a confirmed
  address; admins issue one-time reset links. Google stays off until `DSBA_GOOGLE_CLIENT_ID`/`_SECRET` are set
  (DEPLOYMENT.md section 14 has the console steps).
- UI: Start here removed; /modules rows and module-page icons aligned (one class styled in two sheets; a test now
  refuses that); Quick Look on Space; real first-page covers on every file card; the 32 MT1186 workbooks retired;
  a duplicate ST2187 paper removed, the ST2195 2023 prelim with solutions refiled. Solutions and examiners' reports
  are different documents (kept).
- Migrations: ... 0052 -> 0055 -> 0054 -> 0057 -> 0056 (one head).
- Outline gaps the retag found (questions went to the nearest chapter): MN1178 organisation structure; ST1215
  descriptive statistics and sampling (guide chapter 1), chi-squared and two-proportion tests; EC2020 binary
  response (probit/logit/LPM), maximum likelihood, panel data; EC1002 exchange economies.

### Follow-up, 2026-10-21

Release `a22066f2` is pushed and both GitHub CI jobs are green. Deployment is blocked by Railway's current
[platform incident](https://status.railway.com/incident/QH8L8B3E): new builds are paused in every region. The dev
site remains healthy on `72532d7b`; the password and cover changes are not live yet. After Railway resumes builds,
deploy the latest `feature/backend` commit and run `scripts/check-deploy.sh` against both services before marking
this release deployed. The owner-account role assignment below is already saved in the dev database.

- Passwords need eight characters throughout sign-up, changes and resets; the form hints, generated API contract
  and tests agree. Eight- and nine-character passwords work; seven is refused. API checks: 2,114 passed, one skipped.
- Real first-page covers now appear in Home's grouped New files rows and Carry on (including timed papers), module
  library notes, sitting links, the file-viewer heading and practice previews. Missing/broken images and the styled
  cover preference keep their fallback. Web checks: 1,305 passed; browser checks covered light/dark Home across
  nine sizes, plus module, viewer and practice screens.
- The requested owner account has Admin and Student on Railway dev, created through the development bootstrap
  and audited role CLI. It has neither a password nor a Google link yet; Google can sign in to it once configured.
  The maintenance database proxy was removed after the role was verified.
- Google sign-in is implemented but off: both `DSBA_GOOGLE_CLIENT_ID` and `DSBA_GOOGLE_CLIENT_SECRET` are absent
  locally and on Railway's API service. `DSBA_WEB_BASE_URL` already matches the dev site. The OAuth Web client must
  register `https://web-dev-254f.up.railway.app/api/v1/auth/google/callback`. DEPLOYMENT section 14 now follows
  Google's basic-scope Testing exception and separate branding requirements.

## Operating notes

- **Railway dev region (2026-10-20):** Postgres, api and web run in `southeast-asia` (moved from Amsterdam with
  Mohamed's OK), because Railway routes Bahrain through its Singapore edge. The `dsba-files` bucket is still in
  Amsterdam (ams). Measured after the move and round16/perf, cold browser: Library/Modules/Forum/Calendar LCP
  0.5-1.0 s (was 1.3-1.7 s); warm Home 0.3-0.5 s; the first load in a fresh browser adds ~1-1.5 s of connection setup.
- **After merging a branch with migrations,** run `docker compose exec api alembic upgrade head` locally: the API
  container reloads code on change but does not migrate, and pages 500 until it does.

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

1. Add the chapters the retag found missing (Mohamed, 2026-10-21: "Add the chapters"): from the study guides,
   ST1215 data visualisation and descriptive statistics (with sampling), EC2020 binary response and maximum
   likelihood (and panel data if the guide has it), MN1178 organisation structure, and others where a guide
   chapter has no hub chapter; add their outlines and topics, then have Haiku subagents move the affected
   questions (the notes in the retag say which) and ship `paper_questions.json` again.
2. Then, when Mohamed says go: a student test of round 17 (resits, topics, Quick Look, the new sign-in), a security
   review of the new sign-in, Year 3 chapters and tagging, Quick Look in the sittings table and Cmd-K.
3. Still open from earlier reviews: CQ-20; SEC-14; the standards review's S-1, S-3, S-4 and S-5 to S-7.

## Waiting on Mohamed

- **Anthropic key:** on Railway dev since 2026-10-21; not in the local `.env` yet.
- **Google sign-in:** an OAuth client in Google Cloud Console and `DSBA_GOOGLE_CLIENT_ID`/`_SECRET` on Railway dev
  (DEPLOYMENT.md section 14). Until then dev signs in with email and password.
- **Chapters for the outline gaps** listed in round 17, and ST2195 2022 PrelimExam comm (a commentary filed as a
  past paper).
- **Year 3 chapters:** 44 Year 3 papers can't be tagged until those modules have chapters.
- **Content gaps** (round 14 test, ST-45/48/49): tagged past questions exist only for EC1002 and EC2020; solutions
  for 0-2 sittings per module; an exam's "What to bring" opens an empty forum tag; the six Year 3 modules have no
  unit codes; none of the 10 October exams has a time or place; each VLE MCQ window is two one-day events; IS2184 and every Year 3 module have no lessons.
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
- **To deploy:** a server, a domain, an S3 bucket with its keys (plus a second key for the text worker), an SMTP account, a Google OAuth client, and an Anthropic
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
