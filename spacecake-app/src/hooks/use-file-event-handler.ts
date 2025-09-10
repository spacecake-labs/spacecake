import { useCallback } from "react"
import { useSetAtom, useStore } from "jotai"

import type { FileTreeEvent, WorkspaceInfo } from "@/types/workspace"
import {
  fileContentAtom,
  fileTreeAtom,
  lexicalEditorAtom,
  selectedFilePathAtom,
  userViewPreferencesAtom,
} from "@/lib/atoms/atoms"
import { fileTreeEventAtom } from "@/lib/atoms/file-tree"
import { handleFileEvent } from "@/lib/file-event-handler"

export const useFileEventHandler = (workspace: WorkspaceInfo) => {
  const setFileTreeEvent = useSetAtom(fileTreeEventAtom)
  const store = useStore()

  return useCallback(
    (event: FileTreeEvent) => {
      // Get current values at the time of the event using the store
      // This ensures we always get the latest values without causing re-renders
      const currentPath = store.get(selectedFilePathAtom)
      const currentEditor = store.get(lexicalEditorAtom)
      const currentTree = store.get(fileTreeAtom)
      const userViewPreferences = store.get(userViewPreferencesAtom)
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
    [setFileTreeEvent, store, workspace]
  )
}
