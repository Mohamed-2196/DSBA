#!/usr/bin/env bash
# Is a commit live on a deploy (the Railway dev environment)? Waits until the API and the web app both run it, then
# checks that the API is healthy and that the web app serves its bundle:
#
#   scripts/check-deploy.sh https://web-dev-254f.up.railway.app            # the commit checked out here (HEAD)
#   scripts/check-deploy.sh https://web-dev-254f.up.railway.app 1147bd1    # another commit (seven characters or more)
#
# - The API names its commit in GET /api/v1/health ("commit": RAILWAY_GIT_COMMIT_SHA or DSBA_COMMIT_SHA).
# - The web app names its build in index.html (<meta name="app-version">, from the same variable when it is built).
# - Healthy: /api/v1/health answers 200 with "database": "ok" and "storage": "ok".
# - The bundle: the entry script and stylesheet that index.html names answer 200 with their types and some size.
#
# DEPLOY_TIMEOUT (seconds, default 600) and DEPLOY_POLL (seconds, default 15) set the wait. Needs curl and jq. On
# GitHub the results also go to the job's summary. Exit status 0: the commit is live and healthy; 1: it isn't, with
# the reasons printed.
set -uo pipefail

base="${1:?usage: scripts/check-deploy.sh <base-url> [commit]}"
base="${base%/}"
want="${2:-$(git rev-parse HEAD)}"
want="$(tr '[:upper:]' '[:lower:]' <<<"$want")"
timeout="${DEPLOY_TIMEOUT:-600}"
poll="${DEPLOY_POLL:-15}"
problems=()

command -v jq >/dev/null || { echo "scripts/check-deploy.sh needs jq (and curl)" >&2; exit 2; }
if [[ ! "$want" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "usage: scripts/check-deploy.sh <base-url> [commit]: '$want' is not a commit hash" >&2
  exit 2
fi

say() { printf '%s\n' "$*"; }
summary() { [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && printf '%s\n' "$@" >>"$GITHUB_STEP_SUMMARY"; return 0; }
problem() {
  problems+=("$1")
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then say "::error::$1"; else say "FAILED: $1"; fi
}

# get <path>: the body of a GET (empty when the request fails); the status code goes to $status.
get() {
  local out
  out="$(curl -sS --max-time 20 -H 'Cache-Control: no-cache' -w $'\n%{http_code}' "$base$1" 2>/dev/null)" || out=$'\n000'
  status="${out##*$'\n'}"
  body="${out%$'\n'*}"
}

api_commit() {
  get /api/v1/health
  [[ "$status" == 200 ]] && jq -r '.commit // empty' <<<"$body" 2>/dev/null
}

web_version() {
  get /
  [[ "$status" == 200 ]] && sed -n 's/.*<meta name="app-version" content="\([^"]*\)".*/\1/p' <<<"$body" | head -1
}

runs() { [[ -n "$1" && "$1" == "$want"* ]]; } # a full hash runs the commit its first characters name

say "Waiting up to ${timeout}s for $base to run $want"
deadline=$((SECONDS + timeout))
while :; do
  api="$(api_commit)"
  web="$(web_version)"
  say "$(date -u +%H:%M:%S) api: ${api:-unknown}, web app: ${web:-unknown}"
  if runs "$api" && runs "$web"; then
    break
  fi
  if ((SECONDS >= deadline)); then
    late="after ${timeout}s: is its deploy still building, or did it fail?"
    runs "$api" || problem "The API runs ${api:-an unknown commit}, not $want, $late"
    if [[ "$web" == dev ]]; then
      problem "The web app's build doesn't know its commit ('dev'): its build had no RAILWAY_GIT_COMMIT_SHA (web/Dockerfile)."
    elif ! runs "$web"; then
      problem "The web app runs ${web:-an unknown build}, not $want, $late"
    fi
    break
  fi
  sleep "$poll"
done

# The API's health.
get /api/v1/health
if [[ "$status" != 200 ]]; then
  problem "GET /api/v1/health answered $status."
else
  database="$(jq -r '.database // "missing"' <<<"$body" 2>/dev/null)"
  storage="$(jq -r '.storage // "missing"' <<<"$body" 2>/dev/null)"
  say "health: $body"
  [[ "$database" == ok ]] || problem "The API can't reach its database (database: ${database:-unreadable})."
  [[ "$storage" == ok ]] || problem "The API can't reach its file storage (storage: ${storage:-unreadable}): uploads and downloads fail."
fi

# The web app's bundle: index.html, and the entry script and stylesheet it names.
get /
if [[ "$status" != 200 ]]; then
  problem "GET / answered $status."
else
  script="$(grep -o '<script type="module" crossorigin src="/assets/[^"]*\.js"' <<<"$body" | sed 's/.*src="//; s/"$//' | head -1)"
  style="$(grep -o '<link rel="stylesheet" crossorigin href="/assets/[^"]*\.css"' <<<"$body" | sed 's/.*href="//; s/"$//' | head -1)"
  [[ -n "$script" ]] || problem "index.html names no entry script under /assets/."
  [[ -n "$style" ]] || problem "index.html names no stylesheet under /assets/."
  for asset in $script $style; do
    found="$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}|%{size_download}|%{content_type}' "$base$asset" 2>/dev/null)" ||
      found="000|0|none"
    IFS='|' read -r code size type <<<"$found"
    case "$asset" in *.js) kind=javascript ;; *) kind=css ;; esac
    if [[ "$code" != 200 || "$type" != *"$kind"* || "$size" -lt 1024 ]]; then
      problem "$asset answered $code ($type, $size bytes)."
    else
      say "bundle: $asset ($type, $size bytes)"
    fi
  done
fi

if ((${#problems[@]})); then
  summary "### $base does not run ${want:0:7}" "" "${problems[@]/#/- }"
  exit 1
fi
summary "### $base runs ${want:0:7}" "" "The API and the web app run it, its database and storage answer and its bundle is served."
say "OK: $base runs $want."
