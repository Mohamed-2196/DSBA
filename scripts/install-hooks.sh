#!/usr/bin/env bash
# Turns on the repo's git hooks (.githooks/) for this clone. Run it once after cloning.
#
# The pre-push hook checks what each push changes before it leaves your machine (see .githooks/pre-push):
#   SKIP_CHECKS=1 git push    skip it in an emergency (or git push --no-verify)
#   FULL_CHECKS=1 git push    run everything CI runs (scripts/check.sh)
# To turn the hooks off again: git config --unset core.hooksPath
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
chmod +x "$root"/.githooks/*
git -C "$root" config core.hooksPath .githooks
echo "Git hooks are on for this clone: .githooks/pre-push checks what you push."
echo "Skip it once with SKIP_CHECKS=1 git push; run everything with FULL_CHECKS=1 git push."
