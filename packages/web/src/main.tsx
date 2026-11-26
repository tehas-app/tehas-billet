import { hydrate } from "@solidjs/web"
import { AtomRegistry, Hydration } from "effect/reactivity"
import { IslandRoot, type IslandName } from "./islands.tsx"

// The entry of a page with islands. The server rendered each island and the
// atoms it read; this hydrates every island in place on one registry, so a
// mutation in one island refreshes what another shows.
const registry = AtomRegistry.make()
const state = document.getElementById("atoms")?.textContent
if (state) Hydration.hydrate(registry, JSON.parse(state))

for (const element of document.querySelectorAll<HTMLElement>("[data-island]")) {
  const name = element.dataset.island as IslandName
  hydrate(() => <IslandRoot name={name} registry={registry} />, element, { renderId: name })
}
