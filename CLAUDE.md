# DSBA Hub

The student hub for BIBF's BSc Data Science and Business Analytics (University of London, Bahrain): modules and
lessons, a library of past papers and notes, a forum, the newsletter, the programme calendar, the Career Navigator,
search and a grades calculator. Reading is open to everyone. Posting, uploading and personal features need an
account: a one-time code sent by email or text, with no passwords. The product owner is Mohamed, a DSBA student rep.

Where the work stands and what's next: @docs/STATUS.md

## Working with Mohamed (always)

- **Never block.** Mohamed must be able to talk to you at any moment.
  - Anything that takes more than about a minute runs in the background: test suites, builds, `docker compose`,
    end-to-end runs, research and reviews. Run long shell commands as background commands, and start agents as
    background agents (Ctrl+B sends a running one there).
  - Keep answering him while they run, and pick up their results when they report back.
  - Never wait in the foreground for something long, and never hand a long job to an agent that holds your reply.
- **Use the team.** Split big work across the agents in `.claude/agents/`, each in the background. Give each its own
  git worktree (`git worktree add ../dsba-<name> -b <branch>`) so agents never move each other's HEAD. Merge their
  branches yourself.
- **Check in briefly.** Write a line or two when something lands: a branch merged, checks green or red, a decision
  needed. Don't go silent, and don't narrate every step.
- **Ask only when it matters.** Ask before anything that can't be undone or that he might decide differently:
  product calls, deleting data, deploying. Otherwise make the sensible call, say which one you made, and carry on.
- **Keep `docs/STATUS.md` current.** Update what's done, what's open and the decisions. The next session starts
  from it.

## Hard rules

- Work on `feature/backend` or a branch off it. Never commit to, merge into or deploy `master` or `gh-pages`: the
  live v1 site runs from them.
- Secrets stay in `.env` on his machine or the server, never in the repo or the chat. That covers the Google API key,
  service-account JSON, S3 keys, Twilio and SMTP.
- Never put real students' emails or phone numbers in code, tests, fixtures or screenshots.
- The launch film lives on `feature/dsba-pulse`. It is never published, and nobody draws or imitates third-party logos.

## Layout

```
api/        FastAPI, SQLAlchemy 2 (sync, psycopg 3), Alembic, Pydantic v2, uv. app/{routers,services,models,schemas,core,seed}
web/        React 18, strict TypeScript, TanStack Query, openapi-fetch, React Router 7, Vite 7. src/{features,ui,api,state,lib,shell,auth}
web/e2e/    Playwright suite (signs students up with real codes)
docs/       backend/ARCHITECTURE.md (the team brief: conventions, security baseline, decisions D1-D10),
            backend/DEPLOYMENT.md, reviews/ (security, code quality, UI/UX, student test), STATUS.md
scripts/    check.sh: every check CI runs
```

## Commands

```sh
docker compose up --build                 # the stack: app :5173, API :8000 (/api/v1/docs), Mailpit :8025, MinIO console :9001
scripts/check.sh            # everything CI runs (or: scripts/check.sh api | web)
cd api && uv run --no-sync pytest tests/<area> -q                  # one area; each run makes its own database
cd web && npm test                                                 # Vitest; name.test.ts next to the module
cd web && npx playwright test                                      # e2e against a running stack (env in web/e2e/support.ts)
cd api && uv run --no-sync python -m app.cli openapi > openapi.json && cd ../web && npm run api:types   # after any API shape change
cd api && uv run --no-sync alembic revision --autogenerate -m "what changed"                          # after any model change; read it
cd api && uv run --no-sync python -m app.cli dev-login you@example.com --name "Test" --year 2 --role admin   # token for the dsba_session cookie
```

Inside Docker, run the CLI with `docker compose exec api python -m app.cli <command>`; `--help` lists the commands.

## Conventions that matter most

Details are in `docs/backend/ARCHITECTURE.md`.

- **API:**
  - Routers stay thin; the logic lives in `app/services`.
  - Errors use the shared envelope with typed codes (`app/core/errors.py`).
  - Every write is CSRF-checked and rate-limited where it can be abused.
  - Admin and moderator actions go to the audit log.
  - Keep mypy strict and ruff clean; add tests for every change.
- **Web:**
  - Use the generated API types only (`src/api/types.ts`), never `any`.
  - Use the shared homes instead of copies: `ConfirmDialog` and `QueryError` (`src/ui`); errors, paging, keys and
    uploads (`src/api`); `useDebouncedValue` and `removeStored` (`src/state`); dates and share (`src/lib`).
  - Features import each other only through their `public.ts`.
- **Copy:** plain, short, sentence case. An error says what happened and what to do next.
- **Responsive, every screen:**
  - Sizes: phones from 360 px wide plus landscape, tablets, laptops, and monitors up to 3440 px.
  - Nothing scrolls sideways.
  - Touch targets are at least 44 px on touch screens.
  - Prose stays under about 75 characters per line.

## Gotchas

- A change to an API shape means regenerating `api/openapi.json` and `web/src/api/schema.d.ts` together. The check
  fails if either is stale.
- A model change needs an Alembic migration. The drift check builds the schema from the migrations and compares it
  with the models.
- Without Docker, the local S3 is moto in memory: a restart empties it. In Docker it is MinIO (`pgsty/minio`; the
  official image is no longer on Docker Hub). Production uses AWS S3; Cloudflare R2 has no presigned POST.
- Sign-in codes: in Docker they appear in Mailpit, and texts in `docker compose logs api`. Without Docker, both go to
  the API's log.
- `web/e2e/support.ts` still defaults to the old cloud dev paths. To run it against Docker:
  - set `E2E_BASE_URL`, `E2E_MAIL_DIR`, `E2E_SMS_DIR` and `E2E_DEV_LOGIN`;
  - set the API's `DSBA_EMAIL_BACKEND=file` and `DSBA_SMS_BACKEND=file` with their directories mounted.

  It's on the list in STATUS.md.
