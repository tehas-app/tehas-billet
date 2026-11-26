import type { Note } from "@billet/api"
import { type JSX, NoHydration, renderToString } from "@solidjs/web"
import { AsyncResult, Atom, AtomRegistry, Hydration } from "effect/reactivity"
import { RegistryContext } from "./atom.ts"
import { notes } from "./client.ts"
import { HomePage, MissingPage, NotePage } from "./pages.tsx"

// The server bundle's entry: `packages/server/src/pages.ts` calls these with the
// data from SQLite, and each returns a whole document.

const render = (registry: AtomRegistry.AtomRegistry, page: () => JSX.Element) =>
  "<!doctype html>" + renderToString(() => (
    <RegistryContext value={registry}>
      <NoHydration>{page()}</NoHydration>
    </RegistryContext>
  ))

// The atoms the islands read, after the render read them, for the page to
// hydrate its registry from. A `<` would let a title close the script.
const withState = (registry: AtomRegistry.AtomRegistry, html: string) => {
  const state = JSON.stringify(Hydration.dehydrate(registry)).replaceAll("<", "\\u003c")
  return html.replace("</body>", `<script type="application/json" id="atoms">${state}</script></body>`)
}

// One registry per request, seeded with what the islands read and disposed
// after, so nothing is shared between requests and the server fetches nothing.
const withRegistry = (
  seed: Parameters<typeof AtomRegistry.make>[0],
  f: (registry: AtomRegistry.AtomRegistry) => string
) => {
  const registry = AtomRegistry.make(seed)
  try {
    return f(registry)
  } finally {
    registry.dispose()
  }
}

export const renderHome = (list: ReadonlyArray<Note>): string =>
  withRegistry(
    { initialValues: [Atom.initialValue(notes, AsyncResult.success(list), { skipInitialRun: true })] },
    (registry) => withState(registry, render(registry, () => <HomePage />))
  )

export const renderNote = (note: Note): string =>
  withRegistry(undefined, (registry) => render(registry, () => <NotePage note={note} />))

export const renderMissing = (message: string): string =>
  withRegistry(undefined, (registry) => render(registry, () => <MissingPage message={message} />))
