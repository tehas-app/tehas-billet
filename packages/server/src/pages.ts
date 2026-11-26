import type { Note } from "@billet/api"
import { Context, Effect, Layer, Predicate, Schema } from "effect"

// `npm run build -w @billet/web` writes this file from packages/web/src/server.tsx.
const bundle = new URL("../../web/dist/server/server.js", import.meta.url)

export class PagesNotBuilt extends Schema.TaggedError<PagesNotBuilt>()("PagesNotBuilt", {
  message: Schema.String,
  cause: Schema.Defect()
}) {}

// The pages, rendered to whole documents by the web package's server bundle.
// The handlers give it data; it knows nothing of SQLite or HTTP.
export class Pages extends Context.Service<Pages, {
  home(notes: ReadonlyArray<Note>): Effect.Effect<string>
  note(note: Note): Effect.Effect<string>
  missing(message: string): Effect.Effect<string>
}>()("@billet/server/Pages") {
  static readonly layer = Layer.effect(
    Pages,
    Effect.gen(function*() {
      const module: Record<string, unknown> = yield* Effect.tryPromise({
        try: () => import(bundle.href),
        catch: (cause) => new PagesNotBuilt({ message: `Could not load ${bundle.pathname}: build packages/web`, cause })
      })
      const { renderHome, renderNote, renderMissing } = module
      if (!Predicate.isFunction(renderHome) || !Predicate.isFunction(renderNote) || !Predicate.isFunction(renderMissing)) {
        return yield* new PagesNotBuilt({ message: `${bundle.pathname} does not export the renderers`, cause: null })
      }
      return Pages.of({
        home: (notes) => Effect.sync(() => renderHome(notes) as string),
        note: (note) => Effect.sync(() => renderNote(note) as string),
        missing: (message) => Effect.sync(() => renderMissing(message) as string)
      })
    })
  )
}
