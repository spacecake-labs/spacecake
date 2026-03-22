import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  Github,
  RefreshCw,
} from "lucide-react"
import { memo, useCallback, useEffect } from "react"
import { toast } from "sonner"

import { BranchPopover } from "@/components/branch-popover"
import { StashPopover } from "@/components/stash-popover"
import { tabTriggerClasses } from "@/components/tab-bar/tab-close-button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  gitBranchAtom,
  gitHubRepoInfoAtom,
  gitOperationAtom,
  gitRemoteStatusAtom,
  gitRemoteUrlAtom,
  isBusyAtom,
} from "@/lib/atoms/git"
import { cn } from "@/lib/utils"
import { isRight } from "@/types/adt"

interface GitToolbarProps {
  isExpanded: boolean
  workspacePath: string
  totalChanges: number
  onExpandedChange: (expanded: boolean) => void
}

export const GitToolbar = memo(function GitToolbar({
  isExpanded,
  workspacePath,
  totalChanges,
  onExpandedChange,
}: GitToolbarProps) {
  const isCollapsed = !isExpanded
  const [remoteStatus, setRemoteStatus] = useAtom(gitRemoteStatusAtom)
  const [operation, setOperation] = useAtom(gitOperationAtom)
  const setRemoteUrl = useSetAtom(gitRemoteUrlAtom)
  const gitHubInfo = useAtomValue(gitHubRepoInfoAtom)
  const gitBranch = useAtomValue(gitBranchAtom)

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

  // fetch remote status on mount / workspace change
  useEffect(() => {
    let stale = false
    window.electronAPI.git.getRemoteStatus(workspacePath).then((result) => {
      if (stale) return
      if (isRight(result)) {
        setRemoteStatus({
          ahead: result.value.ahead,
          behind: result.value.behind,
          tracking: result.value.tracking,
        })
      }
    })
    return () => {
      stale = true
    }
  }, [workspacePath, setRemoteStatus])

  // fetch remote url on mount / workspace change
  useEffect(() => {
    let stale = false
    window.electronAPI.git.getRemoteUrl(workspacePath).then((result) => {
      if (stale) return
      if (isRight(result)) {
        setRemoteUrl(result.value)
      }
    })
    return () => {
      stale = true
    }
  }, [workspacePath, setRemoteUrl])

  const handleOpenOnGitHub = useCallback(() => {
    if (!gitHubInfo) return
    window.electronAPI.openExternal(`https://github.com/${gitHubInfo.owner}/${gitHubInfo.repo}`)
  }, [gitHubInfo])

  const handleCreatePR = useCallback(() => {
    if (!gitHubInfo || !gitBranch) return
    const encodedBranch = encodeURIComponent(gitBranch)
    window.electronAPI.openExternal(
      `https://github.com/${gitHubInfo.owner}/${gitHubInfo.repo}/compare/${encodedBranch}?expand=1`,
    )
  }, [gitHubInfo, gitBranch])

  const handleFetch = useCallback(async () => {
    setOperation("fetching")
    try {
      const result = await window.electronAPI.git.fetch(workspacePath)
      if (isRight(result)) {
        await refreshRemoteStatus()
      } else {
        toast.error(result.value.description, {
          description: result.value.detail,
        })
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
        toast.error(result.value.description, {
          description: result.value.detail,
        })
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
        toast.error(result.value.description, {
          description: result.value.detail,
        })
      }
    } finally {
      setOperation("idle")
    }
  }, [workspacePath, setOperation, refreshRemoteStatus])

  const isBusy = useAtomValue(isBusyAtom)

  const handleToggleExpanded = useCallback(() => {
    onExpandedChange(!isExpanded)
  }, [onExpandedChange, isExpanded])

  return (
    <div className="@container h-10 shrink-0 w-full bg-background/50 flex items-center overflow-hidden border-b">
      {/* tabs */}
      <div className="h-full flex-1 min-w-0 overflow-hidden">
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
        {/* expanded: individual buttons (wide) */}
        <div className="hidden @[420px]:flex items-center gap-2">
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
            className="flex items-center gap-0.5 p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              remoteStatus && remoteStatus.behind > 0
                ? `pull - ${remoteStatus.behind} commit${
                    remoteStatus.behind === 1 ? "" : "s"
                  } behind ${remoteStatus.tracking ?? "remote"}`
                : "pull"
            }
            aria-label="pull"
          >
            <ArrowDown className={cn("h-3.5 w-3.5", operation === "pulling" && "animate-bounce")} />
            {remoteStatus && remoteStatus.behind > 0 && (
              <span className="text-[10px] font-mono font-medium" data-testid="behind-count">
                {remoteStatus.behind}
              </span>
            )}
          </button>
          <button
            onClick={handlePush}
            disabled={isBusy}
            className="flex items-center gap-0.5 p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              remoteStatus && remoteStatus.ahead > 0
                ? `push - ${remoteStatus.ahead} commit${
                    remoteStatus.ahead === 1 ? "" : "s"
                  } ahead of ${remoteStatus.tracking ?? "remote"}`
                : "push"
            }
            aria-label="push"
          >
            <ArrowUp className={cn("h-3.5 w-3.5", operation === "pushing" && "animate-bounce")} />
            {remoteStatus && remoteStatus.ahead > 0 && (
              <span className="text-[10px] font-mono font-medium" data-testid="ahead-count">
                {remoteStatus.ahead}
              </span>
            )}
          </button>
          {gitHubInfo && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="github"
                  aria-label="github actions"
                >
                  <Github className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleOpenOnGitHub}>open on github</DropdownMenuItem>
                <DropdownMenuItem onClick={handleCreatePR}>create pull request</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {/* collapsed: dropdown menu (narrow) */}
        <div className="flex @[420px]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                aria-label="git actions"
              >
                <EllipsisVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleFetch} disabled={isBusy}>
                <RefreshCw
                  className={cn("h-3.5 w-3.5", operation === "fetching" && "animate-spin")}
                />
                fetch
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePull} disabled={isBusy}>
                <ArrowDown
                  className={cn("h-3.5 w-3.5", operation === "pulling" && "animate-bounce")}
                />
                pull
                {remoteStatus && remoteStatus.behind > 0 && (
                  <span className="ml-auto text-[10px] font-mono">{remoteStatus.behind}</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePush} disabled={isBusy}>
                <ArrowUp
                  className={cn("h-3.5 w-3.5", operation === "pushing" && "animate-bounce")}
                />
                push
                {remoteStatus && remoteStatus.ahead > 0 && (
                  <span className="ml-auto text-[10px] font-mono">{remoteStatus.ahead}</span>
                )}
              </DropdownMenuItem>
              {gitHubInfo && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleOpenOnGitHub}>
                    <Github className="h-3.5 w-3.5" />
                    open on github
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCreatePR}>
                    <Github className="h-3.5 w-3.5" />
                    create pull request
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <StashPopover workspacePath={workspacePath} />
        <BranchPopover workspacePath={workspacePath} isExpanded={isExpanded} />
        <button
          onClick={handleToggleExpanded}
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
