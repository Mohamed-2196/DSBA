---
name: db-migration
description: Change DSBA Hub's database schema safely with Alembic — edit the SQLAlchemy models, generate a migration with the repo's numbering, read and fix what autogenerate wrote, and pass the drift tests (migrations equal the models, every migration reversible). Use whenever anything under api/app/models changes.
---

# Change the database schema

The models in `api/app/models/` describe the schema. Migrations in `api/migrations/versions/` build it, and the
drift tests (`api/tests/core/test_drift.py`) check that the two agree and that every migration can be undone.

## Steps
1. **Change the model.**
   - Use `Mapped[...]` with `mapped_column(...)`.
   - Enums go through `str_enum(...)`. Primary keys use `uuid_pk()` and timestamps `created_ts()`
     (`app/models/base.py`).
   - Add an index for every new query pattern and every foreign key that `ON DELETE SET NULL` has to scan.
   - Name indexes `ix_<table>_<what>`.
2. **Generate the migration.** Revision ids are short numbers, and the file name gets the date: next is `0005`.
   ```sh
   cd api && uv run --no-sync alembic revision --autogenerate --rev-id 0005 -m "what changed, in a few words"
   ```
3. **Read what it wrote, then fix it.** Autogenerate misses or mangles things:
   - renamed columns or tables (it drops and adds instead);
   - server defaults;
   - enum and check constraint changes;
   - computed columns like `search_vector`;
   - data that must move.

   Put a docstring at the top of the migration saying why, as 0004 does. A `NOT NULL` column on a table with rows
   needs a server default or a backfill first.
4. **Write `downgrade()` too.** It must restore the previous schema; the drift test runs it.
5. **Apply it to your dev database.** Run `uv run --no-sync alembic upgrade head`, or restart the API container,
   which migrates when it starts.
6. **Run the drift tests and the area's tests**:
   ```sh
   uv run --no-sync pytest tests/core/test_drift.py tests/<area> -q
   ```
   - `test_the_migrations_build_the_models_schema` is `alembic check` against a database migrated to head.
   - `test_every_migration_can_be_undone_and_redone` walks each step down and up again.
7. **If a response shape changed too,** regenerate `api/openapi.json` and `web/src/api/schema.d.ts` (the
   `fastapi-endpoint` skill, step 6).

## Never
- Never edit a migration that has already been merged into `feature/backend`: add a new one.
- Never drop a column with data in the same release that stops writing it. Stop writing first, drop later.
- Never put real people's data in a migration.
