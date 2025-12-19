import React from "react"

import { cn } from "@/lib/utils"

interface BlockHeaderProps {
  title: React.ReactNode
  emoji?: React.ReactNode
  badge?: React.ReactNode
  rightActions?: React.ReactNode
  className?: string
}

export function BlockHeader({
  title,
  emoji,
  badge,
  rightActions,
  className,
}: BlockHeaderProps) {
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
          {title}
        </h3>
        {badge}
      </div>
      {rightActions}
    </div>
  )
}
