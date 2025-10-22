import { useLayoutEffect, useRef } from "react"

import { match } from "@/types/adt"
import { WorkspaceInfo } from "@/types/workspace"
import { startWatcher, stopWatcher } from "@/lib/fs"
import { useFileEventHandler } from "@/hooks/use-file-event-handler"

interface WorkspaceWatcherProps {
  workspacePath: WorkspaceInfo["path"]
}

export function WorkspaceWatcher({ workspacePath }: WorkspaceWatcherProps) {
  const handleEvent = useFileEventHandler(workspacePath)
  const isListeningRef = useRef(false)
  const currentWorkspaceRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    // prevent duplicate listeners for the same workspace
    if (
      isListeningRef.current &&
      currentWorkspaceRef.current === workspacePath
    ) {
      return
    }

    let off: (() => void) | undefined

    startWatcher(workspacePath)
      .then((result) => {
        match(result, {
          onLeft: (error) => console.error(error),
          onRight: () => {
            // set up file event listener for ongoing changes
            off = window.electronAPI.onFileEvent((event) => {
              handleEvent(event)
            })
            isListeningRef.current = true
            currentWorkspaceRef.current = workspacePath
          },
        })
      })
      .catch((error) => {
        console.error("error setting up workspace watcher:", error)
      })

    return () => {
      if (off) {
        off()
        isListeningRef.current = false
        currentWorkspaceRef.current = null
      }
      // stop watching the workspace when component unmounts
      stopWatcher(workspacePath)
    }
  }, [workspacePath])

  return null
}
