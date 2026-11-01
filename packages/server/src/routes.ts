import { Api, Health } from "@billet/api"
import { Effect, Layer } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/http-api"
import { Notes } from "./notes.ts"

// Without its dependencies, so that a test can supply its own database.
export const NotesHandlersNoDeps = HttpApiBuilder.group(
  Api,
  "notes",
  Effect.fn(function*(handlers) {
    const notes = yield* Notes

    return handlers.handleAll({
      health: () => Effect.succeed(new Health({ status: "ok" })),
      list: () => notes.list,
      create: ({ payload }) => notes.create(payload.title),
      read: ({ params }) =>
        notes.read(params.id).pipe(
          Effect.catchTag("NoteNotFound", () => new HttpApiError.NotFound())
        )
    })
  })
)

export const NotesHandlers = NotesHandlersNoDeps.pipe(Layer.provide(Notes.layer))

export const ApiRoutes = HttpApiBuilder.layer(Api).pipe(Layer.provide(NotesHandlers))
