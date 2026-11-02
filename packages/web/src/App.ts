// The page. A view is a function from data to nodes. The only state a component holds
// is the state an element owns — a form's field, which the browser keeps.
import type { Atom } from "effect/reactivity"
import { AsyncResult } from "effect/reactivity"
import { AtomElement, Fragment, h, view, type Child } from "./dom.ts"
import { createNote, note, notes, notesKey, type NoteList, type NoteView } from "./client.ts"
import { Link, onPath } from "./route.ts"

const wordsLabel = (words: number) => (words === 1 ? "1 word" : `${words} words`)

type ResultOf<A> = A extends Atom.Atom<infer T> ? T : never

const loading = () => h("p", null, "Loading…")
const warning = (text: string) => h("p", { role: "alert" }, text)

const NoteList = (value: ResultOf<NoteList>) =>
  AsyncResult.match(value, {
    onInitial: loading,
    onFailure: () => warning("The notes could not be loaded."),
    onSuccess: ({ value: list }) =>
      list.length === 0
        ? h("p", null, "No notes yet.")
        : h(
            "ul",
            null,
            ...list.map(({ id, title, words }) =>
              h("li", null, h(Link, { href: `/notes/${id}` }, title), " ", h("small", null, wordsLabel(words)))
            )
          )
  })

const NoteDetail = (id: number): Child => {
  const body = (result: ResultOf<NoteView>) =>
    Fragment({
      children: [
        h(Link, { href: "/" }, "All notes"),
        AsyncResult.builder(result)
          .onInitial(loading)
          .onErrorTag("NotFound", () => warning(`There is no note ${id}.`))
          .onFailure(() => warning("The note could not be loaded."))
          .onSuccess(({ title, words }) =>
            Fragment({ children: [h("h2", null, title), h("p", null, wordsLabel(words))] }),
          )
          .render(),
      ],
    })
  return view(note(id), body)
}

// The form is one element built once. Its field is uncontrolled, so the browser holds
// what a person types and no render can move the caret: patch never assigns a kept
// field's value. The button goes off on the press and back on the result, both held by
// the element itself, so a page drawn again cannot switch it back on while a note is
// still saving.
class NoteForm extends AtomElement {
  #title = h("input", { id: "title", name: "title" }) as HTMLInputElement
  #button = h("button", { type: "submit" }, "Add") as HTMLButtonElement
  #failed = h("p", { role: "alert" }, "The note was not saved. Try again.") as HTMLElement
  #saving = false

  connected(): void {
    this.#failed.hidden = true
    this.append(
      h(
        "form",
        {
          onsubmit: (event: Event) => {
            event.preventDefault()
            this.#save()
          },
        },
        h("label", { htmlFor: "title" }, "New note"),
        h("div", { className: "row" }, this.#title, this.#button),
        this.#failed,
      ),
    )
  }

  #save(): void {
    const trimmed = this.#title.value.trim()
    if (trimmed === "" || this.#saving) return
    this.#saving = true
    this.#button.disabled = true
    this.#failed.hidden = true
    // A save in flight has to be un-cancellable by a second press, so the button is
    // off before the request leaves and back on only when a result arrives.
    this.run(createNote, { payload: { title: trimmed }, reactivityKeys: [notesKey] }).then(
      () => {
        this.#title.value = ""
        this.#saving = false
        this.#button.disabled = false
      },
      () => {
        this.#failed.hidden = false
        this.#saving = false
        this.#button.disabled = false
      },
    )
  }
}

customElements.define("note-form", NoteForm)

const App = () => onPath((path) => h("main", null, h("h1", null, "Notes"), pageFor(path)))

const pageFor = (path: string): Child => {
  const id = path.match(/^\/notes\/(\d+)$/)?.[1]
  return id !== undefined ? NoteDetail(Number(id)) : path === "/" ? home() : notFound()
}

const home = (): Child => Fragment({ children: [() => h(NoteForm, null), view(notes, NoteList)] })

const notFound = (): Child =>
  Fragment({ children: [h(Link, { href: "/" }, "All notes"), warning("There is no such page.")] })

export { App }
