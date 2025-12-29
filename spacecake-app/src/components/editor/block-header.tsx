import React from "react"
import { Code, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"



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
  const titleElement =
    typeof title === "string" && title === "anonymous" ? (
      <Code className="inline-block h-[1em] w-[1em] align-middle text-foreground" />
    ) : (
      title
    )

  const badgeElement =
    typeof badge === "string" ? (
      <Badge variant="secondary" className="text-xs font-mono">
        {badge}
      </Badge>
    ) : (
      badge
    )

  const deleteButton = onDelete && (
    <Button
      variant="ghost"
      size="icon"
      onClick={onDelete}
      className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-destructive transition-colors"
      data-testid="block-delete-button"
      title="delete block"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )

  return (
    <div
      className={cn(
        "flex items-center justify-between border-b bg-muted/30 px-4 py-2 rounded-t-lg",
        className
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {emoji && <span className="text-sm">{emoji}</span>}
        <h3 className="font-semibold text-foreground text-sm leading-tight">
          {titleElement}
        </h3>
        {badgeElement}
      </div>
      <div className="flex items-center gap-2">
        {rightActions}
        {deleteButton}
      </div>
    </div>
  )
}
