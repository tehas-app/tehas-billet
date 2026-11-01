---
name: effect
description: How this repository uses Effect 4, with the guide to read for each task, samples from the code here, and the traps found while building it. Use before writing or changing any code that imports from effect.
---

# Effect in this repository

The source of truth is the installed package. Read
`node_modules/effect/AGENTS.md` first: it is at the installed version and needs no
network. Do not write Effect from memory, because most of what is remembered is
Effect 3. `Effect.catchAll`, `Context.Tag` and `Schema.Literal(...)` with several
arguments are signs of that.

The samples below are excerpts of real files, and `test/billet_test.sh` fails if
one stops matching. When a sample and a guide disagree, trust the guide, change
the code, then change the sample.

## Which guide to read

Paths are under `node_modules/effect/ai-docs/src/`.

| Task | Guide | Used here in |
| --- | --- | --- |
| Generators, `Effect.fn` | `01_effect/01_basics/02_effect-fn.ts` | `packages/server/src/notes.ts` |
| Schema, classes, decoding | `01_effect/02_schema/10_schema-basics.ts` | `packages/api/src/index.ts` |
| Services | `01_effect/03_services/01_service.ts` | `packages/server/src/notes.ts` |
| Layer composition | `01_effect/03_services/20_layer-composition.ts` | `packages/server/src/routes.ts` |
| Config into a layer | `01_effect/03_services/20_layer-unwrap.ts` | `packages/server/src/db.ts` |
| Errors | `01_effect/04_errors/01_error-handling.ts`, `01_effect/04_errors/10_catch-tags.ts` | `packages/server/src/notes.ts` |
| Resources and scopes | `01_effect/05_resources/10_acquire-release.ts` | Not needed yet |
| The entry point | `01_effect/06_running/20_layer-launch.ts` | `packages/server/src/main.ts` |
| Logging | `08_observability/10_logging.ts` | The default logger |
| Tracing | `08_observability/20_otlp-tracing.ts` | Spans from `Effect.fn`, no exporter |
| Testing Effect code | `09_testing/10_effect-tests.ts` | `packages/server/db.test.ts` |
| Testing with layers | `09_testing/20_layer-tests.ts` | `packages/server/notes.test.ts` |
| SQL | `40_sql/10_basics.ts` | `packages/server/src/notes.ts` |
| HttpApi | `51_http-server/10_basics.ts` | `packages/server/src/routes.ts` |
| Testing HttpApi | `51_http-server/20_testing.ts` | `packages/server/notes.test.ts` |

`51_http-server/fixtures/` is a whole API split across files, and the layout here
follows it. `node_modules/effect/AGENTS.md` also holds the rule on predicates:
use `Predicate`, never a helper of your own such as `isString`. Schema's full
guide is the one reference that is not in the package: it is
[SCHEMA.md](https://github.com/Effect-TS/effect/blob/main/packages/effect/SCHEMA.md),
which needs the network and follows `main`, not the installed version.

Where a guide offers more than this repository uses, this repository wins on the
following. `40_sql/10_basics.ts` shows `Model.Class` and `SqlModel`, and the rule
here is that SQL is written as SQL, so use `SqlSchema` with the `sql` tag. It also
shows `SqliteMigrator.fromRecord`, and migrations here are `.sql` files.

## Samples

### A service

A `Context.Service` with a `static layer`. `layerNoDeps` is what a test uses, and
`layer` provides the dependencies locally so that `main.ts` stays short. The id
is the package and the path. A row is decoded by a Schema, and what the API does
not declare is a defect.

```ts packages/server/src/notes.ts
export class Notes extends Context.Service<Notes, {
  readonly list: Effect.Effect<ReadonlyArray<Note>>
  create(title: string): Effect.Effect<Note>
  read(id: number): Effect.Effect<Note, NoteNotFound>
}>()("@billet/server/Notes") {
  static readonly layerNoDeps = Layer.effect(
    Notes,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
```

```ts packages/server/src/notes.ts
      const read = Effect.fn("Notes.read")((id: number) =>
        findById(id).pipe(
          Effect.map(toNote),
          Effect.catchTags({
            NoSuchElementError: () => new NoteNotFound({ id }),
            SchemaError: Effect.die,
            SqlError: Effect.die
          })
        )
      )
```

### SQL decoded by a Schema

```ts packages/server/src/notes.ts
      const findById = SqlSchema.findOne({
        Request: Schema.Int,
        Result: NoteRow,
        execute: (id) => sql`SELECT id, title FROM notes WHERE id = ${id}`
      })
```

The `sql` tag binds `${id}` as a parameter. `findOne` fails with
`NoSuchElementError` when no row comes back, and `findAll` takes `Schema.Void`.

### An endpoint

Errors the API declares stay typed. The service knows nothing of HTTP, so the
handler maps its domain error to the one the endpoint declares.

```ts packages/api/src/index.ts
  HttpApiEndpoint.get("read", "/api/notes/:id", {
    params: { id: Schema.Int },
    success: Note,
    error: HttpApiError.NotFound
  })
```

```ts packages/server/src/routes.ts
      read: ({ params }) =>
        notes.read(params.id).pipe(
          Effect.catchTag("NoteNotFound", () => new HttpApiError.NotFound())
        )
```

### Configuration

A `Config` is yielded like an effect. Every setting has a default, because a
preview is given no variable.

```ts packages/server/src/config.ts
export const ServerConfig = Config.all({
  port: Config.Port("PORT").pipe(Config.withDefault(8080)),
  databaseFile: Config.String("DATABASE_FILE").pipe(Config.withDefault("billet.db"))
})
```

```ts packages/server/src/main.ts
const HttpServerLayer = Layer.unwrap(
  Effect.gen(function*() {
    const { port } = yield* ServerConfig
    return NodeHttpServer.layer(createServer, { port })
  })
)
```

### The entry point

```ts packages/server/src/main.ts
const Main = HttpRouter.serve(Layer.mergeAll(ApiRoutes, WebRoutes)).pipe(Layer.provide(HttpServerLayer))

Layer.launch(Main).pipe(NodeRuntime.runMain)
```

### A test through the typed client

No server and no network. `:memory:` SQLite runs the real migrations.

```ts packages/server/notes.test.ts
const Handlers = NotesHandlersNoDeps.pipe(
  Layer.provide(Notes.layerNoDeps),
  Layer.provide(layerFile(":memory:"))
)
const makeClient = HttpApiTest.groups(Api, ["notes"])
```

```ts packages/server/notes.test.ts
      const error = yield* client.notes.read({ params: { id: 999_999 } }).pipe(Effect.flip)
      assert.strictEqual(error._tag, "NotFound")
```

## The React bindings

`ai-docs` has no page on these. This section and `packages/web/` are the reference,
with the source in `node_modules/@effect/atom-react/src/Hooks.ts` and
`node_modules/effect/src/reactivity/AtomHttpApi.ts`.

The client is derived from the API. A query is an atom, and `query` keeps one atom
for each set of arguments, so calling it during a render is safe.

```ts packages/web/src/client.ts
export class NotesClient extends AtomHttpApi.Service<NotesClient>()("@billet/web/NotesClient", {
  api: Api,
  httpClient: FetchHttpClient.layer
}) {}
```

```ts packages/web/src/client.ts
export const notes = NotesClient.query("notes", "list", { reactivityKeys: [notesKey] })
export const note = (id: number) => NotesClient.query("notes", "read", { params: { id } })
export const createNote = NotesClient.mutation("notes", "create")
```

A mutation that names the key refreshes each query that names it, so there is no
manual refresh.

```tsx packages/web/src/App.tsx
    save({ payload: { title: trimmed }, reactivityKeys: [notesKey] }).then(
```

A `mutation` is one atom per endpoint, and a call on it interrupts the call before.
Where only one call can run, as in a form, keep the button off while it does:

```tsx packages/web/src/App.tsx
  const saving = AsyncResult.isWaiting(useAtomValue(createNote))
```

Where a person can start a second call while the first runs, as with a checkbox on
each row, use `runtime.fn` with `concurrent`. Nothing in this repository needs it
yet, so this sample is not a file here:

```ts
export const setTodoDone = TodosClient.runtime.fn<{ readonly id: number; readonly done: boolean }>()(
  Effect.fnUntraced(function*({ done, id }) {
    const client = yield* TodosClient
    return yield* Reactivity.mutation(client.todos.setDone({ params: { id }, payload: { done } }), [todosKey])
  }),
  { concurrent: true }
)
```

A view matches on the result. `AsyncResult.builder` tells a declared error from
any other failure.

```tsx packages/web/src/App.tsx
      {AsyncResult.builder(result)
        .onInitial(() => <p>Loading…</p>)
        .onErrorTag("NotFound", () => <p role="alert">There is no note {id}.</p>)
        .onFailure(() => <p role="alert">The note could not be loaded.</p>)
```

A test replaces the client through the runtime's layer atom, so the components and
the atoms run unchanged.

```tsx packages/web/test/App.test.tsx
    <RegistryProvider initialValues={[[NotesClient.runtime.layer, fakeClient(stored)]]}>
```

## Traps

Each of these was hit while building this repository, unless it says otherwise.

- **A POST payload is a `Schema.Struct` here.** The client then takes a plain
  object, as the form does. This is the rule of this repository and not a limit
  of Effect: a `Schema.Class` payload passed when tried on 4.1.0, with the client
  handing it an instance.
- **A `Schema.Class` response must be an instance.** A handler that returns a plain
  object fails at run time with `Expected Health` and a 500. Use `new Health(...)`.
- **`MigratorFileSystem` skips `.sql` files and reports nothing.** The first query
  then fails with `no such table`. That is why `packages/server/src/db.ts` has its
  own loader, which sorts by number as Effect's does. `MigratorFileSystem` is also
  not exported from `effect/sql`: import it from `effect/sql/MigratorFileSystem`,
  or take the same loader as `SqliteMigrator.fromFileSystem`.
- **`sql.unsafe` runs one statement.** The driver drops what follows the first with
  no error, and the client has no way to run a script. So a migration is one
  statement, and the loader fails with a `MigrationError` on a file with two. A
  trigger has semicolons in its body, so the loader refuses that too.
- **A second `mutation` call cancels the first, with no error.** The first request
  is interrupted and its work may be lost. See The React bindings above.
- **A `Config` has no `.asEffect()`.** Yield it inside `Effect.gen`.
- **The port opens before the handler attaches.** `NodeHttpServer` listens first
  and `HttpRouter.serve` attaches next, and a request in that gap is accepted and
  never answered. A probe of a starting server needs a timeout on each try, as in
  `scripts/smoke.sh`.
- **`HttpStaticServer` with `spa: true` falls back only for a request that accepts
  HTML** and a path with no extension. A browser sends that header and `curl` does
  not.
- **A curried combinator in a helper loses its types.** A bare
  `const notFound = Effect.catchTag(...)` fails in `tsc` with `never[]`. Take the
  effect as an argument.
- **Do not use `.pipe` on `Effect.fn`.** The guide says to pass combinators as its
  later arguments. A `.pipe` inside the body is fine.
- **`AtomHttpApi` turns a transport failure into a defect.** `onFailure` sees it and
  `onError` does not, so a view needs `onFailure` as its last failure case.
- **Node prints an `ExperimentalWarning` for SQLite.** Start with
  `node --disable-warning=ExperimentalWarning`.

## Stability

`effect/http-api`, `effect/sql` and `effect/reactivity` are marked
`@stability unstable` in their source, while `Config` is marked stable. All are
pinned to exact versions here. When Effect moves, read the guides again rather
than trusting this file, and run `test/billet_test.sh`.
