import { useState } from "react"
import { Check, Copy, MoveHorizontal, X } from "lucide-react"

import type { OpenFileSource } from "@/types/claude-code"
import { cn, condensePath } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { TabsTrigger } from "@/components/ui/tabs"

interface TabItemProps {
  id: string
  fileName: string
  filePath: string
  isActive: boolean
  onClose: (e: React.MouseEvent) => void
  source?: OpenFileSource
}

export function TabItem({
  id,
  fileName,
  filePath,
  isActive,
  onClose,
  source,
}: TabItemProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyPath = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(filePath)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("failed to copy path:", err)
    }
  }

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="h-full flex shrink-0">
          <TabsTrigger
            value={id}
            className={cn(
              "group/tab relative h-full gap-1.5 pr-1.5 pl-3 text-xs font-normal cursor-pointer",
              "bg-transparent rounded-none rounded-t-md border border-transparent",
              "data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:border-b-background",
              "data-[state=active]:-mb-px data-[state=active]:shadow-none",
              "data-[state=inactive]:hover:bg-muted/50"
            )}
          >
            {source && (
              <span
                className="text-emerald-500 dark:text-emerald-400 shrink-0 inline-flex items-center gap-1.5"
                title="opened by claude"
              >
                claude
                <MoveHorizontal className="h-3 w-3" />
              </span>
            )}
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
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        className="w-auto max-w-md p-2"
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate">
              {condensePath(filePath)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyPath}
              className="h-6 w-6 p-0 cursor-pointer flex-shrink-0"
              aria-label="copy path"
              title="copy path"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
          {source && (
            <span className="text-xs flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              opened by claude
            </span>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
