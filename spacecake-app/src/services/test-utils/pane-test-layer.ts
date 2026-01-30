import migration0000 from "@/drizzle/0000_natural_rogue.sql?raw"
import migration0001 from "@/drizzle/0001_stiff_ego.sql?raw"
import { Database, makeDatabaseService, PgliteError } from "@/services/database"
import { PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { drizzle } from "drizzle-orm/pglite"
import { Context, Effect, Layer } from "effect"

/**
 * Creates a test Database layer with an in-memory PGlite instance.
 * This layer provides the same Database service as the production layer,
 * using the shared `makeDatabaseService` factory.
 */
export const makeTestDatabaseLayer = () =>
  Layer.scoped(
    Database,
    Effect.gen(function* () {
      // Create in-memory PGlite instance with live extension (same as production)
      const client = yield* Effect.tryPromise({
        try: () => PGlite.create({ extensions: { live } }),
        catch: (error) => new PgliteError({ cause: error }),
      })

      // Run migrations
      yield* Effect.tryPromise({
        try: () => client.exec(migration0000),
        catch: (error) => new PgliteError({ cause: error }),
      })

      yield* Effect.tryPromise({
        try: () => client.exec(migration0001),
        catch: (error) => new PgliteError({ cause: error }),
      })

      const orm = drizzle({ client, casing: "snake_case" })

      // Use the same factory as production - this ensures test and production
      // use identical database logic. Cast is needed because Effect.Service adds
      // internal branding that makeDatabaseService doesn't include.
      return makeDatabaseService(client, orm) as Context.Tag.Service<
        typeof Database
      >
    })
  )

/**
 * A fresh test Database layer - creates a new in-memory PGlite for each usage.
 */
export const TestDatabaseLayer = makeTestDatabaseLayer()
