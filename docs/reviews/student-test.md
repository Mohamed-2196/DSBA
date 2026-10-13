# Student test: DSBA Hub through the browser

Tester: student tester. Status: **done** (10 October 2026). Stack under test: the shared dev API `:8000`, my web dev
server `:5178`, the freshly seeded dev database (shared with the other reviewers while I tested).

**Round 3 (13 October 2026):** the e2e suite now runs against the Docker stack with one command,
`scripts/e2e.sh`. What changed, the status of ST-1 to ST-12 and the latest results are in
[Round 3](#round-3-the-suite-on-the-docker-stack-13-october-2026) at the end. The by-hand findings below are from
10 October; the next by-hand pass is the re-review round.

Personas: **Sara Al-Mahmood** (Year 2, signed up with her phone +973 3612 4587, later added an email),
**Ali Hasan** (Year 1, signed up with ali.hasan.dsba@example.com on a 390×844 screen), **Noor Al-Sayed** (Year 3,
signed up by email through an expired code, then deleted her account), **Fatima Ahmed** (Year 3 student rep,
dev-login), **Maryam Yusuf** (admin, dev-login). Screenshots are in
`/tmp/claude-0/-home-claude-dsba/331caa53-7cba-5bfe-8500-672e2c76573d/scratchpad/student/shots/` (paths below are
relative to it).

## Summary

As a student the Hub works end to end. Reading needs no account and every page loads as a guest. Phone and email
sign-up work, with the wrong, expired, retired and reused code cases, resend, sign-out and adding an email. The
forum works: a thread with a picture, answers, nested replies, votes, accept, edit, delete, report, and the rep's
hide, lock and resolve. The library takes all eleven allowed file types, refuses the wrong ones, and runs the rep's
review with notes, preview, byte-identical downloads and stars. Lesson progress carries over or is left out on
sign-in, then resumes and clears. The newsletter, the calendar (with a valid ICS feed), notifications, search
(⌘K and on-page), the Career Navigator, the grades calculator, the admin's People page, suspensions, export and
account deletion also work. Every page fits 390×844 with no sideways scroll, and dark mode applies everywhere.

**No blockers.** One **major**: a rep's event for a module goes on every cohort's calendar and feed unless they
change the default cohort (ST-2). Everything else is minor or a nit. The e2e suite in `web/e2e` covers these flows:
**40 tests, green in two consecutive full runs of about 4.7 minutes each.** Three of them pin down known bugs (ST-1,
ST-2, ST-4) as expected failures.

| Feature | What I tested | Result |
|---|---|---|
| Guest browsing | Every page as a guest (home, modules, a module and its tabs, library, a file, forum, a thread, new thread, newsletter, an issue, calendar, career, grades, about, account/moderation/people sign-in prompts, 404) | works |
| Phone sign-up | Sara: local number `3612 4587` (hint shows +973), wrong code ("4 tries left"), resend after the 30 s countdown, old code retired (`410`), profile step (too-short name refused, cohort preselected from the first-visit choice) | works |
| Email sign-up | Ali on 390×844: malformed address caught, code by email, profile | works |
| Expired code | Noor: code expired (moved in the DB), "This code has expired" → "Send a new code" after the cooldown → signed in | works |
| Reused code | Verifying a used code again: `410 code_expired` | works |
| Sign out and back in | Account menu → Sign out (grades cleared, `/me` 401); signing back in within 30 s shows "Wait 21 seconds before asking for another code." | works |
| Add an email to a phone account | Code by email; other devices signed out; a notice texted to the phone | works |
| Profile and cohort | Rename (too-short name refused), cohort Year 2 → 3 → 2 (home follows), sidebar year switch doesn't change the account, email preferences | works |
| Forum: post | Thread with a picture (upload, preview, post, picture renders), reply, nested reply | works |
| Forum: votes, accept, edit, delete | Vote/unvote/vote (counts and state survive a reload), reply votes, accept an answer, edit ("edited"), delete a reply, delete a thread with replies | works (ST-11, ST-12) |
| Forum: report and moderate | Report a reply and a thread; reporting twice answered kindly; rep hides a reply and a thread, locks a duplicate, resolves and dismisses reports with notes; reporters notified | works |
| Forum: locked / hidden as a student | Locked: no composer, notice, API `409 thread_locked`. Hidden: "We couldn't find that thread" for students, guests and the author | works (ST-5) |
| Forum: search and filters | Year tabs, Hot/New/Top, "No replies yet", tag chips, search by title and body words | works |
| Library: uploads | PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, IPYNB, R, TXT, CSV: each "Sent for review", listed under Your uploads as "Waiting for review" | works |
| Library: wrong files | `.exe` and 51 MB refused before upload; HTML renamed `.pdf` refused by the server (`mismatch`); missing title; API: 51 MB presign `too_large`, `.exe` and `.svg` `unsupported_type` | works (copy: ST-7) |
| Library: review | Rep previews a pending PDF, publishes, rejects with a note; uploader notified; note shown on the item and in Your uploads | works |
| Library: read | PDF preview (inline `application/pdf`, short-lived URL), downloads byte-identical (PDF, DOCX, IPYNB, CSV), download count, "No preview" for other formats | works |
| Library: stars, search, filters | Star/unstar, Starred, search, module and type chips, "Search all years" | bug ST-1 |
| Forum pictures | PNG/JPEG attach; SVG and a 9 MB PNG refused with clear messages | works |
| Modules and lessons | Guest marks lessons (survive reload, "Continue learning"); sign in → "Add to my account" (synced) or "Leave it out" (cleared); resume; clear with Undo | works |
| Newsletter | Rep publishes "The pilot" with a confirmation; students notified; the notification opens the issue; reactions persist; guests read and are asked to sign in to react | works |
| Calendar | My year / all years, months, event drawer, subscribe dialog, `.ics` download and feed (CRLF, folded lines, UID/DTSTAMP/DTSTART), rep adds, edits, moves to another cohort, deletes | bug ST-2 |
| Notifications | Badge count, opening one (right page, becomes read), a no-link one, mark all as read | works (ST-4, ST-6) |
| Search (⌘K and `/`) | Finds new threads, library files, a rep's new event and a newly published issue; Enter opens | works |
| Career Navigator | Track filter, external links in a new tab with `noopener` | works |
| Grades calculator | Marks stay after reload, nothing sent to the server, cleared on sign-out | works |
| Mini Noora | Exam dates and topic lookups with lesson links | bug ST-3 |
| Admin: People | Search by email and by phone with a space, role change and back (person notified), activity log | works (ST-9) |
| Suspension | Suspended Ali: banner and disabled Post, no reply box, vote/reply/upload/report/rename `403`; lifted: can post again | works (ST-8) |
| Export and deletion | Export JSON; Noor deletes her account: signed out everywhere, old cookie dead, thread and reply stay as "Deleted account", published upload stays without a name | works |
| 390×844 and dark mode | Every page as a guest, Sara and Fatima at 390×844 (no horizontal overflow), and in dark mode on desktop and phone | works |

## Bugs

By severity: **major** ST-2. **Minor** ST-1, ST-3, ST-4, ST-5. **Nits** ST-6 to ST-12.

### ST-1 (minor) "Starred" says "No starred files yet" when your starred files are in another year

- Owner: frontend-library
- Steps: as a Year 1 student (Ali), open a Year 2 file (`/library/st2133-chapter-2-summary-notes`) and star it. Go to
  the library and press **Starred**.
- Expected: the starred file, or at least "1 starred file is in other years. Show all years".
- Actual: "0 files starred. **No starred files yet.** Star the files you keep coming back to…". The Year 1 filter
  stays on. `GET /api/v1/library/items?starred=true` does return the file, but it only shows after **All years**
  is chosen. A student thinks the star was lost.
- Screenshots: `lib-14-starred.png` (empty), `lib-16-ali-starred-all-years.png` (shown with All years).
- Fix: ignore the cohort filter for Starred and Your uploads, since they are personal lists. Or make the empty state
  count matches in other years, as the search empty state already does ("Search all years").
  e2e: `library.spec.ts` "ST-1" (expected failure).

### ST-2 (major) A rep's event for a module goes on every cohort's calendar by default

- Owner: frontend-content (calendar `EventFormDialog`)
- Steps: as a rep, Calendar → Add event. Title "ST2133 peer revision…", Type Revision, Cohort left at the default
  **Every cohort**, Module **ST2133 … (Year 2)**, a date. Add event.
- Expected: a Year 2 event. The API's rule is "for a module's event the cohort defaults to the module's year".
- Actual: the form always sends `"year": null`, so the API's default never applies. The event gets `year: null` and
  shows on the Year 1 and Year 3 calendars and in their subscribed feeds
  (`GET /api/v1/calendar/events?year=1&from=2026-10-26&to=2026-10-26` lists it). Students who subscribed to
  their own year in Google Calendar get other cohorts' revision sessions, and only a rep can fix it. This is the
  default path for every module event a rep adds.
- Screenshot: `cal-05-add-2026-10-25.png`.
- Fix: when a module is picked and the cohort hasn't been touched, set the cohort to the module's year. Or leave
  `year` out of the request so the API decides. e2e: `calendar.spec.ts` "ST-2" (expected failure).

### ST-3 (minor) Mini Noora answers every MGF question with the same worked example, for another distribution

- Owner: frontend-content (`features/noora/brain.ts`)
- Steps: open Mini Noora and ask "how do I find the mgf of a poisson" (or "mgf of the normal distribution").
- Expected: the Poisson (or normal) MGF, or a pointer to the right lesson.
- Actual: "Here's how, step by step: With k = λ/2 from (a), split at x = 0 … M_X(t) = λ²/(λ² − t²)". That is the
  MGF of a Laplace density from one past-paper question, and it comes back whatever distribution was asked
  about. A student revising ST2133 gets a wrong formula with confident steps. The "preview" disclaimer doesn't
  help much here.
- Screenshot: `noora-02-answer.png`.
- Fix: show the worked steps only when the question matches that example. Otherwise answer with the chapter links.

### ST-4 (minor) Reply notifications open the top of the thread, not the reply

- Owner: community (`services/forum.py`, the `notify(...)` calls in `create_reply` and `accept_answer`)
- Steps: Ali replies to Sara's thread. Sara opens the notification.
- Expected: the page scrolls to Ali's reply. The thread page already supports `#reply-<id>`.
- Actual: the URL is `/forum/<slug>` for `thread_reply`, `reply_reply` and `answer_accepted`, so in a long thread the
  student has to look for the reply.
- Fix: `url=f"/forum/{t.slug}#reply-{r.id}"`. e2e: `notifications.spec.ts` "ST-4" (expected failure).

### ST-5 (minor, product call) The author of a hidden thread gets a 404 and no explanation

- Owner: community
- Steps: Ali posts a thread. Sara reports it, and Fatima hides it and resolves the report. Ali opens his thread.
- Actual: "We couldn't find that thread. The link may be wrong, or the thread was removed." Nothing tells Ali that a
  rep hid it or why, although Sara, the reporter, is told. A hidden reply works the same way.
- Expected: a notification to the author ("A student rep hid your thread … Contact a student rep"). For the author,
  a "hidden by a student rep" notice instead of a 404.
- Screenshot: `stu-02-ali-own-hidden-thread.png`.

### ST-6 (nit) Notifications for a deleted reply stay, with the same text as the others

- Owner: community
- Ali posted a reply and deleted it. Sara still has two identical "Ali Hasan replied to your thread / “ST2133 2023
  Q3(b)…”" notifications, and one points at a reply that no longer exists. The body quotes the thread title, not
  the reply, so the two can't be told apart. Suggestion: quote the start of the reply, and drop the notification
  (or mark it read) when the reply is deleted or hidden.
- Screenshot: `stu-05-sara-notifications.png`.

### ST-7 (nit) "This file doesn't match what was declared. Choose the file again."

- Owner: content (the message of `POST /uploads/{id}/complete`, shown as it is)
- Steps: upload an HTML page renamed `ST2134 past paper 2024.pdf`.
- Response: `422 {"error":{"code":"mismatch","message":"This file doesn't match what was declared. Choose the file again."}}`
- A student never "declared" anything, and choosing the same file again fails again. Suggestion: "This isn't a real
  PDF: its contents don't match the .pdf name. Export it again as a PDF, or choose another file."
- Screenshot: `lib-03-ali-html-as-pdf.png`.

### ST-8 (nit) A suspended student can still star files

- Owner: content (`routers/library.py` `star`/`unstar` use `CurrentUser`)
- Steps: suspend Ali, then `PUT /api/v1/library/items/{id}/star`, or press the star.
- Response: `200 {"starred":true}`. Every other write answers `403 Your account is suspended…`, and the brief says to
  use `ActiveUser` for every write. Stars are private, so this is harmless but inconsistent. A profile-less account
  can star too.

### ST-9 (nit) The activity log doesn't say which newsletter issue was published

- Owner: accounts (People → Activity), using the audit row's `title`/`slug`
- The log says "Fatima Ahmed published a newsletter issue", while every other line names its object ("published
  “ST2133 Chapter 2 summary notes”").
- Screenshot: `adm-02-activity.png`.

### ST-10 (nit) Every guest page logs a red 401 in the console

- Owner: accounts
- `GET /api/v1/me` answers 401 for guests on every page load, and the browser shows it as "Failed to load resource:
  401". This is what the contract says, but it gets in the way when looking for real errors. A `200 null`, or a
  session endpoint that never answers 401, would keep the console clean.

### ST-11 (nit) "1 reply from 2 people"

- Owner: frontend-community (`ThreadSidebar`, "In this thread")
- The thread author is counted as a participant. On Ali's duplicate thread, which has one reply by Fatima, the
  sidebar says "1 reply from 2 people: Ali Hasan, Fatima Ahmed".
- Screenshot: `forum-41-deleted-thread.png`.

### ST-12 (nit) Deleting a thread "removes it from the forum", but it stays listed

- Owner: frontend-community (thread delete dialog)
- The dialog says "… will be removed from the forum and its text deleted. The replies stay readable at its link."
  A thread with replies stays in the list with a "Deleted" badge, which is right. The copy should say so: "Its
  text is deleted. Because it has replies, it stays listed so they can still be read."

## Works, but confusing as a student

- **Mini Noora's hint bubble** ("Hi! I'm Mini Noora…") comes back on every page until you open her once. It covers
  the bottom-right corner (the "Your modules" list on Home, toasts, Related threads) and has no close button.
- **Reporting** leaves the button as it was: after reporting a reply it still says "Report". I could only tell I had
  already reported it by trying again; the second try is answered kindly.
- **Library search stays inside your year.** As a Year 1 student, searching "regression" gives "No files match",
  because the Year 1 filter stays on. The empty state does offer "Search all years", and that helped.
- **Signing straight back in** within 30 seconds of the last code shows "Wait 21 seconds before asking for another
  code." It is clear, but students who sign out by mistake will hit it.

## Notes for the other reviewers

- **Security:** deleting an account deletes its one-time-code rows (`otp.forget_identifiers`). Those same rows are
  what the per-IP, per-address and global SMS budgets count. Someone who owns a Bahraini number can sign in, delete
  the account and repeat, and every cycle refills the texts-per-hour budget. I confirmed that the rows go when an
  account is deleted; I didn't attack it. Consider keeping the rows with the identifier hashed, or counting limits
  elsewhere.
- **Storage emulator:** moto accepted a 200 KB POST to a presigned policy declared as 1000 bytes. `complete` caught it
  (`mismatch`), so the server's second check works. Real S3/MinIO enforce `content-length-range`, but it is worth
  checking once against MinIO.
- **Shared code budget:** all of us sign in from 127.0.0.1, so the 30 codes per IP per hour are shared. The e2e
  suite uses 5 codes per run.

## The end-to-end suite

Files (all mine): `web/playwright.config.ts`, `web/e2e/support.ts` (settings, code readers, dev-login, real test
files made at run time), `web/e2e/fixtures.ts` (a page per persona), `web/e2e/auth.setup.ts`, 11 `*.spec.ts` files
and `web/e2e/cleanup.teardown.ts`.

How to run (since round 3; the stack up with `docker compose up -d --build`, then from the repo root):

```
scripts/e2e.sh                            # everything, about 3 minutes
scripts/e2e.sh e2e/forum.spec.ts          # one area (the setup project still runs first)
E2E_KEEP=1 scripts/e2e.sh                 # keep the run's accounts and posts to look at afterwards
scripts/e2e.sh --restore                  # afterwards: the API sends mail to Mailpit again
```

The script puts the stack in e2e mode first (see [Round 3](#round-3-the-suite-on-the-docker-stack-13-october-2026)).
Once it is, `cd web && npx playwright test` works too.

Settings: `E2E_BASE_URL` (default `http://localhost:5173`, the web container), `E2E_MAIL_DIR` / `E2E_SMS_DIR`
(default `api/var/mail|sms`), `E2E_API_DIR` and `E2E_DEV_LOGIN` (how to run dev-login, default
`docker compose -p dsba-hub exec -T api python -m app.cli dev-login`; without Docker,
`uv run --no-sync python -m app.cli dev-login` in `api/`), `E2E_STATE_DIR` (default `$TMPDIR/dsba-e2e-<port>`:
sessions, run details and `test-results`, so nothing is written into the repo), `E2E_KEEP=1`, and `E2E_CHROMIUM`
(a browser to launch instead of Playwright's Chromium). The first cloud set-up used `http://127.0.0.1:5178`,
`/home/claude/devsvc/mail|sms` and `uv run`: set those variables to run it there again.

How it works:

- **setup:** signs up a new Sara (a random +973 3x mobile) and a new Ali (`ali.e2e.<tag>@example.com`) with real
  codes. It covers the wrong code, resend, retired and reused codes, profile, grades cleared on sign-out, guest
  lesson progress added on sign-in, resume, clear, and adding an email. It then gets the rep
  (`e2e.rep@example.com`) and the admin (`e2e.admin@example.com`) sessions with dev-login.
- **app:** the specs, one worker, each multi-step area in serial mode. Everything the run creates carries
  `[e2e <tag>]`.
- **cleanup (teardown):** the two students download their data and delete their accounts, and the test checks
  that their posts show "Deleted account". The rep then hides the run's threads and deletes its files, events
  and newsletter issue. Nothing the run didn't create is touched.
- **Waits:** the suite has no fixed sleeps. The one exception is the wait the API asks for ("Wait 21 seconds…")
  before signing back in within the 30 s cooldown.

**Result (10 October):** `40 passed` on the cloud stack, in two consecutive full runs (4.7 and 4.6 minutes). That
included the three known-bug tests, which used `test.fail(...)`: ST-1 (`library.spec.ts`), ST-2 (`calendar.spec.ts`)
and ST-4 (`notifications.spec.ts`). When one of these bugs is fixed, its test passes unexpectedly and fails the run,
as a reminder to delete the `test.fail` line. Round 2 fixed all three and removed the lines. For the latest results,
see Round 3.

Side effects:

- Each run uses 5 one-time codes (3 texts, 2 emails), and 2 more emails when the teardown needs step-up codes (a
  run longer than 10 minutes). The e2e mode raises the per-network limit of 30 codes an hour (Round 3).
- Publishing the run's newsletter issue notifies every account in the database that wants newsletter news. The
  teardown deletes the issue, so those notifications then lead to "We couldn't find that issue".

Checks: `npx eslint e2e playwright.config.ts` is clean, and so is `npx tsc -p tsconfig.node.json`, which now
includes the suite.

Requests for the lead:

- ~~Type-check the suite in `npm run typecheck`.~~ Done in round 2: `tsconfig.node.json` includes `e2e/**/*.ts` and
  `playwright.config.ts`.
- If `outputDir` is ever moved into the repo, add `test-results/` and `playwright-report/` to `.gitignore`.

## Test data I left in the dev database

- **Threads and replies** by Sara, Ali, Noor (now "Deleted account") and Fatima:
  - the ST2133 E[Y] question with a picture and an accepted answer;
  - two EC1002 elasticity threads, one locked as a duplicate and then deleted by Ali;
  - a hidden ST1215 mock thread;
  - a Machine Learning study-group thread.
- **Library:** 12 uploads in every allowed format (11 published, one rejected with a note).
- **Newsletter:** "The pilot" published.
- **Calendar:** a Year 2 ST2133 peer revision session on 26 October.

All e2e runs cleaned up after themselves. The stable e2e rep and admin accounts stay.

Note for the UI/UX reviewer: while resolving my own reports I also resolved the open report on "ux-Hamad A."'s spam
reply in the ST2195 thread. My note there, "Hid the reply…", is wrong: the reply was not hidden. Sorry about that.

## Round 3: the suite on the Docker stack (13 October 2026)

Scope: `docs/STATUS.md`, "Next", item 1. The e2e suite runs against `docker compose` with one command, the whole
suite ran, the tests that broke on deliberate round 2 changes are updated, and it ran again straight away. There was
no by-hand pass this time: the full re-test of every feature as each kind of user comes in the re-review round.

Stack: Docker Desktop on Mohamed's Mac, compose project `dsba-hub`, with `api`, `mail` and `web` mounted from the
branch `round3/e2e-docker` (code as on `feature/backend`, `fd4bfe5`). Browser: Google Chrome 155, headless, driven by
Playwright 1.56 (see "Left open").

### The command

```
scripts/e2e.sh                            # the whole suite, about 3 minutes
scripts/e2e.sh e2e/forum.spec.ts          # one area; any arguments go on to `npx playwright test`
E2E_KEEP=1 scripts/e2e.sh                 # keep the run's accounts and posts
scripts/e2e.sh --restore                  # put the API back on Mailpit and the log
```

What it changes in the running stack (`compose.e2e.yaml` over `compose.yaml`, applied with
`up -d --no-deps api mail web`):

- **Mail and texts go to files.** The API and the mail worker save emails, sign-in codes included, as `.eml` files
  in `api/var/mail`, and the API saves texts as `.txt` files in `api/var/sms`. Both folders are git-ignored and
  mounted into the containers, and the suite reads its codes there. Mailpit gets nothing until `--restore`.
- **Two limits are raised.** Every request reaches the API through the web container's Vite proxy, and the
  development API trusts no proxy, so to the API the whole suite comes from one address: the web container's. So
  does anyone else using `:5173` at the time. A run asks for 5 to 7 codes, 3 of them by text, and even a run of one
  spec signs the students up first. With the per-network limit of 30 codes an hour, only four to six runs fit in an
  hour, and the next is refused ("Too many codes were asked for from your network"). The site's text budget (50 an
  hour, 300 a day) would stop an afternoon of reruns. So `DSBA_OTP_MAX_PER_IP_PER_HOUR` goes to 1000, and
  `DSBA_SMS_MAX_PER_HOUR` and `_PER_DAY` to 1000 and 10000.
- **Everything else keeps its production value.** The per-address and per-account limits, the 30 s wait before a new
  code and the wrong-code lockout per address and network (D4) are unchanged. Every run signs up new students, and the
  rep and the admin sign in with dev-login, so none of them builds up across reruns. Production isn't affected:
  `compose.prod.yaml` trusts only Caddy's address (`DSBA_TRUSTED_PROXIES`) and keeps the default limits.
- **db, minio and mailpit are never stopped or recreated.** The stack stays in e2e mode after a run, so reruns start
  at once.

The suite's defaults (`web/e2e/support.ts`) now point at this stack: `E2E_BASE_URL=http://localhost:5173`,
`E2E_MAIL_DIR=api/var/mail`, `E2E_SMS_DIR=api/var/sms` and
`E2E_DEV_LOGIN="docker compose -p dsba-hub exec -T api python -m app.cli dev-login"`, which finds the project from
any folder. The cloud settings still work through the same variables. While it waits for a code, the suite names the
folder it reads and says how to switch the API to its file backends.

The browser is Playwright's own Chromium when it is completely installed. On a Mac without it, the script sets
`E2E_CHROMIUM` to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, which `playwright.config.ts`
launches.

### Tests I changed, and why

All three follow deliberate round 2 changes. None of them hides an app bug.

| Test | Change | Why |
|---|---|---|
| `auth.setup.ts`, "Sara signs up with her phone number" | The resend button is "Send a new code", not "Resend code" | The UI/UX review asked for one name for the action, before and after a code expires (`e96121a`). Run 1 stopped here, so nothing else ran. |
| `admin.spec.ts`, "the admin makes Ali a student rep and back" | "Change" on Ali's row, then the "Student rep" (or "Student") card, then "Make student rep" (or "Make student"), instead of a "Role of …" select | UX-15 replaced the select with a dialog of radio cards. The radio sits hidden under its card (opacity 0, no pointer events), so the test clicks the card, as an admin does, and checks that the radio is on. |
| `cleanup.teardown.ts`, account deletion | If "Confirm it's you" opens, the test reads the step-up code from the mail folder and enters it | Since D2, deleting an account needs a step-up code once the session is over 10 minutes old. A full run takes about 3 minutes, so this only happens on a very slow run. I checked the path on its own (see Results). |

Commit `5c3617d` fixed two setup steps without running them. Both are right and pass in every run:
- Sara's code step says "Sent to +973 3xxx xxxx." in full (UX-16).
- The rep confirms "Hide reply" and "Hide thread" in the new dialogs.

### Earlier findings

| ID | Severity | Status | How I know |
|---|---|---|---|
| ST-1 | minor | **fixed** | e2e "ST-1: a starred file from another year shows under Starred" passes, with no `test.fail` |
| ST-2 | major | **fixed** | e2e "ST-2: an event for a Year 2 module added with the default cohort is a Year 2 event" passes |
| ST-3 | minor | fix merged, to re-test | `ebd3476`: Mini Noora gives the worked Laplace steps only for Laplace (`noora/formulas.ts`). The e2e test only asks for an exam date. |
| ST-4 | minor | **fixed** | e2e "ST-4: a reply notification links to the reply itself" passes |
| ST-5 | minor | decided (D3), fix merged, to re-test | `e96121a`: authors see their hidden thread with a notice and are told why. The e2e test checks students and guests, not the author. |
| ST-6 | nit | fix merged, to re-test | `services/forum/replies.py`: deleting or hiding a reply removes the notifications about it |
| ST-7 | nit | fix merged, to re-test | The message is now "This isn't a real .pdf file: what's inside doesn't match its name. Save or export it again, or choose another file." The e2e test checks the `mismatch` code. |
| ST-8 | nit | fix merged, to re-test | Starring now needs an active account (`ActiveUser` in `routers/library.py`) |
| ST-9 | nit | fix merged, to re-test | The activity log names the issue: "published the newsletter issue “…”" (`admin/audit.ts`) |
| ST-10 | nit | **fixed** | Guest pages ask `GET /auth/session`, which answers 200. In the API log for runs 1 and 2, the only 401s were the suite's own `GET /me` checks after signing out and after deleting an account. |
| ST-11 | nit | fix merged, to re-test | `forum/lib/replies.ts` counts the people who replied, so the author no longer counts |
| ST-12 | nit | fix merged, to re-test | The delete dialog now says "Its text is deleted, but its title and its reply stay in the forum…" |

"To re-test" means a by-hand check in the re-review round. The suite doesn't reach these.

### New findings

None. Every failure in these runs came from a deliberate change, and each test is updated (above). No test
needed `test.fail`.

### Left open

- **Playwright's Chromium doesn't install on this Mac.** With Node 26.11 and Playwright 1.56, `npx playwright install
  chromium` stops while unpacking, every time at 624 KB. It leaves `~/Library/Caches/ms-playwright/chromium-1194`
  half unpacked, without its `INSTALLATION_COMPLETE` marker, and holds a lock that blocks every other install while
  it hangs. The suite runs in Google Chrome instead. A newer Playwright, or the tools on a Node LTS (22 or 24), may
  bring the pinned browser back; I didn't try either.
- **Test locations are wrong under Node 26.** Every Playwright start warns that `module.register()` is deprecated,
  and the list reporter prints the wrong line for each test (for example `auth.setup.ts:304` for a test at line
  203). The titles are right, and a failure's code frame shows the right line. Running one test by `file:line` may
  not pick the test you mean, so use `-g "title"`.
- **The teardown's step-up branch runs only on a slow run.** I checked it once on its own (Results). Nothing tests
  step-up before changing an email or phone number.
- **`CLAUDE.md`, `docs/STATUS.md` and `README.md` still describe the old way.** The lead is updating them. The
  command and its settings are in `scripts/e2e.sh --help` and above.

### Results

All runs used `scripts/e2e.sh` on the Docker stack, one worker, with Google Chrome 155. "Did not run" means the
tests after a failure in a serial group or in the setup project. The counts are Playwright's.

| Run | What ran | Passed | Failed | Skipped | Did not run | Time |
|---|---|---|---|---|---|---|
| 1 | The whole suite, as it was | 2 | 1 | 0 | 38 | 2.3 min |
| 2 | The whole suite, after the resend and teardown changes | 38 | 1 | 0 | 2 | 5.7 min |
| | `admin.spec.ts` alone, after clicking the role card | 10 | 0 | 0 | 0 | 1.4 min |
| | `accounts.spec.ts` with `E2E_KEEP=1`, keeping two students for the step-up check | 7 | 0 | 2 | 0 | 1.3 min |
| A | **The whole suite, final** | **41** | **0** | **0** | **0** | 2.9 min |
| B | **The whole suite again, straight after A** | **41** | **0** | **0** | **0** | 2.8 min |
| | The teardown alone (`--project=cleanup`), 11 minutes after those students signed in | 2 | 0 | 0 | 0 | 4 s |

- **Run 1:** the setup failed on "Resend code", so no spec ran. The two passes are the teardown, with nothing to
  clean up.
- **Run 2:** the admin's role change failed on the hidden radio, and the other two admin tests didn't run.
- **The teardown run:** it took the step-up path for both students. The API log shows `DELETE /me` 403, then
  `POST /me/step-up` 202, `POST /me/step-up/verify` 200 and `DELETE /me` 204.

Afterwards, `scripts/e2e.sh --restore` put the API back on SMTP and the console, and a code for a made-up
`restore.e2e.*@example.com` address arrived in Mailpit. `api`, `mail` and `web` run from the main checkout again.

**Final: 41 passed, 0 failed, 0 skipped**, in two full runs back to back (A and B).
