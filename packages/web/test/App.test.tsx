// @vitest-environment jsdom
import { Note } from "@billet/api"
import { RegistryProvider } from "@effect/atom-react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Deferred, Effect, Layer } from "effect"
import { HttpApiError } from "effect/http-api"
import { afterEach, beforeEach, expect, it } from "vitest"
import { App } from "../src/App.tsx"
import { NotesClient } from "../src/client.ts"

// The real components and atoms, with the client underneath them replaced.
const fakeClient = (stored: Array<Note>, beforeSave: Effect.Effect<void> = Effect.void) => {
  const client = {
    notes: {
      list: () => Effect.sync(() => [...stored]),
      create: ({ payload }: { readonly payload: { readonly title: string } }) =>
        beforeSave.pipe(
          Effect.map(() => {
            const created = new Note({ id: stored.length + 1, title: payload.title, words: 2 })
            stored.push(created)
            return created
          })
        ),
      read: ({ params }: { readonly params: { readonly id: number } }) => {
        const found = stored.find((item) => item.id === params.id)
        return found === undefined ? Effect.fail(new HttpApiError.NotFound()) : Effect.succeed(found)
      }
    }
  }
  return Layer.succeed(NotesClient, client as unknown as NotesClient["Service"])
}

const renderApp = (stored: Array<Note>) =>
  render(
    <RegistryProvider initialValues={[[NotesClient.runtime.layer, fakeClient(stored)]]}>
      <App />
    </RegistryProvider>
  )

beforeEach(() => window.history.pushState(null, "", "/"))
afterEach(cleanup)

it("says so when there are no notes", async () => {
  renderApp([])
  expect(await screen.findByText("No notes yet.")).toBeTruthy()
})

it("adds a note through the form and shows it in the list", async () => {
  renderApp([])
  await screen.findByText("No notes yet.")

  fireEvent.change(screen.getByLabelText("New note"), { target: { value: "  ship it  " } })
  fireEvent.click(screen.getByRole("button", { name: "Add" }))

  expect(await screen.findByRole("link", { name: "ship it" })).toBeTruthy()
})

it("keeps the button off while a note is saving, so a second press cannot cancel the first", async () => {
  const stored: Array<Note> = []
  const gate = Effect.runSync(Deferred.make<void>())
  const slow = fakeClient(stored, Deferred.await(gate))
  render(
    <RegistryProvider initialValues={[[NotesClient.runtime.layer, slow]]}>
      <App />
    </RegistryProvider>
  )
  await screen.findByText("No notes yet.")

  fireEvent.change(screen.getByLabelText("New note"), { target: { value: "one" } })
  fireEvent.click(screen.getByRole("button", { name: "Add" }))

  await waitFor(() => expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true))
  Effect.runSync(Deferred.succeed(gate, undefined))
  expect(await screen.findByRole("link", { name: "one" })).toBeTruthy()
})

it("ignores a title of only spaces", async () => {
  const stored: Array<Note> = []
  renderApp(stored)
  await screen.findByText("No notes yet.")

  fireEvent.change(screen.getByLabelText("New note"), { target: { value: "   " } })
  fireEvent.click(screen.getByRole("button", { name: "Add" }))

  expect(stored).toHaveLength(0)
})

it("opens the detail view from the list and comes back", async () => {
  renderApp([new Note({ id: 1, title: "first", words: 1 })])

  fireEvent.click(await screen.findByRole("link", { name: "first" }))
  expect(await screen.findByRole("heading", { name: "first" })).toBeTruthy()
  expect(screen.getByText("1 word")).toBeTruthy()
  expect(window.location.pathname).toBe("/notes/1")

  fireEvent.click(screen.getByRole("link", { name: "All notes" }))
  expect(await screen.findByLabelText("New note")).toBeTruthy()
})

it("shows the detail view on a reload of its path", async () => {
  window.history.pushState(null, "", "/notes/1")
  renderApp([new Note({ id: 1, title: "first", words: 1 })])
  expect(await screen.findByRole("heading", { name: "first" })).toBeTruthy()
})

it("names a note that does not exist", async () => {
  window.history.pushState(null, "", "/notes/9")
  renderApp([])
  expect(await screen.findByText("There is no note 9.")).toBeTruthy()
})
