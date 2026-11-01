import { it, expect } from "@effect/vitest"
import { Schema } from "effect"
import { Note, Title } from "./src/index.ts"

it("decodes a good Note", () => {
  const note = Schema.decodeUnknownSync(Note)({ id: 1, title: "ship it", words: 2 })
  expect(note).toBeInstanceOf(Note)
  expect(note.title).toBe("ship it")
})

it("refuses a title of only spaces", () => {
  expect(() => Schema.decodeUnknownSync(Title)("   ")).toThrow()
})

it("refuses an empty title", () => {
  expect(() => Schema.decodeUnknownSync(Note)({ id: 1, title: "", words: 0 })).toThrow()
})
