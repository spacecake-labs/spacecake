import { PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { and, desc, eq, getTableColumns, gt, isNotNull, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { Console, Data, DateTime, Effect, flow, Option, Schema } from "effect"

import { workspaceCacheQuery } from "@/lib/db/queries"
import {
  ActiveEditorSelectSchema,
  EditorInsertSchema,
  EditorSelectionUpdate,
  EditorSelectSchema,
  EditorStateUpdate,
  EditorStateWithFileIdSelectSchema,
  editorTable,
  EditorUpdateSelectionSchema,
  EditorUpdateStateSchema,
  FileInsertSchema,
  FileSelectSchema,
  fileTable,
  FileUpdateSchema,
  PaneInsertSchema,
  PaneItemInsertSchema,
  PaneItemPrimaryKey,
  PaneItemSelectSchema,
  paneItemTable,
  PanePrimaryKey,
  PaneSelectSchema,
  paneTable,
  WorkspaceInsertSchema,
  WorkspaceSelectSchema,
  workspaceTable,
  type EditorInsert,
  type FileInsert,
  type FileUpdate,
  type PaneInsert,
  type PaneItemInsert,
  type WorkspaceInsert,
  type WorkspaceLayout,
} from "@/schema"
import { EditorPrimaryKey } from "@/schema/editor"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import {
  defaultWorkspaceSettings,
  WorkspaceSettingsSchema,
  type WorkspaceSettings,
} from "@/schema/workspace-settings"
import { maybeSingleResult, singleResult } from "@/services/utils"
import { AbsolutePath } from "@/types/workspace"

export class PgliteError extends Data.TaggedError("PgliteError")<{
  cause: unknown
}> {}

const execute = <A, I, T, E>(
  schema: Schema.Schema<A, I>,
  exec: (values: I) => Effect.Effect<T, E>,
) =>
  flow(
    Schema.decode(schema),
    Effect.flatMap(Schema.encode(schema)),
    // Effect.tap((encoded) => Effect.log("db:", encoded)),
    Effect.mapError((error) => new PgliteError({ cause: error })),
    Effect.flatMap(exec),
  )

type Orm = ReturnType<typeof drizzle>

/**
 * Creates the Database service methods given a PGlite client and ORM.
 * This factory is shared between production and test layers.
 * Generic over the client type to preserve PGliteWithLive in production.
 */
export const makeDatabaseService = <C extends PGlite>(client: C, orm: Orm) => {
  const query = <R>(execute: (_: Orm) => Promise<R>) =>
    Effect.tryPromise({
      try: () => execute(orm),
      catch: (error) => {
        Console.log(error)
        return new PgliteError({ cause: error })
      },
    })

  return {
    client,
    orm,
    query,

    selectWorkspaceCache: (workspacePath: AbsolutePath) =>
      query((_) => workspaceCacheQuery(_, workspacePath)),

    selectLastOpenedWorkspace: query((_) =>
      _.select()
        .from(workspaceTable)
        .where(eq(workspaceTable.is_open, true))
        .orderBy(desc(workspaceTable.last_accessed_at))
        .limit(1),
    ).pipe(
      maybeSingleResult(),
      Effect.flatMap((maybeWorkspace) =>
        Option.isNone(maybeWorkspace)
          ? Effect.succeed(Option.none())
          : Schema.decode(WorkspaceSelectSchema)(maybeWorkspace.value).pipe(
              Effect.map(Option.some),
            ),
      ),
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
              .returning(),
          )
        }),
      ),
      singleResult(() => new PgliteError({ cause: "workspace not upserted" })),
      Effect.flatMap(Schema.decode(WorkspaceSelectSchema)),
      // Effect.tap((workspace) =>
      //   Effect.log("db: upserted workspace:", workspace)
      // )
    ),

    upsertFile: () =>
      flow(
        execute(FileInsertSchema, (values: FileInsert) =>
          Effect.gen(function* () {
            return yield* query((_) =>
              _.insert(fileTable)
                .values(values)
                .onConflictDoUpdate({
                  target: fileTable.path,
                  set: {
                    ...values,
                  },
                })
                .returning(),
            )
          }),
        ),
        singleResult(() => new PgliteError({ cause: "file not upserted" })),
        Effect.flatMap(Schema.decode(FileSelectSchema)),
        // Effect.tap((file) => Effect.log("db: upserted file:", file))
      ),

    updateFileAccessedAt: flow(
      execute(FileUpdateSchema, (values: FileUpdate) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now
          return yield* query((_) =>
            _.update(fileTable)
              .set({ last_accessed_at: DateTime.formatIso(now) })
              .where(eq(fileTable.id, values.id)),
          )
        }),
      ),
      // Effect.tap((file) => Effect.log("db: updated file accessed at:", file))
    ),

    upsertPane: flow(
      execute(PaneInsertSchema, (values: PaneInsert) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now

          return yield* query((_) =>
            _.insert(paneTable)
              .values(values)
              .onConflictDoUpdate({
                target: [paneTable.workspace_id, paneTable.position],
                set: {
                  ...values,
                  last_accessed_at: DateTime.formatIso(now),
                },
              })
              .returning(),
          )
        }),
      ),
      singleResult(() => new PgliteError({ cause: "pane not upserted" })),
      Effect.flatMap(Schema.decode(PaneSelectSchema)),
      // Effect.tap((pane) => Effect.log("db: upserted pane:", pane))
    ),

    insertPaneItem: flow(
      execute(PaneItemInsertSchema, (values: PaneItemInsert) =>
        Effect.gen(function* () {
          return yield* query((_) => _.insert(paneItemTable).values(values).returning())
        }),
      ),
      singleResult(() => new PgliteError({ cause: "pane item not inserted" })),
      Effect.flatMap(Schema.decode(PaneItemSelectSchema)),
    ),

    /**
     * Closes a pane item (tab) and returns the next active item's info for navigation.
     * - Deletes the pane item
     * - Recompacts positions
     * - Only updates the active item pointer if closing the active tab
     * - Returns the new active item's editor/file info (or none if no items remain or not closing active)
     */
    closePaneItemAndGetNext: (paneItemId: PaneItemPrimaryKey, isClosingActiveTab: boolean) =>
      Effect.gen(function* () {
        // Get pane_id and position before deletion
        const deleted = yield* query((_) =>
          _.delete(paneItemTable).where(eq(paneItemTable.id, paneItemId)).returning({
            pane_id: paneItemTable.pane_id,
            position: paneItemTable.position,
          }),
        ).pipe(maybeSingleResult())

        if (Option.isNone(deleted)) return Option.none()

        const { pane_id: paneId, position: deletedPosition } = deleted.value

        // Recompact positions: decrement all positions greater than deleted
        yield* query((_) =>
          _.update(paneItemTable)
            .set({ position: sql`${paneItemTable.position} - 1` })
            .where(
              and(eq(paneItemTable.pane_id, paneId), gt(paneItemTable.position, deletedPosition)),
            ),
        )

        // Only update active pointer if closing the active tab
        if (!isClosingActiveTab) {
          return Option.none()
        }

        // Find new active item with full info (most recently accessed)
        const newActive = yield* query((_) =>
          _.select({
            id: paneItemTable.id,
            editorId: editorTable.id,
            filePath: fileTable.path,
            viewKind: editorTable.view_kind,
          })
            .from(paneItemTable)
            .innerJoin(editorTable, eq(paneItemTable.editor_id, editorTable.id))
            .innerJoin(fileTable, eq(editorTable.file_id, fileTable.id))
            .where(eq(paneItemTable.pane_id, paneId))
            .orderBy(desc(paneItemTable.last_accessed_at))
            .limit(1),
        ).pipe(maybeSingleResult())

        // Update pane's active item (will be null if no items remain)
        yield* query((_) =>
          _.update(paneTable)
            .set({
              active_pane_item_id: Option.match(newActive, {
                onNone: () => null,
                onSome: (v) => v.id,
              }),
            })
            .where(eq(paneTable.id, paneId)),
        )

        // Return the new active item's info for navigation
        return newActive
      }),

    updatePaneItemAccessedAt: (paneItemId: PaneItemPrimaryKey) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now
        return yield* query((_) =>
          _.update(paneItemTable)
            .set({ last_accessed_at: DateTime.formatIso(now) })
            .where(eq(paneItemTable.id, paneItemId)),
        )
      }),

    selectActivePaneItemForPane: (paneId: PanePrimaryKey) =>
      query((_) =>
        _.select(getTableColumns(paneItemTable))
          .from(paneTable)
          .innerJoin(paneItemTable, eq(paneItemTable.id, paneTable.active_pane_item_id))
          .where(eq(paneTable.id, paneId))
          .limit(1),
      ).pipe(
        maybeSingleResult(),
        Effect.flatMap((maybe) =>
          Option.isNone(maybe)
            ? Effect.succeed(Option.none())
            : Schema.decode(PaneItemSelectSchema)(maybe.value).pipe(Effect.map(Option.some)),
        ),
      ),

    updatePaneActivePaneItem: (paneId: PanePrimaryKey, paneItemId: PaneItemPrimaryKey | null) =>
      Effect.gen(function* () {
        return yield* query((_) =>
          _.update(paneTable)
            .set({ active_pane_item_id: paneItemId })
            .where(eq(paneTable.id, paneId)),
        )
      }),

    updateWorkspaceActivePane: (workspaceId: WorkspacePrimaryKey, paneId: PanePrimaryKey | null) =>
      Effect.gen(function* () {
        return yield* query((_) =>
          _.update(workspaceTable)
            .set({ active_pane_id: paneId })
            .where(eq(workspaceTable.id, workspaceId)),
        )
      }),

    /**
     * Activates an editor in a pane by:
     * 1. Upserting a paneItem for this editor
     * 2. Setting this paneItem as the pane's active item
     * 3. Setting this pane as the workspace's active pane
     */
    activateEditorInPane: (editorId: EditorPrimaryKey, paneId: PanePrimaryKey) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now

        // Get next position for new items
        const [{ maxPosition }] = yield* query((_) =>
          _.select({
            maxPosition: sql<number>`COALESCE(MAX(${paneItemTable.position}), -1)`,
          })
            .from(paneItemTable)
            .where(eq(paneItemTable.pane_id, paneId)),
        )

        // Upsert paneItem (unique on pane_id + editor_id)
        // New items get next position, existing items keep their position
        const paneItems = yield* query((_) =>
          _.insert(paneItemTable)
            .values({
              pane_id: paneId,
              kind: "editor",
              editor_id: editorId,
              position: maxPosition + 1,
            })
            .onConflictDoUpdate({
              target: [paneItemTable.pane_id, paneItemTable.editor_id],
              set: { last_accessed_at: DateTime.formatIso(now) },
              // Don't change position for existing items
            })
            .returning({ id: paneItemTable.id }),
        )

        const paneItemId = paneItems[0].id

        // Update pane's active item and get workspace_id
        const panes = yield* query((_) =>
          _.update(paneTable)
            .set({
              active_pane_item_id: paneItemId,
              last_accessed_at: DateTime.formatIso(now),
            })
            .where(eq(paneTable.id, paneId))
            .returning({ workspace_id: paneTable.workspace_id }),
        )

        // Update workspace's active pane
        yield* query((_) =>
          _.update(workspaceTable)
            .set({ active_pane_id: paneId })
            .where(eq(workspaceTable.id, panes[0].workspace_id)),
        )

        return paneItemId
      }),

    upsertEditor: flow(
      execute(EditorInsertSchema, (values: EditorInsert) =>
        Effect.gen(function* () {
          return yield* query((_) =>
            _.insert(editorTable)
              .values(values)
              .onConflictDoUpdate({
                target: [editorTable.pane_id, editorTable.file_id],
                set: {
                  ...values,
                },
              })
              .returning(),
          )
        }),
      ),
      singleResult(() => new PgliteError({ cause: "editor not upserted" })),
      Effect.flatMap(Schema.decode(EditorSelectSchema)),
      // Effect.tap((editor) => Effect.log("db: upserted editor:", editor))
    ),

    updateEditorAccessedAt: (editorId: EditorPrimaryKey, paneId: PanePrimaryKey) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now
        // Find the paneItem for this editor in this pane and update its access time
        return yield* query((_) =>
          _.update(paneItemTable)
            .set({ last_accessed_at: DateTime.formatIso(now) })
            .where(and(eq(paneItemTable.editor_id, editorId), eq(paneItemTable.pane_id, paneId))),
        )
      }),

    updateEditorState: flow(
      execute(EditorUpdateStateSchema, (values: EditorStateUpdate) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now

          return yield* query((_) =>
            _.update(editorTable)
              .set({
                state: values.state,
                state_updated_at: DateTime.formatIso(now),
                selection: values.selection,
                view_kind: values.view_kind,
              })
              .where(eq(editorTable.id, values.id)),
          )
        }),
      ),
      // Effect.tap((editor) => Effect.log("db: updated editor state:", editor))
    ),

    updateEditorSelection: flow(
      execute(EditorUpdateSelectionSchema, (values: EditorSelectionUpdate) =>
        Effect.gen(function* () {
          return yield* query((_) =>
            _.update(editorTable)
              .set({
                selection: values.selection,
              })
              .where(eq(editorTable.id, values.id)),
          )
        }),
      ),
      // Effect.tap((editor) =>
      //   Effect.log("db: updated editor selection:", editor)
      // )
    ),

    deleteFile: (filePath: AbsolutePath) =>
      Effect.gen(function* () {
        return yield* query((_) =>
          _.delete(fileTable).where(eq(fileTable.path, filePath)).returning(),
        ).pipe(
          maybeSingleResult(),
          // Effect.tap((deletedFiles) =>
          //   Effect.log("db: deleted file:", deletedFiles)
          // )
        )
      }),

    selectLastOpenedFile: () =>
      query((_) =>
        _.select(getTableColumns(fileTable))
          .from(fileTable)
          .where(isNotNull(fileTable.last_accessed_at))
          .orderBy(desc(fileTable.last_accessed_at))
          .limit(1),
      ).pipe(
        singleResult(() => new PgliteError({ cause: "no file found" })),
        Effect.flatMap(Schema.decode(FileSelectSchema)),
      ),

    selectFile: (filePath: AbsolutePath) =>
      query((_) =>
        _.select(getTableColumns(fileTable))
          .from(fileTable)
          .where(eq(fileTable.path, filePath))
          .limit(1),
      ).pipe(
        maybeSingleResult(),
        Effect.flatMap((maybe) =>
          Option.isNone(maybe)
            ? Effect.succeed(Option.none())
            : Schema.decode(FileSelectSchema)(maybe.value).pipe(Effect.map(Option.some)),
        ),
      ),

    selectActiveEditorForWorkspace: (workspacePath: AbsolutePath) =>
      query((_) =>
        _.select({
          id: editorTable.id,
          viewKind: editorTable.view_kind,
          workspacePath: workspaceTable.path,
          filePath: fileTable.path,
        })
          .from(workspaceTable)
          .innerJoin(
            paneTable,
            and(
              eq(paneTable.id, workspaceTable.active_pane_id),
              eq(workspaceTable.path, workspacePath),
            ),
          )
          .innerJoin(paneItemTable, eq(paneItemTable.id, paneTable.active_pane_item_id))
          .innerJoin(editorTable, eq(editorTable.id, paneItemTable.editor_id))
          .innerJoin(fileTable, eq(fileTable.id, editorTable.file_id))
          .limit(1),
      ).pipe(
        maybeSingleResult(),
        Effect.flatMap((maybe) =>
          Option.isNone(maybe)
            ? Effect.succeed(Option.none())
            : Schema.decode(ActiveEditorSelectSchema)(maybe.value).pipe(Effect.map(Option.some)),
        ),
      ),

    selectLatestEditorStateForFile: (filePath: AbsolutePath) =>
      query((_) =>
        _.select({
          id: editorTable.id,
          state: editorTable.state,
          view_kind: editorTable.view_kind,
          selection: editorTable.selection,
          fileId: fileTable.id,
        })
          .from(editorTable)
          .innerJoin(fileTable, eq(editorTable.file_id, fileTable.id))
          .where(eq(fileTable.path, filePath))
          .orderBy(
            desc(editorTable.state_updated_at), // prioritise records with state
          )
          .limit(1),
      ).pipe(
        maybeSingleResult(),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(Option.none()),
            onSome: (value) =>
              Schema.decode(EditorStateWithFileIdSelectSchema)(value).pipe(Effect.map(Option.some)),
          }),
        ),
      ),

    clearEditorStatesForFile: (filePath: AbsolutePath) =>
      Effect.gen(function* () {
        return yield* query((_) =>
          _.update(editorTable)
            .set({ state: null, state_updated_at: null, selection: null })
            .from(fileTable)
            .where(eq(fileTable.path, filePath)),
        )
      }),

    selectEditorStateById: (editorId: EditorPrimaryKey) =>
      query((_) =>
        _.select({
          id: editorTable.id,
          state: editorTable.state,
          view_kind: editorTable.view_kind,
          selection: editorTable.selection,
          fileId: editorTable.file_id,
        })
          .from(editorTable)
          .where(eq(editorTable.id, editorId))
          .limit(1),
      ).pipe(
        maybeSingleResult(),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(Option.none()),
            onSome: (value) =>
              Schema.decode(EditorStateWithFileIdSelectSchema)(value).pipe(Effect.map(Option.some)),
          }),
        ),
      ),

    updateWorkspaceLayout: (workspaceId: WorkspacePrimaryKey, layout: WorkspaceLayout) =>
      query((_) =>
        _.update(workspaceTable).set({ layout }).where(eq(workspaceTable.id, workspaceId)),
      ),

    updateWorkspaceSettings: (workspaceId: WorkspacePrimaryKey, settings: WorkspaceSettings) =>
      query((_) =>
        _.update(workspaceTable).set({ settings }).where(eq(workspaceTable.id, workspaceId)),
      ),

    selectWorkspaceSettings: (workspaceId: WorkspacePrimaryKey) =>
      query((_) =>
        _.select({ settings: workspaceTable.settings })
          .from(workspaceTable)
          .where(eq(workspaceTable.id, workspaceId))
          .limit(1),
      ).pipe(
        maybeSingleResult(),
        Effect.map((maybe) =>
          Option.match(maybe, {
            onNone: () => defaultWorkspaceSettings,
            onSome: (row) =>
              Option.getOrElse(
                Schema.decodeUnknownOption(WorkspaceSettingsSchema)(row.settings),
                () => defaultWorkspaceSettings,
              ),
          }),
        ),
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
}

export class Database extends Effect.Service<Database>()("Database", {
  effect: Effect.gen(function* () {
    const client = yield* Effect.tryPromise({
      try: () =>
        PGlite.create(`idb://spacecake`, {
          extensions: { live },
          relaxedDurability: true,
        }),
      catch: (error) => {
        console.log(error)
        return new PgliteError({ cause: error })
      },
    })

    const orm = drizzle({ client, casing: "snake_case" })

    return makeDatabaseService(client, orm)
  }),
}) {}
