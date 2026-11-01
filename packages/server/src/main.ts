import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { createServer } from "node:http"
import { ServerConfig } from "./config.ts"
import { ApiRoutes } from "./routes.ts"
import { WebRoutes } from "./web.ts"

const HttpServerLayer = Layer.unwrap(
  Effect.gen(function*() {
    const { port } = yield* ServerConfig
    return NodeHttpServer.layer(createServer, { port })
  })
)

const Main = HttpRouter.serve(Layer.mergeAll(ApiRoutes, WebRoutes)).pipe(Layer.provide(HttpServerLayer))

Layer.launch(Main).pipe(NodeRuntime.runMain)
