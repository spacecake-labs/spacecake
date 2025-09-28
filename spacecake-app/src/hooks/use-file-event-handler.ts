import { useCallback } from "react"
import { localStorageService } from "@/services/storage"
import { useSetAtom, useStore } from "jotai"
import type { LexicalEditor } from "lexical"

import type { FileTreeEvent, WorkspaceInfo } from "@/types/workspace"
import { fileContentAtom } from "@/lib/atoms/atoms"
import { fileTreeEventAtom } from "@/lib/atoms/file-tree"
import { handleFileEvent } from "@/lib/file-event-handler"

export const useFileEventHandler = (workspace: WorkspaceInfo) => {
  const setFileTreeEvent = useSetAtom(fileTreeEventAtom)
  const store = useStore()

  return useCallback(
    (event: FileTreeEvent, currentEditor?: LexicalEditor | null) => {
      // Get current values at the time of the event using the store
      // This ensures we always get the latest values without causing re-renders
      const storedPrefs = localStorageService.get("spacecake-view-preferences")
      const userViewPreferences = storedPrefs ? JSON.parse(storedPrefs) : {}
      const currentFileContent = store.get(fileContentAtom)

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
        workspace
      )
    },
    [setFileTreeEvent, store, workspace] // Stable dependencies only
  )
}
