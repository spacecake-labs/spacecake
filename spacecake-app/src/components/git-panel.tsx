import { useVirtualizer } from "@tanstack/react-virtual"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Check, ChevronDown, ChevronRight, Copy, File, Loader2, Undo2 } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { TabsContent } from "@/components/ui/tabs"
import { useRoute } from "@/hooks/use-route"
import {
  commitAmendAtom,
  commitFilesAtom,
  commitMessageAtom,
  discardStateAtom,
  gitBranchAtom,
  GitCommit as GitCommitType,
  gitCommitsAtom,
  gitExcludedPathsAtom,
  gitOperationAtom,
  gitPanelTabAtom,
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

function GitCheckbox({
  checked,
  indeterminate,
  onChange,
  title,
  "aria-label": ariaLabel,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  title?: string
  "aria-label"?: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate ?? false
    }
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={ariaLabel}
      title={title}
      onChange={(e) => {
        e.stopPropagation()
        onChange()
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "size-3.5 shrink-0 cursor-pointer appearance-none rounded-[3px] border border-muted-foreground/60 bg-background hover:border-muted-foreground transition-colors",
        "checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%200%201%200%201.414l-5%205a1%201%200%200%201-1.414%200l-2-2a1%201%200%200%201%201.414-1.414L6.5%209.086l4.293-4.293a1%201%200%200%201%201.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-center",
        "indeterminate:border-primary indeterminate:bg-primary indeterminate:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%224%22%20y%3D%227%22%20width%3D%228%22%20height%3D%222%22%20rx%3D%221%22%2F%3E%3C%2Fsvg%3E')]",
      )}
    />
  )
}

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

const FileItem = memo(function FileItem({
  file,
  fullPath,
  status,
  isStaged,
  onClick,
  onToggleStage,
  onDiscard,
}: {
  file: string
  fullPath: string
  status?: FileStatus
  isStaged?: boolean
  onClick?: () => void
  onToggleStage?: () => void
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
    <HoverCard openDelay={400} closeDelay={0}>
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
          {onToggleStage !== undefined && (
            <GitCheckbox
              checked={isStaged ?? false}
              onChange={onToggleStage}
              title={isStaged ? "exclude from commit" : "include in commit"}
              aria-label={isStaged ? "exclude from commit" : "include in commit"}
            />
          )}
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
          {onDiscard && (
            <div className="hidden group-hover:flex items-center flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDiscard()
                }}
                className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                title="discard changes"
                aria-label="discard changes"
              >
                <Undo2 className="h-3 w-3" />
              </button>
            </div>
          )}
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
      <HoverCardContent side="right" align="center" className="w-auto max-w-md p-2">
        <div className="flex items-center gap-2">
          <span className="text-xs break-all">{file}</span>
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
})

const ConflictSection = memo(function ConflictSection({
  files,
  workspacePath,
  onFileClick,
}: {
  files: Array<{ path: string; status: FileStatus }>
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath) => void
}) {
  const [isOpen, setIsOpen] = useState(true)

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
          <span>merge conflicts</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            {files.length}
          </Badge>
        </CollapsibleTrigger>
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
              />
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})

const CommitListItem = memo(function CommitListItem({
  commit,
  isSelected,
  onSelect,
}: {
  commit: GitCommitType
  isSelected: boolean
  onSelect: (hash: string) => void
}) {
  const shortHash = commit.hash.substring(0, 7)
  const formattedDate = new Date(commit.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })

  const handleClick = useCallback(() => onSelect(commit.hash), [onSelect, commit.hash])

  return (
    <button
      onClick={handleClick}
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
})

function CommitForm({
  workspacePath,
  includedFiles,
}: {
  workspacePath: AbsolutePath
  includedFiles: string[]
}) {
  const [message, setMessage] = useAtom(commitMessageAtom)
  const [amend, setAmend] = useAtom(commitAmendAtom)
  const isCommitting = useAtomValue(isCommittingAtom)
  const setOperation = useSetAtom(gitOperationAtom)
  const canCommit = includedFiles.length > 0 && (message.trim() !== "" || amend) && !isCommitting

  const handleCommit = useCallback(async () => {
    if (!canCommit) return
    setOperation("committing")
    try {
      const result = await window.electronAPI.git.commit(workspacePath, message, {
        amend: amend || undefined,
        files: includedFiles,
      })
      if (isRight(result)) {
        toast.success(`committed ${result.value.hash.substring(0, 7)}`)
        setMessage("")
        setAmend(false)
      } else {
        toast.error(result.value.description, {
          description: result.value.detail,
        })
      }
    } catch (err) {
      toast.error("commit failed", { description: String(err) })
    } finally {
      setOperation("idle")
    }
  }, [canCommit, workspacePath, message, amend, includedFiles, setOperation, setMessage, setAmend])

  return (
    <form
      className="px-2 py-3 border-b space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        handleCommit()
      }}
    >
      <Input
        placeholder="commit message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="h-7 text-xs"
        disabled={isCommitting}
      />
      <div className="flex items-center justify-between">
        <Button
          type="submit"
          size="sm"
          className="h-6 text-xs px-2 cursor-pointer"
          disabled={!canCommit}
        >
          {isCommitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          commit
        </Button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <GitCheckbox
            checked={amend}
            onChange={() => setAmend(!amend)}
            title="amend last commit"
            aria-label="amend last commit"
          />
          amend
        </span>
      </div>
    </form>
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
        toast.error(result.value.description, { description: result.value.detail })
      }
    } catch (err) {
      toast.error("discard failed", { description: String(err) })
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
              ? `discard changes to "${discardState.filePath}"? this action cannot be undone.`
              : "discard all changes? this action cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => setDiscardState({ isOpen: false })}
          >
            cancel
          </Button>
          <Button
            variant="destructive"
            className="cursor-pointer"
            onClick={handleDiscard}
            disabled={isBusy}
          >
            discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface UnifiedFile {
  path: string
  status: FileStatus
  isIncluded: boolean
}

const ChangeFileRow = memo(function ChangeFileRow({
  file,
  workspacePath,
  onFileClick,
  onToggleInclude,
  onDiscard,
}: {
  file: UnifiedFile
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath) => void
  onToggleInclude: (filePath: string) => void
  onDiscard: (filePath: string) => void
}) {
  const fullPath = `${workspacePath}/${file.path}`

  const handleClick = useCallback(() => {
    onFileClick?.(AbsolutePath(fullPath))
  }, [onFileClick, fullPath])

  const handleToggle = useCallback(() => {
    onToggleInclude(file.path)
  }, [onToggleInclude, file.path])

  const handleDiscard = useCallback(() => {
    onDiscard(file.path)
  }, [onDiscard, file.path])

  return (
    <FileItem
      file={file.path}
      fullPath={fullPath}
      status={file.status}
      isStaged={file.isIncluded}
      onClick={handleClick}
      onToggleStage={handleToggle}
      onDiscard={handleDiscard}
    />
  )
})

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
  const [excludedPaths, setExcludedPaths] = useAtom(gitExcludedPathsAtom)
  const scrollRef = useRef<HTMLDivElement>(null)

  const conflictedFiles = useMemo<Array<{ path: string; status: FileStatus }>>(
    () => status?.conflicted.map((path) => ({ path, status: "conflicted" as FileStatus })) ?? [],
    [status?.conflicted],
  )

  // unified file list from git status — all files default to included (ui-only state)
  const changedPaths = useMemo(() => {
    const fileMap = new Map<string, FileStatus>()

    for (const path of status?.staged ?? []) {
      fileMap.set(path, "added")
    }
    for (const path of status?.modified ?? []) {
      fileMap.set(path, "modified")
    }
    for (const path of status?.untracked ?? []) {
      fileMap.set(path, "untracked")
    }
    for (const path of status?.deleted ?? []) {
      fileMap.set(path, "deleted")
    }

    return Array.from(fileMap.entries())
      .map(([path, fileStatus]) => ({ path, status: fileStatus }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }, [status?.staged, status?.modified, status?.untracked, status?.deleted])

  // clean up excluded paths when files disappear from the working tree
  useEffect(() => {
    const currentPaths = new Set(changedPaths.map((f) => f.path))
    setExcludedPaths((prev: Set<string>) => {
      const next = new Set<string>()
      for (const p of prev) {
        if (currentPaths.has(p)) next.add(p)
      }
      return next.size === prev.size ? prev : next
    })
  }, [changedPaths, setExcludedPaths])

  const { allFiles, includedFiles } = useMemo(() => {
    const all: UnifiedFile[] = []
    const included: string[] = []
    for (const f of changedPaths) {
      const isIncluded = !excludedPaths.has(f.path)
      all.push({ ...f, isIncluded })
      if (isIncluded) included.push(f.path)
    }
    return { allFiles: all, includedFiles: included }
  }, [changedPaths, excludedPaths])

  const rowVirtualizer = useVirtualizer({
    count: allFiles.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 10,
  })

  const allIncluded = allFiles.length > 0 && includedFiles.length === allFiles.length
  const someIncluded = includedFiles.length > 0 && !allIncluded

  const handleToggleFile = useCallback(
    (filePath: string) => {
      setExcludedPaths((prev: Set<string>) => {
        const next = new Set(prev)
        if (next.has(filePath)) {
          next.delete(filePath)
        } else {
          next.add(filePath)
        }
        return next
      })
    },
    [setExcludedPaths],
  )

  const handleDiscard = useCallback(
    (filePath: string) => {
      setDiscardState({ isOpen: true, kind: "file", filePath })
    },
    [setDiscardState],
  )

  const handleToggleAll = useCallback(() => {
    if (allIncluded) {
      setExcludedPaths(new Set(changedPaths.map((f) => f.path)))
    } else {
      setExcludedPaths(new Set())
    }
  }, [allIncluded, changedPaths, setExcludedPaths])

  const hasNoChanges = conflictedFiles.length === 0 && allFiles.length === 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <CommitForm workspacePath={workspacePath} includedFiles={includedFiles} />
      {hasNoChanges ? (
        <div className="flex-1 px-1">
          <div className="text-sm text-muted-foreground text-center py-4">no changes</div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden px-1">
          <div className="space-y-1 flex-shrink-0">
            <ConflictSection
              files={conflictedFiles}
              workspacePath={workspacePath}
              onFileClick={onFileClick}
            />
            {allFiles.length > 0 && (
              <div className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium">
                <GitCheckbox
                  checked={allIncluded}
                  indeterminate={someIncluded}
                  onChange={handleToggleAll}
                  title={allIncluded ? "exclude all changes" : "include all changes"}
                  aria-label={allIncluded ? "exclude all changes" : "include all changes"}
                />
                <span>changes</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {allFiles.length}
                </Badge>
                <button
                  onClick={() => setDiscardState({ isOpen: true, kind: "all" })}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer flex-shrink-0"
                  title="discard all changes"
                  aria-label="discard all changes"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <div ref={scrollRef} className="flex-1 overflow-auto">
            {allFiles.length > 0 && (
              <div
                className="ml-2 border-l pl-2"
                style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                  const file = allFiles[virtualItem.index]
                  return (
                    <div
                      key={file.path}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <ChangeFileRow
                        file={file}
                        workspacePath={workspacePath}
                        onFileClick={onFileClick}
                        onToggleInclude={handleToggleFile}
                        onDiscard={handleDiscard}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
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
  const [filesMap, setFilesMap] = useAtom(commitFilesAtom)
  const files = filesMap.get(commit.hash)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (files !== undefined) return

    let cancelled = false
    setIsLoading(true)

    window.electronAPI.git
      .getCommitFiles(workspacePath, commit.hash)
      .then((result) => {
        if (cancelled) return
        if (isRight(result)) {
          setFilesMap((prev) => {
            const next = new Map(prev)
            next.set(commit.hash, result.value)
            return next
          })
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [commit.hash, workspacePath, setFilesMap])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
        changed files
      </div>
      <div className="flex-1 overflow-auto p-1">
        {isLoading || files === undefined ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">no files</div>
        ) : (
          <div className="space-y-0.5">
            {files.map((file) => {
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

function HistoryView({
  commits,
  workspacePath,
  onFileClick,
}: {
  commits: GitCommitType[]
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath, commitHash: string) => void
}) {
  const [selectedCommit, setSelectedCommit] = useAtom(selectedCommitAtom)
  const scrollRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 5,
  })

  // auto-select first commit when entering history with no valid selection
  useEffect(() => {
    if (commits.length > 0) {
      const hasValidSelection = commits.some((c) => c.hash === selectedCommit)
      if (!hasValidSelection) {
        setSelectedCommit(commits[0].hash)
      }
    }
  }, [commits, selectedCommit, setSelectedCommit])

  const selectedCommitData = useMemo(
    () => commits.find((c) => c.hash === selectedCommit),
    [commits, selectedCommit],
  )

  return (
    <ResizablePanelGroup orientation="vertical">
      <ResizablePanel defaultSize="50%" minSize="20%">
        <div className="h-full flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-auto p-1">
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
                      onSelect={setSelectedCommit}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize="50%" minSize="20%">
        {selectedCommitData ? (
          <CommitFilesPane
            commit={selectedCommitData}
            workspacePath={workspacePath}
            onFileClick={onFileClick}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-sm text-muted-foreground">select a commit</div>
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export function GitPanel({ workspacePath, onFileClick, onCommitFileClick }: GitPanelProps) {
  const [status, setStatus] = useAtom(gitStatusAtom)
  const [commits, setCommits] = useAtom(gitCommitsAtom)
  const setIsLoading = useSetAtom(gitStatusLoadingAtom)
  const [isGitRepo, setIsGitRepo] = useAtom(isGitRepoAtom)
  const isGitRepoRef = useRef<boolean | null>(null)
  const setGitBranch = useSetAtom(gitBranchAtom)
  const initialBranchFetched = useRef(false)
  const currentTab = useAtomValue(gitPanelTabAtom)
  const currentTabRef = useRef(currentTab)

  // keep ref in sync without re-subscribing the file event effect
  useEffect(() => {
    currentTabRef.current = currentTab
  }, [currentTab])

  const refreshWorkingTree = useCallback(async () => {
    setIsLoading(true)
    try {
      const isRepo = await window.electronAPI.git.isGitRepo(workspacePath)
      setIsGitRepo(isRepo)
      isGitRepoRef.current = isRepo

      if (!isRepo) {
        setStatus(null)
        setCommits([])
        return
      }

      const result = await window.electronAPI.git.getStatus(workspacePath)

      match(result, {
        onLeft: (err) => {
          console.error("Git status error:", err)
        },
        onRight: (status) => {
          setStatus(status as GitStatus)
        },
      })
    } catch (err) {
      console.error("Git refresh error:", err)
    } finally {
      setIsLoading(false)
    }
  }, [workspacePath, setStatus, setCommits, setIsLoading, setIsGitRepo])

  const refreshHistory = useCallback(async () => {
    try {
      const logResult = await window.electronAPI.git.getCommitLog(workspacePath, 100)

      match(logResult, {
        onLeft: (err) => {
          console.error("Git log error:", err)
        },
        onRight: (commits) => {
          const parsed = (
            commits as Array<{
              hash: string
              message: string
              author: string
              date: Date | string
            }>
          ).map((c) => ({
            ...c,
            date: typeof c.date === "string" ? new Date(c.date) : c.date,
          }))
          setCommits(parsed)
        },
      })
    } catch (err) {
      console.error("Git log error:", err)
    }
  }, [workspacePath, setCommits])

  // initial fetch
  useEffect(() => {
    refreshWorkingTree()

    if (!initialBranchFetched.current) {
      initialBranchFetched.current = true
      window.electronAPI.git.getCurrentBranch(workspacePath).then(setGitBranch)
    }
  }, [workspacePath, refreshWorkingTree, setGitBranch])

  // fetch history when switching to history tab
  useEffect(() => {
    if (currentTab === "history") {
      refreshHistory()
    }
  }, [currentTab, refreshHistory])

  // subscribe to file-event for all workspace changes
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout

    const cleanup = window.electronAPI.onFileEvent((event) => {
      if (!event.path.startsWith(workspacePath)) return
      if (event.path.endsWith(".lock")) return
      if (isGitRepoRef.current === false) return

      const isGitStateChange =
        event.path.includes("/.git/") &&
        (event.path.endsWith("/HEAD") ||
          event.path.endsWith("/index") ||
          event.path.includes("/refs/"))

      if (event.path.includes("/.git/") && !isGitStateChange) return

      if (event.path.endsWith("/.git/HEAD")) {
        window.electronAPI.git.getCurrentBranch(workspacePath).then(setGitBranch)
      }

      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        refreshWorkingTree()
        // only refresh history if the history tab is active and it's a git state change
        if (currentTabRef.current === "history" && isGitStateChange) {
          refreshHistory()
        }
      }, 300)
    })

    return () => {
      cleanup()
      clearTimeout(debounceTimer)
    }
  }, [workspacePath, refreshWorkingTree, refreshHistory, setGitBranch])

  // get current route to detect stale diff views
  const currentRoute = useRoute()
  const routeViewKind = currentRoute?.viewKind
  const routeFilePath = currentRoute?.filePath
  const routeBaseRef = currentRoute?.baseRef
  const routeTargetRef = currentRoute?.targetRef
  const routeWorkspaceId = currentRoute?.workspaceId

  const allChangedPaths = useMemo(() => {
    if (!status) return new Set<string>()
    const paths = [
      ...status.modified,
      ...status.staged,
      ...status.untracked,
      ...status.deleted,
      ...status.conflicted,
    ]
    return new Set(paths.map((f) => `${workspacePath}/${f}`))
  }, [status, workspacePath])

  // navigate away from stale diff views when file is no longer in changes list
  useEffect(() => {
    if (!status || !routeFilePath || routeViewKind !== "diff") return
    if (routeBaseRef || routeTargetRef) return

    if (!allChangedPaths.has(routeFilePath) && routeWorkspaceId) {
      router.navigate({
        to: "/w/$workspaceId/f/$filePath",
        params: {
          workspaceId: encodeBase64Url(routeWorkspaceId),
          filePath: encodeBase64Url(routeFilePath),
        },
        search: {},
      })
    }
  }, [
    status,
    allChangedPaths,
    routeViewKind,
    routeFilePath,
    routeBaseRef,
    routeTargetRef,
    routeWorkspaceId,
  ])

  if (isGitRepo === false) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-muted-foreground">no git repository found</div>
      </div>
    )
  }

  return (
    <>
      <TabsContent value="changes" className="flex-1 min-h-0 overflow-hidden mt-0">
        <WorkingTreeFilesPane
          status={status}
          workspacePath={workspacePath}
          onFileClick={onFileClick}
        />
      </TabsContent>
      <TabsContent value="history" className="flex-1 min-h-0 overflow-hidden mt-0">
        <HistoryView
          commits={commits}
          workspacePath={workspacePath}
          onFileClick={onCommitFileClick}
        />
      </TabsContent>
    </>
  )
}
