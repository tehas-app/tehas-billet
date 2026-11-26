# Stack

## Origin

`tehas-billet`, version none yet.

## Languages and runtimes

- TypeScript 7, the Go-native compiler. `tsc` only checks types: Node runs `.ts`
  directly on the server, and Vite compiles the web package's `.tsx`. `tsc`
  emits nothing.
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
- Solid 2 with Vite 8, as islands. The Effect server renders every page with
  Solid's `renderToString`, from the data in SQLite. A page is markup inside
  `NoHydration`, and only an island, a component in
  `packages/web/src/islands.tsx`, hydrates in the browser. A page without one
  loads no script. Islands read server state from Effect atoms through
  `packages/web/src/atom.ts`, because `@effect/atom-solid` asks for Solid 1. The
  islands on a page share one registry, so a mutation in one refreshes another.
  A link is a plain `<a>`, there is no router, and the CSS is a few lines of
  plain CSS.
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
- `packages/server/src/web.ts`: the page routes, and the islands' script and
  the stylesheet under `/assets`.
- `packages/server/src/pages.ts`: loads the web package's server bundle.
- `packages/server/src/native.ts`: loads the Rust addon.
- `packages/server/src/main.ts`: the entry point. Node runs it directly.
- `packages/web/src/client.ts`: the typed client and its atoms.
- `packages/web/src/atom.ts`: reads and writes atoms from a Solid component.
- `packages/web/src/islands.tsx`: the islands: the components that hydrate.
- `packages/web/src/pages.tsx`: the pages, which render on the server only.
- `packages/web/src/server.tsx`: the server bundle's entry. It renders a page
  and hands the atoms the islands read to the page.
- `packages/web/src/main.tsx`: the browser's entry. It hydrates each island.
- `packages/web/test/`: island and render tests. `packages/web/test/e2e/`:
  Playwright.
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
  1. Add the page to `packages/web/src/pages.tsx`, as `NotePage` is, and a
     function that renders it to `packages/web/src/server.tsx`, as
     `renderNote` does.
  2. Add the function to `Pages` in `packages/server/src/pages.ts`, and its
     route to `PageRoutesNoDeps` in `packages/server/src/web.ts`. A page must
     not share a path with the API, which lives under `/api`. A path the routes
     do not name gets the 404 page.
  3. Test the route as `packages/server/web.test.ts` does, and the markup as
     `packages/web/test/server.test.tsx` does.
- **Add an island:** only for a part of a page a person acts on.
  1. Add the component to `islands` in `packages/web/src/islands.tsx`, and
     place it on a page with `<Island name="..." />`. A name appears once on a
     page, because it is the island's hydration id.
  2. Server state goes in an atom in `packages/web/src/client.ts`. An atom the
     server renders has a `serializationKey`, and the render function seeds it
     with `skipInitialRun`, as `renderHome` does, so the server fetches nothing.
     A mutation that changes a list names the list's `reactivityKeys`. A
     mutation a person can repeat before the last one lands needs care: see
     the traps in `.agents/skills/effect/SKILL.md`.
  3. Test it as `packages/web/test/islands.test.tsx` does, with the client
     replaced.
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
- `node_modules/solid-js/CHEATSHEET.md`: Solid 2, at the installed version.
  Solid 2 is not Solid 1, and memory of Solid is usually memory of 1.x.
- The gap: Effect's atoms have no page in `ai-docs` and no Solid 2 binding. For
  them the reference is `packages/web/` here and the source in
  `node_modules/effect/src/reactivity/`.

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
- The islands are Solid's `NoHydration` and `Hydration` by hand, not Solid's
  server components. Those need its server-function runtime, which would be a
  second server beside the Effect one.
- `vitest.config.ts` has a project for each way the web package compiles. The
  Solid plugin compiles JSX for the server only when a project's environment is
  `node`.
