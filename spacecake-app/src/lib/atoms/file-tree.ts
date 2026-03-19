// hook to get file state only if it has been opened
import { atom } from "jotai"
import { atomWithMachine } from "jotai-xstate"

import {
  expandedFoldersAtom,
  fileTreeAtom,
  isCreatingInContextAtom,
  openedFilesAtom,
} from "@/lib/atoms/atoms"
import { findItemInTree } from "@/lib/file-event-handler"
import { replaceEqualDeep } from "@/lib/structural-sharing"
import { fileTypeFromExtension, fileTypeFromFileName } from "@/lib/workspace"
import { fileStateMachine } from "@/machines/file-tree"
import { router } from "@/router"
import type { File, FileTree, FileTreeEvent, Folder, WorkspaceInfo } from "@/types/workspace"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"
import { WorkspaceNotFound } from "@/types/workspace-error"

/** sort comparator: folders first, then alphabetical by name */
const fileTreeCompare = (a: File | Folder, b: File | Folder): number => {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1
  return a.name.localeCompare(b.name)
}

/** insert an item into an already-sorted array, preserving sort order */
const sortedInsert = (items: FileTree, newItem: File | Folder): FileTree => {
  const idx = items.findIndex((item) => fileTreeCompare(newItem, item) < 0)
  if (idx === -1) return [...items, newItem]
  const result = [...items]
  result.splice(idx, 0, newItem)
  return result
}

/** recursively sort a tree (used on initial load, merge, and lazy-load expand) */
export const sortTree = (items: FileTree): FileTree => {
  const sorted = [...items].sort(fileTreeCompare)
  return sorted.map((item) =>
    item.kind === "folder" ? { ...item, children: sortTree(item.children) } : item,
  )
}

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
      return { ...item, children: sortedInsert(item.children, itemToAdd) }
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

/** recursively rewrite paths under a renamed folder */
const rewriteChildPaths = (children: FileTree, oldPrefix: string, newPrefix: string): FileTree =>
  children.map((item) => {
    const newItemPath = AbsolutePath(newPrefix + item.path.slice(oldPrefix.length))
    const newItemName = newItemPath.split("/").pop()!
    if (item.kind === "folder") {
      return {
        ...item,
        path: newItemPath,
        name: newItemName,
        children: rewriteChildPaths(item.children, oldPrefix, newPrefix),
      }
    }
    return { ...item, path: newItemPath, name: newItemName }
  })

// Helper to merge new tree with existing, preserving expanded and resolved state
const mergeTrees = (
  newTree: FileTree,
  oldTree: FileTree,
  expandedFolders: { [path: string]: boolean },
): FileTree => {
  // build a map for O(1) lookups instead of O(n) find per item
  const oldFoldersByPath = new Map<string, Folder>()
  for (const item of oldTree) {
    if (item.kind === "folder") {
      oldFoldersByPath.set(item.path, item)
    }
  }

  return newTree.map((newItem) => {
    if (newItem.kind === "folder") {
      const oldItem = oldFoldersByPath.get(newItem.path)

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
  set(fileTreeAtom, sortTree(mergedTree))
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
          set(fileTreeAtom, sortedInsert(currentTree, newItem))
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

        // only notify files that already have state machines (i.e., were opened).
        // watcher events fire for every file in the workspace - don't create
        // machine actors for files the user never opened.
        if (hasFileStateAtom(absolutePath)) {
          set(getOrCreateFileStateAtom(absolutePath), {
            type: "file.external.change",
          })
        }

        break
      }

      case "unlinkFile": {
        const newTree = removeItemFromTree(currentTree, absolutePath)
        set(fileTreeAtom, newTree)
        removeFileStateAtom(absolutePath)
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
        // clean up file state atoms for all children
        const childPrefix = absolutePath + "/"
        for (const path of fileStateAtoms.keys()) {
          if (path.startsWith(childPrefix)) {
            fileStateAtoms.delete(path)
            deleteFile(path)
          }
        }
        break
      }
    }
  },
)

let prevSortedTree: FileTree = []

/**
 * the tree is maintained in sorted order at mutation time (sorted insert on add,
 * sort on initial load). this derived atom only does structural sharing to
 * preserve reference identity for unchanged subtrees.
 */
export const sortedFileTreeAtom = atom((get) => {
  const fileTree = get(fileTreeAtom)
  const shared = replaceEqualDeep(prevSortedTree, fileTree) as FileTree
  prevSortedTree = shared
  return shared
})

const createFileStateMachineAtom = (filePath: AbsolutePath) =>
  atomWithMachine(
    () => fileStateMachine,
    () => ({ input: { filePath, fileType: fileTypeFromFileName(filePath) } }),
  )

const fileStateAtoms = new Map<AbsolutePath, ReturnType<typeof createFileStateMachineAtom>>()

/** get or create a file state atom - use at intentional creation sites only */
export function getOrCreateFileStateAtom(filePath: AbsolutePath) {
  let atom = fileStateAtoms.get(filePath)
  if (!atom) {
    atom = createFileStateMachineAtom(filePath)
    fileStateAtoms.set(filePath, atom)
  }
  return atom
}

/** get a file state atom if it exists - returns undefined without creating */
export function getFileStateAtom(filePath: AbsolutePath) {
  return fileStateAtoms.get(filePath)
}

/** O(1) existence check */
export function hasFileStateAtom(filePath: AbsolutePath): boolean {
  return fileStateAtoms.has(filePath)
}

/** remove a file state atom */
export function removeFileStateAtom(filePath: AbsolutePath): boolean {
  return fileStateAtoms.delete(filePath)
}

/** remove all file state atoms (used on workspace unmount) */
export function clearFileStateAtoms() {
  fileStateAtoms.clear()
}

/** transfer file state atom from old path to new path */
export function renameFileStateAtom(oldPath: AbsolutePath, newPath: AbsolutePath): void {
  const existing = fileStateAtoms.get(oldPath)
  if (existing) {
    fileStateAtoms.delete(oldPath)
    fileStateAtoms.set(newPath, existing)
  }
}

/** transfer all file state atoms under a folder prefix */
export function renameFileStateAtomsUnderPrefix(
  oldPrefix: AbsolutePath,
  newPrefix: AbsolutePath,
): void {
  const toMove: [AbsolutePath, ReturnType<typeof createFileStateMachineAtom>][] = []
  for (const [path, atomRef] of fileStateAtoms) {
    if (path.startsWith(oldPrefix + "/")) toMove.push([path, atomRef])
  }
  for (const [oldPath, atomRef] of toMove) {
    fileStateAtoms.delete(oldPath)
    fileStateAtoms.set(AbsolutePath(newPrefix + oldPath.slice(oldPrefix.length)), atomRef)
  }
}

/** optimistic rename: update tree, expanded folders, file state atoms, and opened files */
export const renameInTreeAtom = atom(
  null,
  (
    get,
    set,
    {
      oldPath,
      newPath,
      isFolder,
    }: { oldPath: AbsolutePath; newPath: AbsolutePath; isFolder: boolean },
  ) => {
    const tree = get(fileTreeAtom)
    const newName = newPath.split("/").pop()!
    const parentPath = newPath.substring(0, newPath.lastIndexOf("/"))

    // 1. find item, remove from old location
    const item = findItemInTree(tree, oldPath)
    if (!item) return
    const treeWithout = removeItemFromTree(tree, oldPath)

    // 2. create renamed item
    const renamed =
      item.kind === "folder"
        ? {
            ...item,
            path: newPath,
            name: newName,
            children: rewriteChildPaths(item.children, oldPath, newPath),
          }
        : { ...item, path: newPath, name: newName }

    // 3. insert into new location (same parent, just re-sorted)
    // if parentPath doesn't match a folder in the tree (root-level items), use sortedInsert
    const parentExists = parentPath ? findFolderInTree(treeWithout, parentPath) : undefined
    const newTree = parentExists
      ? addItemToTree(treeWithout, parentPath, renamed)
      : sortedInsert(treeWithout, renamed)
    set(fileTreeAtom, newTree)

    // 4. migrate expanded folders
    if (isFolder) {
      set(expandedFoldersAtom, (prev) => {
        const next: Record<string, boolean> = {}
        for (const [p, v] of Object.entries(prev)) {
          if (p === oldPath) next[newPath] = v
          else if (p.startsWith(oldPath + "/")) next[newPath + p.slice(oldPath.length)] = v
          else next[p] = v
        }
        return next
      })
    }

    // 5. migrate file state atoms
    if (isFolder) {
      renameFileStateAtomsUnderPrefix(oldPath, newPath)
    } else {
      renameFileStateAtom(oldPath, newPath)
    }

    // 6. update opened files atom
    set(openedFilesAtom, (prev) => {
      const next = new Set(prev)
      if (isFolder) {
        for (const p of prev) {
          if (p.startsWith(oldPath + "/")) {
            next.delete(p)
            next.add(AbsolutePath(newPath + p.slice(oldPath.length)))
          }
        }
      } else if (next.has(oldPath)) {
        next.delete(oldPath)
        next.add(newPath)
      }
      return next
    })
  },
)

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
 * Reuses cached FlatTreeItem wrappers when the underlying data is unchanged,
 * preserving reference identity for React.memo downstream.
 */
export function flattenVisibleTree(
  tree: FileTree,
  expandedFolders: Record<string, boolean>,
  cache: Map<string, FlatTreeItem>,
): FlatTreeItem[] {
  const result: FlatTreeItem[] = []

  function flatten(items: FileTree, depth: number) {
    for (const item of items) {
      if (item.kind === "folder") {
        const isExpanded = expandedFolders[item.path] ?? false
        const hasChildren = item.children.length > 0 || !item.resolved

        const cached = cache.get(item.path) as FlatFileTreeItem | undefined
        if (
          cached &&
          cached.item === item &&
          cached.depth === depth &&
          cached.isExpanded === isExpanded &&
          cached.hasChildren === hasChildren
        ) {
          result.push(cached)
        } else {
          result.push({ item, depth, isExpanded, hasChildren })
        }

        if (isExpanded && item.children.length > 0) {
          flatten(item.children, depth + 1)
        }
      } else {
        const cached = cache.get(item.path) as FlatFileTreeItem | undefined
        if (cached && cached.item === item && cached.depth === depth) {
          result.push(cached)
        } else {
          result.push({ item, depth, isExpanded: false, hasChildren: false })
        }
      }
    }
  }

  flatten(tree, 0)
  return result
}

let prevFlatCache = new Map<string, FlatTreeItem>()

/**
 * Atom that provides a flattened list of visible tree items for virtualized rendering.
 * Merges user-expanded folders with auto-reveal folders.
 * Injects creation input pseudo-items when creating files/folders in a directory.
 */
export const flatVisibleTreeAtom = atom((get) => {
  const tree = get(sortedFileTreeAtom)
  const expandedFolders = get(expandedFoldersAtom)
  const isCreatingInContext = get(isCreatingInContextAtom)

  const flatTree = flattenVisibleTree(tree, expandedFolders, prevFlatCache)

  // update intern cache for next recomputation
  const newCache = new Map<string, FlatTreeItem>()
  for (const flatItem of flatTree) {
    if (flatItem.item.kind !== "creation-input") {
      newCache.set(flatItem.item.path, flatItem)
    }
  }
  prevFlatCache = newCache

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
