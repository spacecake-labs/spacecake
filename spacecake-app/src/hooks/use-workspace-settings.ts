import { Option, Schema } from "effect"

import { useQuerySingle } from "@/hooks/use-query"
import { workspaceSettingsQuery } from "@/lib/db/queries"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import {
  defaultWorkspaceSettings,
  WorkspaceSettingsRowSchema,
  WorkspaceSettingsSchema,
} from "@/schema/workspace-settings"

const decodeSettings = Schema.decodeUnknownOption(WorkspaceSettingsSchema)

/**
 * Reactive hook that provides workspace settings data with live updates.
 *
 * Returns the settings with defaults applied for missing fields.
 */
export const useWorkspaceSettings = (workspaceId: WorkspacePrimaryKey) => {
  const { data, loading, error, empty } = useQuerySingle(
    (orm) => workspaceSettingsQuery(orm, workspaceId).toSQL(),
    WorkspaceSettingsRowSchema,
  )

  const settings = data?.settings
    ? Option.getOrElse(decodeSettings(data.settings), () => defaultWorkspaceSettings)
    : defaultWorkspaceSettings

  return {
    settings,
    loading,
    error,
    empty,
  }
}
