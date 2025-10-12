import {
  EditorSelectSchema,
  editorTable,
  paneTable,
  workspaceTable,
} from "@/schema/drizzle"
import { and, desc, eq, getTableColumns } from "drizzle-orm"

import { AbsolutePath } from "@/types/workspace"
import { useQuery } from "@/hooks/use-query"

export const useActiveEditor = (workspacePath: AbsolutePath) => {
  return useQuery(
    (orm) =>
      orm
        .select(getTableColumns(editorTable))
        .from(editorTable)
        .innerJoin(paneTable, eq(editorTable.pane_id, paneTable.id))
        .innerJoin(
          workspaceTable,
          and(
            eq(paneTable.workspace_id, workspaceTable.id),
            eq(workspaceTable.path, workspacePath)
          )
        )
        .where(eq(editorTable.is_active, true))
        .orderBy(desc(editorTable.last_accessed_at))
        .limit(1)
        .toSQL(),
    EditorSelectSchema
  )
}
