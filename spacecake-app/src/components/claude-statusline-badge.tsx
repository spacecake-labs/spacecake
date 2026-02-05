import { useAtomValue } from "jotai"

import { Badge } from "@/components/ui/badge"
import { claudeStatuslineAtom } from "@/lib/atoms/atoms"
import { cn } from "@/lib/utils"

interface ClaudeStatuslineBadgeProps {
  className?: string
}

export function ClaudeStatuslineBadge({ className }: ClaudeStatuslineBadgeProps) {
  const statusline = useAtomValue(claudeStatuslineAtom)

  if (!statusline) return null

  const parts = [statusline.model.toLowerCase()]

  if (statusline.contextUsagePercent !== null) {
    parts.push(`🧠 ${Math.round(statusline.contextUsagePercent)}%`)
  }

  parts.push(`💰 $${statusline.costUsd.toFixed(2)}`)

  const titleParts = [
    `model: ${statusline.model}`,
    statusline.contextUsagePercent !== null
      ? `context: ${Math.round(statusline.contextUsagePercent)}%`
      : null,
    `cost: $${statusline.costUsd.toFixed(2)}`,
  ].filter(Boolean)

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-mono text-muted-foreground", className)}
      title={titleParts.join(" | ")}
    >
      {parts.join(" | ")}
    </Badge>
  )
}
