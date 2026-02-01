import { Effect } from "effect"
import { useSetAtom, useStore } from "jotai"
import { useCallback } from "react"

import type { FileTreeEvent, WorkspaceInfo } from "@/types/workspace"

import { useRoute } from "@/hooks/use-route"
import { fileTreeEventAtom, sortedFileTreeAtom } from "@/lib/atoms/file-tree"
import { handleFileEvent } from "@/lib/file-event-handler"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import { AbsolutePath } from "@/types/workspace"

export const useFileEventHandler = (workspacePath: WorkspaceInfo["path"]) => {
  const setFileTreeEvent = useSetAtom(fileTreeEventAtom)
  const store = useStore()

  const deleteFile = useCallback(
    async (filePath: AbsolutePath) => {
      await RuntimeClient.runPromise(
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.deleteFile(filePath)
        }).pipe(Effect.tapErrorCause(Effect.logError)),
      )
    },
    [workspacePath],
  )

  const route = useRoute()
  const currentPath = route?.filePath || null

  return useCallback(
    (event: FileTreeEvent) => {
      // Get current values at the time of the event using the store
      // This ensures we always get the latest values without causing re-renders
      const fileTree = store.get(sortedFileTreeAtom)

      handleFileEvent(event, currentPath, setFileTreeEvent, workspacePath, fileTree, deleteFile)
    },
    [setFileTreeEvent, store, workspacePath, deleteFile, currentPath],
  )
}
