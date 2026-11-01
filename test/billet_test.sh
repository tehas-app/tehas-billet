#!/usr/bin/env bash
# Checks the shape of the billet: the files its contract promises, and that its
# scripts lint clean. Run from anywhere.
#
# Usage: test/billet_test.sh
#
# Exit: 0 every check passed, 1 a check failed.
set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

failed=0
fail() {
  echo "FAIL  $1"
  failed=1
}
must_exist() {
  local file
  for file in "$@"; do
    [ -e "$file" ] || fail "$file is missing"
  done
}

must_exist scripts/verify.sh scripts/verify-full.sh scripts/smoke.sh scripts/worktree-setup.sh
must_exist migrations/0001_create_notes.sql
must_exist Cargo.toml Cargo.lock crates/example/Cargo.toml crates/example/src/lib.rs

must_exist preview/Dockerfile .dockerignore
if grep '^FROM ' preview/Dockerfile | grep -qv '@sha256:'; then
  fail "a FROM in preview/Dockerfile has no digest"
fi
if grep -q '^ENV ' preview/Dockerfile; then
  fail "preview/Dockerfile sets an ENV: a preview runs on the server's defaults"
fi

must_exist AGENTS.md .tehas/stack.md .agents/skills/effect/SKILL.md

want=$'Origin\nLanguages and runtimes\nFrameworks\nStorage\nLayout\nHow to\nDocs\nDeviations'
[ "$(sed -n 's/^## //p' .tehas/stack.md)" = "$want" ] ||
  fail ".tehas/stack.md does not have the eight headings in order"

if grep -n 'effect.website/llms' AGENTS.md .tehas/stack.md .agents/skills/effect/SKILL.md; then
  fail "a dead effect.website address"
fi

node test/docs_match.mjs || fail "the docs do not match the code"

# A person adds .pi/ in #9; a cycle that writes there is refused.
[ ! -e .pi ] || fail ".pi/ exists"

if command -v shellcheck >/dev/null; then
  shellcheck scripts/*.sh test/*.sh || fail "shellcheck"
else
  fail "shellcheck is not installed"
fi

[ "$failed" = 0 ] || exit 1
echo "ok    billet"
