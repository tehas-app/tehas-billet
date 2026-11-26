import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"
import { fileURLToPath } from "node:url"
import { Notes } from "./notes.ts"
import { Pages } from "./pages.ts"

const assetsDir = fileURLToPath(new URL("../../web/dist/client/assets", import.meta.url))

const html = (body: string, status = 200) => HttpServerResponse.text(body, { contentType: "text/html", status })

const NoteParams = Schema.Struct({ id: Schema.NumberFromString.check(Schema.isInt()) })

// Without their dependencies, so that a test can supply its own.
export const PageRoutesNoDeps = HttpRouter.use(Effect.fn(function*(router) {
  const notes = yield* Notes
  const pages = yield* Pages
  const missing = (message: string) => pages.missing(message).pipe(Effect.map((body) => html(body, 404)))

  yield* router.add("GET", "/", notes.list.pipe(Effect.flatMap(pages.home), Effect.map((body) => html(body))))

  yield* router.add(
    "GET",
    "/notes/:id",
    HttpRouter.schemaPathParams(NoteParams).pipe(
      Effect.flatMap(({ id }) =>
        notes.read(id).pipe(
          Effect.flatMap(pages.note),
          Effect.map((body) => html(body)),
          Effect.catchTag("NoteNotFound", () => missing(`There is no note ${id}.`))
        )
      ),
      Effect.catchTag("SchemaError", () => missing("There is no such page."))
    )
  )

  // A wrong /api path must stay an error, not become a page.
  yield* router.add("*", "/api/*", Effect.succeed(HttpServerResponse.empty({ status: 404 })))
  yield* router.add("GET", "/*", missing("There is no such page."))
}))

export const PageRoutes = PageRoutesNoDeps.pipe(Layer.provide([Notes.layer, Pages.layer]))

// The islands' script and the stylesheet, under the names the pages link to.
export const AssetRoutes = HttpStaticServer.layer({ root: assetsDir, prefix: "/assets" })

export const WebRoutes = Layer.mergeAll(PageRoutes, AssetRoutes)
