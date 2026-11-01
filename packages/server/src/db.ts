import { NodeServices } from "@effect/platform-node"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { Effect, FileSystem, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { fileURLToPath } from "node:url"
import { ServerConfig } from "./config.ts"

const migrationsDir = fileURLToPath(new URL("../../../migrations", import.meta.url))

// The driver prepares one statement and drops what follows it without an error,
// and it has no way to run a script. So a file holds one statement, and a second
// one stops the start instead of being lost.
const isOneStatement = (text: string) =>
  !text
    .replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|--.*$|\/\*[\s\S]*?\*\//gm, "")
    .replace(/;\s*$/, "")
    .includes(";")

const failed = (message: string, cause?: unknown) => new SqliteMigrator.MigrationError({ kind: "Failed", message, cause })

// Effect's own file loader takes .js and .ts only and skips .sql in silence.
export const sqlLoader: (dir: string) => SqliteMigrator.Loader<FileSystem.FileSystem> = Effect.fnUntraced(
  function*(dir) {
    const fs = yield* FileSystem.FileSystem
    const files = yield* fs.readDirectory(dir).pipe(
      Effect.mapError((cause) => failed(`Could not read ${dir}`, cause))
    )
    const migrations = files.flatMap((file) => {
      const match = file.match(/^(\d+)_(.+)\.sql$/)
      if (match === null) return []
      const run = Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const text = yield* fs.readFileString(`${dir}/${file}`)
        if (!isOneStatement(text)) {
          return yield* failed(`${file} holds more than one statement`)
        }
        yield* sql.unsafe(text)
      })
      return [[Number(match[1]), match[2]!, Effect.succeed(run)] as const]
    })
    return migrations.sort(([a], [b]) => a - b)
  }
)

export const migrate = (dir: string = migrationsDir) =>
  SqliteMigrator.layer({ loader: sqlLoader(dir) }).pipe(Layer.provide(NodeServices.layer))

// A migrated database on the given file, with the SQL client exposed.
export const layerFile = (filename: string, dir?: string) =>
  migrate(dir).pipe(Layer.provideMerge(SqliteClient.layer({ filename })))

export const layerConfig = Layer.unwrap(
  Effect.gen(function*() {
    const { databaseFile } = yield* ServerConfig
    return layerFile(databaseFile)
  })
)
