import v0000 from "@/drizzle/0000_medical_cerebro.sql?raw"
import v0001 from "@/drizzle/0001_curly_stephen_strange.sql?raw"
import v0002 from "@/drizzle/0002_uneven_newton_destine.sql?raw"
import v0003 from "@/drizzle/0003_bitter_captain_stacy.sql?raw"
import { systemTable } from "@/schema/drizzle"
import { Database } from "@/services/database"
import { singleResult } from "@/services/utils"
import type { PGlite } from "@electric-sql/pglite"
import { Data, Effect } from "effect"

class MigrationsError extends Data.TaggedError("MigrationsError")<{
  cause: unknown
}> {}

const execute = (client: PGlite) => (sql: string) =>
  Effect.tryPromise({
    try: () => client.exec(sql),
    catch: (error) => new MigrationsError({ cause: error }),
  })

export class Migrations extends Effect.Service<Migrations>()("Migrations", {
  dependencies: [Database.Default],
  effect: Effect.gen(function* () {
    const { query, client } = yield* Database
    const migrate = execute(client)

    // add new migrations here
    const migrations = [
      migrate(v0000),
      migrate(v0001),
      migrate(v0002),
      migrate(v0003),
    ] as const
    const latestMigration = migrations.length

    return {
      apply: Effect.gen(function* () {
        const { version } = yield* query((_) =>
          _.select().from(systemTable)
        ).pipe(
          singleResult(
            () => new MigrationsError({ cause: "system not found" })
          ),
          Effect.catchTags({
            PgliteError: () => Effect.succeed({ version: 0 }), // no db yet
          })
        )

        yield* Effect.all(migrations.slice(version))

        if (version === 0) {
          yield* query((_) => _.insert(systemTable).values({ version: 0 }))
        }

        yield* query((_) =>
          _.update(systemTable).set({ version: latestMigration })
        )

        yield* Effect.log(
          version === latestMigration
            ? "database up to date"
            : `migrated database from v${version} to v${latestMigration}`
        )
      }),
    }
  }),
}) {}
