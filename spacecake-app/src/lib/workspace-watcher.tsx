import { useEffect } from "react"
import { useAtomValue, useSetAtom } from "jotai"

import { fileEventHandlerAtom, workspacePathAtom } from "./atoms/workspace"

export function WorkspaceWatcher() {
  const path = useAtomValue(workspacePathAtom)
  const handleEvent = useSetAtom(fileEventHandlerAtom)

  useEffect(() => {
    if (!path || path === "/") {
      return
    }

    // Only start watching if we have a valid workspace path
    void window.electronAPI.watchWorkspace(path)

    const off = window.electronAPI.onFileEvent(handleEvent)

    return () => {
      off?.()
      // Stop watching the workspace when component unmounts
      window.electronAPI.stopWatching(path)
    }
  }, [path, handleEvent])

  return null
}
