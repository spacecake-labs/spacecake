import {
  FileInsertSchema,
  FileSelectSchema,
  fileTable,
  WorkspaceInsertSchema,
  WorkspaceSelectSchema,
  workspaceTable,
  type FileInsert,
  type WorkspaceInsert,
} from "@/schema/drizzle"
import { maybeSingleResult, singleResult } from "@/services/utils"
import { PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { desc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { Data, DateTime, Effect, flow, Option, Schema } from "effect"

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
        singleResult(
          () => new PgliteError({ cause: "workspace not upserted" })
        ),
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
        maybeSingleResult(),
        Effect.flatMap((maybeWorkspace) =>
          Option.isNone(maybeWorkspace)
            ? Effect.succeed(Option.none())
            : Schema.decode(WorkspaceSelectSchema)(maybeWorkspace.value).pipe(
                Effect.map(Option.some)
              )
        )
      ),

      upsertFile: flow(
        execute(FileInsertSchema, (values: FileInsert) =>
          Effect.gen(function* () {
            const now = yield* DateTime.now
            return yield* query((_) =>
              _.insert(fileTable)
                .values(values)
                .onConflictDoUpdate({
                  target: [fileTable.path],
                  set: {
                    ...values,
                    last_accessed_at: DateTime.formatIso(now),
                  },
                })
                .returning()
            )
          })
        ),
        singleResult(() => new PgliteError({ cause: "file not upserted" })),
        Effect.flatMap(Schema.decode(FileSelectSchema)),
        Effect.tap((file) => Effect.log("db: upserted file:", file))
      ),

      deleteFile: (filePath: string) =>
        query((_) =>
          _.delete(fileTable).where(eq(fileTable.path, filePath)).returning()
        ).pipe(
          singleResult(() => new PgliteError({ cause: "file not deleted" })),
          Effect.tap((deletedFiles) =>
            Effect.log("db: deleted file:", deletedFiles)
          )
        ),

      selectLastOpenedFile: query((_) =>
        _.select()
          .from(fileTable)
          .where(eq(fileTable.is_open, true))
          .orderBy(desc(fileTable.last_accessed_at))
          .limit(1)
      ).pipe(
        singleResult(() => new PgliteError({ cause: "no file found" })),
        Effect.flatMap(Schema.decode(FileSelectSchema))
      ),

      selectRecentFiles: query((_) =>
        _.select()
          .from(fileTable)
          .orderBy(desc(fileTable.last_accessed_at))
          .limit(10)
      ).pipe(
        Effect.flatMap((files) =>
          Effect.forEach(files, (file) => Schema.decode(FileSelectSchema)(file))
        )
      ),
    }
  }),
}) {}
