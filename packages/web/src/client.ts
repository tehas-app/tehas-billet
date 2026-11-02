// The atoms the views read, and the client underneath them. The shapes come from
// packages/api, so the server validates against the same contract the client
// sends.
import { Api } from "@billet/api"
import { FetchHttpClient } from "effect/http"
import { AtomHttpApi } from "effect/reactivity"

export class NotesClient extends AtomHttpApi.Service<NotesClient>()("@billet/web/NotesClient", {
  api: Api,
  httpClient: FetchHttpClient.layer
}) {}

// A mutation that names this key refreshes every query that names it.
export const notesKey = "notes"

export const notes = NotesClient.query("notes", "list", { reactivityKeys: [notesKey] })

// A query is named by the request it makes, and that name is the registry's cache key.
// So a query made inside a render is a different atom from the one before — the page
// would watch the first while the second fetched, which reads as data that never
// arrives. One atom per note, taken from here, keeps a name from ever meaning two.
const noteAtomics = new Map<number, ReturnType<typeof NotesClient.query<"notes", "read">>>()
export const note = (id: number) => {
  const found = noteAtomics.get(id)
  if (found !== undefined) return found
  const made = NotesClient.query("notes", "read", { params: { id } })
  noteAtomics.set(id, made)
  return made
}
export const createNote = NotesClient.mutation("notes", "create")

/** What the two read atoms hold, named so a view can say what it renders. */
export type NoteList = typeof notes
export type NoteView = ReturnType<typeof note>
