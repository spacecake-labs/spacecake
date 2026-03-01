import { eq, useLiveQuery } from "@tanstack/react-db"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { useMemo } from "react"

import { useCollections } from "@/contexts/collections-context"
import { normalizeDock } from "@/lib/dock-transition"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import { defaultWorkspaceLayout, WorkspaceLayoutSchema } from "@/schema/workspace-layout"

const decodeLayout = Schema.decodeUnknownOption(WorkspaceLayoutSchema)

export const useWorkspaceLayout = (workspaceId: WorkspacePrimaryKey) => {
  const { workspaceCollection } = useCollections()

  const result = useLiveQuery(
    (q) =>
      q
        .from({ ws: workspaceCollection })
        .where(({ ws }) => eq(ws.id, workspaceId))
        .select(({ ws }) => ({ layout: ws.layout })),
    [workspaceId, workspaceCollection],
  )

  const row = result.data?.[0]

  const decoded = row?.layout
    ? Option.getOrElse(decodeLayout(row.layout), () => defaultWorkspaceLayout)
    : defaultWorkspaceLayout

  // backfill panels missing from older stored layouts
  const layout = useMemo(() => normalizeDock(decoded), [decoded])

  return useMemo(
    () => ({
      layout,
      loading: result.isLoading,
      error: result.isError ? "collection error" : undefined,
      empty: !row,
    }),
    [layout, result.isLoading, result.isError, row],
  )
}
