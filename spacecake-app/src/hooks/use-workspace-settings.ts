import { eq, useLiveQuery } from "@tanstack/react-db"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { useMemo } from "react"

import { useCollections } from "@/contexts/collections-context"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import { defaultWorkspaceSettings, WorkspaceSettingsSchema } from "@/schema/workspace-settings"

const decodeSettings = Schema.decodeUnknownOption(WorkspaceSettingsSchema)

export const useWorkspaceSettings = (workspaceId: WorkspacePrimaryKey) => {
  const { workspaceCollection } = useCollections()

  const result = useLiveQuery(
    (q) =>
      q
        .from({ ws: workspaceCollection })
        .where(({ ws }) => eq(ws.id, workspaceId))
        .select(({ ws }) => ({ settings: ws.settings })),
    [workspaceId, workspaceCollection],
  )

  const row = result.data?.[0]

  const settings = row?.settings
    ? Option.getOrElse(decodeSettings(row.settings), () => defaultWorkspaceSettings)
    : defaultWorkspaceSettings

  return useMemo(
    () => ({
      settings,
      loading: result.isLoading,
      error: result.isError ? "collection error" : undefined,
      empty: !row,
    }),
    [settings, result.isLoading, result.isError, row],
  )
}
