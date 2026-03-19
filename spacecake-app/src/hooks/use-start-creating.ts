import { useSetAtom } from "jotai"
import { useCallback } from "react"

import {
  contextItemNameAtom,
  expandedFoldersAtom,
  isCreatingInContextAtom,
  lastClickedTreeItemAtom,
} from "@/lib/atoms/atoms"
import { store } from "@/lib/store"
import { resolveCreationParentPath } from "@/lib/utils"

// shared hook for starting file/folder creation in the workspace tree.
// reads lastClickedTreeItemAtom on demand (via store.get) to avoid
// subscribing the caller to every tree-item click.
export function useStartCreating(workspacePath: string | undefined) {
  const setIsCreatingInContext = useSetAtom(isCreatingInContextAtom)
  const setContextItemName = useSetAtom(contextItemNameAtom)
  const setExpandedFolders = useSetAtom(expandedFoldersAtom)

  const startCreating = useCallback(
    (kind: "file" | "folder") => {
      if (!workspacePath) return
      const lastClicked = store.get(lastClickedTreeItemAtom)
      const parentPath = resolveCreationParentPath(lastClicked, workspacePath)
      setIsCreatingInContext({ kind, parentPath })
      setContextItemName("")

      // expand the parent folder so the creation input is visible
      if (parentPath !== workspacePath) {
        setExpandedFolders((prev) => ({ ...prev, [parentPath]: true }))
      }
    },
    [workspacePath, setIsCreatingInContext, setContextItemName, setExpandedFolders],
  )

  return startCreating
}
