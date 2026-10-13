---
name: fastapi-endpoint
description: Add or change an endpoint in DSBA Hub's API end to end — schema, service, router, errors, rate limits, audit, migration if the models change, tests, and the regenerated contract for the web app. Use for any change under api/app/routers or api/app/services that adds or alters a request or response.
---

# Add or change an API endpoint

The general FastAPI rules are in the `fastapi` skill. This skill covers how this repo does it. Work through the
steps in order, and read a neighbouring endpoint in the same area before writing your own.

## 1. Shape: `app/schemas/<area>.py`
- **Base class.** Request and response models extend `ApiModel` (`app/schemas/common.py`). It gives camelCase on
  the wire, snake_case in Python, and builds from ORM objects.
- **Limits in the type.** Constrain text with `Annotated[str, StringConstraints(strip_whitespace=True,
  min_length=…, max_length=…)]`, the way the `Title` and `Description` types in `app/schemas/library.py` do.
  Closed sets are `Literal[...]`.
- **Lists.** A paged list is `Page[T]` from `app/schemas/common.py`, with `items`, `total`, `limit` and `offset`.
- **Public data.** A public response never contains an email or a phone number: people are `UserPublic`.

## 2. Logic: `app/services/<area>.py`
- **Signature.** Take `db: Session`, the acting `User`, and the parsed body. Return ORM objects or schema
  objects. The service never commits; the router does.
- **Authorization on every object.** Allow only the owner or a holder of the area's box (`access.can(user, Box.x)`). Hidden, pending
  and removed things are `not_found()` for everyone else, never 403: that way nobody learns they exist.
- **Errors.** Raise from `app/core/errors.py`:
  - `not_found()` and `forbidden()`;
  - `invalid(field, message)` (422, mapped to the field);
  - `conflict(code, message)` (409);
  - `rate_limited(...)`.

  A new error code goes into `ErrorCode` in `app/schemas/common.py`, with a comment saying when it happens.
  Messages say what happened and what to do, in plain sentence case.
- **Abuse limits.** Anything that can be abused gets `ratelimit.enforce(db, key, Model.created_at, [where…],
  limit=…, window=…, message="… Try again in {}.")`. Insert the new row in the same transaction.
- **Audit.** Reps' and admins' actions are recorded with `record(db, actor, "area.action", "target_type", id,
  {...}, ip)` (`app/services/audit.py`).
- **Notifications** go through `app/services/notify.py`. Emails are queued in the outbox, never sent inline.
- **New rows with a slug** use `insert_with_unique_slug(...)` (`app/core/text.py`).

## 3. Route: `app/routers/<area>.py`
- **Signature.** Use `router = router_for("<tag>")` (`app/routers/_base.py`), and plain `def`: the database layer
  is synchronous.
- **Dependencies.** Use the aliases from `app/core/security.py`: `db: DB`, `user: ActiveUser`, or an alias built with `requires(box)`, `requires_any(...)` or `requires_admin()`; a feature's routes also declare `needs_feature(feature)`,
  `OptionalUser` for public reads.
- **Body of the route.** Parse, call the service, `db.commit()`, return. Write
  `@router.post("/...", response_model=..., status_code=...)`.
- **Docstring.** It lists the errors, e.g. `Errors: not_found (404) when …, rate_limited (429).`
- **Client address.** `client_ip(request)` for rate limits and the audit log; never read `X-Forwarded-For` yourself.
- **Registration.** A new router module goes into the tuple in `app/routers/__init__.py`.
- **CSRF** is checked by middleware for every unsafe method; there's nothing to add.

## 4. Models changed?
Follow the `db-migration` skill: add a migration, read it, and make sure the drift tests pass.

## 5. Tests: `api/tests/<area>/test_<thing>.py`
- **Fixtures** (`tests/conftest.py`):
  - `make_user(role=..., year=...)`;
  - `client_for(user)` gives a signed-in browser with CSRF set; `client_for()` is a guest;
  - `db`, and `storage` (moto S3).
- **What to cover.** The happy path, then each failure the docstring lists: 401 as a guest, 403 or 404 as another
  student, 404 for hidden things, 409, 422 with `error.fields`, and 429 for the limit. Also cover what a suspended
  account can't do.
- **Running them.** `cd api && uv run --no-sync pytest tests/<area> -q`. Each run makes its own database, so a full
  suite run belongs in the background.

## 6. Contract and web types
After any change to a request or response shape, regenerate both files in one commit:
```sh
cd api && uv run --no-sync python -m app.cli openapi > openapi.json
cd ../web && npm run api:types        # web/src/api/schema.d.ts
```
`test_openapi_json_is_what_the_app_serves` and `scripts/check.sh web` fail if either is stale. Then use the new
types through `web/src/api/types.ts` (see the `react-feature` skill).

## 7. Before you call it done
Run `scripts/check.sh api` in the background (ruff, ruff format, mypy strict, pytest). Then follow the
`verification-before-completion` skill: show the passing output, don't just say it passed.
