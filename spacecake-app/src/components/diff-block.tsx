import React from "react"

import { BlockHeader } from "@/components/editor/block-header"
import { DiffEditor } from "@/components/editor/plugins/diff-editor"
import { cn } from "@/lib/utils"
import { fileTypeEmoji, fileTypeFromExtension } from "@/lib/workspace"

interface DiffBlockProps {
  oldContent: string
  newContent: string
  language: string
  filePath: string
  className?: string
}

/**
 * calculates the number of lines added and removed between two content strings.
 */
function calculateDiffStats(oldContent: string, newContent: string) {
  const oldLines = oldContent.split("\n")
  const newLines = newContent.split("\n")

  // simple line-based diff stats
  // this is a rough approximation; for exact stats we'd need a proper diff algorithm
  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)

  let added = 0
  let removed = 0

  for (const line of newLines) {
    if (!oldSet.has(line)) {
      added++
    }
  }

  for (const line of oldLines) {
    if (!newSet.has(line)) {
      removed++
    }
  }

  return { added, removed }
}

export function DiffBlock({
  oldContent,
  newContent,
  language,
  filePath,
  className,
}: DiffBlockProps) {
  const fileName = filePath.split("/").pop() ?? filePath
  const fileType = fileTypeFromExtension(language)
  const emoji = fileTypeEmoji(fileType)
  const { added, removed } = calculateDiffStats(oldContent, newContent)

  const rightActions = (
    <div className="flex items-center gap-1.5 text-xs font-mono">
      {added > 0 && <span className="text-green-600 dark:text-green-400">+{added}</span>}
      {removed > 0 && <span className="text-red-600 dark:text-red-400">-{removed}</span>}
    </div>
  )

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className,
      )}
    >
      <BlockHeader
        emoji={emoji}
        title=""
        badge={fileName}
        rightActions={rightActions}
        // no delete handler - diff view is read-only
      />

      <div className="overflow-hidden rounded-b-lg" data-section="diff">
        <DiffEditor oldContent={oldContent} newContent={newContent} language={language} readOnly />
      </div>
    </div>
  )
}
