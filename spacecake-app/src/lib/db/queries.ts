import { desc, eq, like, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

import { editorTable, fileTable, paneItemTable, paneTable, workspaceTable } from "@/schema/drizzle"
import { EditorPrimaryKey } from "@/schema/editor"
import { FilePrimaryKey } from "@/schema/file"
import { PaneItemPrimaryKey, PanePrimaryKey } from "@/schema/pane"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import { ViewKind } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"

type Orm = ReturnType<typeof drizzle>

/**
 * Constructs a query to fetch workspace cache data.
 *
 * This joins the file, editor, and paneItem tables to get:
 * - filePath: absolute path of the file
 * - fileId: primary key of the file
 * - view_kind: the view kind from the editor (rich or source)
 * - has_cached_state: whether an editor state exists for this file
 * - mtime: modification time of the file
 * - cid: content ID hash of the file
 * - editorId: the primary key of the most recently accessed editor for this file (null if none exists)
 *
 * Uses PostgreSQL's DISTINCT ON to efficiently select only the most recently
 * accessed editor for each file, even when multiple editors exist per file.
 * A single query with DISTINCT ON (file_id) ordered by descending paneItem.last_accessed_at
 * ensures we get the most recent editor per file deterministically.
 */
export const workspaceCacheQuery = (orm: Orm, workspacePath: AbsolutePath) => {
  return orm
    .selectDistinctOn([fileTable.id], {
      filePath: sql<AbsolutePath>`${fileTable.path}`.as("filePath"),
      fileId: sql<FilePrimaryKey>`${fileTable.id}`.as("fileId"),
      view_kind: editorTable.view_kind,
      has_cached_state: sql<boolean>`${editorTable.state} IS NOT NULL`.as("has_cached_state"),
      mtime: fileTable.mtime,
      cid: fileTable.cid,
      editorId: sql<EditorPrimaryKey>`${editorTable.id}`.as("editorId"),
    })
    .from(fileTable)
    .leftJoin(editorTable, eq(fileTable.id, editorTable.file_id))
    .leftJoin(paneItemTable, eq(paneItemTable.editor_id, editorTable.id))
    .where(like(fileTable.path, `${workspacePath}%`))
    .orderBy(fileTable.id, desc(paneItemTable.last_accessed_at))
}

/**
 * Constructs a query to fetch workspace layout data.
 *
 * Returns the layout column for the specified workspace.
 */
export const workspaceLayoutQuery = (orm: Orm, workspaceId: WorkspacePrimaryKey) => {
  return orm
    .select({
      layout: workspaceTable.layout,
    })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
}

/**
 * Constructs a query to fetch pane items with file information.
 *
 * Returns pane items ordered by position, with:
 * - id: pane item primary key
 * - position: display order
 * - editorId: the editor's primary key
 * - filePath: absolute path of the file
 * - viewKind: the view kind (rich or source)
 */
export const paneItemsQuery = (orm: Orm, paneId: PanePrimaryKey) => {
  return orm
    .select({
      id: sql<PaneItemPrimaryKey>`${paneItemTable.id}`.as("id"),
      position: sql<number>`${paneItemTable.position}`.as("position"),
      editorId: sql<EditorPrimaryKey | null>`${paneItemTable.editor_id}`.as("editorId"),
      filePath: sql<AbsolutePath>`${fileTable.path}`.as("filePath"),
      viewKind: sql<ViewKind>`${editorTable.view_kind}`.as("viewKind"),
    })
    .from(paneItemTable)
    .innerJoin(editorTable, eq(paneItemTable.editor_id, editorTable.id))
    .innerJoin(fileTable, eq(editorTable.file_id, fileTable.id))
    .where(eq(paneItemTable.pane_id, paneId))
    .orderBy(paneItemTable.position)
}

/**
 * Query to get the active pane item ID for a pane.
 * Note: We use sql.as() to ensure the alias appears in the raw SQL output,
 * since useLiveQuery runs raw SQL and returns column names as-is.
 */
export const activePaneItemQuery = (orm: Orm, paneId: PanePrimaryKey) => {
  return orm
    .select({
      activePaneItemId: sql<string | null>`${paneTable.active_pane_item_id}`.as("activePaneItemId"),
    })
    .from(paneTable)
    .where(eq(paneTable.id, paneId))
}

/**
 * Constructs a query to fetch workspace settings data.
 *
 * Returns the settings column for the specified workspace.
 */
export const workspaceSettingsQuery = (orm: Orm, workspaceId: WorkspacePrimaryKey) => {
  return orm
    .select({
      settings: workspaceTable.settings,
    })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
}
