import { useEffect, useRef } from "react"

import { WorkspaceInfo } from "@/types/workspace"
import { useFileEventHandler } from "@/hooks/use-file-event-handler"

interface WorkspaceWatcherProps {
  workspace: WorkspaceInfo
}

export function WorkspaceWatcher({ workspace }: WorkspaceWatcherProps) {
  const handleEvent = useFileEventHandler(workspace)
  const isListeningRef = useRef(false)
  const currentWorkspaceRef = useRef<string | null>(null)

  useEffect(() => {
    if (workspace.path === "/") {
      return
    }
    // prevent duplicate listeners for the same workspace
    if (
      isListeningRef.current &&
      currentWorkspaceRef.current === workspace.path
    ) {
      return
    }

    let off: (() => void) | undefined

    // Only start watching if we have a valid workspace path
    window.electronAPI
      .watchWorkspace(workspace.path)
      .then(() => {
        // only register listener if we're not already listening to this workspace
        if (
          !isListeningRef.current ||
          currentWorkspaceRef.current !== workspace.path
        ) {
          off = window.electronAPI.onFileEvent(handleEvent)
          isListeningRef.current = true
          currentWorkspaceRef.current = workspace.path
        }
      })
      .catch((error) => {
        console.error(`error watching workspace at ${workspace.path}:`, error)
      })

    return () => {
      if (off) {
        off()
        isListeningRef.current = false
        currentWorkspaceRef.current = null
      }
      // Stop watching the workspace when component unmounts
      window.electronAPI.stopWatching(workspace.path)
    }
  }, [workspace?.path, handleEvent])

  return null
}
