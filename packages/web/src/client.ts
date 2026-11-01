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
export const note = (id: number) => NotesClient.query("notes", "read", { params: { id } })
export const createNote = NotesClient.mutation("notes", "create")
