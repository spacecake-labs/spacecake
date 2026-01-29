import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { TabsTrigger } from "@/components/ui/tabs"

interface TabItemProps {
  id: string
  fileName: string
  isActive: boolean
  onClose: (e: React.MouseEvent) => void
}

export function TabItem({ id, fileName, isActive, onClose }: TabItemProps) {
  return (
    <TabsTrigger
      value={id}
      className={cn(
        "group/tab relative h-8 gap-1.5 pr-1.5 pl-3 text-xs font-normal",
        "data-[state=active]:bg-background data-[state=active]:shadow-none",
        "data-[state=inactive]:bg-transparent data-[state=inactive]:hover:bg-muted/50"
      )}
    >
      <span className="truncate max-w-[120px]">{fileName}</span>
      <span
        role="button"
        tabIndex={0}
        onPointerDown={(e) => {
          // Prevent Radix TabsTrigger's default activation behavior.
          // Without this, clicking close on an inactive tab would activate it
          // (via onPointerDown) before the close handler runs, causing the tab
          // to briefly reappear due to route loader recreating the pane item.
          e.stopPropagation()
          e.preventDefault()
        }}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onClose(e)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClose(e as unknown as React.MouseEvent)
          }
        }}
        className={cn(
          "h-4 w-4 rounded-sm flex items-center justify-center cursor-pointer",
          "opacity-0 group-hover/tab:opacity-100",
          "hover:bg-muted-foreground/20",
          "transition-opacity",
          isActive && "opacity-100"
        )}
        aria-label={`Close ${fileName}`}
      >
        <X className="h-3 w-3" />
      </span>
    </TabsTrigger>
  )
}
