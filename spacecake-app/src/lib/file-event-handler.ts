import type { LexicalEditor } from "lexical"

import type { ViewKind } from "@/types/lexical"
import type { FileContent, FileTree, FileTreeEvent } from "@/types/workspace"
import { getInitialEditorStateFromContent } from "@/components/editor/read-file"

export const handleFileEvent = async (
  event: FileTreeEvent,
  currentPath: string | null,
  currentEditor: LexicalEditor | null,
  currentTree: FileTree,
  userViewPreferences: Record<string, ViewKind>,
  setFileTreeEvent: (event: FileTreeEvent) => void,
  currentFileContent: FileContent | null
) => {
  // Handle content change events for editor updates
  if (event.kind === "contentChange") {
    // For the currently open file, check if CID has changed to avoid unnecessary updates
    if (currentPath && event.path === currentPath && currentFileContent) {
      if (currentFileContent.cid === event.cid) {
        return // Skip update - CID hasn't changed
      }
    }

    // Update file tree metadata (size, modified date, etag, content hash)
    setFileTreeEvent({
      kind: "contentChange",
      path: event.path,
      etag: event.etag,
      content: event.content,
      fileType: event.fileType,
      cid: event.cid,
    })

    // Then, update editor content if this is the currently open file
    if (currentPath && currentEditor && event.path === currentPath) {
      try {
        // Get the current view preference for this file type
        const currentView = userViewPreferences[event.fileType]

        // Create a mock FileContent object for the event
        const mockFileContent = {
          path: event.path,
          name: event.path.split("/").pop() || "",
          content: event.content,
          fileType: event.fileType,
          size: event.content.length,
          modified: new Date().toISOString(),
          etag: event.etag || "",
          cid: event.cid || "",
          kind: "file" as const,
        }

        // Use the existing function to ensure consistency
        const updateFunction = getInitialEditorStateFromContent(
          mockFileContent,
          currentView
        )

        // Apply the update using the existing logic
        updateFunction(currentEditor)
      } catch (error) {
        console.error("error updating editor content:", error)
      }
    }
  } else {
    // Handle other file tree events
    setFileTreeEvent(event)
  }
}
