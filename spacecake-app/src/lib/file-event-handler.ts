import { readFile } from "@/lib/fs"
import { match } from "@/types/adt"
import type { File, FileTree, FileTreeEvent, Folder, WorkspaceInfo } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"

// pending saves map: tracks files being saved by the app
// key: absolute file path, value: content hash (cid)
const pendingSaves = new Map<AbsolutePath, string>()

// file renames: suppress unlink(old) + add(new) watcher events for app-initiated renames
const pendingRenames = new Map<AbsolutePath, AbsolutePath>() // old → new
const pendingRenamesByNewPath = new Map<AbsolutePath, AbsolutePath>() // new → old

export function addPendingRename(oldPath: AbsolutePath, newPath: AbsolutePath): void {
  pendingRenames.set(oldPath, newPath)
  pendingRenamesByNewPath.set(newPath, oldPath)
  // safety cleanup if watcher events are missed
  setTimeout(() => {
    pendingRenames.delete(oldPath)
    pendingRenamesByNewPath.delete(newPath)
  }, 5_000)
}

// folder renames: suppress all events under old/new prefix
const pendingFolderRenames = new Map<AbsolutePath, AbsolutePath>()

export function addPendingFolderRename(oldPath: AbsolutePath, newPath: AbsolutePath): void {
  pendingFolderRenames.set(oldPath, newPath)
  setTimeout(() => {
    pendingFolderRenames.delete(oldPath)
  }, 5_000)
}

function isUnderPendingFolderRename(path: AbsolutePath): boolean {
  for (const [oldPrefix, newPrefix] of pendingFolderRenames) {
    if (
      path === oldPrefix ||
      path.startsWith(oldPrefix + "/") ||
      path === newPrefix ||
      path.startsWith(newPrefix + "/")
    )
      return true
  }
  return false
}

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
export const findItemInTree = (tree: FileTree, path: string): File | Folder | null => {
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

  // suppress watcher echoes of app-initiated renames
  if (event.kind === "unlinkFile" || event.kind === "unlinkFolder") {
    if (pendingRenames.has(AbsolutePath(event.path))) return
    if (isUnderPendingFolderRename(AbsolutePath(event.path))) return
  }
  if (event.kind === "addFile" || event.kind === "addFolder") {
    const oldPath = pendingRenamesByNewPath.get(AbsolutePath(event.path))
    if (oldPath !== undefined) {
      // both events seen — clean up
      pendingRenames.delete(oldPath)
      pendingRenamesByNewPath.delete(AbsolutePath(event.path))
      return
    }
    // eagerly clean up folder renames when the new folder itself is added
    if (event.kind === "addFolder") {
      for (const [oldPrefix, newPrefix] of pendingFolderRenames) {
        if (AbsolutePath(event.path) === newPrefix) {
          pendingFolderRenames.delete(oldPrefix)
          return
        }
      }
    }
    if (isUnderPendingFolderRename(AbsolutePath(event.path))) return
  }

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
