// hook to get file state only if it has been opened
import { atom } from "jotai"
import { atomFamily } from "jotai-family"
import { atomWithMachine } from "jotai-xstate"

import type { File, FileTree, FileTreeEvent, Folder, WorkspaceInfo } from "@/types/workspace"

import { expandedFoldersAtom, fileTreeAtom, isCreatingInContextAtom } from "@/lib/atoms/atoms"
import { fileTypeFromExtension, fileTypeFromFileName } from "@/lib/workspace"
import { fileStateMachine } from "@/machines/file-tree"
import { router } from "@/router"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"
import { WorkspaceNotFound } from "@/types/workspace-error"

/** find a folder by path in the tree */
export function findFolderInTree(tree: FileTree, folderPath: string): Folder | undefined {
  for (const item of tree) {
    if (item.kind === "folder") {
      if (item.path === folderPath) return item
      if (folderPath.startsWith(item.path + "/")) {
        const found = findFolderInTree(item.children, folderPath)
        if (found) return found
      }
    }
  }
  return undefined
}

/** update a folder by path in the tree (exported for lazy-load expand) */
export const updateFolderInTree = (
  tree: FileTree,
  folderPath: string,
  updater: (folder: Folder) => Folder,
): FileTree => {
  return tree.map((item) => {
    if (item.kind === "folder" && item.path === folderPath) {
      return updater(item)
    }
    if (item.kind === "folder" && folderPath.startsWith(item.path + "/")) {
      return {
        ...item,
        children: updateFolderInTree(item.children, folderPath, updater),
      }
    }
    return item
  })
}

// helper function to find and update items in the tree
const updateFileTree = (
  tree: FileTree,
  path: string, // Now absolute path
  updater: (item: File | Folder) => File | Folder,
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
  itemToAdd: File | Folder,
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

// Helper to merge new tree with existing, preserving expanded and resolved state
const mergeTrees = (
  newTree: FileTree,
  oldTree: FileTree,
  expandedFolders: { [path: string]: boolean },
): FileTree => {
  return newTree.map((newItem) => {
    if (newItem.kind === "folder") {
      const oldItem = oldTree.find(
        (item) => item.path === newItem.path && item.kind === "folder",
      ) as Folder | undefined

      const isExpanded = expandedFolders[newItem.path] || oldItem?.isExpanded || false

      // if the old folder was resolved but the new one isn't, keep the old children
      const useOldChildren = oldItem?.resolved && !newItem.resolved
      const children = useOldChildren ? oldItem.children : newItem.children
      const resolved = useOldChildren ? oldItem.resolved : newItem.resolved

      return {
        ...newItem,
        isExpanded,
        resolved,
        children: mergeTrees(children, oldItem?.children || [], expandedFolders),
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
    deleteFile: (filePath: AbsolutePath) => Promise<void>,
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
    const parentPath = lastSlash === -1 ? null : absolutePath.substring(0, lastSlash)

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
                fileType: fileTypeFromExtension(absolutePath.split(".").pop() || ""),
                // No isExpanded for files
              }
            : {
                name,
                path: absolutePath,
                cid: "",
                kind: "folder",
                children: [],
                isExpanded: true, // Set to true for auto-expansion
                resolved: false,
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
            : item,
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
              workspaceError: new WorkspaceNotFound({ path: workspacePath }),
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
  },
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

const createFileStateMachineAtom = (filePath: AbsolutePath) =>
  atomWithMachine(
    () => fileStateMachine,
    () => ({ input: { filePath, fileType: fileTypeFromFileName(filePath) } }),
  )

export const fileStateAtomFamily = atomFamily(createFileStateMachineAtom)

/**
 * Represents a creation input placeholder for virtualized rendering.
 */
export interface CreationInputItem {
  kind: "creation-input"
  parentPath: string
  creationKind: "file" | "folder"
}

/**
 * Represents a flattened tree item for virtualized rendering (file or folder).
 */
export interface FlatFileTreeItem {
  item: File | Folder
  depth: number
  isExpanded: boolean
  hasChildren: boolean
}

/**
 * Represents a creation input row in the virtualized tree.
 */
export interface FlatCreationInputItem {
  item: CreationInputItem
  depth: number
  isExpanded: false
  hasChildren: false
}

/**
 * Union type for all items in the flattened tree.
 */
export type FlatTreeItem = FlatFileTreeItem | FlatCreationInputItem

/**
 * Flattens a file tree into a list of visible items based on expanded folders.
 * Only includes items whose parent folders are expanded.
 * Optimized to avoid intermediate array creation and spreading.
 */
export function flattenVisibleTree(
  tree: FileTree,
  expandedFolders: Record<string, boolean>,
): FlatTreeItem[] {
  const result: FlatTreeItem[] = []

  function flatten(items: FileTree, depth: number) {
    for (const item of items) {
      if (item.kind === "folder") {
        const isExpanded = expandedFolders[item.path] ?? false
        const hasChildren = item.children.length > 0 || !item.resolved

        result.push({
          item,
          depth,
          isExpanded,
          hasChildren,
        })

        // Only include children if folder is expanded and has actual children
        if (isExpanded && item.children.length > 0) {
          flatten(item.children, depth + 1)
        }
      } else {
        result.push({
          item,
          depth,
          isExpanded: false,
          hasChildren: false,
        })
      }
    }
  }

  flatten(tree, 0)
  return result
}

/**
 * Atom that provides a flattened list of visible tree items for virtualized rendering.
 * Merges user-expanded folders with auto-reveal folders.
 * Injects creation input pseudo-items when creating files/folders in a directory.
 */
export const flatVisibleTreeAtom = atom((get) => {
  const tree = get(sortedFileTreeAtom)
  const expandedFolders = get(expandedFoldersAtom)
  const isCreatingInContext = get(isCreatingInContextAtom)

  const flatTree = flattenVisibleTree(tree, expandedFolders)

  // If creating in a folder context, inject a creation input pseudo-item
  if (isCreatingInContext) {
    const { parentPath, kind } = isCreatingInContext

    // Find the index of the parent folder
    const parentIndex = flatTree.findIndex(
      (flatItem) => flatItem.item.kind === "folder" && flatItem.item.path === parentPath,
    )

    if (parentIndex !== -1) {
      const parentItem = flatTree[parentIndex]
      const creationInputItem: FlatTreeItem = {
        item: {
          kind: "creation-input",
          parentPath,
          creationKind: kind,
        },
        depth: parentItem.depth + 1,
        isExpanded: false,
        hasChildren: false,
      }

      // Insert after the parent folder
      flatTree.splice(parentIndex + 1, 0, creationInputItem)
    }
  }

  return flatTree
})
