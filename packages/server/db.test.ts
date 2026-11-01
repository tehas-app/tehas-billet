import { NodeServices } from "@effect/platform-node"
import type { SqliteMigrator } from "@effect/sql-sqlite-node"
import { assert, it } from "@effect/vitest"
import { Effect, FileSystem } from "effect"
import { SqlClient } from "effect/sql"
import { layerFile } from "./src/db.ts"

const countRows = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<{ readonly n: number }>`SELECT count(*) AS n FROM probe`
})

it.effect("the loader runs a .sql file and skips what is not a migration", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    yield* fs.writeFileString(`${dir}/0001_probe.sql`, "CREATE TABLE probe (id INTEGER PRIMARY KEY);")
    yield* fs.writeFileString(`${dir}/README.md`, "not a migration")

    const rows = yield* countRows.pipe(Effect.provide(layerFile(":memory:", dir)))
    assert.strictEqual(rows[0]!.n, 0)
  }).pipe(Effect.provide(NodeServices.layer)))

it.effect("a migration of two statements stops the start", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    yield* fs.writeFileString(
      `${dir}/0001_two.sql`,
      "CREATE TABLE first (id INTEGER PRIMARY KEY);\nCREATE TABLE probe (id INTEGER PRIMARY KEY);\n"
    )

    const error = yield* countRows.pipe(Effect.provide(layerFile(":memory:", dir)), Effect.flip)
    assert.strictEqual(error._tag, "MigrationError")
    assert.include(String((error as SqliteMigrator.MigrationError).cause), "more than one statement")
  }).pipe(Effect.provide(NodeServices.layer)))

it.effect("a comment marker in a string does not hide a second statement", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    yield* fs.writeFileString(
      `${dir}/0001_two.sql`,
      "CREATE TABLE first (id TEXT DEFAULT '--');\nCREATE TABLE probe (id INTEGER PRIMARY KEY);\n"
    )

    const error = yield* countRows.pipe(Effect.provide(layerFile(":memory:", dir)), Effect.flip)
    assert.strictEqual(error._tag, "MigrationError")
  }).pipe(Effect.provide(NodeServices.layer)))

it.effect("migrations run in the order of their numbers", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    yield* fs.writeFileString(`${dir}/2_create.sql`, "CREATE TABLE probe (id INTEGER PRIMARY KEY);")
    yield* fs.writeFileString(`${dir}/10_add.sql`, "ALTER TABLE probe ADD COLUMN name TEXT;")

    const rows = yield* countRows.pipe(Effect.provide(layerFile(":memory:", dir)))
    assert.strictEqual(rows[0]!.n, 0)
  }).pipe(Effect.provide(NodeServices.layer)))

it.effect("a semicolon in a string or a comment is not a second statement", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    yield* fs.writeFileString(
      `${dir}/0001_probe.sql`,
      "-- a; comment\n/* b; */ CREATE TABLE probe (id TEXT DEFAULT 'a;b');\n"
    )

    const rows = yield* countRows.pipe(Effect.provide(layerFile(":memory:", dir)))
    assert.strictEqual(rows[0]!.n, 0)
  }).pipe(Effect.provide(NodeServices.layer)))
