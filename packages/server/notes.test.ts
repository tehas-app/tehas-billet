import { Api } from "@billet/api"
import { assert, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { layerFile } from "./src/db.ts"
import { Notes } from "./src/notes.ts"
import { NotesHandlersNoDeps } from "./src/routes.ts"

const Handlers = NotesHandlersNoDeps.pipe(
  Layer.provide(Notes.layerNoDeps),
  Layer.provide(layerFile(":memory:"))
)
const makeClient = HttpApiTest.groups(Api, ["notes"])

layer(Layer.mergeAll(Handlers, HttpServer.layerServices))("notes API", (it) => {
  it.effect("answers health", () =>
    Effect.gen(function*() {
      const client = yield* makeClient
      assert.strictEqual((yield* client.notes.health()).status, "ok")
    }))

  it.effect("creates, reads and lists a note", () =>
    Effect.gen(function*() {
      const client = yield* makeClient
      const created = yield* client.notes.create({ payload: { title: "ship it" } })
      assert.strictEqual(created.title, "ship it")
      assert.strictEqual(created.words, 2)

      const read = yield* client.notes.read({ params: { id: created.id } })
      assert.deepStrictEqual(read, created)

      const all = yield* client.notes.list()
      assert.isTrue(all.some((note) => note.id === created.id))
    }))

  it.effect("fails with a typed NotFound for an unknown id", () =>
    Effect.gen(function*() {
      const client = yield* makeClient
      const error = yield* client.notes.read({ params: { id: 999_999 } }).pipe(Effect.flip)
      assert.strictEqual(error._tag, "NotFound")
    }))
})
