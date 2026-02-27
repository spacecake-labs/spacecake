import { eq, useLiveQuery } from "@tanstack/react-db"
import { useMemo } from "react"

import { useCollections } from "@/contexts/collections-context"
import { type PaneItemPrimaryKey, type PaneItemWithFile, PanePrimaryKey } from "@/schema/pane"

const EMPTY: PaneItemWithFile[] = []

export const usePaneItems = (paneId: PanePrimaryKey) => {
  const { paneItemCollection, editorCollection, fileCollection } = useCollections()

  const result = useLiveQuery(
    (q) =>
      q
        .from({ item: paneItemCollection })
        .innerJoin({ editor: editorCollection }, ({ item, editor }) =>
          eq(item.editor_id, editor.id),
        )
        .innerJoin({ file: fileCollection }, ({ editor, file }) => eq(editor.file_id, file.id))
        .where(({ item }) => eq(item.pane_id, paneId))
        .orderBy(({ item }) => item.position, "asc")
        .select(({ item, editor, file }) => ({
          id: item.id,
          position: item.position,
          editorId: editor.id,
          filePath: file.path,
          viewKind: editor.view_kind,
        })),
    [paneId, paneItemCollection, editorCollection, fileCollection],
  )

  const items = (result.data ?? EMPTY) as PaneItemWithFile[]

  return useMemo(
    () => ({
      items,
      loading: result.isLoading,
      error: result.isError ? "collection error" : undefined,
      empty: items.length === 0,
    }),
    [items, result.isLoading, result.isError],
  )
}

export const useActivePaneItemId = (paneId: PanePrimaryKey) => {
  const { paneCollection } = useCollections()

  const result = useLiveQuery(
    (q) =>
      q
        .from({ pane: paneCollection })
        .where(({ pane }) => eq(pane.id, paneId))
        .select(({ pane }) => ({
          activePaneItemId: pane.active_pane_item_id,
        })),
    [paneId, paneCollection],
  )

  return (result.data?.[0]?.activePaneItemId ?? null) as PaneItemPrimaryKey | null
}
