# Security review: design and foundation (round 1)

Reviewer: security. Scope: `docs/backend/ARCHITECTURE.md`, `api/app/core/*`, `config.py`, `main.py`, `db.py`,
`services/{storage,identifiers,notify,audit}.py`, `models/*`, `schemas/*`, the declared routes in `routers/*`,
`cli.py`, `compose.yaml`, `api/Dockerfile`, `.env.example`, and on the web side `features/forum/lib/markdown.js`,
`features/forum/components/Prose.jsx`, `features/newsletter/components/{RichText,Blocks}.jsx`, `api/client.ts`,
`auth/*`, `index.html`. No code was changed. Line numbers refer to the files as of commit `42deff7`.

## Summary

The design is sound: server-generated session tokens stored as SHA-256, HttpOnly + SameSite=Lax cookies, a
double-submit CSRF middleware that also covers sign-in (so login CSRF is blocked), a private bucket with
server-generated keys and exact-key POST policies, `UserPublic` without email or phone, no
`dangerouslySetInnerHTML` anywhere in `web/src`, and `ActiveUser`/`Moderator`/`Admin` on every declared write
that needs one.

The weak spots are in the **sign-in channel**, **file serving** and **links in rendered content**:

- the client IP behind every per-IP limit is chosen by the client (the production image trusts any
  `X-Forwarded-For`), which leaves the SMS channel open to pumping and toll fraud;
- the "5 attempts per code" rule is a read-modify-write that parallel requests can break;
- suspended moderators and admins keep their powers, and production settings fail open;
- an upload can be swapped after it was checked (even after a moderator approved it), and the storage helper
  lets callers serve any type inline;
- the newsletter renderer turns `javascript:` links into live links, so a student rep can run script in the
  app as whoever clicks (an admin included). There is no CSP to catch it;
- backups are plaintext dumps in the uploads bucket, readable and deletable with the API's own key.

**Lead must fix (lead-owned files):** 1, 3 (settings only), 4, 5, 6 (storage part), 7 (storage part), 8 (model
part), 10, 12 (CSP and `index.html`), 14, 17 (sweep), 19 (proxy body limit), 21 (`cli.py`). The "Owner" line of
each finding names who does what. Builders: the checklist at the end maps findings to areas.

| # | Severity | Area | Owner |
|---|---|---|---|
| 1 | blocker | Client IP spoofable via `X-Forwarded-For` | **LEAD** |
| 2 | blocker | OTP attempts not atomic; codes not bound to their flow | accounts |
| 3 | blocker (before SMS goes live) | SMS pumping / toll fraud | accounts, **LEAD** (settings) |
| 4 | major | Suspended moderators/admins keep their powers | **LEAD** |
| 5 | major | Production settings fail open | **LEAD** |
| 6 | major | Uploads can be swapped after `complete` / approval | **LEAD** (storage), content |
| 7 | major | `presigned_get` can serve any type inline | **LEAD** (storage), content |
| 8 | major | `/media/{id}` scope; hidden posts keep public images | content, community, **LEAD** (model) |
| 9 | major | Slow guessing of one person's code over days | accounts |
| 10 | major | Backups: plaintext, same bucket, API's keys | **LEAD** |
| 11 | major | Forum links: `//host` and `/\host` pass as internal | frontend-community, community |
| 12 | major | `javascript:` links in newsletter/career; no CSP | frontend-content, frontend-accounts, content, **LEAD** (CSP) |
| 13 | major | Hidden/pending/draft content leaking through side endpoints | community, content |
| 14 | minor | CSRF token not bound to the session; no `__Host-` cookies | **LEAD**, frontend-accounts |
| 15 | minor | Enumeration and takeover paths in add/change identifier | accounts |
| 16 | minor | Session lifecycle details | accounts |
| 17 | minor | Account deletion, PII retention, bulk email | accounts, content, **LEAD** (sweep) |
| 18 | minor | Server-side URL and calendar text validation | content, **LEAD** (`notify.py`) |
| 19 | minor | Request size caps | **LEAD** (proxy), accounts, content, community |
| 20 | minor | Identifier and display-name hygiene | accounts |
| 21 | minor | Logs and audit gaps | accounts, **LEAD** (`cli.py`) |
| 22 | minor | Reporter identity visible to student reps | community (product call) |
| 23 | minor | Shared computers: cache and guest progress | frontend-accounts, frontend-library |

---

## Findings

### 1. Client IP is attacker-controlled, so every per-IP limit can be bypassed (blocker, LEAD)

- **Files:** `api/Dockerfile` (CMD, line 28), `api/app/core/security.py` `client_ip()` (lines 44-50),
  `config.py` `trust_proxy_headers`.
- **Problem:** the image starts uvicorn with `--proxy-headers --forwarded-allow-ips "*"`. With `"*"`, uvicorn
  0.54 (`middleware/proxy_headers.py`, `always_trust`, line 176) sets `request.client.host` to the **leftmost**
  `X-Forwarded-For` entry, which the client writes. `client_ip()` with `trust_proxy_headers=True` does the same
  thing again. Anyone can send `X-Forwarded-For: <random>` per request: the per-IP OTP limit (the main
  SMS-pumping defence) and the IPs in sessions and the audit log are all fake. A non-IP value
  (`X-Forwarded-For: abc`) also reaches the `INET` columns and turns sign-in into a 500.
- **Fix:**
  - Dockerfile: `CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS:-127.0.0.1}\""]`
    and set `FORWARDED_ALLOW_IPS` in the production compose to the reverse proxy's fixed address (or its Docker
    network). Uvicorn then walks the header right to left and returns the first untrusted hop.
  - `client_ip()`: return `request.client.host` only, and only if `ipaddress.ip_address()` accepts it (else
    `None`). Delete the header parsing and `trust_proxy_headers` (or, if kept, use the **rightmost** entry).
  - Production: the API container publishes no port; only the proxy reaches it. Behind Cloudflare, trust
    Cloudflare's ranges (or read `CF-Connecting-IP` only when the origin accepts nothing else).

### 2. "5 attempts per code" can be broken with parallel requests; verify must be atomic and bound to its flow (blocker)

- **Owner:** accounts (`services/otp.py`, `routers/auth.py`, `routers/me.py`).
- **Problem:** if verify reads the challenge, compares, then writes `attempts + 1`, a burst of a few hundred
  concurrent requests on one challenge all see `attempts < 5`, and the 6-digit space falls in about
  1,000,000 / burst-size tries. Separately, a code must only work for the flow and the user it was issued for.
- **Fix:**
  - Code: `f"{secrets.randbelow(1_000_000):06d}"`. Store
    `hmac.new(secret, f"{challenge_id}:{code}".encode(), "sha256").hexdigest()` (binds the code to its
    challenge, so a hash cannot be reused elsewhere).
  - Count the attempt **before** comparing, atomically, and commit it on its own:
    ```python
    row = db.execute(
        update(OtpChallenge)
        .where(OtpChallenge.id == body.challenge_id,
               OtpChallenge.purpose == OtpPurpose.sign_in,   # add_identifier on /me/identifiers/verify,
               OtpChallenge.consumed_at.is_(None),            # plus OtpChallenge.user_id == user.id there
               OtpChallenge.attempts < s.otp_max_attempts)
        .values(attempts=OtpChallenge.attempts + 1)
        .returning(OtpChallenge.code_hash, OtpChallenge.expires_at, OtpChallenge.identifier, OtpChallenge.channel)
    ).one_or_none()
    db.commit()
    ```
    `None` → read the row only to choose the error (`too_many_attempts` / `code_expired` / `invalid_code`).
    Then check expiry, then `hmac.compare_digest(row.code_hash, expected)`.
  - Consume with a guarded update: `update(...).where(id == ..., consumed_at.is_(None)).values(consumed_at=now)`
    and require `rowcount == 1` (one code, one session).
  - On success, also mark every other open challenge for the same identifier as consumed.
  - Tests: 20 concurrent wrong codes leave `attempts == 5` and answer `too_many_attempts` after the fifth; a
    sign-in challenge is rejected by `/me/identifiers/verify` and vice versa.

### 3. SMS pumping / toll fraud on `POST /auth/otp` and `POST /me/identifiers/otp` (blocker before the Twilio backend goes live)

- **Owner:** accounts (`services/otp.py`, `services/sms.py`, `services/ratelimit.py`); LEAD adds the settings to
  `config.py`.
- **Problem:** `normalize_identifier` accepts any valid number in the world. The limits are per number (5/h)
  and per IP (30/h); a pumping bot rotates numbers inside a premium range and rotates IPs (free today because
  of 1; and one IPv6 client owns a whole /64). Counting rows and then inserting is also racy: a burst of
  parallel requests for one number all pass the count. Every request that passes is a paid SMS.
- **Fix:**
  - Settings (lead): `sms_allowed_regions: list[str] = ["BH"]` (CSV, parsed like `web_origins`; add GCC codes
    only if Mohamed asks), `sms_max_per_hour: int = 50` and `sms_max_per_day: int = 300` (global),
    `otp_max_per_identifier_per_day: int = 10`.
  - A phone identifier gets an SMS only if
    `phonenumbers.region_code_for_number(num) in s.sms_allowed_regions` and
    `phonenumbers.number_type(num) in (PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE)`;
    otherwise 422 `sms_unavailable` ("Use your email address instead.").
  - Global budget: count `channel == 'sms'` challenges in the last hour and day; over budget → 429
    `sms_unavailable` plus `log.warning` (that is the alarm). Email keeps working.
  - Serialise count-then-insert inside the transaction that inserts the challenge:
    `SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))` for `k = "otp:id:<identifier>"`, then
    `"otp:ip:<bucket>"`, then `"otp:sms"`, always in that order.
  - IP bucket: an IPv4 address as is; IPv6 as its /64
    (`ipaddress.ip_network(f"{ip}/64", strict=False)`, counted with `OtpChallenge.ip.op("<<=")(str(net))`).
    When the IP is `None`, count against one shared bucket (`ip IS NULL`); never skip the limit.
  - Enforce the resend cooldown (`otp_resend_seconds`) on the server, and apply all of the above to
    `/me/identifiers/otp` too (it sends SMS), plus a per-user limit there.
  - Deployment note: Twilio Geo Permissions limited to the allowed countries, and SMS Pumping Protection on.

### 4. Suspended moderators and admins keep moderating (major, LEAD)

- **File:** `api/app/core/security.py` `get_moderator()` / `get_admin()` (lines 164-173).
- **Problem:** both depend on `get_current_user`, not `get_active_user`. Suspending a rogue student rep
  (status only) leaves them able to hide posts, publish uploads and edit the newsletter and calendar; a
  suspended admin can still change roles.
- **Fix:** `def get_moderator(user: Annotated[User, Depends(get_active_user)])`, and the same for `get_admin`.
  Test: a suspended moderator gets 403 on `POST /forum/threads/{id}/moderate`.

### 5. Production settings fail open (major, LEAD)

- **Files:** `api/app/config.py` (`env` default, `get_settings()`), `api/app/main.py` (lines 40-42),
  `api/Dockerfile`.
- **Problem:** `DSBA_ENV` defaults to `development`, and production checks only the secret key. If the
  production compose forgets `DSBA_ENV=production` (or sets it and forgets the rest), the API runs with the
  public dev secret (OTP hashes in a DB leak become brute-forceable offline), `console` email/SMS backends
  that print codes into logs, `dev-login` enabled, cookies without `Secure`, Swagger UI, the dev S3 secret,
  and `s3_create_bucket=True` rewriting the bucket CORS on every start. `web_origins` also accepts `"*"`,
  which Starlette's CORS turns into "reflect any origin, with credentials" (`cors.py` line 162).
- **Fix:**
  - Dockerfile: `ENV DSBA_ENV=production` (compose.yaml already sets `development`), so the image is safe by
    default.
  - `get_settings()`: in every environment reject `"*"` in `web_origins`. In production raise unless: the secret
    is at least 32 characters and not the dev value; `cookie_secure` is true; `email_backend == "smtp"`;
    `sms_backend == "twilio"` (or add a `disabled` backend); every origin starts with `https://`;
    `s3_secret_access_key` is not `dsba-dev-secret`; `s3_create_bucket` is false.
  - `main.py`: `docs_url=None, openapi_url=None` in production (the web app's types come from
    `api/openapi.json` in the repo, not from the running API).

### 6. An upload can be swapped after `complete`, and after a moderator approved it (major; LEAD for storage.py, content for uploads.py)

- **Files:** `api/app/services/storage.py` `presigned_post()` (lines 109-117); `routers/uploads.py`,
  `routers/library.py`.
- **Problem:** the POST policy stays valid for `upload_url_ttl_seconds` (900 s) and targets the final key.
  After `complete` has checked the object, and even after a moderator published it, the uploader can POST a
  different file of the same type and size range to the same key. The library is a trusted channel (past
  papers, notes), so a swapped file reaches every student who downloads it; forum images can be swapped after
  posting.
- **Fix:**
  - Presign to a throwaway key, `incoming/<upload id>`. On `complete`: HEAD it, check size and type, then copy
    it server-side to the final key (`library/<uuid>/<safe name>` or `forum/<uuid>/<safe name>`) and delete the
    incoming object. No policy ever allows writing a final key.
  - Storage helper (lead):
    ```python
    def copy(self, src: str, dst: str, content_type: str) -> None:
        self.client.copy_object(Bucket=self.bucket, Key=dst, CopySource={"Bucket": self.bucket, "Key": src},
                                MetadataDirective="REPLACE", ContentType=content_type)
    ```
  - `complete` runs only when `status == pending` (a second call returns the stored result) and only for
    `upload.user_id == user.id` (404 otherwise).
  - Lower `upload_url_ttl_seconds` to 300. Add a bucket lifecycle rule that expires `incoming/` after one day.

### 7. File serving: `presigned_get` lets callers serve any type inline (major; LEAD for storage.py, content for allowlists)

- **Files:** `api/app/services/storage.py` `presigned_get()` (lines 129-139); `routers/uploads.py` `media`,
  `routers/library.py` `file_link` / `download`.
- **Problem:** `inline`, `content_type` and `file_name` are all optional. A call without them serves the object
  with the type the browser declared and no disposition; `inline=True` serves any type inline. An SVG or HTML
  upload served inline runs script on the bucket's origin; if that origin is ever same-site with the app
  (`files.<app domain>`, or a path proxied under the app), it can also plant a `dsba_csrf` cookie and defeat the
  CSRF check (finding 14).
- **Fix:**
  - Storage (lead): make `file_name` and `content_type` required; keep
    `INLINE_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"}`; serve inline
    only if `content_type in INLINE_TYPES`, else force `attachment`. Always send both `ResponseContentType`
    and `ResponseContentDisposition`.
  - Content: pass the type from **your allowlist entry for the verified extension**, never the browser's.
    Allowlists never contain `image/svg+xml`, `text/html`, `application/xhtml+xml`, `text/xml`,
    `application/xml` or JavaScript types. Notebooks, R scripts and Office files are attachments only.
  - Deployment: browsers reach the bucket on the provider's own host (`*.r2.cloudflarestorage.com`,
    `s3.<region>.amazonaws.com`), never on a subdomain of the app's domain.

### 8. `GET /media/{upload_id}` must only serve forum images, and hidden posts keep their images public (major; content + community, LEAD for the model)

- **Files:** `routers/uploads.py` `media` (public by design); `models/library.py` `Upload`.
- **Problem:** the route serves by upload id without a session. If it does not filter, a student can share a
  pending or rejected **library** upload as `/api/v1/media/<id>` and skip review entirely. And because `Upload`
  has no link to the post it appears in, hiding a thread or reply (or deleting the account) leaves its images
  served.
- **Fix:**
  - Content: `media` answers 404 unless `purpose == forum_image`, `status in (uploaded, attached)` and the stored
    type is a raster image from the allowlist; it serves inline with that type (finding 7).
  - Lead (model): add `thread_id` and `reply_id` to `uploads` (nullable FKs, `ondelete="SET NULL"`).
  - Community: on create and edit, attach only **the author's own** `forum_image` uploads referenced as
    `/api/v1/media/<uuid>` in the body. Content: `media` answers 404 when the linked post is hidden or deleted.
    Accounts: account deletion deletes the user's forum images (objects and rows).

### 9. Slow guessing of one person's code over days (major)

- **Owner:** accounts (`services/otp.py`).
- **Problem:** 5 challenges per hour x 5 attempts = 25 guesses an hour on one identifier, about 600 a day:
  roughly a 20% chance per year of signing in as a chosen person (an admin, a student rep), from rotating IPs.
- **Fix:** cap challenges per identifier per day (`otp_max_per_identifier_per_day`, finding 3) and stop after
  repeated failures: if the `sum(attempts)` of this identifier's unconsumed challenges in the last 24 h is 15
  or more, answer 429 `rate_limited` for 24 h (the same answer whether or not an account exists). Only the
  newest open challenge for an identifier accepts codes (issuing one consumes the older ones).

### 10. Backups are plaintext dumps in the uploads bucket, readable and deletable with the API's key (major, LEAD)

- **Files:** `api/app/cli.py` `cmd_backup` (lines 66-93), `compose.yaml` `backup` service.
- **Problem:** `pg_dump | gzip` goes to `backups/db/` in the same bucket, with the API's credentials. The dump
  holds every email, phone number, session hash and OTP row. Anyone with the API's S3 key (a leaked env file,
  a compromised container) can read or delete every backup, and a single bug that lets a client influence a
  storage key would expose them. There is no copy outside that bucket.
- **Fix:**
  - Encrypt before upload to a public key whose private half is kept offline:
    `pg_dump ... | gzip | age -r "$DSBA_BACKUP_AGE_RECIPIENT"` (add `age` to the Dockerfile's apt line).
    Refuse to run in production without the recipient.
  - `pg_dump --exclude-table-data=otp_challenges --exclude-table-data=user_sessions` (a restore signs everyone
    out, which is right after a restore anyway).
  - A separate bucket (`DSBA_BACKUP_BUCKET`) with its own write-only key (PutObject on `backups/*`), versioning
    or Object Lock, and retention by a lifecycle rule instead of the job deleting old dumps. The API's runtime
    key gets no access to it.

### 11. Forum links: `//host` and `/\host` pass as internal; image sources must be exact (major; frontend-community, community)

- **Files:** `web/src/features/forum/lib/markdown.js` `INLINE` (line 65) and `IMAGE` (line 11);
  `components/Prose.jsx` (lines 23-28); the server's `PostImage.src` extraction.
- **Problem:** a link is accepted when it matches `\/[^\s)]*`, and `Prose` sends anything starting with `/` to
  `<Link to>`. `//evil.example/signin` renders as an off-site link; `/\evil.example/signin` is treated as a path
  by React Router, whose `pushState` then fails and falls back to `location.assign`, which browsers read as
  `//evil.example`. A post can carry a link that looks internal and lands on a fake "enter your 6-digit code"
  page; with passwordless sign-in a phished code is an account. Raw HTML is not rendered (good).
- **Fix:**
  - Use `safeHref()` from finding 12. Internal means `^\/(?![\/\\])`; external means `new URL(href)` with
    protocol `https:`, `http:` or `mailto:`; anything else renders as plain text. External links keep
    `target="_blank"` and get `rel="noopener noreferrer nofollow ugc"`; show the host next to the text (or an
    external-link icon).
  - Images (when the prototype's `/demo/` rule is replaced): exactly `^\/api\/v1\/media\/[0-9a-f-]{36}$`, with
    no `..` and no query, on the client and in the server's `PostImage.src` extraction (community).

### 12. `javascript:` links in newsletter and career content, and no CSP (major; frontend-content, frontend-accounts, content; LEAD for the CSP)

- **Files:** `web/src/features/newsletter/lib/text` `LINK_RE` (line 9) and `components/RichText.jsx`
  (lines 12-23); `components/Blocks.jsx` `assetUrl` (line 6); `features/career/{Opportunities,Certificates}.jsx`
  (`href={employer.url}`, `href={cert.url}`, `href={f.url}`); `web/index.html` (inline script, lines 11-20);
  production proxy config.
- **Problem:** `LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/` accepts any scheme. Newsletter issues will be written by
  moderators, who are students, through `POST/PATCH /newsletter/issues`. `[Read more](javascript:alert%281%29)`
  becomes `<a href="javascript:…">`; React 18.3 only warns, and a click runs script in the app. That script can
  read `dsba_csrf` from `document.cookie` and call any API as the victim: a rep's issue can make an admin who
  clicks promote the rep (`PATCH /admin/users/{id}`). Career JSON (admin-written) has the same gap.
  `Blocks.jsx` loads newsletter images from any `https://` or `//` host, so an issue can log every reader's IP.
- **Fix:**
  - Frontend-accounts adds `web/src/ui/safeHref.ts`; everyone imports it (inline the same lines until it
    lands):
    ```ts
    export type SafeHref = { kind: 'internal'; to: string } | { kind: 'external'; href: string };
    export function safeHref(raw: string): SafeHref | null {
      const s = raw.trim();
      if (/^\/(?![/\\])/.test(s)) return { kind: 'internal', to: s };
      try {
        const u = new URL(s);
        if (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:') return { kind: 'external', href: u.href };
      } catch { /* not a URL */ }
      return null; // render the label as plain text
    }
    ```
    Use it everywhere a URL from the server or a user reaches `href`, `to` or `window.open`: forum `Prose`,
    newsletter `RichText`, career, library `sourceUrl`, notification `url`, search results
    (`CommandPalette.jsx` line 259). Newsletter images: app paths or the bucket only.
  - Content: validate URL fields when issues and the career document are written (finding 18).
  - LEAD: a CSP on the app's HTML at the reverse proxy. `script-src 'self'` without `'unsafe-inline'` also stops
    `javascript:` URLs from running, so a renderer someone misses is still covered:
    ```
    Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob: https:; media-src 'self' https:; font-src 'self' data:;
      connect-src 'self' https://<bucket host>; frame-src https://www.youtube-nocookie.com https://www.youtube.com https://<recordings host>;
      object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
    Strict-Transport-Security: max-age=31536000; includeSubDomains
    ```
    (`connect-src` needs the bucket host for the presigned POST; `img-src` must allow it because `/media/{id}`
    redirects there.) Move the inline theme script in `web/index.html` into `public/theme-init.js` loaded with
    `<script src>` (or add its `'sha256-…'` hash). Ship it as `Content-Security-Policy-Report-Only` for a day
    first.

### 13. Hidden, pending and draft content leaking through side endpoints (major; community, content)

- **Files:** `routers/content.py` `search`; `routers/forum.py` `related_threads`, `hot_threads`, `stats`, votes,
  `accept_answer`, `create_reply`; `routers/library.py` `list_items`, `facets`; `routers/modules.py` library
  counts; `routers/newsletter.py` `react`/`unreact`; `routers/reports.py` `create_report`.
- **Problem:** the brief's rule ("hidden, pending and removed things are 404 to others") will be applied in the
  main getters; the usual leaks are the side doors. Also, deleting a post by its author "removes its text", but
  if the text stays in the row, the generated `search_vector` keeps indexing it and search snippets show it.
- **Fix:**
  - For non-moderators, every query that lists, counts or matches content filters
    `status == visible` (forum), `status == published` (library, newsletter), including search (snippets
    too), related and hot threads, forum stats and top contributors, library facets and module counts.
  - Writes that name a target (vote, accept with `reply_id`, reply with `parent_id`, react to a section, report)
    answer 404 when the caller may not see it. Check `reply.thread_id == thread_id` and
    `parent.thread_id == thread_id`.
  - `list_items`: ignore `status` from non-moderators (published only, except their own items with `mine`).
    `review_note` is set only for the uploader and moderators.
  - Author delete: write `body = ''` in the database (the `search_vector` follows), not just in the response.

### 14. CSRF token not bound to the session; cookies without the `__Host-` prefix (minor, LEAD; frontend-accounts)

- **Files:** `api/app/core/security.py` (`CSRFMiddleware`, `_set_csrf_cookie`, `set_session_cookie`);
  `web/src/api/client.ts` (`CSRF_COOKIE`, line 9).
- **Problem:** plain double submit trusts any cookie value. Anyone who can write a cookie for the app's host
  (a sibling subdomain under the same parent domain, or the bucket if it is ever same-site, finding 7) can set
  `dsba_csrf` and forge requests; SameSite does not help between sibling subdomains.
- **Fix:**
  - Production cookie names `__Host-dsba_session` and `__Host-dsba_csrf` (Secure, `Path=/`, no `Domain`); keep
    `cookie_domain` unset in production. `client.ts` reads the name from `import.meta.env.VITE_CSRF_COOKIE`
    (default `dsba_csrf`).
  - When a session cookie is present, the expected token is
    `hmac(secret, b"csrf:" + session_token_hash)`; set it as the CSRF cookie at sign-in and have the middleware
    compare the header with both the cookie and that value. Without a session (sign-in itself), the plain double
    submit stays.
  - Rotate the CSRF cookie at sign-in and sign-out. In `client.ts`, retry once on `csrf_failed` (the 403 already
    sets a fresh cookie).

### 15. Enumeration and takeover paths in add/change identifier (minor)

- **Owner:** accounts (`routers/me.py`).
- **Problem:** `POST /me/identifiers/otp` answers `identifier_taken` (409) before anyone proves they own the
  identifier, so any signed-in user can test whether an email or phone has an account; the brief promises the
  opposite for sign-in. And a stolen session can add a new identifier and remove the original, which keeps the
  account for good.
- **Fix:** always answer 202; if the identifier is taken, send a message saying so instead of a code, and return
  `identifier_taken` only from `/me/identifiers/verify`. On every add, change or removal, notify the other
  identifier ("Your phone number on DSBA Hub was changed. If this wasn't you, contact a student rep.") and
  revoke the user's other sessions.

### 16. Session lifecycle details (minor)

- **Owner:** accounts (`services/sessions.py`, `routers/auth.py`, `routers/me.py`).
- **Fix:**
  - Rotation: on a successful verify, revoke the session behind the request's cookie (if any), then create a
    new one with `expires_at = now + session_days`, storing a validated IP and `user_agent[:300]`.
  - `logout` sets `revoked_at` on the row (not only clears the cookie) and rotates the CSRF cookie.
  - `revoke_session` matches `id == session_id AND user_id == user.id`, 404 otherwise; `list_sessions` shows only
    live sessions of the user.
  - Keep at most 20 live sessions per user (revoke the oldest).

### 17. Account deletion, PII retention and bulk email (minor; accounts, content, LEAD for the sweep)

- **Files:** `routers/me.py` `delete_me`, `export_me`; `cli.py`; `services/mailer.py`; `routers/newsletter.py`
  `publish_issue`.
- **Problem:** the `has_identifier` CHECK means a soft delete cannot clear both email and phone, so a
  "deleted" user would keep their PII. Sign-in challenges for new users have no `user_id`, so their email or
  phone stays in `otp_challenges` forever. Publishing an issue emails everyone.
- **Fix:**
  - `delete_me` hard-deletes the `users` row (the FKs already do the rest: content `SET NULL` → "deleted user";
    sessions, votes, stars, progress and notifications `CASCADE`), and also deletes `otp_challenges` whose
    `identifier` is the user's email or phone, and the user's forum images (finding 8).
  - Lead: a `sweep` CLI step, run daily from the backup loop: delete `otp_challenges` older than 7 days and
    `user_sessions` expired or revoked more than 30 days ago.
  - `export_me` contains only the user's own data; other people appear as `UserPublic` at most.
  - Mailer: one message per recipient, never several addresses in To or Cc; newsletter emails only to
    `newsletter_emails == true`, with a link to the settings page.

### 18. Server-side URL and calendar text validation (minor; content, LEAD for notify.py)

- **Fix:**
  - `create_link`: `LibraryLinkCreate.url` is `HttpUrl`, which allows `http:` and `user:pass@`; reject
    `body.url.scheme != "https"` and any username or password; cap the length at 2,000.
  - `IssueCreate`/`IssueUpdate` (`cover`, `sections`) and `PUT /career`: walk the JSON and reject any string
    under a key named `href`, `url`, `src` or ending in `Url`, and any `[label](href)` inside text, unless it is
    `https://…` or an app path (`/…`, not `//` or `/\`).
  - Lead, `services/notify.py`: keep `url` only when it matches `^/(?![/\\])`, else store `None`.
  - ICS feed: escape `\`, `;`, `,` and newlines in `SUMMARY`, `LOCATION` and `DESCRIPTION` (RFC 5545:
    `\\`, `\;`, `\,`, `\n`), so an event title cannot add properties or events.

### 19. Request size caps (minor; LEAD for the proxy, accounts, content, community)

- **Problem:** uvicorn has no body limit, and any client can get a CSRF cookie and send a 1 GB JSON body.
  `ProgressImport.watched` and `.last` are unbounded dicts; issue `sections` and the career document are
  unbounded JSON.
- **Fix:** proxy: `client_max_body_size 1m` (nginx) or `request_body { max_size 1MB }` (Caddy) on `/api/` (files
  never pass through the API). Accounts: `Field(max_length=5000)` on `watched`, `max_length=100` on `last`, and
  lesson keys matching `^[a-z0-9-]+:\d{1,3}:\d{1,3}$`. Content: cap an issue at 256 KB and the career document
  at 512 KB of JSON. Community: limit reports to 20 per user per hour.

### 20. Identifier and display-name hygiene (minor)

- **Owner:** accounts (`schemas/auth.py` `DisplayName` as an additive validation, `services/identifiers.py`).
- **Fix:**
  - Display names: NFKC-normalise; reject control characters, bidi overrides and zero-width characters
    (`[\x00-\x1f\x7f​-‏‪-‮⁦-⁩﻿]`); for non-staff, reject names containing
    "admin", "moderator", "student rep", "DSBA" or "BIBF" (case-insensitive).
  - Rate-limit key for emails: a canonical form that drops `+tag` (and dots for gmail.com/googlemail.com), so
    `name+1@gmail.com`, `name+2@…` do not each get 5 codes an hour into one inbox. The account keeps the
    address as typed.
  - `DSBA_ADMIN_IDENTIFIERS`: run each entry through `normalize_identifier()` before comparing (entries are
    typed by hand: `+973 3312 3456`, `Name@Gmail.com`).

### 21. Logs and audit gaps (minor; accounts, LEAD for cli.py)

- **Fix:**
  - Accounts: codes, session tokens and presigned URLs are never logged outside development; in logs, show
    identifiers masked like `destination_hint` (`+973 •••• ••12`, `m•••@gmail.com`).
  - Lead, `cli.py` `cmd_set_role`: write an audit row
    (`record(db, None, "user.role", "user", user.id, {"role": args.role, "via": "cli"})`).
  - Everyone: audit `data` carries a snapshot of the actor's display name and the target's title, because
    `actor_id` becomes NULL when an account is deleted and posts change after the fact.

### 22. Reporter identity visible to student reps (minor; community, product call)

- **Files:** `schemas/moderation.py` `ReportOut.reporter`; `routers/reports.py` `list_reports`.
- **Problem:** moderators are classmates. In a cohort of about a hundred, showing who reported a post invites
  retaliation and discourages reports.
- **Fix:** set `reporter` only for admins (None for moderators), or tell reporters in the report dialog that
  student reps see their name. Ask Mohamed.

### 23. Shared computers: cache and guest progress (minor; frontend-accounts, frontend-library)

- **Problem:** BIBF lab and library PCs are shared. `signOut` invalidates queries but keeps the cache in memory
  until refetch, and guest progress "imported on sign-in" on a shared PC is someone else's.
- **Fix:** on sign-out call `queryClient.clear()` and remove per-user drafts from localStorage. Offer the guest
  progress import ("Add the progress saved on this computer to your account?") instead of doing it silently.

---

## Builders: checklist

- **Accounts (backend):** 2 atomic attempts + flow binding; 3 SMS region allowlist, global SMS budget, advisory
  locks, /64 buckets, cooldown on both start endpoints; 9 daily cap + failure lockout; 15 add-identifier always
  202 + notify old identifier; 16 rotate on sign-in, revoke on logout, scope `revoke_session` to the user;
  17 hard delete + purge OTP rows, one email per recipient; 19 progress caps; 20 display names, email
  canonical key, admin identifiers normalised; 21 masked identifiers, no codes in logs.
- **Community (backend):** 8 attach only the author's own forum images; 11 strict media regex for
  `PostImage.src`; 13 visible-only in related/hot/stats, 404 on votes/accept/replies/reports to hidden targets,
  `body = ''` on author delete; 19 report rate limit; 22 reporter visibility.
- **Content (backend):** 6 `incoming/` key + copy on complete + owner check; 7 allowlists without SVG/HTML,
  type from the allowlist; 8 `media` only for visible forum images; 13 published-only in search, facets,
  module counts, reactions; 17 newsletter emails; 18 https-only links, URL checks in issue/career JSON, ICS
  escaping; 19 JSON size caps.
- **Frontend (all four):** 11/12 `safeHref()` wherever a URL reaches `href`, `to`, `src` or `window.open`
  (frontend-accounts adds `src/ui/safeHref.ts`; community: `Prose`; content: newsletter `RichText` and
  `Blocks`, career; library: `sourceUrl`); exact media regex for images; 14 CSRF cookie name from env + one
  retry on `csrf_failed` (frontend-accounts); 23 `queryClient.clear()` on sign-out, ask before importing guest
  progress.
- **Lead:** 1 Dockerfile `--forwarded-allow-ips` + `client_ip()`; 3 new settings; 4 `get_moderator`/`get_admin`
  on `get_active_user`; 5 production validation, `ENV DSBA_ENV=production`, docs off; 6/7 `storage.copy()`,
  strict `presigned_get`; 8 `uploads.thread_id`/`reply_id`; 10 encrypted backups in their own bucket;
  12 CSP + move the theme script out of `index.html`; 14 `__Host-` cookies + session-bound CSRF;
  17 sweep command; 18 `notify()` url check; 19 proxy body limit; 21 audit `set-role`.
