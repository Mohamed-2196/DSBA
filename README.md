# DSBA Hub

The student hub for BIBF's BSc Data Science and Business Analytics (University of London): modules and lessons,
a library of past papers and notes, a forum, the newsletter, the programme calendar, the Career Navigator, search,
a grades calculator, Mini Noora (the hub's helper) and the Daily puzzles. Reading is open to everyone. Posting,
uploading, notifications, synced lesson progress and a student's own notebook, boards and calendar need an account:
students sign in with a one-time code sent to their email or phone, with no passwords.

```
api/            the API: Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, S3 (managed with uv)
web/            the web app: React 18, strict TypeScript, Vite, TanStack Query; web/e2e/ is the Playwright suite
docs/           the team brief, the deployment guide, the reviews and the product spec (see "Docs" below)
scripts/        check.sh: every check CI runs, in one command
compose.yaml    the local stack            compose.prod.yaml    production
```

## Run it with Docker

```sh
docker compose up --build
```

Then open http://localhost:5173. The stack runs PostgreSQL, MinIO (the S3 store, console at
http://localhost:9001), Mailpit (every email the Hub sends, sign-in codes included: http://localhost:8025), the
API (http://localhost:8000, interactive docs at `/api/v1/docs`), the mail worker (emails, the Sunday summary and
reminders), the text worker (search inside papers) and the Vite dev server. The API applies the migrations and
loads the reference content when it starts, and reloads when a file under `api/app` changes. Every feature added
after the first ones arrives switched off: `docker compose exec api python -m app.cli enable-features` turns them
all on.
Codes sent by text appear in the API's log: `docker compose logs -f api`.

The defaults need no `.env`; to change them, copy `.env.example` to `.env`. To make yourself an admin, put your
email in `DSBA_ADMIN_IDENTIFIERS` before you first sign in, or run
`docker compose exec api python -m app.cli set-role you@example.com student admin` afterwards.

## Run it without Docker

You need Python 3.11+ with [uv](https://docs.astral.sh/uv/), Node 22, PostgreSQL 16 or newer, and an S3 endpoint on
`127.0.0.1:9000`. The API's defaults (`api/app/config.py`) match this setup.

```sh
# PostgreSQL: a dsba user (password dsba) that may create databases (each test run makes its own)
psql -U postgres -c "CREATE ROLE dsba LOGIN PASSWORD 'dsba' CREATEDB" -c "CREATE DATABASE dsba OWNER dsba"

# The API on :8000
cd api
uv sync
uv run --no-sync moto_server -H 127.0.0.1 -p 9000 &    # S3 in memory; or MinIO with the keys dsba / dsba-dev-secret
uv run --no-sync alembic upgrade head
uv run --no-sync python -m app.cli seed
# After the migrations change, rebuild the database: psql -U postgres -c "DROP DATABASE dsba WITH (FORCE)" -c "CREATE DATABASE dsba OWNER dsba",
# then run alembic upgrade head and seed again.
uv run --no-sync uvicorn app.main:app --reload --port 8000
uv run --no-sync python -m app.cli mail-worker          # in another terminal: notification emails

# The web app on :5173, which passes /api to :8000
cd web
npm ci
npm run dev
```

Sign-in codes go to the API's log (`DSBA_EMAIL_BACKEND=console`, the default). To sign in without a code,
`uv run --no-sync python -m app.cli dev-login you@example.com --name "Test Student" --year 2 --role admin` prints a
session token: set it as the `dsba_session` cookie for `127.0.0.1`. `python -m app.cli --help` lists the other
commands (backups, the daily sweep, roles, the OpenAPI document).

## Checks and tests

```sh
scripts/check.sh          # everything CI runs, for the API and the web app
scripts/check.sh api      # or one of them: scripts/check.sh web
scripts/check.sh api --fail-fast   # stop at the first failure, as CI does
```

Turn on the pre-push hook once per clone with `scripts/install-hooks.sh`. Before each push it runs the checks for
what the push changes: the API's lint, types and the tests of the areas touched, and the web app's types, lint and
unit tests. `SKIP_CHECKS=1 git push` skips it, and `FULL_CHECKS=1 git push` runs everything below.

`scripts/check.sh` runs these: the lockfiles, ruff, ruff format, mypy and pytest for the API; tsc, ESLint, the unit
tests and a production build for the web app; and the drift checks (the migrations build exactly the models' schema
and can be undone, `api/openapi.json` is what the API serves, and `web/src/api/schema.d.ts` is generated from it).
CI (`.github/workflows/ci.yml`) runs it with `--fail-fast` on every push and on pull requests into `feature/backend`.

- **API tests:** `cd api && uv run --no-sync pytest tests/community -q` for one area. Each run creates its own
  database on the server named by `DSBA_TEST_ADMIN_URL` (default
  `postgresql+psycopg://dsba:dsba@127.0.0.1:5432/postgres`); S3 is moto, in-process. The whole suite runs on up to
  four workers, each with a database of its own: `uv run --no-sync pytest -n auto --maxprocesses 4` (as
  `scripts/check.sh` runs it).
- **Web unit tests:** `cd web && npm test` (Vitest). Put `name.test.ts` next to the module it checks.
- **End-to-end:** `scripts/e2e.sh` (about three minutes; `scripts/e2e.sh --restore` afterwards), against the Docker
  stack. It signs up students with real codes, so it switches the stack to write emails and texts to files
  (`compose.e2e.yaml`) and reads them there; arguments go on to `npx playwright test` (pick tests with `-g "title"`).

After changing the API's request or response shapes, regenerate both contract files:
`cd api && uv run --no-sync python -m app.cli openapi > openapi.json && cd ../web && npm run api:types`.
After changing the models, add a migration: `cd api && uv run --no-sync alembic revision --autogenerate -m "..."`,
and read what it generated.

## Deploy

Production is one server running Docker Compose (`compose.prod.yaml`: Caddy with TLS in front of the built app and
the API, PostgreSQL, the mail and text workers, a daily backup and a daily clean-up) and an S3 bucket outside it.
Every setting, the bucket, the security headers, backups and restores are in
[docs/backend/DEPLOYMENT.md](docs/backend/DEPLOYMENT.md). Every push to `feature/backend` deploys to the Railway dev
environment (DEPLOYMENT.md, section 12).

## Docs

| | |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | where the work stands, what's next and what Mohamed still has to decide |
| [docs/backend/ARCHITECTURE.md](docs/backend/ARCHITECTURE.md) | how the code is organised and where each area lives, the API contract, conventions, access, the security baseline, and the product decisions |
| [docs/backend/CMS.md](docs/backend/CMS.md) | every piece of content students see, where it is edited in Manage, by whom, and what it starts from |
| [docs/backend/DEPLOYMENT.md](docs/backend/DEPLOYMENT.md) | production: every setting, object storage, the proxy and headers, backups and restore, the sweep, analytics, the workers |
| [docs/reviews/](docs/reviews/) | the security, code-quality, UI/UX and student-test reviews |
| [docs/prototype/](docs/prototype/) | the product spec and the design foundation of the prototype the app grew from |
