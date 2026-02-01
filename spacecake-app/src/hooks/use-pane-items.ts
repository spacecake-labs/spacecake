import { Schema } from "effect"
import { useMemo } from "react"

import { useQuery, useQuerySingle } from "@/hooks/use-query"
import { activePaneItemQuery, paneItemsQuery } from "@/lib/db/queries"
import { PaneItemPrimaryKeySchema, PaneItemWithFileSchema, PanePrimaryKey } from "@/schema/pane"

export const usePaneItems = (paneId: PanePrimaryKey) => {
  const result = useQuery((orm) => paneItemsQuery(orm, paneId).toSQL(), PaneItemWithFileSchema)

  const items = result.data ?? []

  return useMemo(
    () => ({
      items,
      loading: result.loading,
      error: result.error,
      empty: result.empty,
    }),
    [items, result.loading, result.error, result.empty],
  )
}

export const useActivePaneItemId = (paneId: PanePrimaryKey) => {
  const result = useQuerySingle(
    (orm) => activePaneItemQuery(orm, paneId).toSQL(),
    Schema.Struct({ activePaneItemId: Schema.NullOr(PaneItemPrimaryKeySchema) }),
  )

  return result.data?.activePaneItemId ?? null
}
