import { Config } from "effect"

// The defaults are what a preview runs on: it is given no variable, it must
// answer on 8080, and the file lands in the working directory.
export const ServerConfig = Config.all({
  port: Config.Port("PORT").pipe(Config.withDefault(8080)),
  databaseFile: Config.String("DATABASE_FILE").pipe(Config.withDefault("billet.db"))
})
