// @vitest-environment jsdom
import { Note } from "@billet/api"
import type { Atom } from "effect/reactivity"
import { AtomRegistry } from "effect/reactivity"
import { Deferred, Effect, Layer } from "effect"
import { HttpApiError } from "effect/http-api"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"
import { App } from "../src/App.ts"
import { NotesClient } from "../src/client.ts"
import { patch } from "../src/dom.ts"

// The real components and atoms, with the client underneath them replaced. The
// registry rides on the root element, so a test hands its own to the root.
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

// The registry rides on the root element, so the test writes the property the
// page does rather than reaching around it.
type WithRegistry = HTMLElement & { registry: AtomRegistry.AtomRegistry }
let root: WithRegistry
let registry: AtomRegistry.AtomRegistry

const renderApp = (stored: Array<Note>, beforeSave?: Effect.Effect<void>) => {
  // A Layer is not a valid initialValues entry (a tuple is [atom, value], and a
  // Layer there throws), so the client's own runtime atom is seeded with the fake
  // service. This is the whole seam: the components and the atoms stay real and
  // only the layer under them is replaced.
  registry = AtomRegistry.make({
    defaultIdleTTL: 400,
    initialValues: [[NotesClient.runtime.layer as unknown as Atom.Atom<unknown>, fakeClient(stored, beforeSave)]],
  })
  root = document.createElement("billet-app") as WithRegistry
  root.registry = registry as never
  document.body.append(root)
  patch(root, App())
  return root
}

// The queries a testing library gave for free. role and name come from the DOM
// itself, which is the whole reason the views still set role and label.
const byRole = (role: string, name?: string) => {
  const byTag: Record<string, string> = {
    button: "button",
    link: "a",
    heading: "h1, h2, h3, h4, h5, h6",
    listitem: "li",
    alert: "[role=alert]",
    paragraph: "p",
  }
  const selector = byTag[role] ?? `[role="${role}"]`
  const found = [...root.querySelectorAll(selector)] as HTMLElement[]
  const wanted = name === undefined ? found : found.filter((el) => (el.textContent ?? "").trim() === name)
  if (wanted.length === 0) throw new Error(`no ${role}${name === undefined ? "" : ` named ${JSON.stringify(name)}`} on the page`)
  return wanted
}

const byLabelText = (label: string) => {
  const found = [...root.querySelectorAll("label")].find((el) => (el.textContent ?? "").trim() === label)
  const id = found?.htmlFor
  const field = id === undefined ? undefined : (root.querySelector(`#${id}`) as HTMLElement | null)
  if (field === null || field === undefined) throw new Error(`no field labelled ${JSON.stringify(label)}`)
  return field
}

const text = (want: string) => {
  const found = [...root.querySelectorAll("*")].find((el) => (el.textContent ?? "").trim() === want)
  if (found === undefined) throw new Error(`${JSON.stringify(want)} is not on the page`)
  return found
}

const settle = async () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const click = (element: HTMLElement) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
}

beforeEach(() => window.history.pushState(null, "", "/"))
afterEach(() => {
  registry?.dispose()
  document.body.replaceChildren()
})

it("says so when there are no notes", async () => {
  renderApp([])
  await settle()
  expect(text("No notes yet.")).toBeTruthy()
})

it("adds a note through the form and shows it in the list", async () => {
  renderApp([])
  await settle()
  expect(text("No notes yet.")).toBeTruthy()

  const field = byLabelText("New note") as HTMLInputElement
  field.value = "  ship it  "
  click(byRole("button", "Add")[0])
  await settle()

  expect(byRole("link", "ship it")[0]).toBeTruthy()
})

it("keeps the button off while a note is saving, so a second press cannot cancel the first", async () => {
  const stored: Array<Note> = []
  const gate = Effect.runSync(Deferred.make<void>())
  renderApp(stored, Deferred.await(gate))
  await settle()
  expect(text("No notes yet.")).toBeTruthy()

  const button = byRole("button", "Add")[0] as HTMLButtonElement
  ;(byLabelText("New note") as HTMLInputElement).value = "one"
  click(button)
  expect(button.disabled).toBe(true)

  Effect.runSync(Deferred.succeed(gate, undefined))
  await settle()
  expect(button.disabled).toBe(false)
  expect(byRole("link", "one")[0]).toBeTruthy()
})

it("ignores a title of only spaces", async () => {
  const stored: Array<Note> = []
  renderApp(stored)
  await settle()
  expect(text("No notes yet.")).toBeTruthy()

  ;(byLabelText("New note") as HTMLInputElement).value = "   "
  click(byRole("button", "Add")[0])
  await settle()
  expect(stored).toHaveLength(0)
})

it("opens the detail view from the list and comes back", async () => {
  renderApp([new Note({ id: 1, title: "first", words: 1 })])
  await settle()

  click(byRole("link", "first")[0])
  await settle()
  expect(byRole("heading", "first")[0]).toBeTruthy()
  expect(text("1 word")).toBeTruthy()
  expect(window.location.pathname).toBe("/notes/1")

  const back = byRole("link", "All notes")[0]
  click(back)
  await settle()
  expect(byLabelText("New note")).toBeTruthy()
})

it("shows the detail view on a reload of its path", async () => {
  window.history.pushState(null, "", "/notes/1")
  renderApp([new Note({ id: 1, title: "first", words: 1 })])
  await settle()
  expect(byRole("heading", "first")[0]).toBeTruthy()
})

it("names a note that does not exist", async () => {
  window.history.pushState(null, "", "/notes/9")
  renderApp([])
  await settle()
  expect(text("There is no note 9.")).toBeTruthy()
})
