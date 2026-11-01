#!/usr/bin/env bash
# The gate of the billet workspace: types, then tests. One line per step, and
# the whole run is non-zero when any step failed. Run from anywhere.
#
# The types step is tsc alone; node runs the .ts files, so nothing is emitted.
#
# Usage: scripts/verify.sh
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

step "types (tsc --noEmit)" node node_modules/typescript/bin/tsc --noEmit -p tsconfig.base.json
step "web types (tsc --noEmit)" node node_modules/typescript/bin/tsc --noEmit -p packages/web/tsconfig.json
step "tests (vitest)" node node_modules/vitest/vitest.mjs run --no-color

[ "$failed" = 0 ] || exit 1
