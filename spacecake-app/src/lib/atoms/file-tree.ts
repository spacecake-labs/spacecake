import { atom } from "jotai"

import type {
  File,
  FileTree,
  FileTreeEvent,
  Folder,
  QuickOpenFileItem,
  RelativePath,
  WorkspaceInfo,
} from "@/types/workspace"
import { AbsolutePath, ZERO_HASH } from "@/types/workspace"
import { expandedFoldersAtom, fileTreeAtom } from "@/lib/atoms/atoms" // Import expandedFoldersAtom
import { parentFolderName, toRelativePath } from "@/lib/utils"
import { fileTypeFromExtension } from "@/lib/workspace"

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
    workspace: WorkspaceInfo,
    deleteFile: (filePath: RelativePath) => Promise<void>
  ) => {
    if (!workspace.path) return

    const currentTree = get(fileTreeAtom)
    const absolutePath = AbsolutePath(event.path)

    if (!absolutePath.startsWith(workspace.path)) {
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

        if (parentPath === null || parentPath === workspace.path) {
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
        break
      }

      case "unlinkFile":
      case "unlinkFolder": {
        const newTree = removeItemFromTree(currentTree, absolutePath)
        set(fileTreeAtom, newTree)

        const fileSegment = toRelativePath(workspace.path, absolutePath)

        // also remove from database if it's a file
        if (event.kind === "unlinkFile") {
          ;(async () => {
            await deleteFile(fileSegment)
          })()
        }
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

// Function to get quick open file items for a specific workspace
export const getQuickOpenFileItems = (
  workspace: WorkspaceInfo,
  fileTree: FileTree
): QuickOpenFileItem[] => {
  if (!workspace?.path) return []

  // Flatten the file tree to get all files
  const flatten = (items: FileTree): File[] => {
    let files: File[] = []
    for (const item of items) {
      if (item.kind === "file") {
        files.push(item)
      } else if (item.kind === "folder") {
        files = files.concat(flatten(item.children))
      }
    }
    return files
  }

  const files = flatten(fileTree)
  return files.map((file) => {
    const displayPath = parentFolderName(file.path, workspace.path, file.name)
    return { file, displayPath }
  })
}
