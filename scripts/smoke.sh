#!/usr/bin/env bash
# Build the pages, start the server on a free port with a temporary database,
# ask it the things a person would, and stop it. Run from anywhere.
#
# Usage: scripts/smoke.sh
#
# Exit: 0 every check passed, 1 a check failed or the server did not start.
set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

node node_modules/vite/bin/vite.js build packages/web --logLevel error || exit 1

work=$(mktemp -d) || exit 1
server=
cleanup() {
  if [ -n "$server" ]; then
    kill "$server" 2>/dev/null
    wait "$server" 2>/dev/null
  fi
  rm -rf "$work"
}
trap cleanup EXIT

port=$(node -e '
  const server = require("node:net").createServer().listen(0, "127.0.0.1", () => {
    console.log(server.address().port)
    server.close()
  })') || exit 1
base="http://127.0.0.1:$port"

PORT=$port DATABASE_FILE="$work/smoke.db" \
  node --disable-warning=ExperimentalWarning packages/server/src/main.ts >"$work/server.log" 2>&1 &
server=$!

# The port opens before the handler attaches, and a request in that gap is never
# answered, so each try needs a timeout of its own.
up=0
for _ in $(seq 1 100); do
  if curl -fsS --max-time 1 -o /dev/null "$base/health" 2>/dev/null; then
    up=1
    break
  fi
  kill -0 "$server" 2>/dev/null || break
  sleep 0.1
done
if [ "$up" != 1 ]; then
  echo "FAIL  the server did not answer /health"
  tail -n 20 "$work/server.log"
  exit 1
fi
echo "ok    GET /health"

failed=0
check() { # <name> <want> <got>
  if [ "$2" = "$3" ]; then
    echo "ok    $1"
  else
    echo "FAIL  $1: wanted $2, got $3"
    failed=1
  fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

check "POST /api/notes with a blank title is a 400" 400 "$(status -X POST -H 'content-type: application/json' \
  -d '{"title":"   "}' "$base/api/notes")"
check "POST /api/notes" 200 "$(status -X POST -H 'content-type: application/json' \
  -d '{"title":"smoke"}' "$base/api/notes")"
check "GET /api/notes/1" 200 "$(status "$base/api/notes/1")"
check "GET /api/notes/999 is a 404" 404 "$(status "$base/api/notes/999")"

check "GET /api/nope is a 404" 404 "$(status "$base/api/nope")"

# The server renders each page. The home page carries its islands and their
# script; a note's page is markup alone.
has() { curl -s "$1" | grep -c "$2"; }
check "GET / renders the islands" 1 "$(has "$base/" 'data-island="NoteList"')"
check "GET / lists the note" 1 "$(has "$base/" '<a href="/notes/1">smoke</a>')"
check "GET /notes/1 renders the note" 1 "$(has "$base/notes/1" '<h2>smoke</h2>')"
check "GET /notes/1 has no script" 0 "$(has "$base/notes/1" '<script')"
check "GET /notes/999 is a 404 page" 404 "$(status "$base/notes/999")"
check "GET /nope is a 404 page" 404 "$(status "$base/nope")"
check "GET /assets/main.js" 200 "$(status "$base/assets/main.js")"
check "GET /assets/style.css" 200 "$(status "$base/assets/style.css")"

[ "$failed" = 0 ] || exit 1
