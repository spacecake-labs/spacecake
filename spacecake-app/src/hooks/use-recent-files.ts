import { isNull, not, useLiveQuery } from "@tanstack/react-db"
import { useMemo } from "react"

import { useCollections } from "@/contexts/collections-context"

export const useRecentFiles = () => {
  const { fileCollection } = useCollections()

  const result = useLiveQuery(
    (q) =>
      q
        .from({ file: fileCollection })
        .where(({ file }) => not(isNull(file.last_accessed_at)))
        .orderBy(({ file }) => file.last_accessed_at, "desc")
        .limit(10)
        .select(({ file }) => ({
          id: file.id,
          path: file.path,
          cid: file.cid,
          mtime: file.mtime,
          created_at: file.created_at,
          last_accessed_at: file.last_accessed_at,
        })),
    [fileCollection],
  )

  return useMemo(
    () => ({
      data: result.data,
      loading: result.isLoading,
      error: result.isError ? "collection error" : undefined,
      empty: result.data?.length === 0,
    }),
    [result.data, result.isLoading, result.isError],
  )
}
