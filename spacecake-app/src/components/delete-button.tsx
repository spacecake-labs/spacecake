import React from "react"
import { Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface DeleteButtonProps {
  onDelete?: () => void
  className?: string
  title?: string
  "data-testid"?: string
}

export function DeleteButton({
  onDelete,
  className,
  title = "delete",
  "data-testid": testId,
}: DeleteButtonProps) {
  if (!onDelete) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onDelete}
      className={cn(
        "h-6 w-6 cursor-pointer text-muted-foreground hover:text-destructive transition-colors",
        className
      )}
      data-testid={testId}
      title={title}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )
}
