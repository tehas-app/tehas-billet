import { Api } from "@billet/api"
import { FetchHttpClient } from "effect/http"
import { AtomHttpApi } from "effect/reactivity"

export class NotesClient extends AtomHttpApi.Service<NotesClient>()("@billet/web/NotesClient", {
  api: Api,
  httpClient: FetchHttpClient.layer
}) {}

// A mutation that names this key refreshes every query that names it.
export const notesKey = "notes"

// The serialization key lets the server hand the list it rendered to the page.
export const notes = NotesClient.query("notes", "list", { reactivityKeys: [notesKey], serializationKey: "all" })
export const createNote = NotesClient.mutation("notes", "create")
