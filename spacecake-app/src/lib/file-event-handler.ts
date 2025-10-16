import { match } from "@/types/adt"
import type {
  File,
  FileContent,
  FileTree,
  FileTreeEvent,
  Folder,
  WorkspaceInfo,
} from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"
import { readFile } from "@/lib/fs"

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
  setFileTreeEvent: (
    event: FileTreeEvent,
    workspace: WorkspaceInfo,
    deleteFile: (filePath: AbsolutePath) => Promise<void>
  ) => void,
  currentFileContent: FileContent | null,
  workspace: WorkspaceInfo,
  fileTree: FileTree,
  deleteFile: (filePath: AbsolutePath) => Promise<void>
) => {
  let processedEvent = event

  if (event.kind === "addFile") {
    const fileInTree = findItemInTree(fileTree, event.path)
    if (fileInTree) {
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
  } else {
    // Handle other file tree events
    setFileTreeEvent(processedEvent, workspace, deleteFile)
  }
}
