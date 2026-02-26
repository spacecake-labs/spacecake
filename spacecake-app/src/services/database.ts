import { PGlite } from "@electric-sql/pglite"
import { live, type PGliteWithLive } from "@electric-sql/pglite/live"
import { and, desc, eq, getTableColumns, isNotNull, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { Console, Data, DateTime, Effect, flow, Option, Schema } from "effect"

import type { PersistableViewKind } from "@/types/lexical"

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
// web worker version kept for when pglite improves worker RPC batching:
// import { PGliteWorker } from "@electric-sql/pglite/worker"
// import PgliteWorkerModule from "@/workers/pglite-worker?worker"

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
 * creates the Database service methods given a PGlite client and ORM.
 * this factory is shared between production and test layers.
 */
export const makeDatabaseService = (client: PGliteWithLive, orm: Orm) => {
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
                  is_open: values.is_open,
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
                  set: { cid: values.cid, mtime: values.mtime },
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
                set: { last_accessed_at: DateTime.formatIso(now) },
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
     * Uses a single CTE per code path to minimize worker roundtrips.
     * - Deletes the pane item
     * - Recompacts positions
     * - Only updates the active item pointer if closing the active tab
     * - Returns the new active item's editor/file info (or none if no items remain or not closing active)
     */
    closePaneItemAndGetNext: (paneItemId: PaneItemPrimaryKey, isClosingActiveTab: boolean) =>
      Effect.gen(function* () {
        if (!isClosingActiveTab) {
          // delete + recompact only (1 roundtrip)
          yield* query((_) =>
            _.execute(sql`
              WITH deleted AS (
                DELETE FROM pane_item WHERE id = ${paneItemId} RETURNING pane_id, "index"
              ),
              _recompacted AS (
                UPDATE pane_item SET "index" = "index" - 1
                WHERE pane_id = (SELECT pane_id FROM deleted)
                  AND "index" > (SELECT "index" FROM deleted)
              )
              SELECT 1
            `),
          )
          return Option.none()
        }

        // closing active tab: delete + recompact + find next + update pane (1 roundtrip)
        // note: CTEs see the pre-mutation snapshot, so we exclude the deleted item explicitly
        const result = yield* query((_) =>
          _.execute(sql`
            WITH deleted AS (
              DELETE FROM pane_item WHERE id = ${paneItemId} RETURNING pane_id, "index"
            ),
            _recompacted AS (
              UPDATE pane_item SET "index" = "index" - 1
              WHERE pane_id = (SELECT pane_id FROM deleted)
                AND "index" > (SELECT "index" FROM deleted)
            ),
            new_active AS (
              SELECT pi.id, e.id AS editor_id, f.path AS file_path, e.view_kind
              FROM pane_item pi
              INNER JOIN editor e ON pi.editor_id = e.id
              INNER JOIN file f ON e.file_id = f.id
              WHERE pi.pane_id = (SELECT pane_id FROM deleted)
                AND pi.id != ${paneItemId}
              ORDER BY pi.last_accessed_at DESC LIMIT 1
            ),
            _updated_pane AS (
              UPDATE pane SET active_pane_item_id = (SELECT id FROM new_active)
              WHERE id = (SELECT pane_id FROM deleted)
            )
            SELECT id, editor_id, file_path, view_kind FROM new_active
          `),
        )

        if (result.rows.length === 0) return Option.none()

        const row = result.rows[0] as {
          id: string
          editor_id: string
          file_path: string
          view_kind: PersistableViewKind
        }

        return Option.some({
          id: row.id,
          editorId: row.editor_id,
          filePath: row.file_path,
          viewKind: row.view_kind,
        })
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

    /**
     * Activates a pane item by updating its access time and the pane's active pointer
     * in a single roundtrip.
     */
    activatePaneItem: (paneId: PanePrimaryKey, paneItemId: PaneItemPrimaryKey) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now
        const nowIso = DateTime.formatIso(now)

        yield* query((_) =>
          _.execute(sql`
            WITH _updated_item AS (
              UPDATE pane_item SET last_accessed_at = ${nowIso} WHERE id = ${paneItemId}
            )
            UPDATE pane SET active_pane_item_id = ${paneItemId} WHERE id = ${paneId}
          `),
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
     * Activates an editor in a pane in a single roundtrip by:
     * 1. Upserting a paneItem for this editor
     * 2. Setting this paneItem as the pane's active item
     * 3. Setting this pane as the workspace's active pane
     */
    activateEditorInPane: (editorId: EditorPrimaryKey, paneId: PanePrimaryKey) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now
        const nowIso = DateTime.formatIso(now)

        const result = yield* query((_) =>
          _.execute(sql`
            WITH max_pos AS (
              SELECT COALESCE(MAX("index"), -1) AS p FROM pane_item WHERE pane_id = ${paneId}
            ),
            upserted AS (
              INSERT INTO pane_item (pane_id, kind, editor_id, "index", last_accessed_at)
              VALUES (${paneId}, 'editor', ${editorId}, (SELECT p + 1 FROM max_pos), ${nowIso})
              ON CONFLICT (pane_id, editor_id) DO UPDATE SET last_accessed_at = EXCLUDED.last_accessed_at
              RETURNING id
            ),
            updated_pane AS (
              UPDATE pane SET active_pane_item_id = (SELECT id FROM upserted), last_accessed_at = ${nowIso}
              WHERE id = ${paneId}
              RETURNING workspace_id
            ),
            _updated_workspace AS (
              UPDATE workspace SET active_pane_id = ${paneId}
              WHERE id = (SELECT workspace_id FROM updated_pane)
            )
            SELECT id FROM upserted
          `),
        )

        return (result.rows[0] as { id: string }).id
      }),

    upsertEditor: flow(
      execute(EditorInsertSchema, (values: EditorInsert) =>
        Effect.gen(function* () {
          return yield* query((_) =>
            _.insert(editorTable)
              .values(values)
              .onConflictDoUpdate({
                target: [editorTable.pane_id, editorTable.file_id],
                set: { view_kind: values.view_kind },
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

    updateEditorViewKind: (editorId: EditorPrimaryKey, viewKind: PersistableViewKind) =>
      query((_) =>
        _.update(editorTable).set({ view_kind: viewKind }).where(eq(editorTable.id, editorId)),
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
        PGlite.create({
          dataDir: "idb://spacecake",
          extensions: { live },
          relaxedDurability: true,
        }),
      catch: (error) => {
        console.log(error)
        return new PgliteError({ cause: error })
      },
    })

    // web worker version (revisit when pglite batches worker RPC):
    // const client = yield* Effect.tryPromise({
    //   try: () =>
    //     PGliteWorker.create(new PgliteWorkerModule(), {
    //       dataDir: "idb://spacecake",
    //       extensions: { live },
    //       singleTab: true,
    //     }),
    //   catch: (error) => {
    //     console.log(error)
    //     return new PgliteError({ cause: error })
    //   },
    // })

    const orm = drizzle({ client, casing: "snake_case" })

    return makeDatabaseService(client, orm)
  }),
}) {}
