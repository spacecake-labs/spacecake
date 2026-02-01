import type { File, FileTree, FileTreeEvent, Folder, WorkspaceInfo } from "@/types/workspace"

import { readFile } from "@/lib/fs"
import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"

// pending saves map: tracks files being saved by the app
// key: absolute file path, value: content hash (cid)
const pendingSaves = new Map<AbsolutePath, string>()

/**
 * adds a file path and its content hash to the pending saves map.
 * this "arms" the map to catch the resulting file watcher event.
 */
export function addPendingSave(filePath: AbsolutePath, cid: string): void {
  pendingSaves.set(filePath, cid)
}

/**
 * checks if a pending save exists for the given file path with a matching cid.
 * if found, removes the entry from the map and returns true.
 * otherwise, returns false.
 */
function checkAndRemovePendingSave(filePath: AbsolutePath, onDiskCID: string): boolean {
  const pendingCID = pendingSaves.get(filePath)
  if (pendingCID === onDiskCID) {
    pendingSaves.delete(filePath)
    return true
  }
  return false
}

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
    workspacePath: WorkspaceInfo["path"],
    deleteFile: (filePath: AbsolutePath) => Promise<void>,
  ) => void,
  workspacePath: WorkspaceInfo["path"],
  fileTree: FileTree,
  deleteFile: (filePath: AbsolutePath) => Promise<void>,
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
          setFileTreeEvent(event, workspacePath, deleteFile)
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
    // check if this is an app-initiated save or a legit external change
    const isAppInitiatedSave = checkAndRemovePendingSave(
      AbsolutePath(processedEvent.path),
      processedEvent.cid,
    )

    // if it's an app-initiated save, don't dispatch the event
    // the state machine is already in Saving or Reparsing state
    // and will handle its own transitions
    if (isAppInitiatedSave) {
      return
    }

    // this is a legit external change, update file tree
    setFileTreeEvent(
      {
        kind: "contentChange",
        path: processedEvent.path,
        etag: processedEvent.etag,
        content: processedEvent.content,
        fileType: processedEvent.fileType,
        cid: processedEvent.cid,
      },
      workspacePath,
      deleteFile,
    )
  } else {
    // Handle other file tree events
    setFileTreeEvent(processedEvent, workspacePath, deleteFile)
  }
}
