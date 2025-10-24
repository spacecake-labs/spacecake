import { editorTable, fileTable } from "@/schema/drizzle"
import { FilePrimaryKey } from "@/schema/file"
import { eq, like, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

import { AbsolutePath } from "@/types/workspace"

type Orm = ReturnType<typeof drizzle>

/**
 * Constructs a query to fetch workspace cache data.
 *
 * This joins the file and editor tables to get:
 * - filePath: absolute path of the file
 * - fileId: primary key of the file
 * - view_kind: the view kind from the editor (rich or source)
 * - has_cached_state: whether an editor state exists for this file
 * - mtime: modification time of the file
 * - cid: content ID hash of the file
 */
export const workspaceCacheQuery = (orm: Orm, workspacePath: AbsolutePath) => {
  return orm
    .select({
      filePath: sql<AbsolutePath>`${fileTable.path}`.as("filePath"),
      fileId: sql<FilePrimaryKey>`${fileTable.id}`.as("fileId"),
      view_kind: editorTable.view_kind,
      has_cached_state: sql<boolean>`${editorTable.state} IS NOT NULL`.as(
        "has_cached_state"
      ),
      mtime: fileTable.mtime,
      cid: fileTable.cid,
    })
    .from(fileTable)
    .innerJoin(editorTable, eq(fileTable.id, editorTable.file_id))
    .where(like(fileTable.path, `${workspacePath}%`))
}
