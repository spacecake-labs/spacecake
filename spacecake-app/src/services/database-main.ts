import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { Effect, Layer } from "effect"
import fs from "node:fs"
import path from "node:path"

import { Database, makeDatabaseService, PgliteError } from "@/services/database"
import { SpacecakeHome } from "@/services/spacecake-home"

/**
 * provides the Database service backed by PGlite with nodefs in the main process.
 * data is stored at ~/.spacecake/.app/pglite-data (on disk, not in IndexedDB).
 */
export const DatabaseMainLayer: Layer.Layer<Database, PgliteError, SpacecakeHome> = Layer.scoped(
  Database,
  Effect.gen(function* () {
    const home = yield* SpacecakeHome
    const dataDir = path.join(home.appDir, "pglite-data")

    // ensure parent directories exist before PGlite tries to mkdirSync the data dir
    // (layer initialises before ensureHomeFolderExists runs in setupProgram)
    yield* Effect.try({
      try: () => fs.mkdirSync(dataDir, { recursive: true }),
      catch: (error) => new PgliteError({ cause: error }),
    })

    const client = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          PGlite.create({
            dataDir,
            relaxedDurability: true,
          }),
        catch: (error) => {
          console.error("failed to create main-process PGlite:", error)
          return new PgliteError({ cause: error })
        },
      }),
      (client) =>
        Effect.promise(() => client.close()).pipe(
          Effect.tap(() => Effect.log("closed PGlite client")),
          Effect.catchAll(() => Effect.void),
        ),
    )

    const orm = drizzle({ client, casing: "snake_case" })

    return makeDatabaseService(client, orm)
  }),
)
