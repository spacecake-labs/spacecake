import type { LexicalEditor } from "lexical"

import { match } from "@/types/adt"
import type { ViewKind } from "@/types/lexical"
import type {
  File,
  FileContent,
  FileTree,
  FileTreeEvent,
  Folder,
  RelativePath,
  WorkspaceInfo,
} from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"
import { readFile } from "@/lib/fs"
import { getInitialEditorStateFromContent } from "@/components/editor/read-file"

// helper to find an item in the tree.
const findItemInTree = (tree: FileTree, path: string): File | Folder | null => {
  for (const item of tree) {
    if (item.path === path) {
      return item
    }
    if (item.kind === "folder" && path.startsWith(item.path + "/")) {
      const found = findItemInTree(item.children, path)
      if (found) {
        return found
      }
    }
  }
  return null
}

export const handleFileEvent = async (
  event: FileTreeEvent,
  currentPath: string | null,
  currentEditor: LexicalEditor | null | undefined,
  userViewPreferences: Record<string, ViewKind>,
  setFileTreeEvent: (
    event: FileTreeEvent,
    workspace: WorkspaceInfo,
    deleteFile: (filePath: RelativePath) => Promise<void>
  ) => void,
  currentFileContent: FileContent | null,
  workspace: WorkspaceInfo,
  fileTree: FileTree,
  deleteFile: (filePath: RelativePath) => Promise<void>
) => {
  let processedEvent = event

  if (event.kind === "addFile") {
    const fileExists = findItemInTree(fileTree, event.path)
    if (fileExists) {
      // File exists, so this is an atomic write. read the file and transform the event
      const result = await readFile(AbsolutePath(event.path))
      match(result, {
        onLeft: (error) => {
          console.error(error)
          // If we can't read the file, we can't treat it as a content change, so we pass it through as an addFile event.
          setFileTreeEvent(event, workspace, deleteFile)
        },
        onRight: (file) => {
          processedEvent = {
            kind: "contentChange",
            path: file.path,
            content: file.content,
            cid: file.cid,
            etag: file.etag,
            fileType: file.fileType,
          }
        },
      })
    }
  }

  // Handle content change events for editor updates
  if (processedEvent.kind === "contentChange") {
    // For the currently open file, check if CID has changed to avoid unnecessary updates
    if (
      currentPath &&
      processedEvent.path === currentPath &&
      currentFileContent
    ) {
      if (currentFileContent.cid === processedEvent.cid) {
        // Skip update - CID hasn't changed (frontend already handled re-parsing)
        return
      }
    }

    // Update file tree metadata (size, modified date, etag, content hash)
    setFileTreeEvent(
      {
        kind: "contentChange",
        path: processedEvent.path,
        etag: processedEvent.etag,
        content: processedEvent.content,
        fileType: processedEvent.fileType,
        cid: processedEvent.cid,
      },
      workspace,
      deleteFile
    )

    // Then, update editor content if this is the currently open file
    if (currentPath && currentEditor && processedEvent.path === currentPath) {
      try {
        // Get the current view preference for this file type
        const currentView = userViewPreferences[processedEvent.fileType]

        // Create a mock FileContent object for the event
        const mockFileContent = {
          path: processedEvent.path,
          name: processedEvent.path.split("/").pop() || "",
          content: processedEvent.content,
          fileType: processedEvent.fileType,
          size: processedEvent.content.length,
          modified: new Date().toISOString(),
          etag: processedEvent.etag || "",
          cid: processedEvent.cid || "",
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
    setFileTreeEvent(processedEvent, workspace, deleteFile)
  }
}
