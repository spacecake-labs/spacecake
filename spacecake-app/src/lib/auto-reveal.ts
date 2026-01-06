import { AbsolutePath } from "@/types/workspace"
import { toRelativePath } from "@/lib/utils"

/**
 * Extracts all parent folder paths from a file path that need to be expanded
 * to reveal the file in the file tree.
 *
 * @param filePath - The absolute path to the file
 * @param workspacePath - The absolute path to the workspace root
 * @returns Array of folder paths that should be expanded
 */
export function getFoldersToExpand(
  filePath: AbsolutePath,
  workspacePath: AbsolutePath
): AbsolutePath[] {
  // Convert to relative path and split into segments
  const relativePath = toRelativePath(workspacePath, filePath)
  const pathSegments = relativePath.split("/")

  // Remove the filename (last segment)
  pathSegments.pop()

  // Build folder paths progressively
  const foldersToExpand: AbsolutePath[] = []
  let currentPath = workspacePath

  for (const segment of pathSegments) {
    currentPath = AbsolutePath(`${currentPath}/${segment}`)
    foldersToExpand.push(currentPath)
  }

  return foldersToExpand
}

/**
 * Merges user-expanded folders with auto-reveal folders.
 * Auto-reveal folders are always expanded, but user preferences are preserved.
 *
 * @param userExpandedFolders - Current user-expanded folder state
 * @param foldersToAutoReveal - Folders that should be auto-revealed
 * @returns Merged expanded folders state
 */
export function mergeExpandedFolders(
  userExpandedFolders: Record<string, boolean>,
  foldersToAutoReveal: string[]
): Record<string, boolean> {
  const merged = { ...userExpandedFolders }

  for (const folderPath of foldersToAutoReveal) {
    // Only auto-expand if user hasn't explicitly closed it
    if (userExpandedFolders[folderPath] !== false) {
      merged[folderPath] = true
    }
  }

  return merged
}
