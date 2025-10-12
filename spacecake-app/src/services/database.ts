import {
  EditorInsertSchema,
  EditorSelectSchema,
  editorTable,
  fileTable,
  PaneInsertSchema,
  PaneSelectSchema,
  paneTable,
  workspaceTable,
  type EditorInsert,
  type PaneInsert,
} from "@/schema/drizzle"
import { ActiveElementSelectSchema } from "@/schema/element"
import {
  FileInsertSchema,
  FileSelectSchema,
  FileUpdateBufferSchema,
  type FileInsert,
  type FileUpdateBuffer,
} from "@/schema/file"
import {
  WorkspaceInsertSchema,
  WorkspaceSelectSchema,
  type WorkspaceInsert,
} from "@/schema/workspace"
import { maybeSingleResult, singleResult } from "@/services/utils"
import { PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { and, desc, eq, getTableColumns } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { Data, DateTime, Effect, flow, Option, Schema } from "effect"

import { AbsolutePath } from "@/types/workspace"

export class PgliteError extends Data.TaggedError("PgliteError")<{
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
          // relaxedDurability: true,
        }),
      catch: (error) => {
        return new PgliteError({ cause: error })
      },
    })

    const orm = drizzle({ client, casing: "snake_case" })
    type Orm = typeof orm

    const query = <R>(execute: (_: Orm) => Promise<R>) =>
      Effect.tryPromise({
        try: () => execute(orm),
        catch: (error) => {
          console.log(error)
          return new PgliteError({ cause: error })
        },
      })

    return {
      client,
      orm,
      query,

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

      upsertFile: () =>
        flow(
          execute(FileInsertSchema, (values: FileInsert) =>
            Effect.gen(function* () {
              const now = yield* DateTime.now

              return yield* query((_) =>
                _.insert(fileTable)
                  .values(values)
                  .onConflictDoUpdate({
                    target: fileTable.path,
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

      upsertPane: flow(
        execute(PaneInsertSchema, (values: PaneInsert) =>
          Effect.gen(function* () {
            // yield* query((_) =>
            //   _.update(paneTable)
            //     .set({ is_active: false })
            //     .where(eq(paneTable.workspace_id, values.workspace_id))
            // )
            const now = yield* DateTime.now

            return yield* query((_) =>
              _.insert(paneTable)
                .values({ ...values, is_active: true })
                .onConflictDoUpdate({
                  target: [paneTable.workspace_id, paneTable.position],
                  set: {
                    ...values,
                    is_active: true,
                    last_accessed_at: DateTime.formatIso(now),
                  },
                })
                .returning()
            )
          })
        ),
        singleResult(() => new PgliteError({ cause: "pane not upserted" })),
        Effect.flatMap(Schema.decode(PaneSelectSchema)),
        Effect.tap((pane) => Effect.log("db: upserted pane:", pane))
      ),

      upsertEditor: flow(
        execute(EditorInsertSchema, (values: EditorInsert) =>
          Effect.gen(function* () {
            // yield* query((_) =>
            //   _.update(editorTable)
            //     .set({ is_active: false })
            //     .where(eq(editorTable.pane_id, values.pane_id))
            // )

            const now = yield* DateTime.now

            return yield* query((_) =>
              _.insert(editorTable)
                .values(values)
                .onConflictDoUpdate({
                  target: [editorTable.pane_id, editorTable.file_id],
                  set: {
                    ...values,
                    is_active: true,
                    last_accessed_at: DateTime.formatIso(now),
                  },
                })
                .returning()
            )
          })
        ),
        singleResult(() => new PgliteError({ cause: "element not upserted" })),
        Effect.flatMap(Schema.decode(EditorSelectSchema)),
        Effect.tap((element) => Effect.log("db: upserted element:", element))
      ),

      updateFileBuffer: flow(
        execute(FileUpdateBufferSchema, (values: FileUpdateBuffer) =>
          Effect.gen(function* () {
            return yield* query((_) =>
              _.update(fileTable)
                .set(values)
                .where(eq(fileTable.path, values.path))
            )
          })
        ),
        Effect.tap((file) => Effect.log("db: updated file buffer:", file))
      ),

      deleteFile: (filePath: AbsolutePath) =>
        Effect.gen(function* () {
          return yield* query((_) =>
            _.delete(fileTable).where(eq(fileTable.path, filePath)).returning()
          ).pipe(
            singleResult(() => new PgliteError({ cause: "file not deleted" })),
            Effect.tap((deletedFiles) =>
              Effect.log("db: deleted file:", deletedFiles)
            )
          )
        }),

      selectLastOpenedFile: () =>
        query((_) =>
          _.select(getTableColumns(fileTable))
            .from(fileTable)
            .orderBy(desc(fileTable.last_accessed_at))
            .limit(1)
        ).pipe(
          singleResult(() => new PgliteError({ cause: "no file found" })),
          Effect.flatMap(Schema.decode(FileSelectSchema))
        ),

      selectFile: (filePath: AbsolutePath) =>
        query((_) =>
          _.select(getTableColumns(fileTable))
            .from(fileTable)
            .where(eq(fileTable.path, filePath))
            .limit(1)
        ).pipe(
          maybeSingleResult(),
          Effect.flatMap((maybe) =>
            Option.isNone(maybe)
              ? Effect.succeed(Option.none())
              : Schema.decode(FileSelectSchema)(maybe.value).pipe(
                  Effect.map(Option.some)
                )
          )
        ),

      selectLastOpenedEditor: (workspacePath: AbsolutePath) =>
        query((_) =>
          _.select({
            id: editorTable.id,
            viewKind: editorTable.view_kind,
            workspacePath: workspaceTable.path,
            filePath: fileTable.path,
          })
            .from(editorTable)
            .innerJoin(
              fileTable,
              and(
                eq(editorTable.file_id, fileTable.id),
                // filter early for performance
                eq(editorTable.is_active, true)
              )
            )
            .innerJoin(paneTable, eq(editorTable.pane_id, paneTable.id))
            .innerJoin(
              workspaceTable,
              and(
                eq(paneTable.workspace_id, workspaceTable.id),
                eq(workspaceTable.path, workspacePath)
              )
            )
            .orderBy(desc(editorTable.last_accessed_at))
            .limit(1)
        ).pipe(
          maybeSingleResult(),
          Effect.flatMap((maybe) =>
            Option.isNone(maybe)
              ? Effect.succeed(Option.none())
              : Schema.decode(ActiveElementSelectSchema)(maybe.value).pipe(
                  Effect.map(Option.some)
                )
          )
        ),

      // selectRecentFiles: (workspacePath: AbsolutePath) =>
      //   query((_) =>
      //     _.select(getTableColumns(fileTable))
      //       .from(fileTable)
      //       .innerJoin(
      //         workspaceTable,
      //         eq(fileTable.workspace_id, workspaceTable.id)
      //       )
      //       .where(eq(workspaceTable.path, workspacePath))
      //       .orderBy(desc(fileTable.last_accessed_at))
      //       .limit(10)
      //   ).pipe(
      //     Effect.flatMap((files) =>
      //       Effect.forEach(files, (file) =>
      //         Schema.decode(FileSelectSchema)(file)
      //       )
      //     )
      //   ),
    }
  }),
}) {}
