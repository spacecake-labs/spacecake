import { workspaceTable } from "@/schema/drizzle"
import { PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { desc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { Data, Effect } from "effect"

class PgliteError extends Data.TaggedError("PgliteError")<{
  cause: unknown
}> {}

// const execute = <A, I, T, E>(
//   schema: Schema.Schema<A, I>,
//   exec: (values: I) => Effect.Effect<T, E>
// ) =>
//   flow(
//     Schema.decode(schema),
//     Effect.flatMap(Schema.encode(schema)),
//     Effect.tap((encoded) => Effect.log("insert", encoded)),
//     Effect.mapError((error) => new PgliteError({ cause: error })),
//     Effect.flatMap(exec)
//   )

export class Database extends Effect.Service<Database>()("Database", {
  effect: Effect.gen(function* () {
    const client = yield* Effect.tryPromise({
      try: () =>
        PGlite.create(`idb://spacecake`, {
          extensions: { live },
        }),
      catch: (error) => {
        console.error("error creating client:", error)

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

      selectWorkspace: query((_) =>
        _.select()
          .from(workspaceTable)
          .where(eq(workspaceTable.is_open, true))
          .orderBy(desc(workspaceTable.last_accessed_at))
          .limit(1)
      ),
    }
  }),
}) {}
