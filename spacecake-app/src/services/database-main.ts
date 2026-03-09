import fs from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

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

/**
 * provides the Database service by restoring from a migration dump file.
 * used when migrating from IndexedDB to filesystem-backed PGlite.
 * the dump is loaded via `loadDataDir`, then the dump file is deleted.
 */
export const makeDatabaseFromDumpLayer = (
  dumpPath: string,
): Layer.Layer<Database, PgliteError, SpacecakeHome> =>
  Layer.scoped(
    Database,
    Effect.gen(function* () {
      const home = yield* SpacecakeHome
      const dataDir = path.join(home.appDir, "pglite-data")

      yield* Effect.try({
        try: () => fs.mkdirSync(dataDir, { recursive: true }),
        catch: (error) => new PgliteError({ cause: error }),
      })

      const dumpData = yield* Effect.try({
        try: () => {
          const buffer = fs.readFileSync(dumpPath)
          return new Blob([buffer])
        },
        catch: (error) => new PgliteError({ cause: error }),
      })

      const client = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            PGlite.create({
              dataDir,
              loadDataDir: dumpData,
              relaxedDurability: true,
            }),
          catch: (error) => {
            console.error("failed to create PGlite from migration dump:", error)
            return new PgliteError({ cause: error })
          },
        }),
        (client) =>
          Effect.promise(() => client.close()).pipe(
            Effect.tap(() => Effect.log("closed PGlite client")),
            Effect.catchAll(() => Effect.void),
          ),
      )

      // dump loaded successfully — delete the file (non-fatal if it fails)
      yield* Effect.try(() => fs.unlinkSync(dumpPath)).pipe(Effect.ignore)

      yield* Effect.log("migration: restored PGlite from IndexedDB dump")

      const orm = drizzle({ client, casing: "snake_case" })

      return makeDatabaseService(client, orm)
    }),
  )
