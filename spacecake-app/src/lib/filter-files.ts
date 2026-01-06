import type { RecentFile } from "@/types/storage"
import type {
  AbsolutePath,
  FileType,
  QuickOpenFileItem,
} from "@/types/workspace"
import { ZERO_HASH } from "@/types/workspace"
import { commandScore } from "@/lib/command-score"
import { parentFolderName } from "@/lib/utils"

export function sortFilesByMatchingScore(
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

export function sortFilesByRecency(recentFiles: RecentFile[]): RecentFile[] {
  return recentFiles.sort((a, b) => b.lastAccessed - a.lastAccessed)
}

export function createQuickOpenItems(
  allFileItems: QuickOpenFileItem[],
  recentFiles: readonly RecentFile[],
  searchQuery: string,
  workspacePath: AbsolutePath
): QuickOpenFileItem[] {
  const recentPaths = new Set(recentFiles.map((f) => f.path))

  // Filter out gitignored files, unless they're recently opened
  const visibleFileItems = allFileItems.filter(
    (item) => !item.file.isGitIgnored || recentPaths.has(item.file.path)
  )

  // If no search, show recent files only (sorted by most recent first)
  if (searchQuery.length === 0) {
    return recentFiles.map((recentFile) => ({
      file: {
        name: recentFile.name,
        path: recentFile.path,
        kind: "file" as const,
        etag: { mtime: new Date(recentFile.lastAccessed), size: 0 },
        fileType: recentFile.fileType as FileType,
        cid: ZERO_HASH,
      },
      displayPath: parentFolderName(
        recentFile.path,
        workspacePath,
        recentFile.name
      ),
    }))
  }

  // When searching, use normal filtering but boost recent files
  const filtered = sortFilesByMatchingScore(visibleFileItems, searchQuery)

  // Move recent files to the top of search results
  const recentInResults = filtered.filter((item) =>
    recentPaths.has(item.file.path)
  )
  const otherInResults = filtered.filter(
    (item) => !recentPaths.has(item.file.path)
  )

  return [...recentInResults, ...otherInResults]
}
