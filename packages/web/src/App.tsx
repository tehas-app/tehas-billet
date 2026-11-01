import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { type FormEvent, useState } from "react"
import { createNote, note, notes, notesKey } from "./client.ts"
import { Link, usePath } from "./route.tsx"

const wordsLabel = (words: number) => (words === 1 ? "1 word" : `${words} words`)

function NoteForm() {
  const save = useAtomSet(createNote, { mode: "promise" })
  const saving = AsyncResult.isWaiting(useAtomValue(createNote))
  const [title, setTitle] = useState("")
  const [failed, setFailed] = useState(false)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (trimmed === "") return
    setFailed(false)
    save({ payload: { title: trimmed }, reactivityKeys: [notesKey] }).then(
      () => setTitle(""),
      () => setFailed(true)
    )
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="title">New note</label>
      <div className="row">
        <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <button type="submit" disabled={saving}>Add</button>
      </div>
      {failed && <p role="alert">The note was not saved. Try again.</p>}
    </form>
  )
}

function NoteList() {
  const list = useAtomValue(notes)
  return AsyncResult.match(list, {
    onInitial: () => <p>Loading…</p>,
    onFailure: () => <p role="alert">The notes could not be loaded.</p>,
    onSuccess: ({ value }) =>
      value.length === 0
        ? <p>No notes yet.</p>
        : (
          <ul>
            {value.map(({ id, title, words }) => (
              <li key={id}>
                <Link href={`/notes/${id}`}>{title}</Link> <small>{wordsLabel(words)}</small>
              </li>
            ))}
          </ul>
        )
  })
}

function NoteDetail({ id }: { readonly id: number }) {
  const result = useAtomValue(note(id))
  return (
    <>
      <Link href="/">All notes</Link>
      {AsyncResult.builder(result)
        .onInitial(() => <p>Loading…</p>)
        .onErrorTag("NotFound", () => <p role="alert">There is no note {id}.</p>)
        .onFailure(() => <p role="alert">The note could not be loaded.</p>)
        .onSuccess(({ title, words }) => (
          <>
            <h2>{title}</h2>
            <p>{wordsLabel(words)}</p>
          </>
        ))
        .render()}
    </>
  )
}

export function App() {
  const path = usePath()
  const id = path.match(/^\/notes\/(\d+)$/)?.[1]
  return (
    <main>
      <h1>Notes</h1>
      {id !== undefined
        ? <NoteDetail id={Number(id)} />
        : path === "/"
        ? (
          <>
            <NoteForm />
            <NoteList />
          </>
        )
        : (
          <>
            <Link href="/">All notes</Link>
            <p role="alert">There is no such page.</p>
          </>
        )}
    </main>
  )
}
