#!/usr/bin/env bash
# Fills an install with the real content in one go, inside the compose stack:
#   1. the migrations (alembic upgrade head);
#   2. the reference content: modules, calendar, newsletter, career and the library's links (python -m app.cli seed);
#   3. the files in the library's Google Drive folders (python -m app.cli import-drive): it prints its plan and asks
#      before it imports anything.
#
#   scripts/seed-real.sh                 # the local stack (compose.yaml): the files go to MinIO
#   scripts/seed-real.sh --prod          # the server (compose.prod.yaml): the files go to the S3 bucket
#   scripts/seed-real.sh --dry-run       # the import only prints its plan (the migrations and the seed still run:
#                                        # both are safe to repeat, and the plan reads the links the seed loads)
#   scripts/seed-real.sh --prod --yes    # anything else goes to import-drive: --yes, --module ID, --limit N
#
# Safe to run again: the seed and the import both skip what's already there. The import needs DSBA_GOOGLE_API_KEY
# (or DSBA_GOOGLE_SERVICE_ACCOUNT_FILE, the path of a service account's JSON key on this machine) in .env next to the
# compose file, or in the environment. Only the import's own container gets them, and never on a command line:
# docs/backend/DEPLOYMENT.md, section 10.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$root/compose.yaml"
import_args=()
while (($#)); do
  case "$1" in
    --prod) compose_file="$root/compose.prod.yaml" ;;
    -h | --help)
      sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) import_args+=("$1") ;;
  esac
  shift
done
compose=(docker compose -f "$compose_file")

# The value of NAME in the environment, else in the .env file compose reads (the last line that sets it, without
# quotes); nothing when neither has it. It is only ever tested or passed on by name, never printed.
setting() {
  local name="$1" env_file
  if [[ -n "${!name:-}" ]]; then
    printf '%s' "${!name}"
    return
  fi
  env_file="$(dirname "$compose_file")/.env"
  [[ -f "$env_file" ]] || return 0
  sed -n "s/^[[:space:]]*$name[[:space:]]*=[[:space:]]*//p" "$env_file" | tail -n 1 |
    sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

key_file="$(setting DSBA_GOOGLE_SERVICE_ACCOUNT_FILE)"
if [[ -z "$(setting DSBA_GOOGLE_API_KEY)" && -z "$key_file" ]]; then
  echo "The Drive import needs DSBA_GOOGLE_API_KEY (or DSBA_GOOGLE_SERVICE_ACCOUNT_FILE) in .env:" \
    "docs/backend/DEPLOYMENT.md, section 10, says how to make one. Nothing was changed." >&2
  exit 1
fi
# -e NAME without a value: compose passes the variable from this environment or .env, so the key never appears in
# a command line (which other users of the machine can see).
import_env=(-e DSBA_GOOGLE_API_KEY)
if [[ -n "$key_file" ]]; then
  if [[ ! -r "$key_file" ]]; then
    echo "DSBA_GOOGLE_SERVICE_ACCOUNT_FILE is set, but $key_file can't be read. Nothing was changed." >&2
    exit 1
  fi
  # The container reads it as its own user (uid 10001): DEPLOYMENT.md says how to let it, and only it.
  import_env+=(-v "$key_file:/run/secrets/google-service-account.json:ro"
    -e DSBA_GOOGLE_SERVICE_ACCOUNT_FILE=/run/secrets/google-service-account.json)
fi

echo "== 1/3 Migrations"
"${compose[@]}" run --rm api alembic upgrade head
echo "== 2/3 Reference content"
"${compose[@]}" run --rm api python -m app.cli seed
echo "== 3/3 Library files from Google Drive"
"${compose[@]}" run --rm "${import_env[@]}" api python -m app.cli import-drive ${import_args[@]+"${import_args[@]}"}
