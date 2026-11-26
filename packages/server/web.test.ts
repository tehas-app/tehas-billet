import { Note } from "@billet/api"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { afterAll, describe, expect, it } from "vitest"
import { NoteNotFound, Notes } from "./src/notes.ts"
import { Pages } from "./src/pages.ts"
import { PageRoutesNoDeps } from "./src/web.ts"

// The real routes, with one note and a renderer that says what it was asked
// for, so this needs neither SQLite nor a build of the web package.
const first = new Note({ id: 1, title: "first", words: 1 })

const FakeNotes = Layer.succeed(Notes, Notes.of({
  list: Effect.succeed([first]),
  create: () => Effect.die("not used"),
  read: (id) => (id === first.id ? Effect.succeed(first) : Effect.fail(new NoteNotFound({ id })))
}))

const FakePages = Layer.succeed(Pages, Pages.of({
  home: (notes) => Effect.succeed(`home: ${notes.map((note) => note.title).join(", ")}`),
  note: (note) => Effect.succeed(`note: ${note.title}`),
  missing: (message) => Effect.succeed(`missing: ${message}`)
}))

const app = HttpRouter.toWebHandler(PageRoutesNoDeps.pipe(Layer.provide([FakeNotes, FakePages])), {
  disableLogger: true
})
afterAll(() => app.dispose())

const get = async (path: string) => {
  const response = await app.handler(new Request(`http://localhost${path}`))
  return { status: response.status, type: response.headers.get("content-type"), body: await response.text() }
}

describe("pages", () => {
  it("renders the home page with the notes", async () => {
    expect(await get("/")).toEqual({ status: 200, type: "text/html", body: "home: first" })
  })

  it("renders a note", async () => {
    expect(await get("/notes/1")).toEqual({ status: 200, type: "text/html", body: "note: first" })
  })

  it("names a note that does not exist, with a 404", async () => {
    expect(await get("/notes/9")).toEqual({ status: 404, type: "text/html", body: "missing: There is no note 9." })
  })

  it("answers any other path with a 404 page", async () => {
    expect(await get("/nope")).toMatchObject({ status: 404, body: "missing: There is no such page." })
    expect(await get("/notes/abc")).toMatchObject({ status: 404, body: "missing: There is no such page." })
  })

  it("answers an unknown /api path with no page", async () => {
    expect(await get("/api/nope")).toEqual({ status: 404, type: null, body: "" })
  })
})
