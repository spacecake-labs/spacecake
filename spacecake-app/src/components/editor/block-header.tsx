import React from "react"

import { cn } from "@/lib/utils"

interface BlockHeaderProps {
  title: string
  rightActions?: React.ReactNode
  className?: string
}

export function BlockHeader({
  title,
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
      <h3 className="font-semibold text-foreground text-sm leading-tight">
        {title}
      </h3>
      {rightActions}
    </div>
  )
}
