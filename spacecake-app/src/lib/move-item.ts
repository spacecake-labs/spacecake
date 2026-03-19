import { createStore } from "jotai"

import { renameInTreeAtom } from "@/lib/atoms/file-tree"
import { quickOpenIndexAtom } from "@/lib/atoms/quick-open-index"
import * as mutations from "@/lib/db/mutations"
import { addPendingFolderRename, addPendingRename } from "@/lib/file-event-handler"
import { rename } from "@/lib/fs"
import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"

type JotaiStore = ReturnType<typeof createStore>

export async function moveOrRenameItem(params: {
  store: JotaiStore
  oldPath: AbsolutePath
  newPath: AbsolutePath
  isFolder: boolean
  navigate: (path: AbsolutePath) => void
  selectedFilePath: AbsolutePath | null
}): Promise<{ success: boolean; error?: string }> {
  const { store, oldPath, newPath, isFolder, navigate, selectedFilePath } = params

  // 1. register pending rename (suppresses watcher events)
  if (isFolder) {
    addPendingFolderRename(oldPath, newPath)
  } else {
    addPendingRename(oldPath, newPath)
  }

  // 2. optimistic UI update (tree + expanded folders + file state atoms + opened files)
  store.set(renameInTreeAtom, { oldPath, newPath, isFolder })

  // 3. update quick-open index
  const newName = newPath.split("/").pop()!
  if (isFolder) {
    store.set(quickOpenIndexAtom, (prev) =>
      prev.map((e) =>
        e.path.startsWith(oldPath + "/")
          ? {
              path: AbsolutePath(newPath + e.path.slice(oldPath.length)),
              name: e.name,
            }
          : e,
      ),
    )
  } else {
    store.set(quickOpenIndexAtom, (prev) =>
      prev.map((e) => (e.path === oldPath ? { path: newPath, name: newName } : e)),
    )
  }

  // 4. filesystem rename
  const result = await rename(oldPath, newPath)

  return match(result, {
    onLeft: (error) => {
      console.error(error)
      // TODO: rollback optimistic state on failure
      return { success: false, error: "error moving item" }
    },
    onRight: async () => {
      // 5. atomic DB path update (preserves file.id -> editor/pane_item survive)
      if (isFolder) {
        await mutations.renameFilesUnderFolder(oldPath, newPath)
      } else {
        await mutations.renameFile(oldPath, newPath)
      }

      // 6. navigate if current file was affected
      if (selectedFilePath === oldPath) {
        navigate(newPath)
      } else if (isFolder && selectedFilePath?.startsWith(oldPath + "/")) {
        navigate(AbsolutePath(newPath + selectedFilePath.slice(oldPath.length)))
      }

      return { success: true }
    },
  })
}
