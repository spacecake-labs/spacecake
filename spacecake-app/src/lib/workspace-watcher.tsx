import { useEffect } from "react"
import { useAtomValue, useSetAtom } from "jotai"

import { workspaceAtom } from "@/lib/atoms/atoms"
import { fileEventHandlerAtom } from "@/lib/atoms/workspace"

export function WorkspaceWatcher() {
  const workspace = useAtomValue(workspaceAtom)
  const handleEvent = useSetAtom(fileEventHandlerAtom)

  useEffect(() => {
    if (!workspace || workspace.path === "/") {
      return
    }

    let off: (() => void) | undefined

    // Only start watching if we have a valid workspace path
    window.electronAPI
      .watchWorkspace(workspace.path)
      .then(() => {
        off = window.electronAPI.onFileEvent(handleEvent)
      })
      .catch((error) => {
        console.error(`error watching workspace at ${workspace.path}:`, error)
      })

    return () => {
      if (off) {
        off()
      }
      // Stop watching the workspace when component unmounts
      window.electronAPI.stopWatching(workspace.path)
    }
  }, [workspace?.path, handleEvent])

  return null
}
