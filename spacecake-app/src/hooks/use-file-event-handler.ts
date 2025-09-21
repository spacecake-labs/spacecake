import { useCallback } from "react"
import { localStorageService } from "@/services/storage"
import { useSetAtom, useStore } from "jotai"
import type { LexicalEditor } from "lexical"

import type { FileTreeEvent, WorkspaceInfo } from "@/types/workspace"
import { fileContentAtom, fileTreeAtom } from "@/lib/atoms/atoms"
import { fileTreeEventAtom } from "@/lib/atoms/file-tree"
import { handleFileEvent } from "@/lib/file-event-handler"
import { useEditorContext } from "@/hooks/use-filepath"

export const useFileEventHandler = (workspace: WorkspaceInfo) => {
  const setFileTreeEvent = useSetAtom(fileTreeEventAtom)
  const store = useStore()
  const editorContext = useEditorContext()
  const currentPath = editorContext?.filePath || null

  return useCallback(
    (event: FileTreeEvent, currentEditor?: LexicalEditor | null) => {
      // Get current values at the time of the event using the store
      // This ensures we always get the latest values without causing re-renders
      const currentTree = store.get(fileTreeAtom)
      const storedPrefs = localStorageService.get("spacecake-view-preferences")
      const userViewPreferences = storedPrefs ? JSON.parse(storedPrefs) : {}
      const currentFileContent = store.get(fileContentAtom)

      handleFileEvent(
        event,
        currentPath,
        currentEditor,
        currentTree,
        userViewPreferences,
        setFileTreeEvent,
        currentFileContent,
        workspace
      )
    },
    [setFileTreeEvent, store, workspace, currentPath]
  )
}
