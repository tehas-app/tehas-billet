import { Dynamic } from "@solidjs/web"
import { AsyncResult, type AtomRegistry } from "effect/reactivity"
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { RegistryContext, useAtomRun, useAtomValue } from "./atom.ts"
import { createNote, notes, notesKey } from "./client.ts"

export const wordsLabel = (words: number) => (words === 1 ? "1 word" : `${words} words`)

export function NoteForm() {
  const save = useAtomRun(createNote)
  const result = useAtomValue(createNote)
  const [title, setTitle] = createSignal("")
  const [failed, setFailed] = createSignal(false)

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    const trimmed = title().trim()
    if (trimmed === "") return
    setFailed(false)
    save({ payload: { title: trimmed }, reactivityKeys: [notesKey] }).then(
      () => setTitle(""),
      () => setFailed(true)
    )
  }

  return (
    <form onSubmit={onSubmit}>
      <label for="title">New note</label>
      <div class="row">
        <input id="title" value={title()} onInput={(event) => setTitle(event.currentTarget.value)} />
        <button type="submit" disabled={AsyncResult.isWaiting(result())}>Add</button>
      </div>
      <Show when={failed()}>
        <p role="alert">The note was not saved. Try again.</p>
      </Show>
    </form>
  )
}

export function NoteList() {
  const result = useAtomValue(notes)
  const list = createMemo(() => {
    const current = result()
    return AsyncResult.isSuccess(current) ? current.value : undefined
  })
  return (
    <Switch fallback={<p>Loading…</p>}>
      <Match when={AsyncResult.isFailure(result())}>
        <p role="alert">The notes could not be loaded.</p>
      </Match>
      <Match when={list()?.length === 0}>
        <p>No notes yet.</p>
      </Match>
      <Match when={list()}>
        {(value) => (
          <ul>
            <For each={value()} keyed={(note) => note.id}>
              {(note) => (
                <li>
                  <a href={`/notes/${note().id}`}>{note().title}</a> <small>{wordsLabel(note().words)}</small>
                </li>
              )}
            </For>
          </ul>
        )}
      </Match>
    </Switch>
  )
}

// Every island by the name the page gives it. The server renders an island and
// the page hydrates it through this one root, so the two trees match.
export const islands = { NoteForm, NoteList }

export type IslandName = keyof typeof islands

export function IslandRoot(props: { readonly name: IslandName; readonly registry: AtomRegistry.AtomRegistry }) {
  return (
    <RegistryContext value={props.registry}>
      <Dynamic component={islands[props.name]} />
    </RegistryContext>
  )
}
