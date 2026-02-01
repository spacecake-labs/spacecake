import React from "react"

import { DeleteButton } from "@/components/delete-button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface BlockHeaderProps {
  title: string | React.ReactNode
  emoji?: React.ReactNode
  badge?: string | React.ReactNode
  rightActions?: React.ReactNode
  onDelete?: () => void
  className?: string
}

export function BlockHeader({
  title,
  emoji,
  badge,
  rightActions,
  onDelete,
  className,
}: BlockHeaderProps) {
  const titleElement = typeof title === "string" && title === "anonymous" ? null : title

  const badgeElement =
    typeof badge === "string" ? (
      <Badge variant="secondary" className="text-xs font-mono">
        {badge}
      </Badge>
    ) : (
      badge
    )

  return (
    <div
      className={cn(
        "flex items-center justify-between border-b bg-muted/30 px-4 py-1.5 rounded-t-lg",
        className,
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {emoji && <span className="text-sm">{emoji}</span>}
        <h3 className="font-semibold text-foreground text-sm leading-tight">{titleElement}</h3>
        {badgeElement}
      </div>
      <div className="flex items-center gap-2">
        {rightActions}
        <DeleteButton onDelete={onDelete} data-testid="block-delete-button" title="delete block" />
      </div>
    </div>
  )
}
