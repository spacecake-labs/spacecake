import { useCallback } from "react"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import { Effect } from "effect"
import { useSetAtom, useStore } from "jotai"

import type { FileTreeEvent, WorkspaceInfo } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"
import { fileContentAtom } from "@/lib/atoms/atoms"
import { fileTreeEventAtom, sortedFileTreeAtom } from "@/lib/atoms/file-tree"
import { handleFileEvent } from "@/lib/file-event-handler"

export const useFileEventHandler = (workspace: WorkspaceInfo) => {
  const setFileTreeEvent = useSetAtom(fileTreeEventAtom)
  const store = useStore()

  const deleteFile = useCallback(
    async (filePath: AbsolutePath) => {
      await RuntimeClient.runPromise(
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.deleteFile(filePath)
        }).pipe(Effect.tapErrorCause(Effect.logError))
      )
    },
    [workspace?.path]
  )

  return useCallback(
    (event: FileTreeEvent) => {
      // Get current values at the time of the event using the store
      // This ensures we always get the latest values without causing re-renders
      const currentFileContent = store.get(fileContentAtom)
      const fileTree = store.get(sortedFileTreeAtom)

      // Get current path from the store instead of context to avoid dependency issues
      // We can derive this from the current file content
      const currentPath = currentFileContent?.path || null

      handleFileEvent(
        event,
        currentPath,
        setFileTreeEvent,
        currentFileContent,
        workspace,
        fileTree,
        deleteFile
      )
    },
    [setFileTreeEvent, store, workspace?.path, deleteFile]
  )
}
