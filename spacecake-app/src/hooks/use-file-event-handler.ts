import { useCallback } from "react"
import { useSetAtom, useStore } from "jotai"
import type { LexicalEditor } from "lexical"

import type { FileTreeEvent, WorkspaceInfo } from "@/types/workspace"
import {
  fileContentAtom,
  fileTreeAtom,
  userViewPreferencesAtom,
} from "@/lib/atoms/atoms"
import { fileTreeEventAtom } from "@/lib/atoms/file-tree"
import { handleFileEvent } from "@/lib/file-event-handler"
import { useFilepath } from "@/hooks/use-filepath"

export const useFileEventHandler = (workspace: WorkspaceInfo) => {
  const setFileTreeEvent = useSetAtom(fileTreeEventAtom)
  const store = useStore()
  const currentPath = useFilepath()

  return useCallback(
    (event: FileTreeEvent, currentEditor?: LexicalEditor | null) => {
      // Get current values at the time of the event using the store
      // This ensures we always get the latest values without causing re-renders
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
    [setFileTreeEvent, store, workspace, currentPath]
  )
}
