import { and, desc, getTableColumns, isNotNull, like } from "drizzle-orm"

import { useQuery } from "@/hooks/use-query"
import { FileSelectSchema, fileTable } from "@/schema"
import { AbsolutePath } from "@/types/workspace"

export const useRecentFiles = (workspacePath: AbsolutePath) => {
  return useQuery(
    (orm) =>
      orm
        .select(getTableColumns(fileTable))
        .from(fileTable)
        .where(
          and(like(fileTable.path, `${workspacePath}%`), isNotNull(fileTable.last_accessed_at)),
        )
        .orderBy(desc(fileTable.last_accessed_at))
        .limit(10)
        .toSQL(),
    FileSelectSchema,
  )
}
