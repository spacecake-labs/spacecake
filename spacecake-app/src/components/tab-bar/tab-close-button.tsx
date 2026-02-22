import { X } from "lucide-react"

import { cn } from "@/lib/utils"

interface TabCloseButtonProps {
  label: string
  isActive: boolean
  onClose: (e: React.MouseEvent) => void
}

/** close button shared by editor and terminal tabs */
export function TabCloseButton({ label, isActive, onClose }: TabCloseButtonProps) {
  return (
    <span
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        // prevent Radix TabsTrigger activation when clicking close on an inactive tab
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
        isActive && "opacity-100",
      )}
      aria-label={`close ${label}`}
    >
      <X className="h-3 w-3" />
    </span>
  )
}

/** shared class names for Radix TabsTrigger used by both editor and terminal tab bars */
export function tabTriggerClasses(isFirst?: boolean) {
  return cn(
    "group/tab relative h-full gap-1.5 pr-1.5 pl-3 text-xs font-normal cursor-pointer",
    "bg-transparent rounded-none rounded-t-md border border-transparent",
    "data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:border-b-background",
    "data-[state=active]:-mb-px data-[state=active]:shadow-none",
    "data-[state=inactive]:hover:bg-muted/50",
    isFirst && "pl-4 !rounded-tl-none !border-l-transparent data-[state=inactive]:ml-px",
  )
}
