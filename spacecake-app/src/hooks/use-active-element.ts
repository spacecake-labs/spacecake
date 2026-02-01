import { and, eq, getTableColumns } from "drizzle-orm"

import { useQuery } from "@/hooks/use-query"
import { EditorSelectSchema, editorTable, paneItemTable, paneTable, workspaceTable } from "@/schema"
import { AbsolutePath } from "@/types/workspace"

export const useActiveEditor = (workspacePath: AbsolutePath) => {
  return useQuery(
    (orm) =>
      orm
        .select(getTableColumns(editorTable))
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
        .limit(1)
        .toSQL(),
    EditorSelectSchema,
  )
}
