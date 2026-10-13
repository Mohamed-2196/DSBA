#!/usr/bin/env bash
# Every check CI runs (.github/workflows/ci.yml), in one command:
#
#   scripts/check.sh        # the API and the web app
#   scripts/check.sh api    # or only one of them
#   scripts/check.sh web
#
# Set up once: `cd api && uv sync` and `cd web && npm ci`. The API tests need a PostgreSQL server where they may
# create databases (DSBA_TEST_ADMIN_URL, default postgresql+psycopg://dsba:dsba@127.0.0.1:5432/postgres;
# `docker compose up -d db` starts one) and a pg_dump of the same major version or newer. The end-to-end suite is
# not part of this: it needs the whole stack in Docker (`scripts/e2e.sh`, see README.md).
#
# Every check runs even when an earlier one fails; the failures are listed at the end. Nothing in the repository
# is changed (the build goes to a temporary folder).
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failed=()

# check <name> <command...>: runs the command and records it when it fails (a log group of its own on GitHub).
check() {
  local name="$1" status
  shift
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::group::$name"; else printf '\n== %s\n' "$name"; fi
  "$@"
  status=$?
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::endgroup::"; fi
  if ((status != 0)); then
    failed+=("$name")
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::error::$name failed"; else echo "FAILED: $name"; fi
  fi
}

# api/requirements.txt (what the API image installs, hashes included) is uv.lock exported.
requirements_match_lock() {
  diff -u <(grep -v '^#' requirements.txt) <(uv export --locked --no-dev --format requirements-txt --no-header --quiet) \
    || { echo "api/requirements.txt is out of date: cd api && uv export --no-dev --format requirements-txt -o requirements.txt"; return 1; }
}

# web/src/api/schema.d.ts (the web app's API types) is generated from api/openapi.json.
schema_matches_openapi() {
  npx --no-install openapi-typescript ../api/openapi.json -o "$tmp/schema.d.ts" --root-types \
    --root-types-no-schema-prefix >/dev/null || return 1
  if ! diff -u src/api/schema.d.ts "$tmp/schema.d.ts"; then
    echo "web/src/api/schema.d.ts is out of date: cd web && npm run api:types"
    return 1
  fi
}

check_api() {
  cd "$root/api" || return 1
  check "api: uv.lock matches pyproject.toml" uv lock --check --quiet
  check "api: requirements.txt matches uv.lock" requirements_match_lock
  check "api: ruff" uv run --no-sync ruff check .
  check "api: ruff format" uv run --no-sync ruff format --check .
  check "api: mypy" uv run --no-sync mypy app tests
  # tests/core/test_drift.py: the migrations build the models' schema (alembic check), every migration can be
  # undone, and api/openapi.json is what the app serves
  check "api: pytest" uv run --no-sync pytest
}

check_web() {
  cd "$root/web" || return 1
  check "web: tsc (the app)" npx --no-install tsc -p tsconfig.json
  check "web: tsc (configs and the e2e suite)" npx --no-install tsc -p tsconfig.node.json
  check "web: eslint" npm run --silent lint
  check "web: knip (unused files, exports and dependencies)" npx --no-install knip
  check "web: unit tests" npm run --silent test
  check "web: schema.d.ts matches api/openapi.json" schema_matches_openapi
  check "web: build" npx --no-install vite build --outDir "$tmp/dist" --emptyOutDir --logLevel warn
}

case "${1:-all}" in
  api) check_api ;;
  web) check_web ;;
  all)
    check_api
    check_web
    ;;
  *)
    echo "usage: scripts/check.sh [api|web]" >&2
    exit 2
    ;;
esac

if ((${#failed[@]})); then
  printf '\n%d check(s) failed:\n' "${#failed[@]}"
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
printf '\nAll checks passed.\n'
