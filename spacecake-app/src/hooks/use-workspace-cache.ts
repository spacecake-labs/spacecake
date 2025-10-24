import { WorkspaceCacheRowSchema } from "@/schema/workspace-cache"

import { AbsolutePath } from "@/types/workspace"
import { workspaceCacheQuery } from "@/lib/db/queries"
import { useQuery } from "@/hooks/use-query"

/**
 * Reactive hook that provides workspace cache data.
 *
 * Returns a Map<AbsolutePath, WorkspaceCacheRow> for ergonomic O(1) lookups.
 */
export const useWorkspaceCache = (workspacePath: AbsolutePath) => {
  const { data, loading, error, empty } = useQuery(
    (orm) => workspaceCacheQuery(orm, workspacePath).toSQL(),
    WorkspaceCacheRowSchema
  )

  const cacheMap = new Map(data?.map((row) => [row.filePath, row]) ?? [])

  return {
    cacheMap,
    loading,
    error,
    empty,
  }
}

export type WorkspaceCache = ReturnType<typeof useWorkspaceCache>["cacheMap"]
export type WorkspaceCacheValue =
  WorkspaceCache extends Map<infer _K, infer V> ? V : never
