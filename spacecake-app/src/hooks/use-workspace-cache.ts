import { eq, useLiveQuery } from "@tanstack/react-db"
import { useMemo } from "react"

import { useCollections } from "@/contexts/collections-context"
import { FilePrimaryKey } from "@/schema/file"
import type { WorkspaceCacheRow } from "@/schema/workspace-cache"
import { AbsolutePath } from "@/types/workspace"

/**
 * reactive hook that provides workspace cache data.
 * joins file and editor collections to derive the workspace cache view.
 *
 * returns a Map<AbsolutePath, WorkspaceCacheRow> for ergonomic O(1) lookups.
 */
export const useWorkspaceCache = () => {
  const { fileCollection, editorCollection } = useCollections()

  const result = useLiveQuery(
    (q) =>
      q
        .from({ file: fileCollection })
        .leftJoin({ editor: editorCollection }, ({ file, editor }) => eq(editor!.file_id, file.id))
        .select(({ file, editor }) => ({
          fileId: file.id,
          filePath: file.path,
          cid: file.cid,
          mtime: file.mtime,
          editorId: editor?.id,
          viewKind: editor?.view_kind,
          hasState: editor?.state,
        })),
    [fileCollection, editorCollection],
  )

  // post-process: group by file, take the first editor per file
  // (collections return all file-editor pairs; we pick one editor per file)
  const cacheMap = useMemo(() => {
    const map = new Map<AbsolutePath, WorkspaceCacheRow>()
    if (!result.data) return map

    for (const row of result.data) {
      const filePath = row.filePath as AbsolutePath
      if (map.has(filePath)) continue // keep the first (already added)

      map.set(filePath, {
        filePath,
        file_id: FilePrimaryKey(row.fileId),
        view_kind: (row.viewKind ?? "source") as WorkspaceCacheRow["view_kind"],
        has_cached_state: row.hasState != null,
        mtime: new Date(row.mtime),
        cid: row.cid,
        editorId: (row.editorId ?? null) as WorkspaceCacheRow["editorId"],
      })
    }
    return map
  }, [result.data])

  return useMemo(
    () => ({
      cacheMap,
      loading: result.isLoading,
      error: result.isError ? "collection error" : undefined,
      empty: cacheMap.size === 0,
    }),
    [cacheMap, result.isLoading, result.isError],
  )
}

export type WorkspaceCache = ReturnType<typeof useWorkspaceCache>["cacheMap"]
export type WorkspaceCacheValue = WorkspaceCache extends Map<infer _K, infer V> ? V : never
