import { FileSelectSchema, fileTable, workspaceTable } from "@/schema/drizzle"
import { and, desc, eq, getTableColumns } from "drizzle-orm"

import { AbsolutePath } from "@/types/workspace"
import { useQuery } from "@/hooks/use-query"

export const useRecentFiles = (workspacePath: AbsolutePath) => {
  return useQuery(
    (orm) =>
      orm
        .select(getTableColumns(fileTable))
        .from(fileTable)
        .innerJoin(
          workspaceTable,
          and(
            eq(fileTable.workspace_id, workspaceTable.id),
            eq(workspaceTable.path, workspacePath)
          )
        )
        .orderBy(desc(fileTable.last_accessed_at))
        .limit(10)
        .toSQL(),
    FileSelectSchema
  )
}
