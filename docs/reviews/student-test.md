# Student test: DSBA Hub through the browser

Tester: student tester. Status: **done** (10 October 2026). Stack under test: the shared dev API `:8000`, my web dev
server `:5178`, the freshly seeded dev database (shared with the other reviewers while I tested).

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

How to run (stack up, a web dev server on 5178 or `E2E_BASE_URL`):

```
cd web
npx playwright test                       # everything, about 5 minutes
npx playwright test e2e/forum.spec.ts     # one area (the setup project still runs first)
E2E_KEEP=1 npx playwright test            # keep the run's accounts and posts to look at afterwards
```

Settings: `E2E_BASE_URL` (default `http://127.0.0.1:5178`), `E2E_MAIL_DIR` / `E2E_SMS_DIR` (default
`/home/claude/devsvc/mail|sms`), `E2E_API_DIR` and `E2E_DEV_LOGIN` (how to run dev-login, default
`uv run --no-sync python -m app.cli dev-login` in `../api`), `E2E_STATE_DIR` (default
`$TMPDIR/dsba-e2e-<port>`: sessions, run details and `test-results`, so nothing is written into the repo),
`E2E_KEEP=1`.

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

**Result:** `40 passed` on the current stack, in two consecutive full runs (4.7 and 4.6 minutes). That includes the three known-bug tests, which use
`test.fail(...)`: ST-1 (`library.spec.ts`), ST-2 (`calendar.spec.ts`) and ST-4 (`notifications.spec.ts`). When one of
these bugs is fixed, its test passes unexpectedly and fails the run, as a reminder to delete the `test.fail` line.

Side effects:

- Each run uses 5 one-time codes (3 texts, 2 emails) out of the 30 per IP per hour.
- Publishing the run's newsletter issue notifies every account in the database that wants newsletter news. The
  teardown deletes the issue, so those notifications then lead to "We couldn't find that issue".

Checks: `npx eslint e2e playwright.config.ts` is clean. `tsc --strict` is clean too, using a scratch tsconfig,
because `web/tsconfig.json` only includes `src`.

Requests for the lead:

- Type-check the suite in `npm run typecheck`, for example by adding `"e2e/**/*.ts", "playwright.config.ts"` to
  `tsconfig.node.json` (with `"lib": ["ES2023", "DOM"]`).
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
