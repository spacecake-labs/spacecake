import type { PGlite } from "@electric-sql/pglite"

import { Data, Effect } from "effect"

import v0000 from "@/drizzle/0000_natural_rogue.sql?raw"
import v0001 from "@/drizzle/0001_add_workspace_layout.sql?raw"
import v0002 from "@/drizzle/0002_pane_items.sql?raw"
import { systemTable } from "@/schema/drizzle"
import { Database } from "@/services/database"
import { singleResult } from "@/services/utils"

class MigrationsError extends Data.TaggedError("MigrationsError")<{
  cause: unknown
}> {}

const execute = (client: PGlite) => (sql: string) =>
  Effect.tryPromise({
    try: () => client.exec(sql),
    catch: (error) => {
      console.error("Migration failed:", error)
      return new MigrationsError({ cause: error })
    },
  })

export class Migrations extends Effect.Service<Migrations>()("Migrations", {
  dependencies: [Database.Default],
  effect: Effect.gen(function* () {
    const { query, client } = yield* Database
    const migrate = execute(client)

    // add new migrations here
    const migrations = [migrate(v0000), migrate(v0001), migrate(v0002)] as const
    const latestMigration = migrations.length

    return {
      apply: Effect.gen(function* () {
        const { version } = yield* query((_) => _.select().from(systemTable)).pipe(
          singleResult(() => new MigrationsError({ cause: "system not found" })),
          Effect.catchTags({
            PgliteError: () => Effect.succeed({ version: 0 }), // no db yet
          }),
        )

        yield* Effect.all(migrations.slice(version))

        if (version === 0) {
          yield* query((_) => _.insert(systemTable).values({ version: 0 }))
        }

        yield* query((_) => _.update(systemTable).set({ version: latestMigration }))

        yield* Effect.log(
          version === latestMigration
            ? "database up to date"
            : `migrated database from v${version} to v${latestMigration}`,
        )
      }),
    }
  }),
}) {}
