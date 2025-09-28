import { useEffect, useRef } from "react"
import { useEditor } from "@/contexts/editor-context"
import { useSetAtom } from "jotai"

import { WorkspaceInfo } from "@/types/workspace"
import { setFileTreeAtom } from "@/lib/atoms/file-tree"
import { useFileEventHandler } from "@/hooks/use-file-event-handler"

interface WorkspaceWatcherProps {
  workspace: WorkspaceInfo
}

export function WorkspaceWatcher({ workspace }: WorkspaceWatcherProps) {
  const { editorRef } = useEditor()
  const handleEvent = useFileEventHandler(workspace)
  const setFileTree = useSetAtom(setFileTreeAtom)
  const isListeningRef = useRef(false)
  const currentWorkspaceRef = useRef<string | null>(null)

  useEffect(() => {
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

    // Only start watching if we have a valid workspace path
    window.electronAPI
      .readWorkspace(workspace.path)
      .then((response) => {
        if (response.success && response.tree) {
          setFileTree(response.tree)
        }
        off = window.electronAPI.onFileEvent((event) =>
          handleEvent(event, editorRef.current)
        )
        isListeningRef.current = true
        currentWorkspaceRef.current = workspace.path
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
  }, [workspace?.path])

  return null
}
