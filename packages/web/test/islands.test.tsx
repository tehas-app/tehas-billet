import { Note } from "@billet/api"
import { render } from "@solidjs/web"
import { fireEvent, screen, waitFor } from "@testing-library/dom"
import { Deferred, Effect, Layer } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { flush } from "solid-js"
import { afterEach, expect, it } from "vitest"
import { NotesClient } from "../src/client.ts"
import { IslandRoot } from "../src/islands.tsx"

// The real islands and atoms, with the client underneath them replaced.
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
        )
    }
  }
  return Layer.succeed(NotesClient, client as unknown as NotesClient["Service"])
}

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.innerHTML = ""
})

// Both islands on one registry, as the page hydrates them.
const renderIslands = (stored: Array<Note>, beforeSave?: Effect.Effect<void>) => {
  const registry = AtomRegistry.make({ initialValues: [[NotesClient.runtime.layer, fakeClient(stored, beforeSave)]] })
  const root = document.body.appendChild(document.createElement("div"))
  dispose = render(() => (
    <>
      <IslandRoot name="NoteForm" registry={registry} />
      <IslandRoot name="NoteList" registry={registry} />
    </>
  ), root)
}

// A signal's new value shows after a flush, which a browser runs between events.
const type = (text: string) => {
  fireEvent.input(screen.getByLabelText("New note"), { target: { value: text } })
  flush()
}
const add = () => fireEvent.click(screen.getByRole("button", { name: "Add" }))

it("says so when there are no notes", async () => {
  renderIslands([])
  expect(await screen.findByText("No notes yet.")).toBeTruthy()
})

it("adds a note through the form, and the list island shows it", async () => {
  renderIslands([])
  await screen.findByText("No notes yet.")

  type("  ship it  ")
  add()

  const link = await screen.findByRole("link", { name: "ship it" })
  expect(link.getAttribute("href")).toBe("/notes/1")
  await waitFor(() => expect((screen.getByLabelText("New note") as HTMLInputElement).value).toBe(""))
})

it("keeps the button off while a note is saving, so a second press cannot cancel the first", async () => {
  const gate = Effect.runSync(Deferred.make<void>())
  renderIslands([], Deferred.await(gate))
  await screen.findByText("No notes yet.")

  type("one")
  add()

  await waitFor(() => expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true))
  Effect.runSync(Deferred.succeed(gate, undefined))
  expect(await screen.findByRole("link", { name: "one" })).toBeTruthy()
})

it("ignores a title of only spaces", async () => {
  const stored: Array<Note> = []
  renderIslands(stored)
  await screen.findByText("No notes yet.")

  type("   ")
  add()

  expect(stored).toHaveLength(0)
})
