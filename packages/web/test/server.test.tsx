import { Note } from "@billet/api"
import { expect, it } from "vitest"
import { renderHome, renderMissing, renderNote } from "../src/server.tsx"

const first = new Note({ id: 1, title: "first", words: 1 })

it("renders the home page with both islands, the script and the state they hydrate from", () => {
  const page = renderHome([first])
  expect(page.startsWith("<!doctype html>")).toBe(true)
  expect(page).toContain(`<div data-island="NoteForm">`)
  expect(page).toContain(`<div data-island="NoteList">`)
  expect(page).toContain(`<a href="/notes/1">first</a> <small>1 word</small>`)
  expect(page).toContain(`<script type="module" src="/assets/main.js">`)
  expect(page).toMatch(/<script type="application\/json" id="atoms">\[.*"title":"first".*\]<\/script>/)
})

it("keeps a title from closing the state script", () => {
  const page = renderHome([new Note({ id: 1, title: "</script><b>", words: 1 })])
  const state = page.slice(page.indexOf(`id="atoms">`))
  expect(state).toContain(`"title":"\\u003c/script>\\u003cb>"`)
})

it("renders a note as markup with no script", () => {
  const page = renderNote(first)
  expect(page).toContain("<h2>first</h2><p>1 word</p>")
  expect(page).not.toContain("<script")
})

it("renders a page that names what is missing", () => {
  expect(renderMissing("There is no note 9.")).toContain(`<p role="alert">There is no note 9.</p>`)
})
