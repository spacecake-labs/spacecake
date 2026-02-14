import { Option, Schema } from "effect"

import { useQuerySingle } from "@/hooks/use-query"
import { workspaceLayoutQuery } from "@/lib/db/queries"
import { normalizeDock } from "@/lib/dock-transition"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import {
  defaultWorkspaceLayout,
  WorkspaceLayoutRowSchema,
  WorkspaceLayoutSchema,
} from "@/schema/workspace-layout"

const decodeLayout = Schema.decodeUnknownOption(WorkspaceLayoutSchema)

/**
 * Reactive hook that provides workspace layout data with live updates.
 *
 * Returns the layout with defaults applied for missing fields.
 */
export const useWorkspaceLayout = (workspaceId: WorkspacePrimaryKey) => {
  const { data, loading, error, empty } = useQuerySingle(
    (orm) => workspaceLayoutQuery(orm, workspaceId).toSQL(),
    WorkspaceLayoutRowSchema,
  )

  const decoded = data?.layout
    ? Option.getOrElse(decodeLayout(data.layout), () => defaultWorkspaceLayout)
    : defaultWorkspaceLayout

  // backfill panels missing from older stored layouts (e.g. "git" added after initial release)
  const layout = normalizeDock(decoded)

  return {
    layout,
    loading,
    error,
    empty,
  }
}
