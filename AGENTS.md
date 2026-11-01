# AGENTS.md

This is a billet: a small, complete web app that shows each layer of the stack
once. A new project starts as a copy of this repository. It is not a framework,
so nothing here is a library to extend. Models copy what they see, which makes
the example code the standard: match it, and keep it worth copying.

`.tehas/stack.md` says what the stack is and how to add an endpoint, a table or
a page. `.agents/skills/effect/SKILL.md` says how this repository uses Effect.

## Before you write code

Effect 4 differs a lot from Effect 3, and memory of Effect is usually memory of
Effect 3. Before writing Effect code:

1. Read `node_modules/effect/AGENTS.md`. It ships with the installed version.
2. Read `.agents/skills/effect/SKILL.md`, which maps each task to the guide in
   `node_modules/effect/ai-docs/` and lists the traps found in this repository.
3. Read the file here that already does what you need. The list is under
   Layout in `.tehas/stack.md`.

Run `scripts/worktree-setup.sh` first if `node_modules/` is missing. The docs
above live there.

## Rules

- All server code is Effect: no bare promises at service boundaries, errors in
  the error channel as tagged errors, configuration through Effect `Config`,
  never `process.env`.
- Every request and response shape is a Schema in `packages/api`. The web client
  is derived from it, so there is no hand-written fetch code.
- SQL is written as SQL, in migrations and the repository layer. No ORM.
- Rust only behind a measured need. Every Rust function has a TypeScript caller
  test.
- Tests first. Tests need no network.
- Read `node_modules/effect/AGENTS.md` and the relevant `ai-docs` before writing
  Effect code. Do not rely on memory.
- A pull request that changes the stack updates `.tehas/stack.md` in the same
  pull request.
- No secrets, gates are not edited by cycles, nothing merges on its own.
- Nothing under `.pi/` is written by a cycle: a person adds those files.

## How to verify

Quote the output of what you ran.

| Command | What it runs | When |
| --- | --- | --- |
| `scripts/verify.sh` | Types and Vitest. Fast, no network | After every change |
| `scripts/verify-full.sh` | `verify.sh`, the Vite build, the Rust checks, Playwright | Before a pull request |
| `scripts/smoke.sh` | A real server on a free port with a temporary database | Before a pull request |
| `test/billet_test.sh` | Files, shellcheck, and that the docs match the code | When docs or scripts change |

All of them need `scripts/worktree-setup.sh` to have run. It needs the network
the first time, and it builds the Rust addon that the server loads, so a change
under `crates/` needs it run again.

Node runs the `.ts` files directly and `tsc` only checks types. Imports carry the
`.ts` extension. TypeScript features that need a transform, such as `enum` or
parameter properties, do not work in Node, and `erasableSyntaxOnly` makes `tsc`
refuse them.

The versions in `package.json` are exact. Change them on purpose, with `npm ci`
and not `npm install` to rebuild the tree.

## Rust

Reach for Rust when a measurement shows a hot path in TypeScript that matters to
a person, and the same measurement can show the gain. Do not reach for it for
speed in general, for code that waits on SQLite or the network, or because a
function looks like it would be fast in Rust. `crates/example` exists to show the
bridge once, and its word count needs no Rust. Steps are under How to in
`.tehas/stack.md`.
