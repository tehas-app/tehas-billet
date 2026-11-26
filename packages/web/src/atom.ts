import { Effect } from "effect"
import { type AsyncResult, type Atom, AtomRegistry } from "effect/reactivity"
import { type Accessor, createContext, createSignal, onSettled, useContext } from "solid-js"

// The registry an island reads its atoms from. The server makes one for each
// request; the page makes one that every island on it shares.
export const RegistryContext = createContext<AtomRegistry.AtomRegistry>()

// The atom's value as a signal. It subscribes once the island is on the page,
// so the server only reads the value it was seeded with.
export function useAtomValue<A>(atom: Atom.Atom<A>): Accessor<A> {
  const registry = useContext(RegistryContext)
  const [value, setValue] = createSignal<A>(registry.get(atom) as Exclude<A, Function>)
  onSettled(() => registry.subscribe(atom, (next) => setValue(() => next), { immediate: true }))
  return value
}

// Writes to a mutation atom and settles with its result.
export function useAtomRun<W, A, E>(atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>): (input: W) => Promise<A> {
  const registry = useContext(RegistryContext)
  return (input) => {
    registry.set(atom, input)
    return Effect.runPromise(AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }))
  }
}
