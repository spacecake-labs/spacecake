import type { QuickOpenFileItem } from "@/types/workspace"
import { commandScore } from "@/lib/command-score"

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
