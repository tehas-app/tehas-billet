import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/http-api"

// Trimmed and not empty, so a title of only spaces is refused.
export const Title = Schema.Trimmed.check(Schema.isNonEmpty())

export class Note extends Schema.Class<Note>("Note")({
  id: Schema.Int,
  title: Title,
  words: Schema.Int
}) {}

export class Health extends Schema.Class<Health>("Health")({ status: Schema.Literal("ok") }) {}

// The notes live under /api so that /notes/1 stays free as the page of a note.
export class NotesGroup extends HttpApiGroup.make("notes").add(
  HttpApiEndpoint.get("health", "/health", { success: Health }),
  HttpApiEndpoint.get("list", "/api/notes", { success: Schema.Array(Note) }),
  HttpApiEndpoint.post("create", "/api/notes", {
    payload: Schema.Struct({ title: Title }),
    success: Note
  }),
  HttpApiEndpoint.get("read", "/api/notes/:id", {
    params: { id: Schema.Int },
    success: Note,
    error: HttpApiError.NotFound
  })
) {}

export class Api extends HttpApi.make("notes-api").add(NotesGroup) {}
