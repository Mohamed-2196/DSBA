# Security review: the implementation (round 2)

Reviewer: security. Scope: everything under `api/` and `web/src` on `feature/backend`, plus `compose*.yaml`,
`api/Dockerfile`, `web/Dockerfile`, `web/deploy/` and `docs/backend/DEPLOYMENT.md`. Tested live against the shared
dev stack (API :8000, web :5173, moto S3, SMTP sink, SMS files) with my own accounts (`sec-*`), with Chromium
(Playwright) for rendering, and in-process for settings. The lead's security changes landed during the review
(uncommitted, 20:26); everything below was re-tested against them. No application code was changed.

## Summary

The implementation is in good shape. Every blocker and major of the design review is closed, each confirmed live:
atomic code attempts (20 parallel wrong codes leave exactly 5 tries), codes bound to their flow and user, the client
IP taken only from the trusted proxy, suspended reps and admins without powers, production settings that refuse to
start unsafe, a session-bound CSRF token, uploads copied then checked, pictures served only while their post is
visible, and a CSP that stops injected script without breaking a page. No payload ran script or led off-site.
**No blockers. One open major:** a rep who deletes a hidden thread republishes its title and replies (SEC-15).
Open minors: anyone can lock an account out of sign-in for 24 h (SEC-2), a stolen session keeps the account (SEC-9),
React Router advisories (SEC-4), no cap on the review queue (SEC-14), PostHog defaults (SEC-8), newsletter sizes
(SEC-6). SEC-1, SEC-5, SEC-10 and SEC-13 (found this round) are fixed by the lead's changes and verified.

| ID | Severity | Owner | Status | Title |
|---|---|---|---|---|
| SEC-15 | **major** | community | open | Deleting a hidden thread makes its title and replies public again |
| SEC-2 | minor | accounts | open | Anyone can lock any account out of sign-in for 24 h, knowing only its email or phone |
| SEC-4 | minor | LEAD (`web/package.json`) | open | React Router 6.28 has open-redirect advisories; Vite dev-server advisories |
| SEC-6 | minor | content | open | Newsletter `dek`, `summary` and `editors` have no size limit |
| SEC-8 | minor | LEAD (`main.tsx`), frontend-accounts | open | PostHog analytics: off today, unsafe defaults when switched on |
| SEC-9 | minor | accounts | open | A stolen or forgotten session can take the account over for good |
| SEC-14 | minor | content | open | No cap on what waits for review, and rejected files are never deleted |
| SEC-3 | nit (was minor) | frontend-accounts | server part fixed | `safeHref()` still accepts `/\t/host` as an internal link |
| SEC-7 | nit (was minor) | LEAD (deployment) | R2 part fixed | The dev stack can't prove the upload policy |
| SEC-11 | nit | accounts | open | Staff-name rule is bypassed with look-alike letters ("Аdmin" in Cyrillic) |
| SEC-12 | nit | community | open | A thread's slug can be another thread's id and shadow it |
| SEC-1 | major | content, LEAD | **fixed** | Suspended moderators could still remove library files and read pending items and drafts |
| SEC-5 | minor | content, LEAD | **fixed** | NUL bytes and huge offsets turned reads into 500s |
| SEC-10 | minor | community, content | **fixed** | Another student's post kept a removed picture public |
| SEC-13 | minor | content, LEAD | **fixed** | `complete` checked one version of the file and copied another |

---

## Findings

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
