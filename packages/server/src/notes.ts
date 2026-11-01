import { Note, Title } from "@billet/api"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { layerConfig } from "./db.ts"
import { wordCount } from "./native.ts"

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()("NoteNotFound", { id: Schema.Int }) {}

const NoteRow = Schema.Struct({ id: Schema.Int, title: Title })

const toNote = (row: typeof NoteRow.Type) => new Note({ ...row, words: wordCount(row.title) })

export class Notes extends Context.Service<Notes, {
  readonly list: Effect.Effect<ReadonlyArray<Note>>
  create(title: string): Effect.Effect<Note>
  read(id: number): Effect.Effect<Note, NoteNotFound>
}>()("@billet/server/Notes") {
  static readonly layerNoDeps = Layer.effect(
    Notes,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      const findAll = SqlSchema.findAll({
        Request: Schema.Void,
        Result: NoteRow,
        execute: () => sql`SELECT id, title FROM notes ORDER BY id`
      })
      const insert = SqlSchema.findOne({
        Request: Schema.String,
        Result: NoteRow,
        execute: (title) => sql`INSERT INTO notes (title) VALUES (${title}) RETURNING id, title`
      })
      const findById = SqlSchema.findOne({
        Request: Schema.Int,
        Result: NoteRow,
        execute: (id) => sql`SELECT id, title FROM notes WHERE id = ${id}`
      })

      const list = findAll().pipe(
        Effect.map((rows) => rows.map(toNote)),
        Effect.orDie,
        Effect.withSpan("Notes.list")
      )

      const create = Effect.fn("Notes.create")((title: string) => insert(title).pipe(Effect.map(toNote), Effect.orDie))

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

      return Notes.of({ list, create, read })
    })
  )

  static readonly layer = this.layerNoDeps.pipe(Layer.provide(layerConfig))
}
