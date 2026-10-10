# Deploying DSBA Hub

Production runs on one server with Docker Compose (`compose.prod.yaml`): Caddy in front, the API, PostgreSQL and
two daily jobs. Files live in an S3 bucket outside the server. Local development uses `compose.yaml` instead.

```
browser ──https──▶ web (Caddy: TLS, the built app, /api/* proxied, security headers, 1 MB body cap)
   │                  └──▶ api (FastAPI, no published port) ──▶ db (PostgreSQL 17, volume pgdata)
   └──presigned POST/GET──▶ bucket (AWS S3, or MinIO behind HTTPS)
backup (daily): pg_dump ──▶ backup bucket (its own key)      sweep (daily): uploads, codes, sessions
```

## 1. Before you start

- A server with Docker and the Compose plugin, ports 80 and 443 open, and a DNS name pointing at it
  (`DSBA_DOMAIN`, e.g. `hub.example.com`). Caddy gets and renews the certificate itself.
- An S3 bucket for files and a second bucket for backups (section 3).
- An SMTP account for sign-in codes (any provider's relay), and a Twilio account if codes go out by text too.

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
| `DSBA_TRUSTED_PROXIES` | never `0.0.0.0/0` or `::/0` |
| `DSBA_S3_*` | bucket and keys set, not the development keys; the endpoint set explicitly (empty for AWS S3); what browsers use (`DSBA_S3_PUBLIC_ENDPOINT_URL`, else `DSBA_S3_ENDPOINT_URL`) is `https://`; `DSBA_S3_CREATE_BUCKET` false (the default in production) |
| `DSBA_EMAIL_BACKEND` | `smtp`, with `DSBA_SMTP_HOST` set and `DSBA_EMAIL_FROM` on your own domain |
| `DSBA_SMS_BACKEND` | `twilio` with its three settings, or `DSBA_SMS_ALLOWED_REGIONS` empty (no texts at all) |

Also in production: the API docs (`/api/v1/docs`) and `/api/v1/openapi.json` are off (the web app's types come
from `api/openapi.json` in the repository), and `python -m app.cli dev-login` refuses to run. The API image sets
`DSBA_ENV=production` itself, so a container started without settings fails instead of running in development mode.

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

**`DSBA_BUCKET_ORIGIN`** is the origin presigned URLs point at; the Content-Security-Policy allows uploads to it,
and images, PDF previews and media from it. With `DSBA_S3_FORCE_PATH_STYLE=false` on AWS that is
`https://<bucket>.s3.<region>.amazonaws.com`; with path-style URLs (MinIO) it is the endpoint's origin, e.g.
`https://files.example.com`.

## 4. Start

```sh
docker compose -f compose.prod.yaml up -d --build          # migrate runs first, then the API and Caddy
docker compose -f compose.prod.yaml run --rm api python -m app.cli setup-bucket
docker compose -f compose.prod.yaml run --rm api python -m app.cli seed
docker compose -f compose.prod.yaml run --rm api python -m app.cli set-role you@example.com admin   # after your first sign-in
```

`DSBA_ADMIN_IDENTIFIERS` does the same for the people listed there when they first sign in. `set-role` writes an
audit row (`user.role`, `via: cli`).

**Updating:** `git pull && docker compose -f compose.prod.yaml up -d --build`. The `migrate` service applies new
migrations before the API starts. Run `seed` again after updates that change the reference content (it never
overwrites what moderators changed).

**Health:** `GET /api/v1/health` (the API image's healthcheck uses it); logs with
`docker compose -f compose.prod.yaml logs -f api`. Logs carry no sign-in codes, tokens or full phone numbers.

## 5. Client addresses and the proxy

Per-IP limits (sign-in codes above all), sessions and the audit log use the client's address. The API takes it from
the TCP connection, and reads `X-Forwarded-For` only when the connection comes from one of `DSBA_TRUSTED_PROXIES`
(addresses or CIDRs; none by default). It then reads the header from the right and takes the first address that
isn't a trusted proxy, so whatever a client writes in the header itself is ignored; a value that isn't an IP address
counts as no address. uvicorn runs with `--no-proxy-headers` so it doesn't rewrite the peer first.

In `compose.prod.yaml`, Caddy has a fixed address on the internal network (`DSBA_PROXY_IP`, default `172.30.0.10`,
in `DSBA_DOCKER_SUBNET`, default `172.30.0.0/24`; change both if that subnet is taken) and is the only trusted proxy.
Caddy drops any `X-Forwarded-For` a client sends and writes the client's address. The API publishes no port.

**Behind Cloudflare or another CDN**, Caddy sees the CDN's addresses: add the CDN's ranges to Caddy
(`servers { trusted_proxies static <ranges> }` in the global options) **and** to `DSBA_TRUSTED_PROXIES`, so both
skip them when reading the header.

## 6. Security headers

Caddy (`web/deploy/Caddyfile`) sets on everything: `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
and `X-Content-Type-Options` and `Referrer-Policy` where the answer has none. On the web app's pages:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-<theme script>'; style-src 'self'
  'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com <bucket>; media-src 'self' https:;
  font-src 'self' data:; connect-src 'self' <bucket>; frame-src https://www.youtube.com
  https://www.youtube-nocookie.com https://vc.bibf.com <bucket>; object-src 'none'; base-uri 'self';
  form-action 'self'; frame-ancestors 'none'
```

- No inline script runs except the theme script in `index.html` (applied before first paint): its hash is computed
  from the built page when the image is built (`web/deploy/csp-hashes.mjs`), so it always matches. `javascript:`
  links can't run either, whichever renderer lets one through.
- `style-src 'unsafe-inline'`: React sets inline `style` attributes; styles can't run script.
- Turning analytics on (`VITE_POSTHOG_KEY` at build time) needs `DSBA_CSP_SCRIPT_EXTRA=https://us-assets.i.posthog.com`
  and `DSBA_CSP_CONNECT_EXTRA=https://us.i.posthog.com`.
- Hashed assets (`/assets/*`) are cached for a year; everything else revalidates, so a deploy shows at once.
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

- uploads never attached to anything (a library item or a forum post) a day after they were made: the object, then
  the row;
- sign-in codes older than two days (the longest rate-limit window is a day);
- sessions that expired or were revoked more than 30 days ago.

`python -m app.cli sweep-uploads` is the old name of the same command.
