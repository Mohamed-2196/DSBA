# Deploying DSBA Hub

Production runs on one server with Docker Compose (`compose.prod.yaml`): Caddy in front, the API, PostgreSQL, the
mail and text workers, and two daily jobs (backup, sweep). Files live in an S3 bucket outside the server. Local
development uses `compose.yaml` instead.

```
browser ──https──▶ web (Caddy: TLS, the built app, /api/* proxied, security headers, 1 MB body cap)
   │                  └──▶ api (FastAPI, no published port) ──▶ db (PostgreSQL 17, volume pgdata)
   └──presigned POST/GET──▶ bucket (AWS S3, or MinIO behind HTTPS)
mail: the email outbox (in db) ──SMTP──▶ your mail relay
texts: published library files ──extract text──▶ search index (in db)
backup (daily): pg_dump ──▶ backup bucket (its own key)      sweep (daily): uploads, codes, sessions, old files
```

## 1. Before you start

- A server with Docker and the Compose plugin, ports 80 and 443 open, and a DNS name pointing at it
  (`DSBA_DOMAIN`, e.g. `hub.example.com`). Caddy gets and renews the certificate itself.
- An S3 bucket for files and a second bucket for backups (section 3), with a key for the API, one for the text
  worker that can only read the library's files and write their covers (section 3), and one for backups (section 7).
- An SMTP account for sign-in codes and notification emails (any provider's relay), and a Twilio account if codes
  go out by text too.
- An Anthropic API key (`DSBA_ANTHROPIC_API_KEY`) if Mini Noora's AI answers (`noora.ai`) are turned on (section 11).

## 2. Settings

Copy `.env.example` to `.env` next to `compose.prod.yaml`, keep only its production block and fill it in.
Compose stops at once if a required variable is missing, and the API refuses to start while any setting is unsafe
for production. It lists every problem in one go, for example:

```
app.config.ConfigError: DSBA Hub won't start in production until these settings are fixed:
  - DSBA_SECRET_KEY must be a random string of at least 32 characters, not the development one (...)
  - DSBA_EMAIL_BACKEND must be smtp (it is 'console'): the console and file backends don't deliver sign-in codes.
```

What production refuses (`app/config.py`, `Settings.production_problems`):

| Setting | Rule |
|---|---|
| `DSBA_SECRET_KEY` | at least 32 characters, not the development value |
| `DSBA_DATABASE_URL` | set (compose builds it from `POSTGRES_PASSWORD`) |
| `DSBA_COOKIE_SECURE` | true (the default in production) |
| `DSBA_SESSION_COOKIE`, `DSBA_CSRF_COOKIE` | start with `__Host-` (the defaults in production are `__Host-dsba_session` and `__Host-dsba_csrf`); `DSBA_COOKIE_DOMAIN` empty |
| `DSBA_WEB_ORIGINS`, `DSBA_WEB_BASE_URL` | `https://` only; `*` is refused in every environment |
| `DSBA_TRUSTED_PROXIES` | set (the reverse proxy's address, or `127.0.0.1/32` with no proxy), never `0.0.0.0/0` or `::/0` |
| `DSBA_OTP_MAX_ATTEMPTS` | at most 5 |
| `DSBA_OTP_MAX_PER_*`, `DSBA_SMS_MAX_PER_*`, `DSBA_EMAIL_MAX_PER_*` | at their defaults or lower, unless `DSBA_ALLOW_RAISED_LIMITS=true` says a higher one is on purpose |
| `DSBA_S3_*` | bucket and keys set, not the development keys; the endpoint set explicitly (empty for AWS S3); what browsers use (`DSBA_S3_PUBLIC_ENDPOINT_URL`, else `DSBA_S3_ENDPOINT_URL`) is `https://`; `DSBA_S3_CREATE_BUCKET` false (the default in production) |
| `DSBA_EMAIL_BACKEND` | `smtp`, with `DSBA_SMTP_HOST` set and `DSBA_EMAIL_FROM` on your own domain |
| `DSBA_SMS_BACKEND` | `twilio` with its three settings, or `DSBA_SMS_ALLOWED_REGIONS` empty (no texts at all) |

Every other setting, the optional ones included, is in section 12.

Also in production: the API docs (`/api/v1/docs`) and `/api/v1/openapi.json` are off (the web app's types come
from `api/openapi.json` in the repository), and `python -m app.cli dev-login` refuses to run. The API image sets
`DSBA_ENV=production` itself, so a container started without settings fails instead of running in development mode.

**The text worker** (`texts`) gets only `DSBA_ENV`, its database URL and the bucket settings, and checks only those
(`Settings.texts_problems`): it opens files anyone could have uploaded, so it holds no secret key, mail, texts or AI
key. Its database URL uses its own role, `dsba_texts`, with the password `DSBA_TEXTS_DB_PASSWORD` (letters, digits,
`-` and `_`: it goes in the URL as it is). The `migrate` service creates the role after the migrations, or sets its
password again, with only what the worker needs: reading `library_items` and noting each file's hash, and keeping
the words in `library_texts` (`python -m app.cli texts-role`, `paper_text.WORKER_GRANTS`). Its bucket key is its own
too (section 3).

## 3. Object storage

**Supported stores:** AWS S3, and MinIO (served over HTTPS to browsers). Browsers upload with a presigned POST
(the policy pins the type and the size range), which **Cloudflare R2 does not support**: R2 only takes presigned
PUT/GET. Moving to R2 would need a presigned-PUT upload path in the API and in the web app's two uploaders; until
then R2 is not supported.

Browsers reach the bucket on the store's own host (`*.amazonaws.com`, or a MinIO host on another domain),
never on a subdomain of the app: a file served from there could otherwise set cookies for the app.

**Set the bucket up once** (CORS for the app's origin, and a lifecycle rule that deletes what is left under
`incoming/` after a day: uploads that were never completed):

```sh
docker compose -f compose.prod.yaml run --rm api python -m app.cli setup-bucket
```

It needs a key that may change the bucket's configuration; run it with an admin key in the environment if the API's
own key can't (`-e DSBA_S3_ACCESS_KEY_ID=... -e DSBA_S3_SECRET_ACCESS_KEY=...`). If the store refuses lifecycle
rules, the command says so: then delete old `incoming/` objects another way (the daily sweep deletes the uploads'
rows and the objects it knows about).

**The API's key** needs `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`
(presigned uploads and downloads, the checks and the server-side copy after an upload, removals) and
`s3:ListBucket` on `arn:aws:s3:::<bucket>` (the health check's HEAD on the bucket). Nothing on the backup bucket.

**The text worker's key** (`DSBA_TEXTS_S3_ACCESS_KEY_ID`, `DSBA_TEXTS_S3_SECRET_ACCESS_KEY`) only reads the
library's files and writes their covers:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::<bucket>/library/*" },
    { "Effect": "Allow", "Action": "s3:PutObject", "Resource": "arn:aws:s3:::<bucket>/covers/*" }
  ]
}
```

On AWS, attach it to an IAM user of its own. On MinIO, the same JSON is a policy:
`mc admin policy create <alias> dsba-texts texts.json`, then `mc admin user add <alias> <key> <secret>` and
`mc admin policy attach <alias> dsba-texts --user <key>`.

**`DSBA_BUCKET_ORIGIN`** is the origin presigned URLs point at; the Content-Security-Policy allows uploads to it,
and images, PDF previews and media from it. With `DSBA_S3_FORCE_PATH_STYLE=false` the URLs use the bucket's own
host: on AWS `https://<bucket>.s3.<region>.amazonaws.com`, on a Railway bucket `https://<bucket>.t3.storageapi.dev`;
with path-style URLs (MinIO) it is the endpoint's origin, e.g. `https://files.example.com`.

## 4. Start

```sh
docker compose -f compose.prod.yaml up -d --build          # migrate runs first, then the API and Caddy
docker compose -f compose.prod.yaml run --rm api python -m app.cli setup-bucket
docker compose -f compose.prod.yaml run --rm api python -m app.cli seed
docker compose -f compose.prod.yaml run --rm api python -m app.cli set-role you@example.com student admin   # after your first sign-in
```

`scripts/seed-real.sh --prod` does the seed and also brings the files of the library's Google Drive folders into the
library (section 10).

`DSBA_ADMIN_IDENTIFIERS` gives the Admin role to a listed person only when they sign in while the hub has no active
admin at all: it starts the hub. Once anyone is an admin it does nothing, so Admin taken from a listed person stays
taken, even if they delete their account and sign up again. Keep it to your own address; you can empty it once you
are signed in as admin.
`set-role` sets exactly the roles you name, and writes an audit entry.

**Daily puzzles' content.** The seed loads the Daily themes (out of the rotation) and the public guess list (into a
list under 5,000 words, so a content file loaded first doesn't leave The Word refusing everyday guesses), but no
puzzles: the answers stay out of the repository. Load the content file (on Mohamed's Mac,
`/Users/mohamed/dsba-hub/private/daily-content.json`; `private/` is git-ignored), then edit it in Manage → Daily
puzzles:

```sh
docker compose -f compose.prod.yaml run --rm -v /path/to/daily-content.json:/tmp/daily.json:ro api \
  python -m app.cli daily-content import /tmp/daily.json
```

Where there is no shell (the Railway dev site), an admin does the same in Manage → Daily puzzles → Load a content
file: Check shows what it would add and leave, Load loads it. Either way it adds what the database lacks and never
overwrites what editors changed, so loading it twice changes nothing; themes join the rotation once every game has
what it needs. `daily-content export FILE` writes the database's content back to a file (it holds every answer: keep
it private). `docs/backend/CMS.md` has the details.

**Updating:** `git pull && docker compose -f compose.prod.yaml up -d --build`. The `migrate` service applies new
migrations before the API starts. Run `seed` again after updates that change the reference content (it never
overwrites what reps changed).

**Health:** `GET /api/v1/health` (the API image's healthcheck uses it); logs with
`docker compose -f compose.prod.yaml logs -f api`. Logs carry no sign-in codes, tokens or full phone numbers.

**Emails.** Sign-in codes are sent while the person waits. Everything else (notification emails, account
notices) goes into the `email_outbox` table with the change it is about, and the `mail` service
(`python -m app.cli mail-worker`) sends it: a failed send is retried with growing waits (30 s, 1 min, 2 min, ... up
to 6 hours) and given up after 8 tries, with a warning in its log (`docker compose -f compose.prod.yaml logs -f
mail`). Several workers may run (`docker compose -f compose.prod.yaml up -d --scale mail=2`): each email is claimed
by one. Sent, failed and cancelled emails are deleted after 30 days. An email is cancelled when its time comes if
the person turned that switch off, changed their address or deleted the account.

The same worker keeps the hub's clock: on Sunday, from the time set in Manage → Sunday summary (Bahrain time), it
queues the week's summaries, and within a minute of their time it turns the reminders on board cards and on students'
own calendar events into notifications. Without a running `mail` service, none of these happen.

**Text of papers.** Search finds words inside published PDF and Word files. The `texts` service
(`python -m app.cli text-worker`) reads each newly published file once, in a child process limited to 60 seconds
and 1 GB, and skips files over 60 MB; scans have no text and stay findable by title only. The child process can't
see the worker's settings: its environment holds none, and the worker makes itself non-dumpable before it starts
one, so the child (the same user) can't read them from `/proc/<worker>/environ` or the worker's memory either. And
the worker holds only its own database role and bucket key (section 2). After deploying it the first time, or after
a big import, read the files already there: `docker compose -f compose.prod.yaml run --rm texts python -m app.cli
extract-texts`, which reads their words and makes their covers (`--retry` reads failed and empty files again).

## 5. Client addresses and the proxy

Per-IP limits (sign-in codes above all), sessions and the audit log use the client's address. The API takes it from
the TCP connection, and reads `X-Forwarded-For` only when the connection comes from one of `DSBA_TRUSTED_PROXIES`
(addresses or CIDRs; none by default). It then reads the header from the right and takes the first address that
isn't a trusted proxy, so whatever a client writes in the header itself is ignored; a value that isn't an IP address
counts as no address. uvicorn runs with `--no-proxy-headers` so it doesn't rewrite the peer first.

In `compose.prod.yaml`, Caddy has a fixed address on the internal network (`DSBA_PROXY_IP`, default `172.30.0.10`,
in `DSBA_DOCKER_SUBNET`, default `172.30.0.0/24`; change both if that subnet is taken) and is the only trusted proxy.
Caddy drops any `X-Forwarded-For` a client sends and writes the client's address. The API publishes no port.

**Behind Cloudflare or another CDN**, Caddy sees the CDN's addresses: put the CDN's ranges in Caddy's
`DSBA_EDGE_PROXIES` (space-separated; the Caddyfile's `trusted_proxies`) **and** in `DSBA_TRUSTED_PROXIES`, so both
skip them when reading the header.

**On Railway** (production's host, Mohamed's call, SEC-50), Railway's edge proxy ends TLS and is the only way in:
Caddy sees the edge's address, and the API sees Caddy's address on the project's private network. Railway doesn't
publish the edge's addresses, but nothing else can reach a service without a TCP proxy, so trust the private ranges:
- the web service (Caddy): `DSBA_EDGE_PROXIES=private_ranges 100.64.0.0/10`. Caddy then keeps the edge's
  `X-Forwarded-For` and adds the edge's address, reading it from the right (`trusted_proxies_strict`).
- the API service: `DSBA_TRUSTED_PROXIES=private_ranges,100.64.0.0/10` (`private_ranges` means Caddy's list:
  10/8, 172.16/12, 192.168/16, 127/8, fd00::/8 and ::1). The API reads the header from the right, skips Caddy and the
  edge, and finds the browser; anything a browser wrote in the header itself stays to the left and is ignored.
- Never give either service a public TCP proxy or a second public domain that skips Caddy.
- Check it once after deploying: sign in, open Your account → Sessions, and confirm the address shown is your own
  (compare with any "what is my IP" page). If it shows a 100.64.x.x or fd12:… address, an edge or Caddy address is
  missing from the lists: add its range to both. If the edge's addresses are public ones, Railway has changed how it
  connects; ask Railway support for its edge ranges rather than trusting everything.

## 6. Security headers

Caddy (`web/deploy/Caddyfile`) sets on everything: `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
and `X-Content-Type-Options` and `Referrer-Policy` where the answer has none. On the web app's pages:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-<theme script>';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com <bucket>; media-src 'self' https:;
  font-src 'self' data:; connect-src 'self' <bucket>; frame-src https://www.youtube.com
  https://www.youtube-nocookie.com https://vc.bibf.com <bucket>; object-src 'none'; base-uri 'self';
  form-action 'self'; frame-ancestors 'none'; worker-src 'self'; manifest-src 'self'
```

- No inline script runs except the theme script in `index.html` (applied before first paint): its hash is computed
  from the built page when the image is built (`web/deploy/csp-hashes.mjs`), so it always matches. `javascript:`
  links can't run either, whichever renderer lets one through.
- `'wasm-unsafe-eval'`: the notebook's PDF reader (pdf.js) decodes scanned pages (JBIG2, JPEG 2000) with
  WebAssembly it fetches from the app's own `/assets/pdfjs-<version>/`. It allows compiling WebAssembly only, never
  `eval` of JavaScript; without it pdf.js falls back to slower plain-JS decoders.
- `style-src 'unsafe-inline'`: React sets inline `style` attributes; styles can't run script.
- Turning analytics on needs the PostHog host in `connect-src` (`DSBA_CSP_CONNECT_EXTRA`) and nothing else
  (section 9).
- Hashed assets (`/assets/*`) are cached for a year; everything else revalidates, so a deploy shows at once.
- The installed app: `/manifest.webmanifest` and a service worker, `/sw.js` (`web/src/sw/`), both from the app's
  own origin. The worker keeps the app shell, the built files and the public images, and never an answer from
  `/api/` or another site (the bucket's short-lived links). A new deploy installs beside the running one and the app
  offers "Reload" (`web/src/lib/pwa.ts`). To take the worker out, deploy a `sw.js` that unregisters itself.
- Request bodies to `/api/*` are capped at 1 MB (413 above that). Files never pass through the API.

The API adds its own headers to every answer (`app/core/headers.py`): `nosniff`, `Referrer-Policy: no-referrer`,
`X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; ...`, and
`Cache-Control: no-store` (always for signed-in JSON).

**Cookies.** The session cookie and the CSRF cookie are `__Host-` cookies in production (Secure, `Path=/`, no
`Domain`). The CSRF token is bound to the session (an HMAC of the session token), set at sign-in and replaced at
sign-out. The web app reads the CSRF cookie by the name it was built with: `VITE_CSRF_COOKIE` (web/Dockerfile and
compose.prod.yaml pass `__Host-dsba_csrf`) must match `DSBA_CSRF_COOKIE`.

## 7. Backups

The `backup` service runs `python -m app.cli backup` when it starts and every 24 hours after:

- `pg_dump` (plain SQL, gzipped) of the whole database except the rows of `otp_challenges` and `user_sessions`
  (a restore signs everyone out, which is what you want after a restore anyway);
- uploaded to `DSBA_BACKUP_BUCKET` under `DSBA_BACKUP_PREFIX` (`backups/db/<UTC time>.sql.gz`) with **its own
  key** (`DSBA_BACKUP_ACCESS_KEY_ID`/`DSBA_BACKUP_SECRET_ACCESS_KEY`; the API service never receives it), and the
  endpoint and region of the main store unless `DSBA_BACKUP_S3_ENDPOINT_URL`/`DSBA_BACKUP_S3_REGION` say otherwise;
- encrypted at rest by the store (`DSBA_BACKUP_SSE`: `AES256`, or `aws:kms` with `DSBA_BACKUP_KMS_KEY_ID`; `none`
  only for a store without server-side encryption);
- then all but the newest `DSBA_BACKUP_KEEP` (14) dumps are deleted.

Without `DSBA_BACKUP_*` (development), dumps go to the main bucket under `backups/db/` with the API's key.

**Recommended:** give the backup key only `s3:PutObject` and `s3:AbortMultipartUpload` on
`arn:aws:s3:::<backup bucket>/backups/*`, turn on versioning or Object Lock on the backup bucket, keep dumps with a
lifecycle rule, and set `DSBA_BACKUP_KEEP=0` (a write-only key can't list or delete old dumps; with a number there
the job says it could not prune them). Nobody holding the API's key, or the backup key, can then read or delete
existing backups.

The uploaded files themselves are not in the dump: turn on versioning on the files bucket too.

### Restore

Use a key that can read the backup bucket (not the backup job's write-only key).

```sh
# 1. Pick and download a dump
aws s3 ls s3://<backup bucket>/backups/db/
aws s3 cp s3://<backup bucket>/backups/db/20261010T020000Z.sql.gz .

# 2. Stop everything that writes to the database
docker compose -f compose.prod.yaml stop web api backup sweep

# 3. Recreate the database (this deletes what is there now)
docker compose -f compose.prod.yaml exec db psql -U dsba -d postgres \
  -c "DROP DATABASE dsba WITH (FORCE)" -c "CREATE DATABASE dsba OWNER dsba"

# 4. Load the dump
gunzip -c 20261010T020000Z.sql.gz \
  | docker compose -f compose.prod.yaml exec -T db psql -U dsba -d dsba -v ON_ERROR_STOP=1 -q

# 5. Bring the schema up to date (the dump may be older than the code) and start again
docker compose -f compose.prod.yaml run --rm migrate
docker compose -f compose.prod.yaml up -d
```

Everyone signs in again afterwards. Try a restore into a scratch database now and then: a backup you have never
restored is a hope, not a backup.

## 8. The daily sweep

The `sweep` service runs `python -m app.cli sweep` when it starts and every 24 hours after. It deletes:

- uploads never attached to anything (a library item, a forum post, a note, a card, a newsletter picture, a module's
  picture, a Career Navigator logo, a bug report) a day after they were made, and board files taken off their card or
  whose card is gone: the object, then the row;
- sign-in codes older than two days (the longest rate-limit window is a day);
- sessions that expired or were revoked more than 30 days ago;
- the files of library items rejected or removed more than a week ago (the item stays, without its file);
- the addresses kept on bug reports after a day, and the screenshots of bug reports closed (fixed or won't
  fix) more than 90 days ago (the report stays, without its screenshot).

## 9. Analytics (optional)

PostHog is off unless the web image is built with a project key. Without one the SDK is not even downloaded. To turn
it on, set in `.env` (here with PostHog's EU cloud; without `VITE_POSTHOG_HOST` it is the US one,
`https://us.i.posthog.com`, and that is the host the CSP needs):

```
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://eu.i.posthog.com
DSBA_CSP_CONNECT_EXTRA=https://eu.i.posthog.com
```

and rebuild the web image (`docker compose -f compose.prod.yaml up -d --build web`). The SDK then loads in a chunk of
its own after the app and sends only page views and page leaves, to that host only (`web/src/lib/analytics.ts`):

- no autocapture of clicks or inputs, no session recordings, surveys, heatmaps, exceptions or remote feature flags
  (nothing PostHog's side can turn on later), and no scripts from PostHog's CDN, so `script-src` needs no exception;
- no cookies (it keeps its random visitor id in `localStorage`), anonymous visitors only (the app never calls
  `identify`), and nothing at all from browsers that send Do Not Track or Global Privacy Control;
- URLs without their query string or hash (search terms stay in the browser), and no page titles (a thread's title
  is what a student wrote).

In the PostHog project settings, also turn on **Discard client IP data**. Use a new project: the key of an old one
is in the repository's history (security review SEC-8).

## 10. The real content: `scripts/seed-real.sh`

One command fills the install with the real content, in the compose stack:

1. the migrations (`alembic upgrade head`);
2. the reference content (`python -m app.cli seed`): modules, calendar, newsletter, career and the library's links;
3. the files in the library's Google Drive folders (`python -m app.cli import-drive`), copied into the bucket as
   library files.

It is safe to run again. The seed adds only what is missing and never overwrites what reps changed or deleted
(modules are the exception: the seed file is their source, so they are refreshed). The import skips every file an
earlier run brought in, even one a rep has removed since.

**The Google API key.** The library's Drive folders are shared with "anyone with the link", so an API key is enough:

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project.
2. APIs & Services, Library: enable the **Google Drive API**.
3. APIs & Services, Credentials: create an **API key**, then edit it: under API restrictions, restrict it to the
   Google Drive API. Under application restrictions, you can also limit it to the server's IP address.
4. Put it in `.env` next to `compose.prod.yaml`: `DSBA_GOOGLE_API_KEY=...`.

Only the import's own container gets the key: `seed-real.sh` passes it by name (`-e DSBA_GOOGLE_API_KEY`), never on
a command line, and the API, the mail worker and the daily jobs never hold it. The import sends it in a request
header, never in a URL, and never prints or logs it.

**A service account (only if a folder needs one).** A folder shared with chosen people only can be shared with a
service account instead:

1. In the same project, IAM & Admin, Service accounts: create one (it needs no role), then Keys, Add key, JSON.
2. Copy the key file to the server outside the repository, and let only the container's user (uid 10001) read it:
   `sudo chown 10001 /etc/dsba/google-importer.json && sudo chmod 400 /etc/dsba/google-importer.json`.
3. In `.env`: `DSBA_GOOGLE_SERVICE_ACCOUNT_FILE=/etc/dsba/google-importer.json`. `seed-real.sh` mounts it read-only
   into the import's container.
4. Share each such folder with the account's email address, as a viewer.

With both set, the key is tried first and the service account takes over where Drive refuses the key. A folder
limited to BIBF's Google domain can't be shared with an account outside it: the import lists it, and its files have
to be uploaded through the library by hand.

**First, a dry run:**

```sh
scripts/seed-real.sh --prod --dry-run
```

The migrations and the seed still run (both are safe to repeat, and the plan reads the links the seed loads). The
import then reads every linked folder and prints its plan without downloading anything. Per module and link it shows
each file it would import (`+`, with its size), what it skips and why (`-`), folders Drive failed to list (`!`),
folders Drive refused (`x`) and how many files are already in the library (`=`). Then it lists the links that
aren't folders (single files and Google Docs stay links) and, again, the refused folders with their module and link.
Check two things:

- **Refused folders:** share each with "anyone with the link" (or with the service account), or leave it as a link.
- **Past papers:** their exam year and zone come from their file names (`app/services/exam_names.py`). A paper whose
  name says neither gets neither; it still shows when no year is chosen.

**Then the real run:**

```sh
scripts/seed-real.sh --prod                # prints the plan, then asks before importing (--yes: doesn't ask)
scripts/seed-real.sh --prod --limit 20     # or a first batch: check the files in the library, then run it again
```

The files go to `library/drive/<module>/<Drive file id>/<name>` in the bucket and are in the library at once,
published, with their link's kind and module; students' notes keep their author. Google Docs and Slides become PDFs,
and Sheets become XLSX files (Google exports at most 10 MB of a file). The library's rules apply: only its file
types, at most `DSBA_MAX_UPLOAD_MB` per file (counted while downloading, whatever Drive says), and each file's first
bytes must match its type. The links stay. Large files go up in parts: the API's key needs nothing more than
section 3 lists, but give it `s3:AbortMultipartUpload` too, so a failed upload leaves no parts behind.

Downloads are 2 seconds apart (`--pace SECONDS` changes that). Drive's quota errors are retried with growing waits.
After many downloads in a row Google may block the network for a while with its "automated queries" page: the
import waits it out (1, 2, 4, 8 and 10 minutes), then doubles its pace; a block that outlasts the waits stops the run.
Files Drive won't hand over (downloads turned off, flagged as abuse) are listed with the reason and their Drive link.
Skipped and failed files aren't marked as imported: run the command again later and it carries on and tries them
again. Each real run is one entry in the audit log ("library import", from the server); a
dry run, or a run with nothing to import, changes nothing. `--module ID` imports one module's folders only.

Locally, `scripts/seed-real.sh` (without `--prod`) does the same in the `compose.yaml` stack, into MinIO, with the key
in the `.env` of your checkout. Without the script, the import alone is
`docker compose -f compose.prod.yaml run --rm -e DSBA_GOOGLE_API_KEY api python -m app.cli import-drive` with
`--dry-run`, `--module ID`, `--limit N`, `--pace SECONDS` or `--yes`.

## 11. Mini Noora, the Sunday summary and bug reports

**Mini Noora's AI answers** come from Claude. Put `DSBA_ANTHROPIC_API_KEY` in `.env` (compose passes it to the API's
services, never to the text worker), then turn on `noora.ai` in Access; it arrives off. The model is `DSBA_NOORA_MODEL`
(`claude-haiku-5-5` by default; it thinks before it answers, at `DSBA_NOORA_EFFORT`). When Claude's safeguards decline a
question, the student is told she can't help with that one, and the log keeps the decline's category only. Admins set
her daily limit per student and the monthly budget in Manage → Numbers (an account under a week old asks at most 5
a day, and an answer the student drops is charged what Claude used, so fresh sign-ups can't spend the month); also set a monthly spending limit on the
Anthropic workspace as a backstop. Without the key, or with `noora.ai` off, she answers from her script, which admins
edit in Manage → Mini Noora, and calls nobody.

**The Sunday summary** is an email of the week ahead for each year, for students who keep its switch on. Turn on
`summary` in Access. The `mail` service queues it on Sunday from the time set in Manage → Sunday summary and sends it;
nothing else needs scheduling. `python -m app.cli weekly-summary` queues this week's at once (for whoever hasn't had
it), and `--preview YEAR` prints a year's text and sends nothing.

**Bug reports.** Anyone, guests included, can send one ("Report a bug" in the account menu, the More drawer, the
command palette and About), and a signed-in reporter can add a screenshot. They are kept in `bug_reports` and admins
triage them in Manage → Bugs. A report goes when its reporter deletes their account; the sweep forgets a report's
address after a day and its screenshot 90 days after it is closed (section 8).

## 12. Every setting

The API and its workers read their settings from the environment, with the prefix `DSBA_` (`app/config.py`), and
from a `.env` in the directory they run in (`api/` without Docker). In production, `compose.prod.yaml` passes each
service only the variables it names, so a setting it doesn't list keeps its default there even when `.env` sets it:
add it to the service's `environment` first. The defaults suit development; section 2 lists what production refuses.

| Setting | Default | What it is |
|---|---|---|
| `DSBA_ENV` | `development` | `development`, `test` or `production` (the API image sets `production`) |
| `DSBA_SECRET_KEY` | development value | keys the sign-in codes' and identifiers' hashes, the CSRF tokens and the private calendar feeds' addresses (a new key gives every feed a new address) |
| `DSBA_DATABASE_URL` | the local `dsba` database | PostgreSQL, `postgresql+psycopg://…` |
| `DSBA_WEB_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | the app's origins, comma-separated (CORS, CSRF) |
| `DSBA_WEB_BASE_URL` | `http://127.0.0.1:5173` | the app's address in emails and texts |
| `DSBA_SESSION_COOKIE`, `DSBA_CSRF_COOKIE` | `dsba_session`, `dsba_csrf` (`__Host-` ones in production) | cookie names; the web app's `VITE_CSRF_COOKIE` must match the second |
| `DSBA_SESSION_DAYS` | `30` | how long a session lasts at most |
| `DSBA_COOKIE_SECURE`, `DSBA_COOKIE_DOMAIN` | false (true in production), none | cookies only over HTTPS; a cookie domain (empty in production) |
| `DSBA_TRUSTED_PROXIES` | none | addresses or CIDRs whose `X-Forwarded-For` is read (section 5) |
| `DSBA_OTP_TTL_SECONDS`, `DSBA_OTP_MAX_ATTEMPTS`, `DSBA_OTP_RESEND_SECONDS` | `600`, `5`, `30` | sign-in codes: lifetime, tries per code, wait before another |
| `DSBA_OTP_MAX_PER_IDENTIFIER_PER_HOUR`, `…_PER_DAY`, `DSBA_OTP_MAX_PER_IP_PER_HOUR` | `5`, `10`, `30` | codes per address and per network (an IPv4 address, or an IPv6 /64) |
| `DSBA_OTP_MAX_PER_IPV6_SITE_PER_HOUR` | `120` | codes per IPv6 /48 together, so one place rotating its /64s can't multiply the per-network limit |
| `DSBA_DEFAULT_PHONE_REGION` | `BH` | how a phone number without a country code is read |
| `DSBA_EMAIL_BACKEND` | `console` | `smtp`, `file` (into `DSBA_EMAIL_FILE_DIR`, default `var/mail`) or `console` |
| `DSBA_EMAIL_FROM` | `DSBA Hub <no-reply@dsba-hub.local>` | the sender |
| `DSBA_SMTP_HOST`, `_PORT`, `_USERNAME`, `_PASSWORD`, `_STARTTLS` | `127.0.0.1`, `1025`, none, none, false | the mail relay |
| `DSBA_EMAIL_SIGNUPS_MAX_PER_HOUR`, `DSBA_EMAIL_SIGNUPS_MAX_PER_DAY` | `100`, `500` | sign-in emails the whole site may send to addresses no account has (sign-ups). Over it, the answer and the per-address limits stay the same (they never say whether an account exists) but the code for a new address isn't sent (marked `suppressed`, it never verifies), and the log says so; students with an account still get codes. Sign-in emails go out just after the answer, so a failed send shows only in the log |
| `DSBA_EMAIL_MAX_PER_HOUR`, `DSBA_EMAIL_MAX_PER_DAY` | `600`, `3000` | every sign-in email together; over it, codes by email pause (the mail provider's daily quota must be well above the daily figure) |
| `DSBA_SMS_BACKEND` | `console` | `twilio`, `file` (into `DSBA_SMS_FILE_DIR`, default `var/sms`) or `console` |
| `DSBA_TWILIO_ACCOUNT_SID`, `_AUTH_TOKEN`, `_FROM` | none | Twilio; `_FROM` is a number or a Messaging Service SID |
| `DSBA_SMS_ALLOWED_REGIONS` | `BH` | countries whose mobile numbers get codes by text; empty: no texts |
| `DSBA_SMS_MAX_PER_HOUR`, `DSBA_SMS_MAX_PER_DAY` | `50`, `300` | texts the whole site may send |
| `DSBA_ALLOW_RAISED_LIMITS` | false | lets production run limits above their defaults (the e2e suite raises them) |
| `DSBA_S3_ENDPOINT_URL` | `http://127.0.0.1:9000` | the store; empty for AWS S3 |
| `DSBA_S3_PUBLIC_ENDPOINT_URL` | none | the endpoint browsers use, when it differs (Docker) |
| `DSBA_S3_REGION`, `DSBA_S3_BUCKET`, `DSBA_S3_FORCE_PATH_STYLE` | `us-east-1`, `dsba-hub`, true | the bucket's region and name; path-style URLs (MinIO) or not (AWS) |
| `DSBA_S3_ACCESS_KEY_ID`, `DSBA_S3_SECRET_ACCESS_KEY` | the development emulator's | the API's key (section 3) |
| `DSBA_S3_CREATE_BUCKET` | true (false in production) | prepare the bucket at start-up (development) |
| `DSBA_UPLOAD_URL_TTL_SECONDS`, `DSBA_DOWNLOAD_URL_TTL_SECONDS` | `300`, `300` | how long presigned links last |
| `DSBA_MAX_UPLOAD_MB`, `DSBA_MAX_IMAGE_MB` | `50`, `8` | the largest file and picture; the web app states the same limits in `web/src/api/uploads.ts`, so change both |
| `DSBA_TEXTS_DB_PASSWORD` | none | the password of the text worker's database role (section 2); letters, digits, `-` and `_` |
| `DSBA_BACKUP_BUCKET`, `DSBA_BACKUP_PREFIX` | none, `backups/db/` | where dumps go (section 7) |
| `DSBA_BACKUP_S3_ENDPOINT_URL`, `DSBA_BACKUP_S3_REGION` | the main store's | the backup bucket's store, when it is another one |
| `DSBA_BACKUP_ACCESS_KEY_ID`, `DSBA_BACKUP_SECRET_ACCESS_KEY` | none | the backup key, set together or not at all |
| `DSBA_BACKUP_SSE`, `DSBA_BACKUP_KMS_KEY_ID`, `DSBA_BACKUP_KEEP` | `AES256`, none, `14` | encryption at rest, and how many dumps to keep (0: all) |
| `DSBA_ADMIN_IDENTIFIERS` | none | emails or phone numbers that get Admin at sign-in while the hub has no active admin |
| `DSBA_GOOGLE_API_KEY`, `DSBA_GOOGLE_SERVICE_ACCOUNT_FILE` | none | the Drive import only (section 10) |
| `DSBA_ANTHROPIC_API_KEY`, `DSBA_NOORA_MODEL` | none, `claude-haiku-5-5` | Mini Noora's AI answers (section 11) |
| `DSBA_NOORA_EFFORT` | `medium` | how much she thinks before she answers: `low`, `medium` or `high` |
| `DSBA_NOORA_INPUT_USD_PER_MTOK`, `DSBA_NOORA_OUTPUT_USD_PER_MTOK` | `0.10`, `0.50` | the model's prices, for the estimated cost the monthly budget is checked against |
| `DSBA_NOORA_LONG_PROMPT_TOKENS`, `DSBA_NOORA_LONG_INPUT_USD_PER_MTOK`, `DSBA_NOORA_LONG_OUTPUT_USD_PER_MTOK` | `100000`, `0.50`, `2.50` | the prices for a prompt over that many tokens |
| `DSBA_NOORA_MAX_ANSWER_TOKENS`, `DSBA_NOORA_ANSWERS_AT_ONCE` | `8000`, `8` | the longest answer (her thinking included), and answers streaming at once hub-wide |
| `DSBA_EDGE_PROXIES` (Caddy) | `127.0.0.1/32` | proxies in front of Caddy whose `X-Forwarded-For` it keeps; on Railway `private_ranges 100.64.0.0/10` (section 5) |
| `DSBA_COMMIT_SHA` (or Railway's `RAILWAY_GIT_COMMIT_SHA`) | none | the commit `/api/v1/health` reports |

`compose.prod.yaml` itself reads these from `.env`, besides the ones it passes on: `DSBA_DOMAIN`, `POSTGRES_PASSWORD`,
`DSBA_PROXY_IP` and `DSBA_DOCKER_SUBNET` (section 5), `DSBA_BUCKET_ORIGIN` and `DSBA_CSP_CONNECT_EXTRA` /
`DSBA_CSP_SCRIPT_EXTRA` for Caddy (sections 3 and 9; `DSBA_API_UPSTREAM` is set by compose), and the text worker's
key, `DSBA_TEXTS_S3_ACCESS_KEY_ID` and `DSBA_TEXTS_S3_SECRET_ACCESS_KEY`, which it hands to that worker as its
`DSBA_S3_*` key.

The web app reads these when it is built (`web/Dockerfile` build arguments): `VITE_CSRF_COOKIE` (`__Host-dsba_csrf`
in the image), `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` (section 9), `VITE_APP_VERSION` (the version in the footer,
in `index.html` and in bug reports; Railway's `RAILWAY_GIT_COMMIT_SHA` when unset), `VITE_API_ORIGIN` (the API's
origin when it isn't the app's own; unset in every setup here) and `VITE_BASE` (the path the app is served under,
`/` by default). In development, `VITE_DEV_API_TARGET` and `VITE_DEV_HOST` point the dev server's proxy and its
address elsewhere.

Tests and the e2e suite read their own: `DSBA_TEST_ADMIN_URL` (the server where each test run makes its database)
and the `E2E_*` variables that `scripts/e2e.sh` sets (`web/e2e/support.ts`).

**The Railway dev environment.** Every push to `feature/backend` deploys the API and the web app to Railway's dev
environment, each from its Dockerfile, with the settings kept in Railway; production is not deployed there.
`.github/workflows/railway.yml` then waits until both run the pushed commit and checks the API's health and the web
app's bundle (`scripts/check-deploy.sh`). The dev site runs outside production mode, with made-up accounts only
(Mohamed's call, security review SEC-43).

