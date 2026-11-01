#!/usr/bin/env bash
# The slow gate: everything in verify.sh, then the steps that build. One line
# per step, and the run is non-zero when any step failed. Run from anywhere.
#
# Usage: scripts/verify-full.sh
#
# Exit: 0 every step passed, 1 a step failed.
set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

failed=0
step() { # <name> <command>...
  local name=$1 rc=0
  shift
  "$@" || rc=$?
  if [ "$rc" = 0 ]; then
    echo "ok    $name"
  else
    echo "FAIL  $name"
    failed=1
  fi
}

step "verify.sh" scripts/verify.sh
step "web build (vite)" node node_modules/vite/bin/vite.js build packages/web --logLevel error
step "rust tests" cargo test --locked
step "rust lints" cargo clippy --locked --all-targets -- -D warnings
step "rust format" cargo fmt --check
step "browser test (playwright)" node node_modules/@playwright/test/cli.js test \
  --config packages/web/test/e2e/playwright.config.ts

[ "$failed" = 0 ] || exit 1
