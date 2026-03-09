import { useSetAtom, useStore } from "jotai"
import { useCallback } from "react"

import { useRoute } from "@/hooks/use-route"
import { fileTreeEventAtom, sortedFileTreeAtom } from "@/lib/atoms/file-tree"
import { quickOpenIndexAtom } from "@/lib/atoms/quick-open-index"
import * as mutations from "@/lib/db/mutations"
import { handleFileEvent } from "@/lib/file-event-handler"
import type { FileTreeEvent, WorkspaceInfo } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"

export const useFileEventHandler = (workspacePath: WorkspaceInfo["path"]) => {
  const setFileTreeEvent = useSetAtom(fileTreeEventAtom)
  const store = useStore()

  const deleteFile = useCallback(async (filePath: AbsolutePath) => {
    await mutations.deleteFile(filePath)
  }, [])

  const route = useRoute()
  const currentPath = route?.filePath || null

  return useCallback(
    (event: FileTreeEvent) => {
      // Get current values at the time of the event using the store
      // This ensures we always get the latest values without causing re-renders
      const fileTree = store.get(sortedFileTreeAtom)

      handleFileEvent(event, currentPath, setFileTreeEvent, workspacePath, fileTree, deleteFile)

      // keep quick-open index current
      if (event.kind === "addFile") {
        const name = event.path.split("/").pop()!
        store.set(quickOpenIndexAtom, (prev) => [...prev, { path: event.path, name }])
      } else if (event.kind === "unlinkFile") {
        store.set(quickOpenIndexAtom, (prev) => prev.filter((f) => f.path !== event.path))
      }
    },
    [setFileTreeEvent, store, workspacePath, deleteFile, currentPath],
  )
}
