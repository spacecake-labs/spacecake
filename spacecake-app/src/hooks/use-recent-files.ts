import { FileSelectSchema, fileTable } from "@/schema"
import { desc, getTableColumns, like } from "drizzle-orm"

import { AbsolutePath } from "@/types/workspace"
import { useQuery } from "@/hooks/use-query"

export const useRecentFiles = (workspacePath: AbsolutePath) => {
  return useQuery(
    (orm) =>
      orm
        .select(getTableColumns(fileTable))
        .from(fileTable)
        .where(like(fileTable.path, `${workspacePath}%`))
        .orderBy(desc(fileTable.last_accessed_at))
        .limit(10)
        .toSQL(),
    FileSelectSchema
  )
}
