import { useAtom, useAtomValue } from "jotai"
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, RefreshCw } from "lucide-react"
import { memo, useCallback, useEffect } from "react"
import { toast } from "sonner"

import { BranchPopover } from "@/components/branch-popover"
import { DockPositionDropdown } from "@/components/dock-position-dropdown"
import { tabTriggerClasses } from "@/components/tab-bar/tab-close-button"
import { Badge } from "@/components/ui/badge"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { gitOperationAtom, gitRemoteStatusAtom, isBusyAtom } from "@/lib/atoms/git"
import { cn } from "@/lib/utils"
import type { DockPosition } from "@/schema/workspace-layout"
import { isRight } from "@/types/adt"

interface GitToolbarProps {
  isExpanded: boolean
  dock: DockPosition
  workspacePath: string
  totalChanges: number
  onExpandedChange: (expanded: boolean) => void
  onDockChange: (dock: DockPosition) => void
}

export const GitToolbar = memo(function GitToolbar({
  isExpanded,
  dock,
  workspacePath,
  totalChanges,
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
        toast.error(result.value.description, { description: result.value.detail })
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
        toast.error(result.value.description, { description: result.value.detail })
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
        toast.error(result.value.description, { description: result.value.detail })
      }
    } finally {
      setOperation("idle")
    }
  }, [workspacePath, setOperation, refreshRemoteStatus])

  const isBusy = useAtomValue(isBusyAtom)

  return (
    <div className="h-10 shrink-0 w-full bg-background/50 flex items-center overflow-hidden border-b">
      {/* tabs */}
      <div className="h-full flex-1 min-w-0">
        <TabsList className="!h-full gap-0 bg-transparent justify-start rounded-none p-0 shrink-0">
          <TabsTrigger value="changes" className={cn("gap-1.5 !pr-3", tabTriggerClasses(true))}>
            changes
            {totalChanges > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 min-w-[1.25rem] h-4">
                {totalChanges}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className={cn("!pr-3", tabTriggerClasses())}>
            history
          </TabsTrigger>
        </TabsList>
      </div>

      {/* right controls */}
      <div className="flex items-center gap-2 flex-shrink-0 px-2">
        {remoteStatus && (remoteStatus.ahead > 0 || remoteStatus.behind > 0) && (
          <div
            className="flex items-center gap-1 text-xs text-muted-foreground"
            data-testid="remote-indicators"
          >
            {remoteStatus.ahead > 0 && (
              <span
                data-testid="ahead-count"
                title={`${remoteStatus.ahead} commit${remoteStatus.ahead === 1 ? "" : "s"} ahead of ${remoteStatus.tracking ?? "remote"}`}
              >
                ↑{remoteStatus.ahead}
              </span>
            )}
            {remoteStatus.behind > 0 && (
              <span
                data-testid="behind-count"
                title={`${remoteStatus.behind} commit${remoteStatus.behind === 1 ? "" : "s"} behind ${remoteStatus.tracking ?? "remote"}`}
              >
                ↓{remoteStatus.behind}
              </span>
            )}
          </div>
        )}
        <button
          onClick={handleFetch}
          disabled={isBusy}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="fetch"
          aria-label="fetch"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", operation === "fetching" && "animate-spin")} />
        </button>
        <button
          onClick={handlePull}
          disabled={isBusy}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="pull"
          aria-label="pull"
        >
          <ArrowDown className={cn("h-3.5 w-3.5", operation === "pulling" && "animate-bounce")} />
        </button>
        <button
          onClick={handlePush}
          disabled={isBusy}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="push"
          aria-label="push"
        >
          <ArrowUp className={cn("h-3.5 w-3.5", operation === "pushing" && "animate-bounce")} />
        </button>
        <div className="w-px h-4 bg-border" />
        <BranchPopover workspacePath={workspacePath} isExpanded={isExpanded} />
        <DockPositionDropdown currentDock={dock} onDockChange={onDockChange} label="git" />
        <button
          onClick={() => onExpandedChange(!isExpanded)}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label={isCollapsed ? "show git panel" : "hide git panel"}
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
