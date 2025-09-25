import {
  WorkspaceInsertSchema,
  WorkspaceSelectSchema,
  workspaceTable,
  type WorkspaceInsert,
} from "@/schema/drizzle"
import { singleResult } from "@/services/utils"
import { PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { desc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { Data, DateTime, Effect, flow, Schema } from "effect"

class PgliteError extends Data.TaggedError("PgliteError")<{
  cause: unknown
}> {}

const execute = <A, I, T, E>(
  schema: Schema.Schema<A, I>,
  exec: (values: I) => Effect.Effect<T, E>
) =>
  flow(
    Schema.decode(schema),
    Effect.flatMap(Schema.encode(schema)),
    Effect.tap((encoded) => Effect.log("db:", encoded)),
    Effect.mapError((error) => new PgliteError({ cause: error })),
    Effect.flatMap(exec)
  )

export class Database extends Effect.Service<Database>()("Database", {
  effect: Effect.gen(function* () {
    const client = yield* Effect.tryPromise({
      try: () =>
        PGlite.create(`idb://spacecake`, {
          extensions: { live },
        }),
      catch: (error) => {
        return new PgliteError({ cause: error })
      },
    })

    const orm = drizzle({ client, casing: "snake_case" })

    const query = <R>(execute: (_: typeof orm) => Promise<R>) =>
      Effect.tryPromise({
        try: () => execute(orm),
        catch: (error) => new PgliteError({ cause: error }),
      })

    return {
      client,
      orm,
      query,

      upsertWorkspace: flow(
        execute(WorkspaceInsertSchema, (values: WorkspaceInsert) =>
          Effect.gen(function* () {
            const now = yield* DateTime.now
            return yield* query((_) =>
              _.insert(workspaceTable)
                .values(values)
                .onConflictDoUpdate({
                  target: [workspaceTable.path],
                  set: {
                    ...values,
                    last_accessed_at: DateTime.formatIso(now),
                  },
                })
                .returning()
            )
          })
        ),
        singleResult(() => new PgliteError({ cause: "workspace not created" })),
        Effect.flatMap(Schema.decode(WorkspaceSelectSchema)),
        Effect.tap((workspace) =>
          Effect.log("db: upserted workspace:", workspace)
        )
      ),

      selectLastOpenedWorkspace: query((_) =>
        _.select()
          .from(workspaceTable)
          .where(eq(workspaceTable.is_open, true))
          .orderBy(desc(workspaceTable.last_accessed_at))
          .limit(1)
      ).pipe(
        singleResult(() => new PgliteError({ cause: "no workspace found" })),
        Effect.flatMap(Schema.decode(WorkspaceSelectSchema))
      ),
    }
  }),
}) {}
