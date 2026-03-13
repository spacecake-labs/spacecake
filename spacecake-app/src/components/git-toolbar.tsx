import { useAtom } from "jotai"
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, RefreshCw } from "lucide-react"
import { memo, useCallback, useEffect } from "react"
import { toast } from "sonner"

import { BranchPopover } from "@/components/branch-popover"
import { DockPositionDropdown } from "@/components/dock-position-dropdown"
import { gitOperationAtom, gitRemoteStatusAtom } from "@/lib/atoms/git"
import { cn } from "@/lib/utils"
import type { DockPosition } from "@/schema/workspace-layout"
import { isRight } from "@/types/adt"

interface GitToolbarProps {
  isExpanded: boolean
  dock: DockPosition
  workspacePath: string
  onExpandedChange: (expanded: boolean) => void
  onDockChange: (dock: DockPosition) => void
}

export const GitToolbar = memo(function GitToolbar({
  isExpanded,
  dock,
  workspacePath,
  onExpandedChange,
  onDockChange,
}: GitToolbarProps) {
  const isCollapsed = !isExpanded
  const [remoteStatus, setRemoteStatus] = useAtom(gitRemoteStatusAtom)
  const [operation, setOperation] = useAtom(gitOperationAtom)

  const refreshRemoteStatus = useCallback(async () => {
    const result = await window.electronAPI.git.getRemoteStatus(workspacePath)
    if (isRight(result)) {
      setRemoteStatus({
        ahead: result.value.ahead,
        behind: result.value.behind,
        tracking: result.value.tracking,
      })
    }
  }, [workspacePath, setRemoteStatus])

  useEffect(() => {
    refreshRemoteStatus()
  }, [refreshRemoteStatus])

  const handleFetch = useCallback(async () => {
    setOperation("fetching")
    try {
      const result = await window.electronAPI.git.fetch(workspacePath)
      if (isRight(result)) {
        await refreshRemoteStatus()
      } else {
        toast.error(result.value.description)
      }
    } finally {
      setOperation("idle")
    }
  }, [workspacePath, setOperation, refreshRemoteStatus])

  const handlePull = useCallback(async () => {
    setOperation("pulling")
    try {
      const result = await window.electronAPI.git.pull(workspacePath)
      if (isRight(result)) {
        toast.success("pulled")
        await refreshRemoteStatus()
      } else {
        toast.error(result.value.description)
      }
    } finally {
      setOperation("idle")
    }
  }, [workspacePath, setOperation, refreshRemoteStatus])

  const handlePush = useCallback(async () => {
    setOperation("pushing")
    try {
      const result = await window.electronAPI.git.push(workspacePath)
      if (isRight(result)) {
        toast.success("pushed")
        await refreshRemoteStatus()
      } else {
        toast.error(result.value.description)
      }
    } finally {
      setOperation("idle")
    }
  }, [workspacePath, setOperation, refreshRemoteStatus])

  const isBusy = operation !== "idle"

  return (
    <div className="h-10 shrink-0 w-full bg-background/50 flex items-center justify-between px-4 overflow-hidden border-b">
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <BranchPopover workspacePath={workspacePath} isExpanded={isExpanded} />
        <DockPositionDropdown currentDock={dock} onDockChange={onDockChange} label="git" />
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {remoteStatus && (remoteStatus.ahead > 0 || remoteStatus.behind > 0) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {remoteStatus.ahead > 0 && <span title="ahead">↑{remoteStatus.ahead}</span>}
            {remoteStatus.behind > 0 && <span title="behind">↓{remoteStatus.behind}</span>}
          </div>
        )}
        <button
          onClick={handleFetch}
          disabled={isBusy}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="fetch"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", operation === "fetching" && "animate-spin")} />
        </button>
        <button
          onClick={handlePull}
          disabled={isBusy}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="pull"
        >
          <ArrowDown className={cn("h-3.5 w-3.5", operation === "pulling" && "animate-bounce")} />
        </button>
        <button
          onClick={handlePush}
          disabled={isBusy}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="push"
        >
          <ArrowUp className={cn("h-3.5 w-3.5", operation === "pushing" && "animate-bounce")} />
        </button>
        <button
          onClick={() => onExpandedChange(!isExpanded)}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label={isCollapsed ? "show git" : "hide git"}
        >
          {isCollapsed ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )
})
