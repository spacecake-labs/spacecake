import { useVirtualizer } from "@tanstack/react-virtual"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  File,
  Loader2,
  Minus,
  Plus,
  Undo2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { useRoute } from "@/hooks/use-route"
import {
  commitAmendAtom,
  commitMessageAtom,
  discardStateAtom,
  gitBranchAtom,
  GitCommit as GitCommitType,
  gitCommitsAtom,
  gitOperationAtom,
  isBusyAtom,
  isCommittingAtom,
  isGitRepoAtom,
  GitStatus,
  gitStatusAtom,
  gitStatusLoadingAtom,
  selectedCommitAtom,
} from "@/lib/atoms/git"
import { encodeBase64Url } from "@/lib/utils"
import { cn, condensePath } from "@/lib/utils"
import { router } from "@/router"
import { isRight, match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"

interface GitPanelProps {
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath) => void
  onCommitFileClick?: (filePath: AbsolutePath, commitHash: string) => void
}

type FileStatus = "modified" | "staged" | "untracked" | "deleted" | "added" | "conflicted"

const statusColors: Record<FileStatus, string> = {
  modified: "text-yellow-500",
  staged: "text-green-500",
  untracked: "text-blue-500",
  deleted: "text-red-500",
  added: "text-green-500",
  conflicted: "text-orange-500",
}

const statusLabels: Record<FileStatus, string> = {
  modified: "M",
  staged: "S",
  untracked: "U",
  deleted: "D",
  added: "A",
  conflicted: "C",
}

function FileItem({
  file,
  fullPath,
  status,
  onClick,
  onStage,
  onUnstage,
  onDiscard,
}: {
  file: string
  fullPath: string
  status?: FileStatus
  onClick?: () => void
  onStage?: () => void
  onUnstage?: () => void
  onDiscard?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  const handleCopyPath = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(fullPath)
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("failed to copy path:", err)
    }
  }

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onClick?.()
            }
          }}
          className="group @container flex items-center gap-2 w-full px-2 py-1 text-sm hover:bg-accent rounded cursor-pointer text-left"
        >
          <File className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="flex-1 min-w-0">
            {/* wide: full path with rtl truncation fallback */}
            <span
              className="hidden @[300px]:block truncate"
              style={{ direction: "rtl", textAlign: "left" }}
            >
              <span style={{ direction: "ltr", unicodeBidi: "embed" }}>{file}</span>
            </span>
            {/* narrow: condensed path with rtl truncation fallback */}
            <span
              className="block @[300px]:hidden truncate"
              style={{ direction: "rtl", textAlign: "left" }}
            >
              <span style={{ direction: "ltr", unicodeBidi: "embed" }}>{condensePath(file)}</span>
            </span>
          </span>
          <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
            {onStage && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onStage()
                }}
                className="p-0.5 rounded hover:bg-accent-foreground/10 text-muted-foreground hover:text-foreground cursor-pointer"
                title="stage"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
            {onUnstage && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUnstage()
                }}
                className="p-0.5 rounded hover:bg-accent-foreground/10 text-muted-foreground hover:text-foreground cursor-pointer"
                title="unstage"
              >
                <Minus className="h-3 w-3" />
              </button>
            )}
            {onDiscard && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDiscard()
                }}
                className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                title="discard"
              >
                <Undo2 className="h-3 w-3" />
              </button>
            )}
          </div>
          {status && (
            <span
              className={cn("text-xs font-medium flex-shrink-0", statusColors[status])}
              title={status}
            >
              {statusLabels[status]}
            </span>
          )}
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-auto max-w-md p-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground break-all">{file}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyPath}
            className="h-6 w-6 p-0 cursor-pointer flex-shrink-0"
            aria-label="copy path"
            title="copy path"
          >
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function FileSection({
  title,
  files,
  workspacePath,
  onFileClick,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  defaultOpen = true,
}: {
  title: string
  files: Array<{ path: string; status: FileStatus }>
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath) => void
  onStageFile?: (filePath: string) => void
  onUnstageFile?: (filePath: string) => void
  onDiscardFile?: (filePath: string) => void
  onStageAll?: () => void
  onUnstageAll?: () => void
  onDiscardAll?: () => void
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  if (files.length === 0) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 min-w-0 hover:bg-accent rounded cursor-pointer py-0.5 px-1">
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span>{title.toLowerCase()}</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            {files.length}
          </Badge>
        </CollapsibleTrigger>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onStageAll && (
            <button
              onClick={onStageAll}
              className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
              title="stage all"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
          {onUnstageAll && (
            <button
              onClick={onUnstageAll}
              className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
              title="unstage all"
            >
              <Minus className="h-3 w-3" />
            </button>
          )}
          {onDiscardAll && (
            <button
              onClick={onDiscardAll}
              className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
              title="discard all"
            >
              <Undo2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <CollapsibleContent>
        <div className="ml-2 border-l pl-2">
          {files.map((file) => {
            const fullPath = `${workspacePath}/${file.path}`
            return (
              <FileItem
                key={file.path}
                file={file.path}
                fullPath={fullPath}
                status={file.status}
                onClick={() => onFileClick?.(AbsolutePath(fullPath))}
                onStage={onStageFile ? () => onStageFile(file.path) : undefined}
                onUnstage={onUnstageFile ? () => onUnstageFile(file.path) : undefined}
                onDiscard={onDiscardFile ? () => onDiscardFile(file.path) : undefined}
              />
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function WorkingTreeItem({
  isSelected,
  hasChanges,
  onClick,
}: {
  isSelected: boolean
  hasChanges: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer text-left",
        isSelected && "bg-accent",
      )}
    >
      {hasChanges ? (
        <Circle className="h-2 w-2 fill-yellow-500 text-yellow-500 flex-shrink-0" />
      ) : (
        <Circle className="h-2 w-2 text-muted-foreground flex-shrink-0" />
      )}
      <span className="font-medium whitespace-nowrap">working tree</span>
    </button>
  )
}

function CommitListItem({
  commit,
  isSelected,
  onClick,
}: {
  commit: GitCommitType
  isSelected: boolean
  onClick: () => void
}) {
  const shortHash = commit.hash.substring(0, 7)
  const formattedDate = new Date(commit.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full px-2 py-1.5 hover:bg-accent rounded cursor-pointer text-left text-sm",
        isSelected && "bg-accent",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{shortHash}</span>
        <span className="text-xs text-muted-foreground ml-auto">{formattedDate}</span>
      </div>
      <p className="mt-0.5 text-sm truncate">{commit.message}</p>
    </button>
  )
}

function CommitPane({
  commits,
  selectedCommit,
  hasChanges,
  onSelectCommit,
}: {
  commits: GitCommitType[]
  selectedCommit: string
  hasChanges: boolean
  onSelectCommit: (commitHash: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 5,
  })

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">commits</div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-1">
        <WorkingTreeItem
          isSelected={selectedCommit === "working-tree"}
          hasChanges={hasChanges}
          onClick={() => onSelectCommit("working-tree")}
        />
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const commit = commits[virtualItem.index]
            return (
              <div
                key={commit.hash}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <CommitListItem
                  commit={commit}
                  isSelected={selectedCommit === commit.hash}
                  onClick={() => onSelectCommit(commit.hash)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CommitForm({
  workspacePath,
  hasStagedFiles,
}: {
  workspacePath: AbsolutePath
  hasStagedFiles: boolean
}) {
  const [message, setMessage] = useAtom(commitMessageAtom)
  const [amend, setAmend] = useAtom(commitAmendAtom)
  const isCommitting = useAtomValue(isCommittingAtom)
  const setOperation = useSetAtom(gitOperationAtom)
  const canCommit = hasStagedFiles && (message.trim() !== "" || amend) && !isCommitting

  const handleCommit = useCallback(async () => {
    if (!canCommit) return
    setOperation("committing")
    try {
      const result = await window.electronAPI.git.commit(
        workspacePath,
        message,
        amend ? { amend: true } : undefined,
      )
      if (isRight(result)) {
        toast.success(`committed ${result.value.hash.substring(0, 7)}`)
        setMessage("")
        setAmend(false)
      } else {
        toast.error(result.value.description)
      }
    } catch (err) {
      toast.error(`commit failed: ${err}`)
    } finally {
      setOperation("idle")
    }
  }, [canCommit, workspacePath, message, amend, setOperation, setMessage, setAmend])

  return (
    <div className="px-2 py-2 border-b space-y-2">
      <Input
        placeholder="commit message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleCommit()
        }}
        className="h-7 text-xs"
        disabled={isCommitting}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-6 text-xs px-2" disabled={!canCommit} onClick={handleCommit}>
          {isCommitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          commit
        </Button>
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => setAmend(e.target.checked)}
            className="h-3 w-3 cursor-pointer"
            disabled={isCommitting}
          />
          amend
        </label>
      </div>
    </div>
  )
}

function DiscardConfirmDialog({ workspacePath }: { workspacePath: AbsolutePath }) {
  const [discardState, setDiscardState] = useAtom(discardStateAtom)
  const isBusy = useAtomValue(isBusyAtom)
  const setOperation = useSetAtom(gitOperationAtom)

  const handleDiscard = useCallback(async () => {
    if (!discardState.isOpen) return
    setOperation("staging")
    try {
      let result
      if (discardState.kind === "file") {
        result = await window.electronAPI.git.discardFile(workspacePath, discardState.filePath)
      } else {
        result = await window.electronAPI.git.discardAll(workspacePath)
      }
      if (isRight(result)) {
        toast.success(discardState.kind === "file" ? "changes discarded" : "all changes discarded")
      } else {
        toast.error(result.value.description)
      }
    } catch (err) {
      toast.error(`discard failed: ${err}`)
    } finally {
      setOperation("idle")
      setDiscardState({ isOpen: false })
    }
  }, [discardState, workspacePath, setOperation, setDiscardState])

  return (
    <Dialog
      open={discardState.isOpen}
      onOpenChange={(open) => {
        if (!open) setDiscardState({ isOpen: false })
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>discard changes</DialogTitle>
          <DialogDescription>
            {discardState.isOpen && discardState.kind === "file"
              ? `discard changes to "${discardState.filePath}"? this cannot be undone.`
              : "discard all changes? this cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDiscardState({ isOpen: false })}>
            cancel
          </Button>
          <Button variant="destructive" onClick={handleDiscard} disabled={isBusy}>
            discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WorkingTreeFilesPane({
  status,
  workspacePath,
  onFileClick,
}: {
  status: GitStatus | null
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath) => void
}) {
  const setDiscardState = useSetAtom(discardStateAtom)
  const setOperation = useSetAtom(gitOperationAtom)

  // conflicted files
  const conflictedFiles = useMemo<Array<{ path: string; status: FileStatus }>>(
    () => status?.conflicted.map((path) => ({ path, status: "conflicted" as FileStatus })) ?? [],
    [status?.conflicted],
  )

  // staged files with "added" status (A)
  const stagedFiles = useMemo<Array<{ path: string; status: FileStatus }>>(
    () => status?.staged.map((path) => ({ path, status: "added" as FileStatus })) ?? [],
    [status?.staged],
  )

  // combine modified, untracked, deleted into "changes" section
  const changesFiles = useMemo<Array<{ path: string; status: FileStatus }>>(
    () => [
      ...(status?.modified.map((path) => ({ path, status: "modified" as FileStatus })) ?? []),
      ...(status?.untracked.map((path) => ({ path, status: "untracked" as FileStatus })) ?? []),
      ...(status?.deleted.map((path) => ({ path, status: "deleted" as FileStatus })) ?? []),
    ],
    [status?.modified, status?.untracked, status?.deleted],
  )

  const handleStageFile = useCallback(
    async (filePath: string) => {
      setOperation("staging")
      try {
        const result = await window.electronAPI.git.stage(workspacePath, [filePath])
        if (!isRight(result)) toast.error(result.value.description)
      } finally {
        setOperation("idle")
      }
    },
    [workspacePath, setOperation],
  )

  const handleUnstageFile = useCallback(
    async (filePath: string) => {
      setOperation("staging")
      try {
        const result = await window.electronAPI.git.unstage(workspacePath, [filePath])
        if (!isRight(result)) toast.error(result.value.description)
      } finally {
        setOperation("idle")
      }
    },
    [workspacePath, setOperation],
  )

  const handleStageAll = useCallback(async () => {
    setOperation("staging")
    try {
      const allPaths = changesFiles.map((f) => f.path)
      const result = await window.electronAPI.git.stage(workspacePath, allPaths)
      if (!isRight(result)) toast.error(result.value.description)
    } finally {
      setOperation("idle")
    }
  }, [workspacePath, changesFiles, setOperation])

  const handleUnstageAll = useCallback(async () => {
    setOperation("staging")
    try {
      const allPaths = stagedFiles.map((f) => f.path)
      const result = await window.electronAPI.git.unstage(workspacePath, allPaths)
      if (!isRight(result)) toast.error(result.value.description)
    } finally {
      setOperation("idle")
    }
  }, [workspacePath, stagedFiles, setOperation])

  const hasNoChanges =
    conflictedFiles.length === 0 && stagedFiles.length === 0 && changesFiles.length === 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
        changed files
      </div>
      <CommitForm workspacePath={workspacePath} hasStagedFiles={stagedFiles.length > 0} />
      <div className="flex-1 overflow-auto p-1">
        {hasNoChanges ? (
          <div className="text-sm text-muted-foreground text-center py-4">no changes</div>
        ) : (
          <div className="space-y-1">
            <FileSection
              title="merge conflicts"
              files={conflictedFiles}
              workspacePath={workspacePath}
              onFileClick={onFileClick}
            />
            <FileSection
              title="staged changes"
              files={stagedFiles}
              workspacePath={workspacePath}
              onFileClick={onFileClick}
              onUnstageFile={handleUnstageFile}
              onUnstageAll={handleUnstageAll}
            />
            <FileSection
              title="changes"
              files={changesFiles}
              workspacePath={workspacePath}
              onFileClick={onFileClick}
              onStageFile={handleStageFile}
              onStageAll={handleStageAll}
              onDiscardFile={(filePath) =>
                setDiscardState({ isOpen: true, kind: "file", filePath })
              }
              onDiscardAll={() => setDiscardState({ isOpen: true, kind: "all" })}
            />
          </div>
        )}
      </div>
      <DiscardConfirmDialog workspacePath={workspacePath} />
    </div>
  )
}

function CommitFilesPane({
  commit,
  workspacePath,
  onFileClick,
}: {
  commit: GitCommitType
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath, commitHash: string) => void
}) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
        changed files
      </div>
      <div className="flex-1 overflow-auto p-1">
        {commit.files.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">no files</div>
        ) : (
          <div className="space-y-0.5">
            {commit.files.map((file) => {
              const fullPath = `${workspacePath}/${file}`
              return (
                <FileItem
                  key={file}
                  file={file}
                  fullPath={fullPath}
                  onClick={() => onFileClick?.(AbsolutePath(fullPath), commit.hash)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function GitPanel({ workspacePath, onFileClick, onCommitFileClick }: GitPanelProps) {
  const [status, setStatus] = useAtom(gitStatusAtom)
  const [commits, setCommits] = useAtom(gitCommitsAtom)
  const setIsLoading = useSetAtom(gitStatusLoadingAtom)
  const [selectedCommit, setSelectedCommit] = useAtom(selectedCommitAtom)
  const [isGitRepo, setIsGitRepo] = useAtom(isGitRepoAtom)
  const isGitRepoRef = useRef<boolean | null>(null)
  const setGitBranch = useSetAtom(gitBranchAtom)
  const initialBranchFetched = useRef(false)

  const refreshStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      // first check if this is a git repo
      const isRepo = await window.electronAPI.git.isGitRepo(workspacePath)
      setIsGitRepo(isRepo)
      isGitRepoRef.current = isRepo

      if (!isRepo) {
        setStatus(null)
        setCommits([])
        return
      }

      const [result, logResult] = await Promise.all([
        window.electronAPI.git.getStatus(workspacePath),
        window.electronAPI.git.getCommitLog(workspacePath, 100),
      ])

      match(result, {
        onLeft: (err) => {
          console.error("Git status error:", err)
        },
        onRight: (status) => {
          setStatus(status as GitStatus)
        },
      })

      match(logResult, {
        onLeft: (err) => {
          console.error("Git log error:", err)
        },
        onRight: (commits) => {
          // convert date strings back to Date objects
          const parsed = (
            commits as Array<{
              hash: string
              message: string
              author: string
              date: Date | string
              files: string[]
            }>
          ).map((c) => ({
            ...c,
            date: typeof c.date === "string" ? new Date(c.date) : c.date,
          }))
          setCommits(parsed)
        },
      })
    } catch (err) {
      console.error("Git refresh error:", err)
    } finally {
      setIsLoading(false)
    }
  }, [workspacePath, setStatus, setCommits, setIsLoading, setIsGitRepo])

  useEffect(() => {
    // initial fetch
    refreshStatus()

    // fetch initial git branch (once per mount)
    if (!initialBranchFetched.current) {
      initialBranchFetched.current = true
      window.electronAPI.git.getCurrentBranch(workspacePath).then(setGitBranch)
    }
  }, [workspacePath, refreshStatus, setGitBranch])

  // subscribe to file-event for all workspace changes (working tree + git state)
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout

    const cleanup = window.electronAPI.onFileEvent((event) => {
      if (!event.path.startsWith(workspacePath)) return

      // skip .lock files — git creates/removes index.lock during operations
      if (event.path.endsWith(".lock")) return

      // skip git polling when workspace is not a git repo
      if (isGitRepoRef.current === false) return

      // check if this is a git state change we care about
      const isGitStateChange =
        event.path.includes("/.git/") &&
        (event.path.endsWith("/HEAD") ||
          event.path.endsWith("/index") ||
          event.path.includes("/refs/"))

      // skip other .git changes (logs, objects, etc.)
      if (event.path.includes("/.git/") && !isGitStateChange) return

      // refresh git branch when HEAD changes
      if (event.path.endsWith("/.git/HEAD")) {
        window.electronAPI.git.getCurrentBranch(workspacePath).then(setGitBranch)
      }

      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => refreshStatus(), 300)
    })

    return () => {
      cleanup()
      clearTimeout(debounceTimer)
    }
  }, [workspacePath, refreshStatus, setGitBranch])

  // get current route to detect stale diff views — narrow to primitive deps
  // so this effect only re-runs when the relevant route fields actually change
  const currentRoute = useRoute()
  const routeViewKind = currentRoute?.viewKind
  const routeFilePath = currentRoute?.filePath
  const routeBaseRef = currentRoute?.baseRef
  const routeTargetRef = currentRoute?.targetRef
  const routeWorkspaceId = currentRoute?.workspaceId

  // navigate away from stale diff views when file is no longer in changes list
  // only applies to working tree diffs, not historical commit diffs
  useEffect(() => {
    if (!status || !routeFilePath || routeViewKind !== "diff") return

    // historical commit diffs have baseRef/targetRef - don't close them based on working tree status
    if (routeBaseRef || routeTargetRef) return

    // check if the current file is still in the working tree changes
    const isFileStillChanged =
      status.modified.some((f) => `${workspacePath}/${f}` === routeFilePath) ||
      status.staged.some((f) => `${workspacePath}/${f}` === routeFilePath) ||
      status.untracked.some((f) => `${workspacePath}/${f}` === routeFilePath) ||
      status.deleted.some((f) => `${workspacePath}/${f}` === routeFilePath) ||
      status.conflicted.some((f) => `${workspacePath}/${f}` === routeFilePath)

    if (!isFileStillChanged && routeWorkspaceId) {
      // navigate to the same file without the diff view
      router.navigate({
        to: "/w/$workspaceId/f/$filePath",
        params: {
          workspaceId: encodeBase64Url(routeWorkspaceId),
          filePath: encodeBase64Url(routeFilePath),
        },
        // remove view=diff by not passing it
        search: {},
      })
    }
  }, [
    status,
    routeViewKind,
    routeFilePath,
    routeBaseRef,
    routeTargetRef,
    routeWorkspaceId,
    workspacePath,
  ])

  const totalChanges =
    (status?.modified.length ?? 0) +
    (status?.staged.length ?? 0) +
    (status?.untracked.length ?? 0) +
    (status?.deleted.length ?? 0) +
    (status?.conflicted.length ?? 0)

  const selectedCommitData = commits.find((c) => c.hash === selectedCommit)

  if (isGitRepo === false) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-muted-foreground">no git repository found</div>
      </div>
    )
  }

  return (
    <div className="h-full">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize="40%" minSize="25%">
          <CommitPane
            commits={commits}
            selectedCommit={selectedCommit}
            hasChanges={totalChanges > 0}
            onSelectCommit={setSelectedCommit}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="60%" minSize="30%">
          {selectedCommit === "working-tree" ? (
            <WorkingTreeFilesPane
              status={status}
              workspacePath={workspacePath}
              onFileClick={onFileClick}
            />
          ) : selectedCommitData ? (
            <CommitFilesPane
              commit={selectedCommitData}
              workspacePath={workspacePath}
              onFileClick={onCommitFileClick}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-sm text-muted-foreground">select a commit</div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
