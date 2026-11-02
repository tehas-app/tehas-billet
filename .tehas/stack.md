# Stack

## Origin

`tehas-billet`, version none yet.

## Languages and runtimes

- TypeScript 7, the Go-native compiler. `tsc` only checks types: Node runs `.ts`
  directly on the server and Vite bundles the browser. Nothing is emitted.
- Node.js 22.19 or newer. `@effect/platform-node` asks for that.
- Rust for measured hot paths only, built from source as a napi-rs addon. It
  loads on Linux: the build copies `libexample.so`.
- Rust 1.99.1, named by `rust-toolchain.toml`; `preview/Dockerfile` builds on
  the same version.
- Exact versions are in `package.json`, `package-lock.json` and `Cargo.lock`.

## Frameworks

- Effect 4: services and layers, typed errors, Schema, config, logging, HTTP and
  SQL, all from the `effect` package. See `.agents/skills/effect/SKILL.md`.
- Effect `HttpApi`: one definition in `packages/api`, shared by the server and
  the client. There is no hand-written fetch code.
- React 19 with Vite 8. `@effect/atom-react` where a component needs server
  state, plain React for the rest, and a few lines of plain CSS. There is no
  router library and no styling framework.
- Vitest with `@effect/vitest`, `cargo test`, and Playwright for the whole path.
- No ORM: `SqlModel` is not used here, and SQL is written as SQL. No auth.

## Storage

SQLite through Node's built-in `node:sqlite`, by way of
`@effect/sql-sqlite-node`, so there is no native binding to build. One file in
the working directory, `billet.db` unless `DATABASE_FILE` says otherwise, in WAL
mode. Numbered plain SQL migrations in `migrations/`, named `0001_name.sql`, run
at start. Each file holds one statement, and the start stops on a file with two.

## Layout

- `packages/api/src/index.ts`: every request and response shape, and the API.
- `packages/server/src/config.ts`: the settings, each with a default.
- `packages/server/src/db.ts`: the migration loader and the database layers.
- `packages/server/src/notes.ts`: a repository: the service that holds the SQL
  queries of one table. Another table gets one like it.
- `packages/server/src/routes.ts`: the handlers.
- `packages/server/src/web.ts`: serves the built page.
- `packages/server/src/native.ts`: loads the Rust addon.
- `packages/server/src/main.ts`: the entry point. Node runs it directly.
- `packages/web/src/client.ts`: the typed client and its atoms.
- `packages/web/src/App.tsx`: the views. `packages/web/src/route.tsx`: the paths.
- `packages/web/test/`: component tests. `packages/web/test/e2e/`: Playwright.
- `migrations/`: the schema. `crates/example/`: the Rust crate.
- `scripts/`: setup and gates. `test/billet_test.sh`: the shape of the billet.
- `preview/Dockerfile`: one container with the server, the page and SQLite.

## How to

Tests first in each of these. Run `scripts/verify.sh` after each step.

- **Add an endpoint:**
  1. Add it to the group in `packages/api/src/index.ts`, with Schemas for what
     goes in and out. A POST payload is a `Schema.Struct`.
  2. Add the query to the service in `packages/server/src/notes.ts`.
  3. Add the handler in `packages/server/src/routes.ts`. `tsc` fails until it
     exists. Map a domain error to the error the endpoint declares.
  4. Test it through the typed client, as `packages/server/notes.test.ts` does.
- **Add a table or a field:**
  1. Add the next numbered file to `migrations/`, one statement to a file.
  2. Add a Schema for the row and a service as in
     `packages/server/src/notes.ts`. For a field, add it to the row Schema, the
     `SELECT` and `RETURNING` lists and `Note` in `packages/api/src/index.ts`.
     A list that misses the field fails to decode, as a 500.
  3. Provide the new service's layer to the handlers, as `NotesHandlers` does.
     A new resource gets its own `HttpApiGroup`, added to `Api` next to
     `NotesGroup`. Give its handlers to `ApiRoutes` as an array, in
     `Layer.provide([NotesHandlers, OtherHandlers])`, and name the group in
     `HttpApiTest.groups`.
  4. A column whose shape differs from the API gets a Schema for the difference:
     `Schema.BooleanFromBit` stores a boolean as 0 or 1.
- **Add a page:**
  1. Add the view to `packages/web/src/App.tsx` and its path to `App`, in the
     way `NoteDetail` is added. Use `Link` from `packages/web/src/route.tsx`.
  2. A page must not share a path with the API. The API lives under `/api`, and
     the server answers an unknown path with `index.html`.
  3. Server state goes in an atom in `packages/web/src/client.ts`. A mutation
     that changes a list names the list's `reactivityKeys`. A mutation a person
     can repeat before the last one lands needs care: see the traps in
     `.agents/skills/effect/SKILL.md`.
  4. Test it as `packages/web/test/App.test.tsx` does, with the client replaced.
- **Move a hot path to Rust:**
  1. Measure it first, and keep the number for the pull request.
  2. Add a `#[napi]` function with a `cargo test` to `crates/example/src/lib.rs`.
     Node sees `word_count` as `wordCount`.
  3. Export it from `packages/server/src/native.ts`, and call it from a service.
  4. Add a Vitest test as the TypeScript caller, as
     `packages/server/notes.test.ts` does.
  5. Run `scripts/worktree-setup.sh` to rebuild the addon, then
     `scripts/verify-full.sh`. Measure again.

## Docs

- `node_modules/effect/AGENTS.md`: the guide to Effect, at the installed version
  and with no network.
- `node_modules/effect/ai-docs/`: runnable examples.
  `.agents/skills/effect/SKILL.md` says which one to read for what.
- `AGENTS.md`: the rules of this repository.
- The gap: the React bindings have no page in `ai-docs`. For them the reference
  is `packages/web/` here and the source in `node_modules/@effect/atom-react/src/`.

## Deviations

From the plan in the epic, each for a reason found while building it:

- The notes API lives under `/api`, and `/health` does not. `/notes/1` has to be
  the page of a note on a reload, and it cannot be that and an API route.
- A migration holds one statement. The driver prepares one and drops the rest
  without an error, and it has no way to run a script.
- `preview/Dockerfile` has a Rust stage. The server loads the addon at start, so
  the image cannot run without one.
- `jsdom` stays below 30, which asks for Node 22.22.2 or newer. This stack's
  floor is 22.19.
- `packages/web/tsconfig.json` sets `skipLibCheck`, because the type files of
  Playwright 1.55 use syntax that TypeScript 7 refuses.
