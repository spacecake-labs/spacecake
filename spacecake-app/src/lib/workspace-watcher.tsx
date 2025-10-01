import { useLayoutEffect, useRef } from "react"
import { useEditor } from "@/contexts/editor-context"

import { match } from "@/types/adt"
import { WorkspaceInfo } from "@/types/workspace"
import { startWatcher, stopWatcher } from "@/lib/fs"
import { useFileEventHandler } from "@/hooks/use-file-event-handler"

interface WorkspaceWatcherProps {
  workspace: WorkspaceInfo
}

export function WorkspaceWatcher({ workspace }: WorkspaceWatcherProps) {
  const { editorRef } = useEditor()
  const handleEvent = useFileEventHandler(workspace)
  const isListeningRef = useRef(false)
  const currentWorkspaceRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!workspace.path || workspace.path === "/") {
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

    startWatcher(workspace.path)
      .then((result) => {
        match(result, {
          onLeft: (error) => console.error(error),
          onRight: () => {
            // set up file event listener for ongoing changes
            off = window.electronAPI.onFileEvent((event) =>
              handleEvent(event, editorRef.current)
            )
            isListeningRef.current = true
            currentWorkspaceRef.current = workspace.path
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
      stopWatcher(workspace.path)
    }
  }, [workspace?.path])

  return null
}
