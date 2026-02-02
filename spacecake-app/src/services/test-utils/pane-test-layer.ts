import { PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { drizzle } from "drizzle-orm/pglite"
import { Context, Effect, Layer } from "effect"

import migration0000 from "@/drizzle/0000_natural_rogue.sql?raw"
import migration0001 from "@/drizzle/0001_add_workspace_layout.sql?raw"
import migration0002 from "@/drizzle/0002_pane_items.sql?raw"
import migration0003 from "@/drizzle/0003_add_workspace_settings.sql?raw"
import { Database, makeDatabaseService, PgliteError } from "@/services/database"

// Cache the migrated database state as a Blob
let cachedDataDir: Blob | null = null

/**
 * Initialize the cached database state by running migrations once.
 * Called lazily on first test run. Exported for use in beforeAll hooks.
 */
export const initCachedDataDir = async (): Promise<Blob> => {
  if (cachedDataDir) return cachedDataDir

  // Create a temporary PGlite instance, run migrations, then dump
  const tempClient = await PGlite.create({ extensions: { live } })
  await tempClient.exec(migration0000)
  await tempClient.exec(migration0001)
  await tempClient.exec(migration0002)
  await tempClient.exec(migration0003)

  // Dump the migrated state
  cachedDataDir = await tempClient.dumpDataDir()

  // Close the temp client
  await tempClient.close()

  return cachedDataDir
}

/**
 * Creates a test Database layer with an in-memory PGlite instance.
 * Uses cached migration state for faster test setup.
 */
export const makeTestDatabaseLayer = () =>
  Layer.scoped(
    Database,
    Effect.gen(function* () {
      // Get or create cached database state with migrations applied
      const dataDir = yield* Effect.tryPromise({
        try: () => initCachedDataDir(),
        catch: (error) => new PgliteError({ cause: error }),
      })

      // Create in-memory PGlite instance with cached state (no need to run migrations)
      const client = yield* Effect.tryPromise({
        try: () =>
          PGlite.create({
            extensions: { live },
            loadDataDir: dataDir,
          }),
        catch: (error) => new PgliteError({ cause: error }),
      })

      const orm = drizzle({ client, casing: "snake_case" })

      return makeDatabaseService(client, orm) as Context.Tag.Service<typeof Database>
    }),
  )

/**
 * A fresh test Database layer - creates a new in-memory PGlite for each usage.
 * Uses cached migrations for faster setup.
 */
export const TestDatabaseLayer = makeTestDatabaseLayer()
