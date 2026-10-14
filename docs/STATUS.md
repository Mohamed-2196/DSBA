# Status

This is the handoff between sessions: where the work stands, what's next and what Mohamed still has to decide.
Update it whenever you finish or start something. Last updated 2026-10-14, when round 11 started on Mohamed's Mac.

## Where things stand

`feature/backend` holds the real product: the API and the strict-TypeScript web app built on it. Nothing is
deployed yet.

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
- **Last checks.** On round 10: 1,096 API tests and 655 Vitest tests, mypy strict, knip clean.

## In flight: round 11

Eight builders, each on `round11/<name>` in `../dsba-<name>`, off `feature/backend`; the lead merges and re-chains
migrations. They cover Mohamed's feedback (F-1 to F-14) and the round 10 findings:

| Branch | Covers |
| --- | --- |
| `round11/shell` | sidebar scrolling, newsletter pictures, Home options, no pulse motif, report a bug (F-1, F-2, F-3, F-5, F-14) |
| `round11/papers2` | no Google Drive in the UI, papers by sitting with real covers (F-6, F-7) |
| `round11/notebook` | writing over documents and richer notes (F-8, F-12) |
| `round11/noora4` | Noora as a full assistant (F-9) |
| `round11/career` | Career Navigator editable in Manage (F-10) |
| `round11/calendar3` | each student's own calendar (F-11) |
| `round11/board3` | boards for everyday tasks (F-13) |
| `round11/fixes` | review findings outside those areas |

`round11/fixes` decisions:
- **Lesson progress off (SEC-32):** nothing new is saved, and what was saved before is kept but hidden (not served,
  not used by the board) until tracking is on again. The export still holds it.
- **Seniors (SEC-35):** a Year 3 account can list itself once it is 30 days old. The line can't claim a staff role
  or hold a link. A rep-confirmed year would be stronger; it needs a column and a queue in Manage.
- **Links in emails (SEC-30):** bare domains are taken out too, so "Node.js" and "notes.pdf" read "[link]" in
  emails and the Sunday summary.

## Operating notes

- **New features arrive switched off.** Turn them on in Manage → Access.
- **The Docker stack** runs from the main checkout (compose project `dsba-hub`). `scripts/e2e.sh` switches it to
  e2e mode and `--restore` switches it back. Nobody runs `docker compose down`: the API's pytest uses its Postgres.
- **Drive import:** 105 files in. Google blocks the network for "automated queries" after bursts; the importer
  paces itself and waits the block out, and a re-run picks up the rest. Skipped: 8 IS2184 videos and one 60 MB PDF.
  After merging RTC changes, run `python -m app.cli exam-meta` to give imported files their zone.
- **Local database:** keep it (it holds the import). When a migration was edited in place, apply the change by
  hand instead of rebuilding.
- **Test accounts (local):** mohamed.admin@example.com (admin), rami.rep@example.com (rep),
  sara.student@example.com (Year 2); codes in Mailpit.
- **Python 3.12** is pinned in `api/.python-version`, matching the image and CI.
- **Workers:** in production, the `mail` worker sends queued notifications and Sunday summaries; the `texts` worker (`python -m app.cli text-worker`) extracts text from published PDFs and Word files for search.
- **Noora AI env:** `DSBA_ANTHROPIC_API_KEY` and `DSBA_NOORA_MODEL` power AI answers; without the key Noora runs in script mode.
- **PWA:** installs via `/manifest.webmanifest` and `/sw.js`; the service worker caches the app shell and static assets.
- **Bug reports coming:** student bug reporting with optional screenshots (F-14) is being built in `round11/shell` (`bug_reports` table, Manage → Bugs).

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

- **Assets:** regenerate the rejects in `docs/design/asset-prompts-round2.md` (7 module icons: IS2184 and the six
  Year 3 modules; the board spot).
- **Content gaps:** the six Year 3 modules have no unit codes; the October exams have no times or places; IS2184
  and every Year 3 module have no lessons.
- **`exam_meta_from_name()`** in `api/app/services/exam_names.py`: the real past-paper name patterns.
- **Product calls:**
  - Should notification emails stay on by default?
  - Should there be a site-wide daily upload budget (SEC-14)?
  - Should a rep confirm seniors, beyond the 30-day rule?
  - A "shared computer" sign-in with a shorter session, and sessions that end after some days without use (S-2)?
  - Should an "I'm not a student" mode show all years?
- **To deploy:** a server, a domain, an S3 bucket with its keys, an SMTP account, Twilio for texts, and an Anthropic
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
