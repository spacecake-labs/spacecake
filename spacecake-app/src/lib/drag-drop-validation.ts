import { findItemInTree } from "@/lib/file-event-handler"
import type { FileTree } from "@/types/workspace"
import type { AbsolutePath } from "@/types/workspace"

export function canDropItem(
  sourcePath: AbsolutePath,
  sourceKind: "file" | "folder",
  targetFolderPath: AbsolutePath,
  tree: FileTree,
): { valid: boolean; reason?: string } {
  // dropping onto itself
  if (sourcePath === targetFolderPath) {
    return { valid: false, reason: "cannot drop item onto itself" }
  }

  // dropping a folder into its own descendant
  if (sourceKind === "folder" && targetFolderPath.startsWith(sourcePath + "/")) {
    return { valid: false, reason: "cannot drop a folder into its own descendant" }
  }

  // source's current parent === target folder (no-op move)
  const sourceParent = sourcePath.substring(0, sourcePath.lastIndexOf("/"))
  if (sourceParent === targetFolderPath) {
    return { valid: false, reason: "item is already in this folder" }
  }

  // target folder is a system folder
  const targetItem = findItemInTree(tree, targetFolderPath)
  if (targetItem?.kind === "folder" && targetItem.isSystemFolder) {
    return { valid: false, reason: "cannot drop into a system folder" }
  }

  // name conflict in target folder
  const sourceName = sourcePath.split("/").pop()!
  const newPath = `${targetFolderPath}/${sourceName}`
  const existing = findItemInTree(tree, newPath)
  if (existing) {
    return { valid: false, reason: `'${sourceName}' already exists in the target folder` }
  }

  return { valid: true }
}
