import type { RecentFile } from "@/types/storage"
import type { AbsolutePath, FileType, QuickOpenFileItem } from "@/types/workspace"

import { commandScore } from "@/lib/command-score"
import { parentFolderName } from "@/lib/utils"
import { ZERO_HASH } from "@/types/workspace"

// Recency boost: recent files get a 15% score boost.
// This means a recent file will only beat a non-recent file
// if their match quality is within ~15% of each other.
export const RECENCY_BOOST = 1.15

export function sortFilesByMatchingScore(
  files: QuickOpenFileItem[],
  searchQuery: string,
  recentPaths?: Set<string>,
  maxResults: number = 100,
): QuickOpenFileItem[] {
  if (!searchQuery) return []

  const results: { item: QuickOpenFileItem; score: number }[] = []
  for (const item of files) {
    const score = commandScore(item.file.path, searchQuery, [])
    if (score > 0) {
      const isRecent = recentPaths?.has(item.file.path)
      results.push({ item, score: isRecent ? score * RECENCY_BOOST : score })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, maxResults).map((r) => r.item)
}

export function sortFilesByRecency(recentFiles: RecentFile[]): RecentFile[] {
  return recentFiles.sort((a, b) => b.lastAccessed - a.lastAccessed)
}

export function createQuickOpenItems(
  allFileItems: QuickOpenFileItem[],
  recentFiles: readonly RecentFile[],
  searchQuery: string,
  workspacePath: AbsolutePath,
): QuickOpenFileItem[] {
  const recentPaths = new Set(recentFiles.map((f) => f.path))

  // Filter out gitignored files, unless they're recently opened
  const visibleFileItems = allFileItems.filter(
    (item) => !item.file.isGitIgnored || recentPaths.has(item.file.path),
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
      displayPath: parentFolderName(recentFile.path, workspacePath, recentFile.name),
    }))
  }

  // When searching, sort by match score with recency boost applied
  return sortFilesByMatchingScore(visibleFileItems, searchQuery, recentPaths)
}
