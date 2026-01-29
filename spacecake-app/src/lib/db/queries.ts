import {
  editorTable,
  fileTable,
  paneItemTable,
  workspaceTable,
} from "@/schema/drizzle"
import { EditorPrimaryKey } from "@/schema/editor"
import { FilePrimaryKey } from "@/schema/file"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import { desc, eq, like, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

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
      has_cached_state: sql<boolean>`${editorTable.state} IS NOT NULL`.as(
        "has_cached_state"
      ),
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
export const workspaceLayoutQuery = (
  orm: Orm,
  workspaceId: WorkspacePrimaryKey
) => {
  return orm
    .select({
      layout: workspaceTable.layout,
    })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
}
