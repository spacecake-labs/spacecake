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

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Badge
        variant="outline"
        className="text-xs font-mono text-muted-foreground"
        title={`model: ${statusline.model}`}
      >
        {statusline.model.toLowerCase()}
      </Badge>
      {statusline.contextUsagePercent !== null && (
        <Badge
          variant="outline"
          className="text-xs font-mono text-muted-foreground"
          title={`context window used: ${Math.round(statusline.contextUsagePercent)}%`}
        >
          🧠 {Math.round(statusline.contextUsagePercent)}%
        </Badge>
      )}
      <Badge
        variant="outline"
        className="text-xs font-mono text-muted-foreground"
        title={`total cost (USD): $${statusline.costUsd.toFixed(2)}`}
      >
        💰 ${statusline.costUsd.toFixed(2)}
      </Badge>
    </div>
  )
}
