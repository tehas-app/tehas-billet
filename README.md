# tehas-billet

A reference stack for new web app projects: React, Effect on Node, SQLite and
Rust. A billet is the small, complete app a new project starts from. It shows
each layer once, and it is an npm workspace that stands on its own. The plan is
in epic [#1](https://github.com/tehas-app/tehas-billet/issues/1).

The app is a list of notes. Each note carries a word count from a Rust addon, so
one request goes through every layer: the React page, the typed client, the
Effect server, SQLite and Rust.

## Start

You need Node 22.19 or newer and a Rust toolchain.

```
scripts/worktree-setup.sh
npm run build -w @billet/web
node --disable-warning=ExperimentalWarning packages/server/src/main.ts
```

Open <http://localhost:8080>. The notes go in `billet.db` in the working
directory. `PORT` and `DATABASE_FILE` change those two, and neither is needed.

To work on the page with reloads, leave the server running and start Vite, which
passes `/api` on to the server:

```
npm run dev -w @billet/web
```

## What is here

| Path | What it is |
| --- | --- |
| `AGENTS.md` | The rules, for anyone changing this repository |
| `.tehas/stack.md` | The stack, the layout, and how to add an endpoint, a table or a page |
| `.agents/skills/effect/SKILL.md` | How this repository uses Effect 4, with samples and traps |
| `packages/api/` | `@billet/api`: the API definition, in Effect's `HttpApi` |
| `packages/server/` | `@billet/server`: the handlers, SQLite, and the server |
| `packages/web/` | `@billet/web`: the React page, on a client derived from the API |
| `migrations/` | Numbered plain SQL, run at start |
| `crates/example/` | The Rust crate, built into a napi-rs addon |
| `preview/Dockerfile` | One container with the server, the page and SQLite |
| `scripts/` | Setup and the gates |
| `test/billet_test.sh` | The shape of the billet, and that the docs match the code |

## The gates

The scripts find the workspace from their own file, so run them from anywhere.

```
scripts/verify.sh
scripts/verify-full.sh
scripts/smoke.sh
test/billet_test.sh
```

`verify.sh` runs `tsc --noEmit` and Vitest, and needs no network. `verify-full.sh`
adds the Vite build, `cargo test`, `cargo clippy`, `cargo fmt --check` and
Playwright. `smoke.sh` builds the page, starts a real server on a free port with a
temporary database, and asks it what a person would. Each prints one line per step
and ends non-zero when a step failed.

`worktree-setup.sh` runs `npm ci` and builds the addon, so it needs the network the
first time and a `package-lock.json` that matches `package.json`. The versions of
every dependency are exact, so `npm ci` and not `npm install` is how the tree is
built; `npm install` would be free to move a transitive package.

## Playwright

`@playwright/test` is pinned to the `PLAYWRIGHT_VERSION` in `host/versions.env` of
tehas-app/tehas: 1.55.1 today. The sandbox image holds the Chromium for that version
and no other, so the two move together. If only one moves, `verify-full.sh` fails
with a missing browser. Do not run `playwright install` in the sandbox.

Outside the sandbox, install the browser yourself. Playwright 1.55.1 does not know
Ubuntu 26.04, so there it needs to be told a platform it does:

```
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 scripts/verify-full.sh
```

## The preview

`preview/Dockerfile` follows the contract in `host/docs/new-project.md` of
tehas-app/tehas. It builds from the repository root, and it runs with no network and
no variable on the server's defaults: port 8080, and the database in `/data`, the
image's working directory.

```
git archive HEAD | docker build -f preview/Dockerfile -t tehas-preview:local -
docker run --rm -p 127.0.0.1:18080:8080 --read-only --tmpfs /tmp --tmpfs /config --tmpfs /data \
  --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges:true \
  --memory 256m --cpus 1 --pids-limit 128 --log-opt max-size=10m --log-opt max-file=2 \
  tehas-preview:local
```

Then open <http://127.0.0.1:18080>.

## Starting a project from this

Copy this repository as the root of the new one. A copy passes every gate as it is,
so start from there, and replace the notes with your first feature by following How
to in `.tehas/stack.md`.

The gates name what they guard, so removing a part means changing them in the same
step. This is a person's job, because a cycle does not edit gates.

To remove Rust, unless a measurement says you need it: delete `crates/`,
`Cargo.toml`, `Cargo.lock` and `packages/server/src/native.ts`, drop `words` from
the API, and delete the cargo lines from `scripts/worktree-setup.sh`,
`scripts/verify-full.sh` and `test/billet_test.sh`, and the Rust stage from
`preview/Dockerfile`.
