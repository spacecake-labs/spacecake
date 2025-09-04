import type { RecentFile } from "@/types/storage"
import type { FileType, QuickOpenFileItem } from "@/types/workspace"
import { commandScore } from "@/lib/command-score"
import { parentFolderName } from "@/lib/utils"

export function filterAndSortFiles(
  files: QuickOpenFileItem[],
  searchQuery: string
): QuickOpenFileItem[] {
  if (!searchQuery) return []

  const results: { item: QuickOpenFileItem; score: number }[] = []
  for (const item of files) {
    const score = commandScore(item.file.path, searchQuery, [])
    if (score > 0) {
      results.push({ item, score })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.map((r) => r.item)
}

export function createQuickOpenItems(
  allFileItems: QuickOpenFileItem[],
  recentFiles: readonly RecentFile[],
  searchQuery: string,
  workspacePath?: string
): QuickOpenFileItem[] {
  // If no search, show recent files first, then all files
  if (searchQuery.length === 0) {
    // Convert recent files to QuickOpenFileItem format
    const recentFileItems = recentFiles.map((recentFile) => ({
      file: {
        name: recentFile.name,
        path: recentFile.path,
        kind: "file" as const,
        etag: { mtimeMs: recentFile.lastAccessed, size: 0 },
        fileType: recentFile.fileType as FileType,
        cid: "0000000000000000",
      },
      displayPath:
        workspacePath && recentFile.path.includes(workspacePath)
          ? parentFolderName(recentFile.path, workspacePath, recentFile.name)
          : recentFile.path.split("/").pop() || recentFile.name,
    }))

    // Combine recent files with all files, removing duplicates
    const recentPaths = new Set(recentFiles.map((f) => f.path))
    const otherFiles = allFileItems.filter(
      (item) => !recentPaths.has(item.file.path)
    )

    return [...recentFileItems, ...otherFiles]
  }

  // When searching, use normal filtering but boost recent files
  const filtered = filterAndSortFiles(allFileItems, searchQuery)
  const recentPaths = new Set(recentFiles.map((f) => f.path))

  // Move recent files to the top of search results
  const recentInResults = filtered.filter((item) =>
    recentPaths.has(item.file.path)
  )
  const otherInResults = filtered.filter(
    (item) => !recentPaths.has(item.file.path)
  )

  return [...recentInResults, ...otherInResults]
}
