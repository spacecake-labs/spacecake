import { useAtomValue } from "jotai"

import { Badge } from "@/components/ui/badge"
import { claudeRateLimitsAtom, claudeStatuslineAtom } from "@/lib/atoms/atoms"
import { cn } from "@/lib/utils"

interface ClaudeStatuslineBadgeProps {
  className?: string
}

function formatResetsIn(resetsAt: number): string {
  const seconds = Math.max(0, resetsAt - Math.floor(Date.now() / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function ClaudeStatuslineBadge({ className }: ClaudeStatuslineBadgeProps) {
  const statusline = useAtomValue(claudeStatuslineAtom)
  const rateLimits = useAtomValue(claudeRateLimitsAtom)

  if (!statusline && !rateLimits) return null

  const parts: string[] = []
  const titleParts: string[] = []

  if (statusline) {
    parts.push(statusline.model)
    titleParts.push(`model: ${statusline.model}`)

    if (statusline.contextUsagePercent !== null) {
      parts.push(`🧠 ${Math.round(statusline.contextUsagePercent)}%`)
      titleParts.push(`context: ${Math.round(statusline.contextUsagePercent)}%`)
    }

    parts.push(`💰 $${statusline.costUsd.toFixed(2)}`)
    titleParts.push(`cost: $${statusline.costUsd.toFixed(2)}`)
  }

  if (rateLimits?.fiveHour) {
    const { used_percentage, resets_at } = rateLimits.fiveHour
    parts.push(`5h: ${Math.round(used_percentage)}%`)
    titleParts.push(`5h: ${Math.round(used_percentage)}% (resets in ${formatResetsIn(resets_at)})`)
  }

  if (rateLimits?.sevenDay && rateLimits.sevenDay.used_percentage >= 50) {
    const { used_percentage, resets_at } = rateLimits.sevenDay
    parts.push(`7d: ${Math.round(used_percentage)}%`)
    titleParts.push(`7d: ${Math.round(used_percentage)}% (resets in ${formatResetsIn(resets_at)})`)
  }

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
