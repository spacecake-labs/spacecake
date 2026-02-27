import { eq, useLiveQuery } from "@tanstack/react-db"
import { useMemo } from "react"

import { useCollections } from "@/contexts/collections-context"

export const useActiveEditor = () => {
  const { workspaceCollection, paneCollection, paneItemCollection, editorCollection } =
    useCollections()

  const result = useLiveQuery(
    (q) =>
      q
        .from({ ws: workspaceCollection })
        .innerJoin({ pane: paneCollection }, ({ ws, pane }) => eq(pane.id, ws.active_pane_id!))
        .innerJoin({ item: paneItemCollection }, ({ pane, item }) =>
          eq(item.id, pane.active_pane_item_id!),
        )
        .innerJoin({ editor: editorCollection }, ({ item, editor }) =>
          eq(editor.id, item.editor_id!),
        )
        .select(({ editor }) => ({
          id: editor.id,
          pane_id: editor.pane_id,
          file_id: editor.file_id,
          view_kind: editor.view_kind,
        })),
    [workspaceCollection, paneCollection, paneItemCollection, editorCollection],
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
