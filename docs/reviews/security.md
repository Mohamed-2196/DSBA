# Security review: the implementation (round 3 re-review)

Reviewer: security. Scope: `feature/backend` at `75626cd` (after the round 3 merge `1274e81`): every earlier finding
(SEC-1 to SEC-15 here, 1 to 23 in `security-design.md`), what rounds 2 and 3 added (the email outbox and mail worker,
step-up, lockouts per address and network, the newsletter form editor, pictures in the library and the forum, the
Drive import, the e2e override, the data router), and the approved access design
(`docs/superpowers/specs/2026-10-13-access-roles-and-feature-switches-design.md`). No application code was changed.

How it was checked: reading the code; the API suite (727 tests, all passing with `pg_dump` 18 on PATH); proof tests in
`api/tests/test_sec_review_r3.py` (one per new finding that can be shown in-process; all pass, which means each
problem is real); live requests against the shared Docker stack only for the upload policy (made-up account
`sec-r3-policy@example.com`, 4 presigns), and `npm audit` on the lockfile. No limit or lockout was hammered live.

## Summary

Round 2 closed almost everything the earlier reviews asked for: hidden threads stay hidden when deleted (SEC-15),
wrong codes lock a network rather than an address and then switch the address to long codes (SEC-2, D4), changing
how one signs in needs a fresh session or a step-up code (SEC-9, D2), `safeHref()` refuses the tab and backslash
forms (SEC-3), the dependencies are clean (SEC-4), newsletter text is capped (SEC-6), the bucket policy is now proven
on MinIO (SEC-7), PostHog is locked down (SEC-8), look-alike staff names are refused (SEC-11), slugs can't shadow ids
(SEC-12), and the review queue is capped (SEC-14, in part). The Drive import handles its key and Drive's untrusted
names and bytes carefully, and nothing in the e2e override can reach `compose.prod.yaml`. The data router has no
return-to parameter and no open redirect.

**No blockers.** The new problems are about what a trusted account or the email channel can do:

- **SEC-16 (major):** step-up protects an admin's own account but not the admin powers. A stolen admin session,
  however old, can move any other account (another admin's included) to an address the attacker reads, or make the
  attacker's own account an admin, for good.
- **SEC-17 (minor):** one student can make the Hub send another student 60 emails an hour, each quoting the student's
  own text and links, from the Hub's own address.
- **SEC-18 (minor):** every published issue emails every account, with no cap: a rep (or, after the access work, any
  holder of `newsletter.manage`) can mass-mail the whole cohort from the Hub's address as often as they like.
- **SEC-19 (nit), SEC-20 (minor):** a student's list shows their own removed files; production settings accept an
  empty `DSBA_TRUSTED_PROXIES` and the e2e mode's raised limits.

The access design is sound in its shape (boxes checked in code, roles as data, admin-only powers, switches enforced
by the API), but it needs a few rules written down before it is built: see "Design review: access" (AD-1 to AD-9).

| ID | Severity | Owner | Status | Title |
|---|---|---|---|---|
| SEC-16 | **major** | accounts (`routers/admin.py`) | open | Admin powers need no step-up: a stolen admin session takes over any account for good |
| SEC-17 | minor | community, accounts (`services/notify.py`) | open | Notification emails: 60 an hour from one student to one person, quoting their links |
| SEC-18 | minor | content (`services/newsletter.py`) | open | Publishing an issue mass-emails every account, with no limit |
| SEC-20 | minor | LEAD (`config.py`) | open | Production settings accept no trusted proxy and the e2e mode's raised limits |
| SEC-19 | nit | content (`services/library.py`) | open | `?mine=1&status=removed` lists a student's removed files |
| SEC-14 | minor | content, Mohamed | **partly fixed** | Review queue capped and rejected files swept; no site-wide upload budget yet (product call) |
| SEC-2 | minor | accounts | **fixed** (residual noted) | Wrong codes lock a network, not the address (D4) |
| SEC-3 | nit | frontend-accounts | **fixed** | `safeHref()` refuses whitespace, controls and backslashes and checks the origin |
| SEC-4 | minor | LEAD | **fixed** | React Router 7.18.4, Vite 7.3.7, `npm audit`: 0; Python installed with `--require-hashes` |
| SEC-6 | minor | content | **fixed** | `dek`/`summary` 2,000 characters, 12 editors of 80, 256 KB per issue |
| SEC-7 | nit | LEAD | **fixed** (on MinIO) | Upload policy refuses another key, another type and a bigger body |
| SEC-8 | minor | LEAD | **fixed** | PostHog: page views only, no autocapture, no recordings, masked, `ip: false` |
| SEC-9 | minor | accounts | **fixed** (see SEC-16) | Step-up before changing identifiers or deleting the account; admin recovery exists |
| SEC-11 | nit | accounts | **fixed** (residual nit) | Look-alike letters refused; "A d m i n" and "Ad-min" still pass |
| SEC-12 | nit | community | **fixed** | A value that reads as an id is looked up as an id first |
| SEC-15 | major | community | **fixed** | Deleting a hidden post keeps it hidden; unhiding gives a deleted post |
| SEC-1, 5, 10, 13 | | | **fixed** (still) | Re-checked: code unchanged in substance, their tests pass |

---

## New findings (round 3)

### SEC-16. Admin powers need no step-up: a stolen admin session takes over any account for good (major)

- **Owner:** accounts. **Where:** `api/app/routers/admin.py:131` `update_user` (role change at `:153`, account
  recovery `_recover` at `:170`).
- **What an attacker does:** D2 made a session alone too weak to change how *its own* account signs in, because a
  lab PC left signed in is the realistic way sessions get stolen. `PATCH /admin/users/{id}` has no such check. Whoever
  sits at an admin's unlocked browser (sessions last 30 days, no idle timeout) can:
  - set another admin's email to an inbox they read (account recovery), sign in as that admin, and from there
    recover the first admin's account too: every admin account is theirs, and the real admins are signed out;
  - or simply make their own student account an admin, which survives the stolen session being revoked.
  The victims get a notice, but only after the fact, and nobody else can undo it.
- **Proof:** `test_sec16_old_admin_session_takes_over_other_accounts_without_step_up`: with a session an hour old,
  `POST /me/identifiers/otp` answers 403 `step_up_required`, while `PATCH /admin/users/{other admin}
  {"email": ...}` and `PATCH /admin/users/{student} {"role": "admin"}` both answer 200 and take effect.
- **Fix:** call `sessions.require_step_up(sess)` in `update_user` whenever the body changes `email`, `phone` or
  `role` (the web app already handles `step_up_required`). Also refuse account recovery on an admin's account
  (another admin recovering an admin should go through `set-role` on the server, or need two admins). Test: an
  admin session older than 10 minutes gets 403 `step_up_required` for each of the three fields, and 200 after
  `POST /me/step-up/verify`. The access design keeps both powers admin-only, so carry the rule over (AD-1).

### SEC-17. Notification emails: 60 an hour from one student to one person, quoting their links (minor)

- **Owner:** community (rate), accounts (`services/notify.py`). **Where:** `services/notify.py:64` `notify()` queues
  one email per notification (`:99`); `services/forum/rules.py:28` allows 60 replies an hour; `email_text()` quotes
  300 characters of the reply.
- **What an attacker does:** replies to a classmate's thread 60 times an hour (more with a second account: accounts
  are free). Each reply is an email from the Hub's own address to the thread's author, with the reply's text and
  links in it; mail apps turn `https://…` into a link. So a student can (a) flood a classmate's inbox, about 1,400
  emails a day per account, and (b) send phishing ("your code expired, sign in at https://dsba-hub-login.example")
  that passes SPF and DKIM as the Hub. Spam complaints against the Hub's sending domain also put the sign-in codes,
  sent from the same domain, at risk for everyone. The person can turn the switch off, but it is on by default.
- **Proof:** `test_sec17_one_student_sends_sixty_emails_an_hour_to_one_person`: 60 replies queue 60 emails to the
  thread's author, and the reply's `https://dsba-hub-login.example/code` is in the email body.
- **Fix:** at most one reply email per thread per recipient until they open it (or a cap of about 10 notification
  emails per recipient per hour, the rest only in the Hub); quote no links in emails (replace each URL in the
  excerpt with "[link]"), or quote no body at all ("Ali replied to your thread “…”").

### SEC-18. Publishing an issue mass-emails every account, with no limit (minor)

- **Owner:** content. **Where:** `services/newsletter.py:283` `publish()` calls `notify_all()` (`:291`), which
  queues an email for every account with "New newsletter issues" on (the default). Creating, publishing and deleting
  issues has no rate limit.
- **What an attacker does:** a rep, or whoever holds a rep's session, creates and publishes issue after issue: each
  is an email to the whole cohort from the Hub's address, with a subject and a 300-character quote they choose. The
  same spam-reputation risk as SEC-17, at 160 times the scale. The access design gives `newsletter.manage` to a new
  "Newsletter manager" role too, so more people will hold this power.
- **Proof:** `test_sec18_a_rep_mass_emails_every_account_per_published_issue`: three issues published in a row queue
  three emails per account.
- **Fix:** at most one issue email to the cohort per day (later issues notify in the Hub only), or let only admins
  publish; quote no links in the email (as SEC-17); audit already records each publish.

### SEC-19. `?mine=1&status=removed` lists a student's removed files (nit)

- **Owner:** content. **Where:** `services/library.py:234` `_visible_statuses()`: with `mine`, any `status` is taken
  as asked, `removed` included, while `can_see()` keeps removed items for moderators only.
- **Impact:** small: the student only sees their own files, with the rep's note. It is still a side door past the
  rule "removed: moderators only", and it would show more if notes ever say more.
- **Proof:** `test_sec19_uploader_lists_own_removed_item`: the item answers 404 by id but is in the list.
- **Fix:** with `mine`, accept only `pending`, `published` and `rejected`.

### SEC-20. Production settings accept no trusted proxy and the e2e mode's raised limits (minor)

- **Owner:** LEAD. **Where:** `app/config.py:220` `production_problems()`.
- **The e2e override itself is fine:** `compose.e2e.yaml` is applied only by `scripts/e2e.sh` on top of
  `compose.yaml`; `compose.prod.yaml` sets neither the file backends nor the raised limits, and production already
  refuses the `file` email and text backends. But nothing refuses the raised values if they reach a server some other
  way (a copied `.env`, an `environment:` line added while debugging): `DSBA_OTP_MAX_PER_IP_PER_HOUR=1000`,
  `DSBA_SMS_MAX_PER_HOUR=1000`, `DSBA_SMS_MAX_PER_DAY=10000`, even `DSBA_OTP_MAX_ATTEMPTS=1000` start without a word.
- **No trusted proxy:** with `DSBA_TRUSTED_PROXIES` empty behind Caddy, every request comes from Caddy's address. The
  per-network limits then become site-wide: one person asking for 30 codes an hour stops everyone's sign-in, and
  15 wrong codes lock an address for the whole site, which is the SEC-2 attack D4 removed. `compose.prod.yaml` sets
  it, so this only bites a hand-made deployment.
- **Proof:** `test_sec20_production_accepts_raised_limits_and_no_trusted_proxy`: `production_problems()` is empty for
  those settings.
- **Fix:** in production, refuse an empty `DSBA_TRUSTED_PROXIES` (a deployment without a proxy can list `127.0.0.1/32`
  on purpose), `otp_max_attempts > 5`, and the OTP and SMS limits above their defaults unless a deliberate
  `DSBA_ALLOW_RAISED_LIMITS=true` is set.

---

## Earlier findings, re-checked

- **SEC-1 (fixed).** `is_moderator()`/`is_admin()` require an active account; `get_moderator`/`get_admin` depend on
  `get_active_user` (`core/security.py:304-325`); `tests/core/test_roles.py` passes. The web app now hides powers from
  a suspended rep too (`627309f`).
- **SEC-2 (fixed as decided in D4).** `services/otp.py`: 15 wrong codes lock that network (IP or /64) out of that
  address for a day; 15 from anywhere switch the address to 10-character codes (about 50 bits); `test_lockout.py`
  passes. *Residual (accepted, not a new finding):* the per-address limit of 5 codes an hour can be spent by anyone,
  so an attacker rotating networks (IPv6 /64s are cheap) can keep an address waiting an hour at a time and fill its
  inbox; and 50 texts an hour to random +973 mobiles pause texts for everyone (email keeps working). A one-time
  sign-in link by email (SEC-2's second fix) would remove the first.
- **SEC-3 (fixed).** `web/src/ui/safeHref.ts` refuses whitespace (Unicode and zero-width included), control
  characters and backslashes anywhere, and an internal path must resolve to the probe origin. Search results and
  notifications use `safeInternalPath()`; the forum, newsletter and career go through `safeHref()`.
- **SEC-4 (fixed).** `react-router-dom` 7.18.4 (past every advisory listed), `vite` 7.3.7, `rollup` 4.64.5;
  `npm audit` and `npm audit --omit=dev`: 0 vulnerabilities. `api/requirements.txt` carries hashes and
  `api/Dockerfile` installs with `--require-hashes`.
- **SEC-5 (fixed).** Unchanged; `tests/core/test_errors.py` and `test_headers.py` pass.
- **SEC-6 (fixed).** `Standfirst` 2,000 characters, `editors` at most 12 of 80, `_check_size()` caps the whole issue
  at 256 KB on create and update (`schemas/newsletter.py`, `services/newsletter.py:170`).
- **SEC-7 (fixed on MinIO).** Live against the Docker stack's MinIO: a body over the declared size answers 400
  `EntityTooLarge`, another key and another `Content-Type` 403 `AccessDenied`, the right one 204. Run the same three
  against the production bucket once it exists (AWS S3 enforces POST policies the same way).
- **SEC-8 (fixed).** `web/src/lib/analytics.ts`: `autocapture: false`, `disable_session_recording`, no flags or
  remote config, no CDN scripts, `person_profiles: 'identified_only'` without `identify()`, masked text and
  attributes, `ip: false`, page views only. Whether to switch it on at all stays Mohamed's call.
- **SEC-9 (fixed; see SEC-16).** `sessions.require_step_up()` guards adding, changing and removing identifiers and
  `DELETE /me` (10 minutes after a sign-in or a step-up code to an existing identifier); `test_step_up.py` passes.
  Admins can recover an account (`PATCH /admin/users/{id}`), audited, all sessions ended, notice to the old address.
  The admin side has no step-up: SEC-16.
- **SEC-10 (fixed).** `forum/images.py` attaches only the author's own images; `uploads.can_view_image()` serves
  others only while the owning post is readable; `test_media.py` passes.
- **SEC-11 (fixed; nit left).** NFKC, one script per word, a TR39-style skeleton before the staff-word check. Refused:
  `Аdmin`, `Student Rеp`, `DSBА Team`, `Αdmin`, `Admın`, `Adrnin`, `Adm1n`. Still accepted: `A d m i n`, `Ad-min`,
  `Mod erator`. Compare the skeleton with spaces, dots, hyphens and apostrophes removed as well. Low risk: the staff
  pill is shown only for real staff.
- **SEC-12 (fixed).** `forum/visibility.py:98` looks a UUID up as an id first.
- **SEC-13 (fixed).** `complete` still copies with `if_match`, then checks the copy (`services/uploads.py:253`).
- **SEC-14 (partly fixed).** At most 10 pending files per student (`too_many_pending`, under a lock); files of
  rejected or removed items are deleted by the sweep after a week. The site-wide daily upload budget waits on
  Mohamed ("Waiting on Mohamed" in STATUS.md).
- **SEC-15 (fixed).** `forum/threads.py:129` keeps a hidden thread hidden when deleted and `moderate_thread` gives
  it back as deleted; the same for replies; `test_hidden_posts.py` passes.

The design review's findings 1 to 23 stand as recorded in the round 2 table below, re-checked in the code: still
fixed, with two still open in part: **10** (backups: SSE only, not encrypted to an offline key, and the default
`DSBA_BACKUP_KEEP=14` needs a key that can delete) and **19** (now complete: SEC-6 is fixed).

## What rounds 2 and 3 added: checked and sound

- **Email outbox and mail worker** (`services/outbox.py`, `mailer.py`). Rows are queued in the caller's transaction,
  claimed with `FOR UPDATE SKIP LOCKED`, subjects are folded to one line (no header injection; `email.message` would
  refuse a line break anyway), bodies are plain text, logs show only masked addresses. A notification email is
  cancelled when the account is gone, its address changed or the switch is off; the account's queued emails cascade
  with it. Volume and content are SEC-17 and SEC-18.
- **Step-up** (`sessions.require_step_up`, `/me/step-up`). Step-up codes are sign-in codes bound to the account
  (`_bound_to`), so they can't sign anyone in and sign-in codes can't step up; success renews the session (new token,
  new CSRF cookie). Adding an identifier checks step-up when the code is sent; its code is bound to the account.
- **Lockouts** (D4): see SEC-2. Attempts are counted atomically before the comparison; only the newest code works;
  a success closes every open code for the address; deleted accounts' challenges stay, anonymised, for the limits.
- **Newsletter form editor.** The API types every block (`schemas/newsletter.py`) and checks every link and picture
  with `core/links.py` (https, mailto or a Hub path; no whitespace, controls or backslashes; pictures only from the
  app or `/api/v1/media/<id>`, which still applies the forum's visibility per reader). The web editor mirrors the rules
  and renders through `safeHref()`/`safeImageSrc()`. Its local copy of unsaved edits uses a `hub.mine.` key, which
  sign-out clears.
- **Pictures** (D9 and the forum). Library jpg/png/webp are checked by their first bytes after the copy and shown
  inline only through `preview_link()` (PDF and the allowlisted images); forum images as before. No SVG anywhere.
- **The Drive import** (`services/drive.py`, `drive_import.py`, `scripts/seed-real.sh`). The key travels only in
  `X-Goog-Api-Key`, never in a URL (httpx logs URLs); redirects are followed only to Google's API host (with the key)
  or `*.googleusercontent.com` (without it); `scrub()` takes the key and the service account's token out of every
  message; the key reaches only the import's own container, passed by name (`-e DSBA_GOOGLE_API_KEY`), never on a
  command line, and is not in `compose.prod.yaml`'s API environment. Drive's answers are treated as untrusted: ids
  and resource keys must match `[A-Za-z0-9_-]{1,100}` before they reach a query or header, JSON is read with a cap,
  downloads are counted against the limit whatever Drive announces, the first bytes are checked with the uploads'
  own `looks_right()`, the stored type is the allowlist's. Names lose control and format characters; the storage key
  is `library/drive/<module id>/<file id>/<safe_file_name>`, all three parts checked, so no traversal. Titles and
  descriptions are React text. Note for operators: the import publishes without review whatever is in the linked
  folders, so a folder linked by a rep is trusted like a rep's upload; read the plan before answering "y".
- **The e2e override:** see SEC-20.
- **The data router.** No `returnTo`/`next` parameter exists; programmatic navigation uses fixed paths, the file
  viewer's `backTo` comes from history state (not from the URL), the command palette navigates only to
  `safeInternalPath()` results and opens only fixed external URLs. React Router 7 also keeps `//host` in the path.
- **Secrets.** `git grep` for keys, tokens and passwords finds only the documented development defaults; `.env` is
  ignored by git and both Docker builds; `.env.example` holds placeholders.

## Design review: access

Of `docs/superpowers/specs/2026-10-13-access-roles-and-feature-switches-design.md`, before it is built. The shape is
right: the code checks boxes, never role names; admin-only powers can't be ticked on another role; a suspended
account has no boxes; switches are enforced by the API and read on every request. These are the rules it still needs
written into the spec and its testing list. Severities are for the built feature if the rule is missed.

### AD-1. Admin-only powers need a step-up (major; carries SEC-16 over)

Giving and taking roles, editing roles, flipping switches and account recovery are exactly what a stolen admin
session would use to keep itself in. Require `sessions.require_step_up()` on `PUT /admin/users/{id}/roles`,
`POST/PATCH/DELETE /admin/roles…`, `PUT /admin/features/{feature}` and the recovery fields of
`PATCH /admin/users/{id}`, and refuse recovery on an account that holds Admin. **Test:** each answers 403
`step_up_required` with a session older than 10 minutes.

### AD-2. `people.suspend` must not see contact details through search (major)

The spec gives `people.suspend` "the people list (names, years, roles, no contact details)". Today's
`GET /admin/users` searches `q` in email and phone (`routers/admin.py:110-117`, substring `ilike`), and `PATCH
/admin/users/{id}` answers `AdminUser` with `email` and `phone`. If the list keeps that search, a holder finds
anyone's address one character at a time (`q=a`, `q=al`, ... and watch who stays in the list), or confirms a guess.
**Rule:** for anyone without Admin, search names only and return a shape without `email`/`phone` from both the list
and the PATCH. **Test:** a `people.suspend` holder searching a person's exact email gets no match, and no response
of theirs contains an `@` or a phone number.

### AD-3. What Student (the role every new account gets) may hold (major)

Accounts are free: anyone with an email address gets Student at sign-in. The spec lets admins edit Student's
boxes, so one wrong tick gives a manager box (`library.manage`: publish without review, see pending files;
`people.suspend`: suspend anyone; `audit.read`) to every stranger who signs up, at once (rule 5). **Rule:** the role
given at sign-in may hold only the "contributor" boxes (`forum.post`, `library.upload`, `newsletter.react`,
`reports.create`, and later ones marked so); the API refuses the others on it (409). **Test:** `PATCH` Student with
`people.suspend` answers 409.

### AD-4. Badges and staff names on custom roles (minor)

A role "may show a badge", and staff words are allowed in the names of people holding "a role with a badge". An
admin's custom role badged "Admin" or "Student rep" (or "Αdmin" in Greek) makes its holders look like staff, and lets
a "Society helper" call themselves "Admin" in the forum. **Rule:** badges are unique, never a built-in role's badge
or one that reads as a staff word after `skeleton()`; only Admin and Rep holders may use staff words in names.

### AD-5. Reports belong to the area that handles them (minor)

`forum.moderate` handles forum reports and `library.manage` library ones, but today `list_reports` returns every
report to every moderator and `resolve_report` checks only the role (`services/reports.py`); report cards carry the
target's excerpt, including the text of hidden posts. **Rule:** list and resolve filter by the target's box
(`thread`/`reply` need `forum.moderate`, `library_item` needs `library.manage`); the badge counts on `/manage` too.
**Test:** a `library.manage`-only holder gets no forum report and 404 resolving one.

### AD-6. Switches must close the side doors, not only the feature's own routes (minor)

The testing list checks "every protected endpoint" with the feature off, which leaves out the public GETs and the
paths that belong to a feature without being under its prefix: `/search` (stated), `/media/{id}` (forum images),
`POST /uploads` with `forum_image` or `library`, `/library/items/{id}/download` and `/file`,
`/calendar/feed.ics` and `/events/{id}.ics` (calendar apps poll them), `/modules/{id}` library counts,
`/admin/stats`, the reports queue and `POST /reports` for a switched-off target, and emails: a notification of a
switched-off feature already in the outbox (or `notify_all` on publish) still goes out. **Rule and test:** every
route declares its feature or is on a short reviewed list of feature-less routes; a test walks the router table (as
this review did) and fails on an undeclared route. The outbox drops emails whose feature is off when their turn
comes, as it does for a switch turned off.

### AD-7. The last-admin rule needs a lock, and covers deletion (minor)

"The last active admin can't lose it or be suspended" is a check-then-act: two admins removing each other's Admin at
the same moment both pass the count. And the last admin can still `DELETE /me`, or lose the account to recovery.
**Rule:** take an advisory lock (`ratelimit.lock(db, "admins")`) around every change that can remove an active admin
(roles, status, deletion), count inside it, and refuse `DELETE /me` for the last active admin (409 `last_admin`).
**Test:** two parallel requests, one admin left.

### AD-8. Newsletter publishing is a mass-email power (minor; carries SEC-18 over)

`newsletter.manage` is planned for a new "Newsletter manager" role. With D1, each publish emails every account. Put a
daily cap on cohort emails (or keep "publish" admin-only and let managers write drafts) before the box spreads.

### AD-9. What the testing list should add

- "No route lets a non-admin gain a box" needs the concrete cases: a holder of every box calling `PUT
  /admin/users/{self}/roles`, `PATCH /admin/roles/{their own role}`, creating a role and asking for it, and
  `PATCH /admin/users/{self}` with `status` (all 403).
- A suspended holder of every box, and a person with no roles, on every write (403) and on hidden posts, pending
  files and drafts (404), not only on the endpoints that had `Moderator` before: today's 25 inline `is_moderator()`
  calls are where a missed conversion leaks (`is_moderator()` returning True for a non-moderator was SEC-1).
- `/me` and `UserPublic` never show another person's roles beyond the badge (`UserPublic.badge` only).
- Every admin-only and box-granting change is audited with before and after, and the person is notified (rule 6),
  including role changes made by deleting a role that people hold.

## Top three things to do

1. **Step-up on admin powers (SEC-16, AD-1).** One line in `update_user` today, and the same rule on every admin-only
   route of the access work. It closes the one path from a stolen session to permanent control of the Hub.
2. **Write the access rules into the spec before `round4/access` starts (AD-2, AD-3, AD-5, AD-6).** Contact details
   stay admin-only (no email or phone search for `people.suspend`), the role every sign-up gets can't hold manager
   boxes, reports follow their area's box, and a router-table test makes every route declare its feature.
3. **Cap and clean the Hub's emails (SEC-17, SEC-18).** One reply email per thread until it is read, one cohort email
   per day, no links quoted from students or reps. This protects the sending domain that carries every sign-in code.

Then: SEC-20 (refuse an empty `DSBA_TRUSTED_PROXIES` and raised limits in production), SEC-19, the SEC-11 nit, and the
open parts of design findings 10 (backups to an offline key) and SEC-14 (the upload budget, Mohamed's call).

**For whoever fixes these:** `api/tests/test_sec_review_r3.py` asserts that each problem exists, so each test fails
once its finding is fixed. Turn it into the opposite assertion in the area's own tests and delete the file. Not done
in this review: `pip-audit` (it timed out here; the lockfile is unchanged in substance since round 2's clean run),
the upload policy on AWS S3 (proved on MinIO), and a browser pass over the new editor (code read only).

---

# Round 2 record (as written then; statuses above supersede it)

## Round 2 findings

### SEC-1. Suspended moderators could still remove library files and read pending items and drafts (major, fixed)

- **Owner:** content, LEAD (`core/security.py`).
- **What it was:** `is_moderator()` checked the role only, and it decided moderator rights outside the `Moderator`
  dependency: `library.can_see/can_edit/_visible_statuses/remove`, `newsletter.can_see` and `include_drafts`. With
  `DELETE /library/items/{id}` on `CurrentUser`, a suspended rep (`sec-suspmod`) removed a published item (204, file
  deleted from the bucket), read someone's pending upload (200), listed `?status=pending` and read both newsletter
  drafts; `POST /library/items/{id}/review` also answered 200 and published an item.
- **Status: fixed.** `is_moderator()` and `is_admin()` now require an active account and `get_moderator`/`get_admin`
  depend on `get_active_user`. Re-tested: as `sec-suspmod`, pending item 404, review queue empty, no drafts, review
  403, `DELETE` 403, forum moderation 403; a suspended admin (`sec-suspadmin`) gets 403 on `/admin/users`,
  `/admin/audit`, `PATCH /admin/users/{self}` and `PUT /career`.

### SEC-2. Anyone can lock any account out of sign-in for 24 h (minor)

- **Owner:** accounts (`services/otp.py`).
- **Where:** `services/otp.py:241` `_failed_codes_wait()` and the daily cap (`:216`) count per address only.
- **Why it matters:** the lockout from design finding 9 works, but it is keyed on the address alone, so it is also a
  switch anyone can flip: knowing a classmate's email or phone (class lists, WhatsApp groups) is enough to stop them,
  a student rep or an admin from signing in on any new device for 24 hours, every day. No account is needed. Ten
  code requests (the daily cap) do the same. Existing sessions keep working and reading stays public, hence minor;
  it hurts most in exam weeks and when a rep has to moderate from a lab PC. Related: per-address limits don't slow
  an attacker who sprays guesses across many addresses (15 a day each); only the per-IP limit does, and IPv6 /64s
  are cheap.
- **Reproduce** (done on `sec-lockvictim@example.com` from a guest browser, about 90 s): 3 x
  `POST /api/v1/auth/otp {"identifier": "<victim>"}` 30 s apart, each followed by 5 wrong
  `POST /api/v1/auth/otp/verify`; the victim's own request then answers
  `429 rate_limited "Too many wrong codes were entered for this address. Try again in 24 hours."` (`retryAfter` 86307).
- **Fix:**
  - count the 24 h failure lock per (address, IP bucket) at 15, and keep a per-address ceiling high enough that only a
    distributed attack reaches it (for example 60 a day: about a 2 % chance a year of guessing one address's code);
  - when an address is locked or over its daily cap, still let its owner in another way: email a one-time sign-in link
    (a 128-bit token, not guessable) instead of a 6-digit code;
  - log a warning when an address is locked, and when failed codes across the site pass a threshold (for example 200
    an hour): that is the alarm for spraying.

### SEC-3. `safeHref()` still accepts `/\t/host` as an internal link (nit; was minor, server part fixed)

- **Owner:** frontend-accounts (`web/src/ui/safeHref.ts:15`).
- **What it was:** browsers delete tabs and newlines inside URLs, so `"/\t/evil.example/signin"` becomes
  `//evil.example/signin`. The shared `safeHref()` treats it as an app path, and the server's `check_links()` didn't
  look at a CTA's `to` at all. As `sec-mod` I created an issue with
  `{"type": "cta", "label": "Confirm on the Hub", "to": "/\t/evil.example/signin"}` (201); the draft rendered
  `<a href="/\t/evil.example/signin">`, and a click in Chromium went to `http://evil.example/signin`. `javascript:` and
  `http://` in `to` were stored too (the reader hid the first).
- **Status: server part fixed.** `check_links()` now checks `to`, and `safe_link()` refuses whitespace, control
  characters and backslashes anywhere: the same requests now answer 422 (`sections.0.blocks.0.to`), and so do
  `javascript:`, `http://` and `https://example.com\@evil.example`. My test issue is deleted.
- **Still open (defense in depth):** `safeHref()` itself still accepts the tab form, and it also guards the career
  pages, notifications and search results. Move the forum's rule (`features/forum/lib/links.ts`
  `SPACE_OR_CONTROL`) into `safeHref()`: return `null` when the string has whitespace, a control character or a
  backslash anywhere, and for an internal path also require `new URL(s, location.origin).origin === location.origin`.

### SEC-4. React Router 6.28 has open-redirect advisories; Vite dev-server advisories (minor)

- **Owner:** LEAD (`web/package.json`, lockfile).
- **Where:** `react-router-dom@6.28.0` / `@remix-run/router@1.21.0`; `vite@5.4.11` (`esbuild@0.21.5`, `rollup@4.27.2`).
- **What:** `npm audit --omit=dev` rates the three router packages high, for four advisories about
  `<Link>`/`useNavigate` with untrusted paths: GHSA-9jcx-v3wj-wh4m (external redirect via untrusted paths, fixed
  in 6.30.2), GHSA-2j2x-hqr9-3h42 (`//` paths, fixed in 6.30.4 / router 1.23.3), GHSA-2w69-qvjg-hvjx (XSS via open redirect,
  router <= 1.23.1), and GHSA-wrjc-x8rr-h8h6 (backslash paths, range up to 7.18.0). The app passes moderator and
  user content to these APIs (forum links, newsletter, career, notifications, search), so its own path checks are the
  only guard (see SEC-3). The full audit lists 20 issues (12 high); the others are build or dev-time: Vite (any
  website can read the dev server's responses; `server.fs.deny` bypass with `?raw??`), rollup path traversal,
  postcss, nanoid, brace-expansion, minimatch. `dompurify` (low) comes with `posthog-js`. `uvx pip-audit` on
  `requirements.txt` and on the dev environment: no known vulnerabilities.
- **Fix:** `npm install react-router-dom@^6.30.6` and plan the v7 move for GHSA-wrjc. Vite 5.4.21 (the last 5.x)
  fixes the dev-server advisories except the optimized-deps `.map` path traversal and two Windows-only ones, which
  need Vite 6.4.3+ or 7; refresh the lockfile so rollup resolves to 4.59+. Export `requirements.txt` with hashes
  (`uv export --no-dev` without `--no-hashes`) and install it with `pip install --require-hashes` in `api/Dockerfile`.

### SEC-5. NUL bytes and huge offsets turned reads into 500s (minor, fixed)

- **Owner:** content, LEAD (`core/errors.py`, `core/pagination.py`).
- **What it was:** `GET /search?q=a%00b`, `/library/items?q=a%00b`, `?module_id=%00` (library, calendar),
  `/library/items/%00`, `/newsletter/issues/%00`, `/modules/%00`, `?offset=99999999999999999999` (forum, library), and
  a NUL in a moderator's calendar, link or issue title or in `PUT /me/progress/resume` all answered 500 with a full
  traceback (SQL and parameters) in the log and without the security headers.
- **Status: fixed.** `ControlCharactersMiddleware` answers 400 `bad_request` for control characters in the path or
  query, `Offset` is capped at 100,000 (422), a `DataError` from the database answers 422 without logging the SQL,
  and the 500 handler adds the security headers. Re-tested: all of the above answer 400 or 422. Side effect for the
  web app (nit): a tab pasted into a search box now answers 400 "This address has characters it can't have"; the
  search inputs could replace control characters with spaces before calling the API.

### SEC-6. Newsletter `dek`, `summary` and `editors` have no size limit (minor)

- **Owner:** content (`schemas/newsletter.py` `IssueCreate`/`IssueUpdate`, `services/newsletter.py:203`
  `check_issue_content`).
- **What:** sections are capped at 256 KB and the cover at 16 KB, but `dek`, `summary` and `editors` are not: an
  issue with 600 KB in `dek` or 2 MB in `editors` is accepted (201) by the API. In production Caddy caps request
  bodies at 1 MB, so each write is bounded, but `GET /newsletter/issues` returns every issue's `dek`, `summary` and
  `editors` with no pagination, and the text goes into `search_vector`. Design finding 19 asked for 256 KB per issue.
- **Fix:** `dek` and `summary` `max_length=2000`, `editors` at most 12 names of 80 characters, and a 256 KB cap on
  the whole issue's JSON.

### SEC-7. The dev stack can't prove the upload policy (nit; was minor, R2 part fixed)

- **Owner:** LEAD (deployment).
- **What:** the presigned POST is right (exact key `incoming/<id>`, exact `Content-Type`, `content-length-range`
  [1, declared size], 5 minutes), but moto accepts a POST with another key, another type or a larger body (all 204),
  so the shared dev stack never shows the policy working. The API doesn't depend on it (`complete` copies from
  `incoming/<id>` and checks the copy's size and first bytes), but the policy is what stops a 5 GB upload. The R2 half
  of this finding is settled: `DEPLOYMENT.md` now says R2 is not supported because it has no presigned POST.
- **Fix:** before launch, run the same three POSTs against MinIO (`compose.yaml`) or the production bucket: another
  key, another type, and a body over the declared size must each be refused.

### SEC-8. PostHog analytics: off today, unsafe defaults when switched on (minor)

- **Owner:** LEAD (`web/src/main.tsx:28`), frontend-accounts.
- **What:** `PostHogProvider` gets only `api_host` when `VITE_POSTHOG_KEY` is set at build time. PostHog's defaults
  then autocapture clicks with element text, and session replay follows the project's remote settings: the account
  page shows the student's email and phone number. `DEPLOYMENT.md` now lists the CSP sources it needs, but not the
  privacy settings. It sends students' browsing to a US host. (A project key, `phc_1CG2…`, is in the history of
  `src/legacy/main.v1.jsx`; PostHog keys are public by design, but rotate it if that project is reused.)
- **Fix:** decide it with Mohamed before launch. If kept: `autocapture: false` (or `mask_all_text: true`),
  `disable_session_recording: true`, `person_profiles: 'identified_only'`, never `identify()` with an email or phone
  number, and `ip: false`.

### SEC-9. A stolen or forgotten session can take the account over for good (minor)

- **Owner:** accounts (`routers/me.py:110` `start_add_identifier`, `:137` `verify_add_identifier`, `:175`
  `remove_identifier`).
- **What:** replacing the email or phone number needs only the session and a code sent to the *new* address. Whoever
  holds a session (a lab PC where the owner forgot to sign out; sessions last 30 days) can put their own email on the
  account and remove the phone number. The design's fix for finding 15 is in place (a notice to the old address, other
  sessions revoked), but the revocation now signs the real owner out, and the notice says "contact a student rep",
  who has no way to give the account back: no endpoint changes another user's identifier.
- **Reproduce:** with a session of the victim: `POST /api/v1/me/identifiers/otp {"identifier": "<attacker's address>"}`,
  verify with the code from that inbox, then `DELETE /api/v1/me/identifiers/<the other kind>`. The account now signs
  in only with the attacker's address, and the owner's other browsers are signed out. (Done live up to the
  verification on `sec-alice`, adding a phone number: her other session was revoked at once; the removal step is
  `routers/me.py:175`, which asks for nothing else.)
- **Fix:** ask for proof of an address the account already has before replacing or removing one: for a change (or a
  removal), first send a code to the current identifier, or accept it only from a session less than 15 minutes old.
  Give admins an audited recovery action (`PATCH /admin/users/{id}` with `email`/`phone`). A "This is a shared
  computer" choice at sign-in, giving a cookie without `Max-Age` and a 12-hour session, would shrink the lab-PC case.

### SEC-10. Another student's post kept a removed picture public (minor, fixed)

- **Owner:** community, content.
- **What it was:** `release_images()` kept an image `attached` while *any* post contained its URL, and `/media` served
  every `uploaded` or `attached` forum image. `sec-alice` posted a photo, `sec-bob` re-posted its URL (his thread even
  used it as its thumbnail), alice edited it out and deleted her thread: the image stayed public.
- **Status: fixed.** An image now belongs to its uploader's post (`uploads.thread_id`/`reply_id`, migration 0002),
  `release_images()` only looks at the uploader's posts, and `/media` serves an image to others only while that post is
  visible. Re-tested: an uploaded but unposted image is 404 to a guest (302 to its uploader); in a visible thread 302;
  owning thread hidden: 404 to guests and to the student who re-posted it, 302 to a moderator; unhidden: 302; edited
  out by its owner while bob's copy still links it: 404.

### SEC-11. Staff-name rule is bypassed with look-alike letters (nit)

- **Owner:** accounts (`services/accounts.py:130` `clean_display_name`).
- **What:** "Admin", "DSBA Team" and "Student Rep" are refused for students, but `"Аdmin"` (Cyrillic А),
  `"Student Rеp"` (Cyrillic е), `"DSBА Team"`, `"Αdmin"` (Greek Α) and `"Admın"` (dotless ı) are
  accepted (`PATCH /api/v1/me`, all 200). The forum shows the real "Student rep"/"Admin" pill only for real staff,
  which limits the damage.
- **Fix:** compare a confusables skeleton (Unicode TR39: map Cyrillic and Greek look-alikes and `ı` to Latin before the
  `STAFF_WORDS` check), or refuse names that mix Latin with Cyrillic or Greek letters in one word.

### SEC-12. A thread's slug can be another thread's id and shadow it (nit)

- **Owner:** community (`services/forum.py:437` `thread_by_slug`, `:959` `_thread_slug`).
- **What:** a thread titled with another thread's UUID gets that UUID as its slug, and `GET /forum/threads/{slug}`
  tries the slug before the id, so a link of the form `/forum/<id>` (the API documents it; `LiveLists` falls back to
  it) opens the impostor.
- **Reproduce:** as `sec-bob`, `POST /api/v1/forum/threads {"title": "283e7029-d173-4b58-a57a-702c019024fc", ...}`
  (the id of a `sec-alice` thread); `GET /api/v1/forum/threads/283e7029-…` returned bob's thread. (Deleted since.)
- **Fix:** look the value up as an id first when it parses as a UUID (as `library.find` does), or never generate a
  slug that parses as a UUID (append `-thread`).

### SEC-13. `complete` checked one version of the file and copied another (minor, fixed)

- **Owner:** content, LEAD (`services/storage.py`).
- **What it was:** `complete` HEADed `incoming/<id>`, read its first KB, then copied it, while the presigned POST for
  that key stayed valid. Re-POSTing other bytes during `complete` stored them under the checked name: 6 tries, 6 RTF
  files stored as `race.pdf`.
- **Status: fixed.** `complete` now copies first (tied to the HEAD's ETag where the store supports it), then checks
  the size and first bytes of the copy, which no presigned policy can write; the POST lives 5 minutes. Re-tested
  with the same race: 2 of 5 answered `mismatch`, 3 stored the real PDF, none stored the swapped bytes.

### SEC-14. No cap on what waits for review, and rejected files are never deleted (minor)

- **Owner:** content (`services/uploads.py`, `services/library.py:453` `review`).
- **What:** the only limit is 20 uploads per account per hour, up to 50 MB each, and accounts are free (an email each;
  the per-IP limit allows about 30 new accounts an hour). An upload turned into a pending item is `attached`, so the
  daily sweep never touches it, and rejecting it keeps the object. One person can park about 1 GB an hour per account
  in the bucket and in the reps' queue, and nothing alerts anyone.
- **Fix:** delete the object when an item is rejected (keep the row and the note); allow at most 10 pending items per
  uploader (409 `too_many_pending`); keep a site-wide daily budget of uploaded bytes (for example 2 GB) that answers
  429 and logs a warning when reached.

### SEC-15. Deleting a hidden thread makes its title and replies public again (major)

- **Owner:** community (`services/forum.py:1185` `delete_thread`; also `:1415` `delete_reply`).
- **Where:** `delete_thread()` sets `status = deleted` whatever the status was, and `can_see_thread()` (`:404`) shows
  a deleted thread to everyone while it has visible replies. The thread page offers moderators "Delete" on a hidden
  thread (`web/src/features/forum/ThreadPage.tsx:381`, `canEdit && !deleted`).
- **Why it matters:** reps hide a thread because of what it says (harassment, someone's phone number in the title, a
  pile-on in the replies). "Delete" looks like the stronger, tidier action, but it publishes the title, the author
  and every visible reply again, to guests too, and puts it back in the forum list and its search (by title). The
  audit log shows a hide then a delete, so nobody notices. A hidden reply that a rep deletes also reappears as a
  "deleted" placeholder with its author, without its text (code: `_set_reply_status(..., deleted)`).
- **Reproduce:** as `sec-alice`, create a thread; as `sec-bob`, reply; as `sec-mod`,
  `POST /api/v1/forum/threads/{id}/moderate {"status": "hidden"}` (guest: 404), then
  `DELETE /api/v1/forum/threads/{id}` (204). As a guest, `GET /api/v1/forum/threads/<slug>` -> 200
  `status: deleted`, the title, and bob's reply in full; the thread is listed in `GET /forum/threads` again.
  (Done on `sec-test-zebrafinch-hidden-thread`, hidden again afterwards.)
- **Fix:** deleting a hidden post keeps it hidden: in `delete_thread()` and `delete_reply()`, when the post is hidden,
  clear the body and audit the delete but leave the status `hidden`; and make "unhide" restore `deleted` in that case
  (for example, `_status_before_hide()` returns `deleted` when a `forum.*.delete` entry is newer than the last hide).
  Test: hide, delete, then a guest and the author get 404, the list and search don't show it, and unhiding gives
  `deleted`.

---

## Checked and sound

Live against the dev stack unless marked (code) or (tests); re-checked after the lead's changes where they apply.

- **Sign-in codes.** 6 digits from `secrets`, stored as HMAC(secret, "<challenge>:<code>"). 20 parallel wrong codes
  on one challenge: 4 x `invalid_code` + 16 x `too_many_attempts`, `attempts = 5`, and the right code is refused
  afterwards. A used code answers `code_expired`; a new code retires older ones (tests). A sign-in challenge is refused
  by `/me/identifiers/verify` and an add-identifier challenge by `/auth/otp/verify` (410, without burning a try);
  another user's add-identifier challenge: 410. Resend cooldown and rate-key folding: `sec.fold+one@gmail.com` then
  `secfold+two@googlemail.com` -> 429 "Wait 30 seconds". Texts: US numbers, Bahraini landlines and 8000 numbers -> 422
  `sms_unavailable`. Per-IP and IPv6 /64 limits, the text budget and the advisory locks: `test_sign_in.py` and
  `test_otp_races.py` pass (47 tests); I didn't exhaust the shared IP's quota on purpose.
- **No enumeration.** `POST /auth/otp` never reads `users` (code) and answers the same shape for any address;
  `POST /me/identifiers/otp` for an address another account uses answers the same 202 and sends that inbox a notice
  instead of a code; `identifier_taken` only comes after a correct code. Rate-limit messages are the same for unknown
  addresses.
- **Sessions.** Sign-in sets a fresh token (`HttpOnly; Path=/; SameSite=lax`; in production `Secure` and `__Host-`),
  revokes the browser's previous session (old cookie -> 401) and replaces the CSRF cookie; a cookie value the server
  never issued is ignored, so fixation fails. Logout revokes the row. Adding a phone revoked the account's other
  session and sent a notice to the email. Someone else's session or notification id: 404. Removing the last identifier:
  409.
- **CSRF.** Without the cookie, without the header, with a mismatched header, or with a header but no cookie: 403
  `csrf_failed` (sign-in verify included, so login CSRF fails); a cross-site `text/plain` POST: 403. After the lead's
  change the token is bound to the session: a planted cookie with a matching header -> 403 (the refusal carries the
  right cookie, and the web app's single retry then succeeds); a guest's valid token reused with a session -> 403.
  CORS answers only the configured origins (`https://evil.example`, `null`: no `Access-Control-Allow-Origin`).
- **Client address.** With the image's flags (`--no-proxy-headers`, `DSBA_TRUSTED_PROXIES=127.0.0.1` on a scratch
  instance): `X-Forwarded-For: 203.0.113.9` from the proxy -> 203.0.113.9; `198.51.100.7, 203.0.113.10` ->
  203.0.113.10 (the client-written left part is ignored); a junk rightmost hop -> no address. Before the change, the
  Dockerfile's `--forwarded-allow-ips "*"` let any client choose its address.
- **Roles.** `PATCH /me` ignores `role`, `status`, `email` and `id`; `/admin/users`, `/admin/audit` and
  `PATCH /admin/users/{id}`: 403 for students and moderators; an admin can't change their own role (409);
  `PUT /career`: 403 for moderators. `/admin/reports` hides the reporter from moderators. Suspended and profile-less
  accounts get 403 on threads, replies, votes, reports and uploads; suspended reps and admins on every moderation and
  admin route (SEC-1).
- **Forum visibility.** A hidden thread (and its replies) is 404 by slug and id for guests, its author and its
  repliers, and absent from the list, `?q=` (title, body and reply words), `mine`, `hot`, `related` and `/search`;
  vote, reply, accept, report, edit and delete answer 404. A hidden reply in a visible thread: not in the thread, not
  matched by search, 404 on vote, edit and child replies. Author delete empties `body` in the database. Editing or
  deleting someone else's post: 403. (The exception is SEC-15.)
- **Rendering** (Chromium). A post with `javascript:`, `JaVaScRiPt:`, `vbscript:`, `data:`, `//host`, `/\host`, raw
  `<script>`, `<img onerror>`, `<a href="javascript:">`, an autolink, a remote image and a media URL with a query: no
  dialog, no request off the origin, no link off the origin except the plain external `https://` one (new tab,
  `noopener noreferrer nofollow ugc`, host shown). Only the exact `/api/v1/media/<uuid>` picture loads. A title of
  `<img src=x onerror=…>` stays text on the page, in lists, `<title>`, notifications and the command palette; search
  pages with `"><svg onload=…>` in `?q=`: no dialog. Report notes, review notes and file names are React text.
- **CSP** (`web/deploy/Caddyfile`). I built the app, served it with the Caddyfile's policy (its theme-script hash from
  `csp-hashes.mjs`, the dev bucket as `DSBA_BUCKET_ORIGIN`) and opened Home, Forum, a thread with a picture, a PDF
  preview, a module, an issue, Calendar, Account and Grades signed in: no violation, the theme script ran, and a
  script injected into the DOM was refused. API answers carry `default-src 'none'`, `nosniff`, `no-referrer`, `DENY`
  and `no-store`, 500s included.
- **Library visibility.** A pending item is 404 for guests and other students by id and slug, on `download`, `file`,
  star, report, edit and delete, and absent from the list (`status=pending` is ignored for students), `?q=` and
  `/search`; its uploader sees it with `mine`. A removed item's `download` and `file`: 404 even for moderators.
  Another student's upload id in `POST /library/items`: 404; the same upload twice: 409.
- **Uploads.** The presigned POST pins the exact key `incoming/<id>`, the exact `Content-Type` and
  `content-length-range` [1, declared size] for 5 minutes; 8 MB images, 50 MB files. SVG, HTML, JavaScript, an image
  type on a PDF name and an extension-less name: 422. On `complete`, an HTML file posted as `.png`, a non-zip `.docx`
  and a body larger than declared: 422 `mismatch`; another user's `complete`: 404. Re-POSTing after `complete` doesn't
  touch the stored object. File names lose folders, CR/LF, NUL and bidi controls; keys use a cleaned ASCII name.
  Downloads are `attachment` with the allowlist's type; previews are `inline` only for PDF; `/media` only for forum
  images (a library upload id: 404). 30 parallel presigns: exactly 20 accepted. `incoming/` has a one-day lifecycle
  rule.
- **Account deletion.** `DELETE /me` deleted the forum picture (media 302 -> 404), the sessions (old token -> 401) and
  the OTP rows, and left the thread as "deleted user".
- **Moderator and admin content.** Students: 403 on issues, calendar and links. In issues and the career document,
  `javascript:`, `data:`, `//host`, a backslash or whitespace in a link, and `http://` in a CTA: 422. Drafts: 404 for
  guests and students. Library links: `http://`, `javascript:`, `data:`, user:password, over 2,000 characters and
  relative or malformed URLs: 422; all 51 seeded links are `https://`.
- **ICS feed.** A title of `x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:injected` and a place with `;`, `,` and a line
  break come out escaped on one line; one `BEGIN:VEVENT` line per event.
- **Injection.** 29 search payloads (quotes, tsquery operators, `%`, `_`, backslashes, unbalanced quotes, long strings)
  on `/search`, the forum and library lists, `module_id`, `tag` and the admin search: no error and no unexpected match.
  Sorts and statuses are enums. The server fetches nothing a user names (no SSRF).
- **Logs and errors.** `api.log` holds no code, token, email or phone number after all of the above; 500s say only
  "Something went wrong on our side."; a database `DataError` is logged without its SQL.
- **Production settings.** `DSBA_ENV=production` (now the image's default) with development values refuses to start
  and names each problem; with real values it starts with `Secure` `__Host-` cookies, no bucket set-up and no
  `/api/v1/docs` or `openapi.json`. `DSBA_WEB_ORIGINS=*` is refused in every environment.
- **Deployment** (code). The API publishes no port; Caddy overwrites `X-Forwarded-For`, caps `/api/*` bodies at 1 MB
  and sends HSTS; backups go to their own bucket with their own key, without `otp_challenges` and `user_sessions`;
  `pg_dump` gets its password from the environment, not the command line; the daily sweep deletes stale uploads, codes
  and sessions; `set-role` is audited.
- **Secrets.** No credentials in tracked files beyond the documented development defaults; `.env` is ignored by git and
  by both Docker builds. `api/Dockerfile` runs as a non-root user; `compose.yaml` publishes Postgres, MinIO, the API and
  Vite on 127.0.0.1 only.
- **Shared computers** (code). Sign-out resets personal queries and clears `hub.mine.*` (grades included) and forum
  drafts; guest progress is imported only after the student says yes.

## Status of the design review's findings

| # | Finding | Status | Notes |
|---|---|---|---|
| 1 | Client IP spoofable via `X-Forwarded-For` | fixed | `client_ip()` reads the header only from `DSBA_TRUSTED_PROXIES`, right to left; image runs `--no-proxy-headers`; verified on a scratch instance |
| 2 | OTP attempts not atomic; not bound to flow | fixed | verified live (20 parallel wrong codes, both directions of flow binding, one code one session) |
| 3 | SMS pumping | fixed | region and mobile-only rules, text budget, advisory locks, /64 buckets, cooldown on both start endpoints; settings now in `config.py`; production requires Twilio or no texts |
| 4 | Suspended moderators/admins keep powers | fixed | including the library and newsletter paths of SEC-1; verified for a suspended rep and a suspended admin |
| 5 | Production settings fail open | fixed | `production_problems()`, `ENV DSBA_ENV=production`, docs off; verified in-process |
| 6 | Uploads swappable after `complete` | fixed | `incoming/` key, copy then check the copy (SEC-13), owner check, idempotent `complete`, 5-minute POST, lifecycle rule |
| 7 | `presigned_get` can serve any type inline | fixed | type and name required; inline only for PDF and raster images |
| 8 | `/media` scope; hidden posts keep images | fixed | forum images only, tied to their post, 404 while it is hidden or deleted (SEC-10) |
| 9 | Slow guessing of one code | fixed | daily cap, 15-failure lock, newest code only; the lock can be abused (SEC-2) |
| 10 | Backups plaintext in the uploads bucket | mostly fixed | own bucket and key, SSE at rest, codes and sessions excluded. Still: SSE is transparent to anyone who can read the backup bucket (the design asked for encryption to an offline key, e.g. `age`), and the default `DSBA_BACKUP_KEEP=14` needs a key that can list and delete backups; make `0` (lifecycle retention, write-only key) the production default |
| 11 | Forum links `//host`, `/\host` | fixed | verified in Chromium |
| 12 | `javascript:` links; no CSP | fixed | renderers use `safeHref()`; CSP in the Caddyfile verified on a built app; the tab form is SEC-3 |
| 13 | Hidden/pending/draft leaks through side endpoints | fixed | verified live across lists, search, hot, related, votes, replies, accept, reports, download, file and star (stats, facets, module counts and reactions by code); except SEC-15 |
| 14 | CSRF not bound to the session; no `__Host-` | fixed | verified live; `__Host-` names in production, the web app reads the name from `VITE_CSRF_COOKIE` and retries once |
| 15 | Enumeration and takeover via identifiers | fixed as designed | always 202, notices, other sessions revoked; residual risk is SEC-9 |
| 16 | Session lifecycle | fixed | rotation, revocation on logout, scoped revoke, 20-session cap (tests) |
| 17 | Deletion, PII retention, bulk email | fixed | hard delete with OTP rows and pictures; daily sweep; publishing an issue creates notifications only (no bulk email) |
| 18 | URL and calendar text validation | fixed | https-only links; link checks in issue and career JSON (now including `to`); ICS escaping; `notify()` keeps only Hub paths |
| 19 | Request size caps | mostly fixed | Caddy 1 MB, progress import caps, issue sections 256 KB, career 512 KB, 20 reports an hour; `dek`/`summary`/`editors` are SEC-6 |
| 20 | Identifier and display-name hygiene | fixed | NFKC, control and bidi characters refused, staff words for students, email rate key, admin identifiers normalised; look-alikes are SEC-11 |
| 21 | Logs and audit gaps | fixed | no codes or tokens in logs, masked identifiers, `set-role` audited, actor and target names snapshotted |
| 22 | Reporter identity visible to reps | fixed | `reporter` only for admins |
| 23 | Shared computers | fixed | cache reset and storage cleared on sign-out; guest progress import asks first |

## Notes for the team

- **Not tested:** load and brute force beyond proving each limit once; exhausting the shared per-IP code quota (the
  tests cover it); the POST policy on a store that enforces it (SEC-7); Caddy itself (I served the built app with its
  CSP through Vite preview instead).
- **Dev environment only:** the shared dev API (`/home/claude/devsvc/start.sh`) runs uvicorn without
  `--no-proxy-headers`, so uvicorn's default trusts `X-Forwarded-For` from 127.0.0.1 there; `api/Dockerfile` and
  `compose.yaml` are right.
- **Test data left in the dev database:** the `sec-*` accounts (`sec-susp`, `sec-suspmod` and `sec-suspadmin` are
  suspended; `sec-lockvictim@example.com` is locked out of sign-in until about 20:00 on 11 October), their uploads
  (swept after a day), and two `sec-test` threads kept as evidence: `sec-test-zebrafinch-hidden-thread` (hidden, for
  SEC-15) and "sec-test thread by deleted user" (hidden). Every other `sec-test` thread, library item, calendar date
  and newsletter issue I created was deleted or removed.
