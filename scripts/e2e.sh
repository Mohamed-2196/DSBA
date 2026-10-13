#!/usr/bin/env bash
# The end-to-end suite (web/e2e) against the local Docker stack, in one command:
#
#   scripts/e2e.sh                          # the whole suite
#   scripts/e2e.sh e2e/forum.spec.ts        # one area (the setup project still signs the students up first)
#   scripts/e2e.sh --headed -g "rep hides"  # anything else goes to `npx playwright test`
#   E2E_KEEP=1 scripts/e2e.sh               # keep the run's accounts and posts to look at afterwards
#   scripts/e2e.sh --restore                # put the API back on Mailpit and the log, and stop there
#
# Start the stack once with `docker compose up -d --build`, and install the suite's tools once:
# `cd web && npm ci && npx playwright install chromium`.
#
# The browser: Playwright's own Chromium when it is installed. On a Mac without it, the installed Google Chrome
# (/Applications/Google Chrome.app): `npx playwright install` can hang while unpacking on macOS with Node 26, and
# Playwright drives Chrome just as well. E2E_CHROMIUM picks another browser's executable, and
# PLAYWRIGHT_BROWSERS_PATH Playwright's browsers in another folder.
#
# What it changes in the running stack (compose.e2e.yaml, over compose.yaml):
#   - It recreates `api` and `mail` (and `web` if its settings differ) with the file backends: emails, sign-in codes
#     included, are saved in api/var/mail and texts in api/var/sms (git-ignored), where the suite reads its codes.
#     Mailpit gets nothing while this lasts.
#   - It raises two limits the whole suite would otherwise run into, because every request reaches the API through
#     the web container's proxy and so comes from one address: codes per network per hour (30) and the site's
#     texts per hour and day (50 and 300). Per-address and per-account limits are unchanged.
#   - db, minio and mailpit are never touched (no stop, no recreate, no `down`).
# The stack stays in e2e mode after the run, so reruns start at once; `scripts/e2e.sh --restore` undoes it.
#
# The suite's settings (web/e2e/support.ts) default to this stack; set any of them to override:
#   E2E_BASE_URL=http://localhost:5173  E2E_MAIL_DIR=<repo>/api/var/mail  E2E_SMS_DIR=<repo>/api/var/sms
#   E2E_DEV_LOGIN="docker compose -p dsba-hub exec -T api python -m app.cli dev-login"
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project=dsba-hub  # `name:` in compose.yaml
base=(docker compose -p "$project" -f "$root/compose.yaml")
e2e=("${base[@]}" -f "$root/compose.e2e.yaml")
mail_dir="$root/api/var/mail"
sms_dir="$root/api/var/sms"

say() { printf '\n== %s\n' "$*"; }
fail() { printf 'scripts/e2e.sh: %s\n' "$*" >&2; exit 1; }

# wait_for <what> <url> <seconds>: until the URL answers 2xx.
wait_for() {
  local what="$1" url="$2" left="$3"
  until curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; do
    ((left -= 2)) || true
    ((left > 0)) || fail "$what didn't answer at $url. Look at: docker compose logs --tail 50 api web"
    sleep 2
  done
}

backend() { "${base[@]}" exec -T api printenv DSBA_EMAIL_BACKEND 2>/dev/null | tr -d '\r' || true; }

# True when Playwright's own Chromium (the browser and its headless shell) is completely installed: each install
# location a dry run lists holds the marker Playwright writes once a browser is unpacked.
playwright_chromium_installed() {
  local dirs dir
  dirs="$(cd "$root/web" && npx --no-install playwright install --dry-run chromium 2>/dev/null \
    | awk '/^browser: / { want = /^browser: chromium/ } want && /Install location:/ { sub(/^ *Install location: */, ""); print }')"
  [[ -n "$dirs" ]] || return 1
  while IFS= read -r dir; do
    [[ -f "$dir/INSTALLATION_COMPLETE" ]] || return 1
  done <<<"$dirs"
}

restore() {
  say "Putting the API and the mail worker back on Mailpit (emails) and the API's log (texts)"
  "${base[@]}" up -d --no-deps api mail
  wait_for "The API" http://127.0.0.1:8000/api/v1/health 180
  [[ "$(backend)" != file ]] || fail "the API still writes emails to files."
  echo "Done: emails go to Mailpit (http://localhost:8025), texts to \`docker compose logs api\`."
}

case "${1:-}" in
  -h | --help)
    sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d; s/^# \{0,1\}//'
    exit 0
    ;;
  --restore)
    restore
    exit 0
    ;;
esac

command -v docker >/dev/null || fail "Docker isn't installed or isn't on the PATH."
[[ -x "$root/web/node_modules/.bin/playwright" ]] || fail "the suite's tools aren't installed: cd web && npm ci"
[[ -n "$("${base[@]}" ps -q --status running db 2>/dev/null)" ]] \
  || fail "the stack isn't running: docker compose up -d --build (from $root)"

if [[ -z "${E2E_CHROMIUM:-}${PLAYWRIGHT_BROWSERS_PATH:-}" ]] && ! playwright_chromium_installed; then
  chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  [[ "$(uname -s)" == Darwin && -x "$chrome" ]] \
    || fail "Playwright's Chromium isn't installed: cd web && npx playwright install chromium"
  export E2E_CHROMIUM="$chrome"  # playwright.config.ts launches it as the executable
  echo "Playwright's own Chromium isn't installed, so the suite runs in Google Chrome."
fi

# The folders the API writes into (as its own user, so open to everyone on a Linux host). Files older than two days
# go: no run needs them, and the suite reads every new file while it waits for a code.
mkdir -p "$mail_dir" "$sms_dir"
chmod a+rwx "$mail_dir" "$sms_dir"
find "$mail_dir" "$sms_dir" -type f -mtime +2 -delete

say "Switching the stack to e2e mode (compose.e2e.yaml)"
"${e2e[@]}" up -d --no-deps api mail web
wait_for "The API" http://127.0.0.1:8000/api/v1/health 180
[[ "$(backend)" == file ]] || fail "the API doesn't write emails to files: check compose.e2e.yaml."
wait_for "The web app" http://localhost:5173/api/v1/health 300  # the web container installs its packages first

export E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:5173}"
export E2E_MAIL_DIR="${E2E_MAIL_DIR:-$mail_dir}"
export E2E_SMS_DIR="${E2E_SMS_DIR:-$sms_dir}"
export E2E_DEV_LOGIN="${E2E_DEV_LOGIN:-docker compose -p $project exec -T api python -m app.cli dev-login}"

say "npx playwright test $*"
status=0
(cd "$root/web" && npx playwright test "$@") || status=$?

say "The stack is still in e2e mode: emails and texts go to api/var/mail and api/var/sms."
echo "Back to Mailpit: scripts/e2e.sh --restore"
exit "$status"
