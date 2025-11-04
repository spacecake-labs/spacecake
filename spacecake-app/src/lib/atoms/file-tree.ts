import { fileStateMachine } from "@/machines/file-tree"
import { router } from "@/router"
// hook to get file state only if it has been opened
import { atom } from "jotai"
import { atomWithMachine } from "jotai-xstate"
import { atomFamily } from "jotai/utils"

import type {
  File,
  FileTree,
  FileTreeEvent,
  Folder,
  QuickOpenFileItem,
  WorkspaceInfo,
} from "@/types/workspace"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"
import { expandedFoldersAtom, fileTreeAtom } from "@/lib/atoms/atoms"
// Import expandedFoldersAtom
import { parentFolderName } from "@/lib/utils"
import { fileTypeFromExtension, fileTypeFromFileName } from "@/lib/workspace"

// helper function to find and update items in the tree
const updateFileTree = (
  tree: FileTree,
  path: string, // Now absolute path
  updater: (item: File | Folder) => File | Folder
): FileTree => {
  return tree.map((item) => {
    if (item.path === path) {
      return updater(item)
    }
    if (item.kind === "folder" && path.startsWith(item.path + "/")) {
      return {
        ...item,
        children: updateFileTree(item.children, path, updater),
      }
    }
    return item
  })
}

const addItemToTree = (
  tree: FileTree,
  parentPath: string, // Now absolute path
  itemToAdd: File | Folder
): FileTree => {
  return tree.map((item) => {
    if (item.kind === "folder" && item.path === parentPath) {
      // Prevent adding duplicates
      if (item.children.find((child) => child.path === itemToAdd.path)) {
        return item
      }
      return { ...item, children: [...item.children, itemToAdd] }
    }
    if (item.kind === "folder" && parentPath.startsWith(item.path + "/")) {
      return {
        ...item,
        children: addItemToTree(item.children, parentPath, itemToAdd),
      }
    }
    return item
  })
}

const removeItemFromTree = (tree: FileTree, path: string): FileTree => {
  // path is now absolute
  const newTree = tree.filter((item) => item.path !== path)
  return newTree.map((item) => {
    if (item.kind === "folder" && path.startsWith(item.path + "/")) {
      return {
        ...item,
        children: removeItemFromTree(item.children, path),
      }
    }
    return item
  })
}

// Helper to merge new tree with existing, preserving expanded state
const mergeTrees = (
  newTree: FileTree,
  oldTree: FileTree,
  expandedFolders: { [path: string]: boolean }
): FileTree => {
  return newTree.map((newItem) => {
    if (newItem.kind === "folder") {
      const oldItem = oldTree.find(
        (item) => item.path === newItem.path && item.kind === "folder"
      ) as Folder | undefined

      const isExpanded =
        expandedFolders[newItem.path] || oldItem?.isExpanded || false

      return {
        ...newItem,
        isExpanded,
        children: mergeTrees(
          newItem.children,
          oldItem?.children || [],
          expandedFolders
        ),
      }
    }
    return newItem
  })
}

// atom for setting the initial file tree from readWorkspace
export const setFileTreeAtom = atom(null, (get, set, tree: FileTree) => {
  const currentExpandedFolders = get(expandedFoldersAtom)
  const currentTree = get(fileTreeAtom)
  const mergedTree = mergeTrees(tree, currentTree, currentExpandedFolders)
  set(fileTreeAtom, mergedTree)
})

// atom for handling file tree events
export const fileTreeEventAtom = atom(
  null,
  (
    get,
    set,
    event: FileTreeEvent,
    workspacePath: WorkspaceInfo["path"],
    deleteFile: (filePath: AbsolutePath) => Promise<void>
  ) => {
    if (!workspacePath) return

    const currentTree = get(fileTreeAtom)
    const absolutePath = AbsolutePath(event.path)

    if (!absolutePath.startsWith(workspacePath)) {
      return
    }

    // Extract the name from the absolute path
    const name = absolutePath.split("/").pop()!

    // For nested items, we need the parent path for tree operations
    const lastSlash = absolutePath.lastIndexOf("/")
    const parentPath =
      lastSlash === -1 ? null : absolutePath.substring(0, lastSlash)

    switch (event.kind) {
      case "addFile":
      case "addFolder": {
        const newItem: File | Folder =
          event.kind === "addFile"
            ? {
                name,
                path: absolutePath,
                cid: ZERO_HASH,
                kind: "file",
                etag: event.etag,
                fileType: fileTypeFromExtension(
                  absolutePath.split(".").pop() || ""
                ),
                // No isExpanded for files
              }
            : {
                name,
                path: absolutePath,
                cid: "",
                kind: "folder",
                children: [],
                isExpanded: true, // Set to true for auto-expansion
              }

        if (parentPath === null || parentPath === workspacePath) {
          // Add to workspace root level
          if (currentTree.find((i) => i.path === absolutePath)) return
          set(fileTreeAtom, [...currentTree, newItem])
        } else {
          // Add to parent folder
          set(fileTreeAtom, addItemToTree(currentTree, parentPath, newItem))
        }

        // If a folder was added, mark it as expanded
        if (newItem.kind === "folder") {
          set(expandedFoldersAtom, (prev) => ({
            ...prev,
            [newItem.path]: true,
          }))
        }
        break
      }

      case "contentChange": {
        // Update file tree metadata (size, modified date, etag, content hash)
        const newTree = updateFileTree(currentTree, absolutePath, (item) =>
          item.kind === "file"
            ? {
                ...item,
                etag: event.etag,
                cid: event.cid, // Update the content hash
              }
            : item
        )
        set(fileTreeAtom, newTree)

        // Dispatch external change event to the state machine
        // Note: pending saves are filtered by the file event handler,
        // so only legit external changes reach here
        set(fileStateAtomFamily(absolutePath), {
          type: "file.external.change",
        })

        break
      }

      case "unlinkFile": {
        const newTree = removeItemFromTree(currentTree, absolutePath)
        set(fileTreeAtom, newTree)
        ;(async () => {
          await deleteFile(absolutePath)
        })()

        break
      }
      case "unlinkFolder": {
        if (absolutePath === workspacePath) {
          router.navigate({
            to: "/",
            search: {
              notFoundPath: workspacePath,
            },
            replace: true,
          })
          break
        }
        const newTree = removeItemFromTree(currentTree, absolutePath)
        set(fileTreeAtom, newTree)
        break
      }
    }
  }
)

export const sortedFileTreeAtom = atom((get) => {
  const fileTree = get(fileTreeAtom)

  const sortItems = (items: FileTree): FileTree => {
    return [...items].sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "folder" ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  const sortTree = (items: FileTree): FileTree => {
    return sortItems(items).map((item) => {
      if (item.kind === "folder") {
        return { ...item, children: sortTree(item.children) }
      }
      return item
    })
  }

  return sortTree(fileTree)
})

/**
 * Flattens a FileTree to get all files (excluding folders).
 */
export const flattenFiles = (tree: FileTree): File[] => {
  const files: File[] = []
  for (const item of tree) {
    if (item.kind === "file") {
      files.push(item)
    } else if (item.kind === "folder") {
      files.push(...flattenFiles(item.children))
    }
  }
  return files
}

// Function to get quick open file items for a specific workspace
export const getQuickOpenFileItems = (
  workspacePath: WorkspaceInfo["path"],
  fileTree: FileTree
): QuickOpenFileItem[] => {
  if (!workspacePath) return []

  const files = flattenFiles(fileTree)
  return files.map((file) => {
    const displayPath = parentFolderName(file.path, workspacePath, file.name)
    return { file, displayPath }
  })
}

const createFileStateMachineAtom = (filePath: AbsolutePath) =>
  atomWithMachine(
    () => fileStateMachine,
    () => ({ input: { filePath, fileType: fileTypeFromFileName(filePath) } })
  )

export const fileStateAtomFamily = atomFamily(createFileStateMachineAtom)
