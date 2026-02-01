import { Option, Schema } from "effect"

import { useQuerySingle } from "@/hooks/use-query"
import { workspaceLayoutQuery } from "@/lib/db/queries"
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

  const layout = data?.layout
    ? Option.getOrElse(decodeLayout(data.layout), () => defaultWorkspaceLayout)
    : defaultWorkspaceLayout

  return {
    layout,
    loading,
    error,
    empty,
  }
}
