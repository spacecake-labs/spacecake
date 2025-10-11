import {
  ElementSelectSchema,
  elementTable,
  fileTable,
  workspaceTable,
} from "@/schema"
import { and, desc, eq, getTableColumns } from "drizzle-orm"

import { AbsolutePath } from "@/types/workspace"
import { useQuery } from "@/hooks/use-query"

export const useActiveElement = (workspacePath: AbsolutePath) => {
  return useQuery(
    (orm) =>
      orm
        .select(getTableColumns(elementTable))
        .from(elementTable)
        .innerJoin(fileTable, and(eq(elementTable.file_id, fileTable.id)))
        .innerJoin(
          workspaceTable,
          and(
            eq(fileTable.workspace_id, workspaceTable.id),
            eq(workspaceTable.path, workspacePath)
          )
        )
        .where(eq(elementTable.is_active, true))
        .orderBy(desc(elementTable.last_accessed_at))
        .limit(1)
        .toSQL(),
    ElementSelectSchema
  )
}
