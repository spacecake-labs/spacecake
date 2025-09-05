import { useEffect } from "react"
import { useAtomValue, useSetAtom } from "jotai"

import { workspaceAtom } from "@/lib/atoms/atoms"
import {
  getWorkspaceEditorLayoutKey,
  getWorkspaceRecentFilesKey,
} from "@/lib/atoms/storage"

import { fileEventHandlerAtom, workspacePathAtom } from "./atoms/workspace"

interface WorkspaceWatcherProps {
  onNotFound: () => void
}

export function WorkspaceWatcher({ onNotFound }: WorkspaceWatcherProps) {
  const path = useAtomValue(workspacePathAtom)
  const handleEvent = useSetAtom(fileEventHandlerAtom)
  const setWorkspace = useSetAtom(workspaceAtom)

  useEffect(() => {
    if (!path || path === "/") {
      return
    }

    let off: (() => void) | undefined

    // Only start watching if we have a valid workspace path
    window.electronAPI
      .watchWorkspace(path)
      .then(() => {
        off = window.electronAPI.onFileEvent(handleEvent)
      })
      .catch((error) => {
        console.error(`workspace not found at ${path}:`, error)

        // clean up persisted data for this workspace
        localStorage.removeItem(getWorkspaceRecentFilesKey(path))
        localStorage.removeItem(getWorkspaceEditorLayoutKey(path))

        // clear the global workspace atom and navigate away
        setWorkspace(null)
        onNotFound()
      })

    return () => {
      off?.()
      // Stop watching the workspace when component unmounts
      window.electronAPI.stopWatching(path)
    }
  }, [path, handleEvent, onNotFound, setWorkspace])

  return null
}
