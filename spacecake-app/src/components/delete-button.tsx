import { Trash2 } from "lucide-react"
import React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DeleteButtonProps {
  onDelete?: () => void
  className?: string
  title?: string
  disabled?: boolean
  "data-testid"?: string
}

export function DeleteButton({
  onDelete,
  className,
  title = "delete",
  disabled = false,
  "data-testid": testId,
}: DeleteButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onDelete}
      disabled={disabled || !onDelete}
      className={cn(
        "h-6 w-6 text-muted-foreground transition-colors",
        disabled || !onDelete
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:text-destructive",
        className,
      )}
      data-testid={testId}
      title={title}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )
}
