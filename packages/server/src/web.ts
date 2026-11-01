import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"
import { fileURLToPath } from "node:url"

const distDir = fileURLToPath(new URL("../../web/dist", import.meta.url))

// A wrong /api path must stay an error, not become the page.
const ApiNotFound = HttpRouter.use(Effect.fn(function*(router) {
  yield* router.add("*", "/api/*", Effect.succeed(HttpServerResponse.empty({ status: 404 })))
}))

export const WebRoutes = Layer.mergeAll(HttpStaticServer.layer({ root: distDir, spa: true }), ApiNotFound)
