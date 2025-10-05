import { useCallback } from "react"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import { localStorageService } from "@/services/storage"
import { useSetAtom, useStore } from "jotai"
import type { LexicalEditor } from "lexical"

import type { FileTreeEvent, WorkspaceInfo } from "@/types/workspace"
import { RelativePath } from "@/types/workspace"
import { fileContentAtom } from "@/lib/atoms/atoms"
import { fileTreeEventAtom, sortedFileTreeAtom } from "@/lib/atoms/file-tree"
import { handleFileEvent } from "@/lib/file-event-handler"

export const useFileEventHandler = (workspace: WorkspaceInfo, db: Database) => {
  const setFileTreeEvent = useSetAtom(fileTreeEventAtom)
  const store = useStore()

  const deleteFile = useCallback(
    async (filePath: RelativePath) => {
      await RuntimeClient.runPromise(db.deleteFile(workspace.path)(filePath))
    },
    [db, workspace.path]
  )

  return useCallback(
    (event: FileTreeEvent, currentEditor?: LexicalEditor | null) => {
      // Get current values at the time of the event using the store
      // This ensures we always get the latest values without causing re-renders
      const storedPrefs = localStorageService.get("spacecake-view-preferences")
      const userViewPreferences = storedPrefs ? JSON.parse(storedPrefs) : {}
      const currentFileContent = store.get(fileContentAtom)
      const fileTree = store.get(sortedFileTreeAtom)

      // Get current path from the store instead of context to avoid dependency issues
      // We can derive this from the current file content
      const currentPath = currentFileContent?.path || null

      handleFileEvent(
        event,
        currentPath,
        currentEditor,
        userViewPreferences,
        setFileTreeEvent,
        currentFileContent,
        workspace,
        fileTree,
        deleteFile
      )
    },
    [setFileTreeEvent, store, workspace, deleteFile] // Stable dependencies only
  )
}
