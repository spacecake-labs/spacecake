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
  Undo2,
} from "lucide-react"
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
        "size-3.5 shrink-0 cursor-pointer appearance-none rounded-[3px] border border-input",
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
              title={isStaged ? "unstage changes" : "stage changes"}
              aria-label={isStaged ? "unstage changes" : "stage changes"}
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

function ConflictSection({
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
    <form
      className="px-2 py-2 border-b space-y-2"
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
        <Button type="submit" size="sm" className="h-6 text-xs px-2 cursor-pointer" disabled={!canCommit}>
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
              ? `discard changes to "${discardState.filePath}"? this action cannot be undone.`
              : "discard all changes? this action cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => setDiscardState({ isOpen: false })}>
            cancel
          </Button>
          <Button variant="destructive" className="cursor-pointer" onClick={handleDiscard} disabled={isBusy}>
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
  isStaged: boolean
}

const ChangeFileRow = memo(function ChangeFileRow({
  file,
  workspacePath,
  onFileClick,
  onToggleStage,
  onDiscard,
}: {
  file: UnifiedFile
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath) => void
  onToggleStage: (filePath: string, isCurrentlyStaged: boolean) => void
  onDiscard: (filePath: string) => void
}) {
  const fullPath = `${workspacePath}/${file.path}`

  const handleClick = useCallback(() => {
    onFileClick?.(AbsolutePath(fullPath))
  }, [onFileClick, fullPath])

  const handleToggle = useCallback(() => {
    onToggleStage(file.path, file.isStaged)
  }, [onToggleStage, file.path, file.isStaged])

  const handleDiscard = useCallback(() => {
    onDiscard(file.path)
  }, [onDiscard, file.path])

  return (
    <FileItem
      file={file.path}
      fullPath={fullPath}
      status={file.status}
      isStaged={file.isStaged}
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
  const setOperation = useSetAtom(gitOperationAtom)

  const conflictedFiles = useMemo<Array<{ path: string; status: FileStatus }>>(
    () => status?.conflicted.map((path) => ({ path, status: "conflicted" as FileStatus })) ?? [],
    [status?.conflicted],
  )

  // unified file list: staged + unstaged deduplicated by path
  const baseFiles = useMemo<UnifiedFile[]>(() => {
    const fileMap = new Map<string, UnifiedFile>()

    for (const path of status?.staged ?? []) {
      fileMap.set(path, { path, status: "added", isStaged: true })
    }
    for (const path of status?.modified ?? []) {
      const existing = fileMap.get(path)
      if (existing) {
        existing.status = "modified"
      } else {
        fileMap.set(path, { path, status: "modified", isStaged: false })
      }
    }
    for (const path of status?.untracked ?? []) {
      fileMap.set(path, { path, status: "untracked", isStaged: false })
    }
    for (const path of status?.deleted ?? []) {
      const existing = fileMap.get(path)
      if (existing) {
        existing.status = "deleted"
      } else {
        fileMap.set(path, { path, status: "deleted", isStaged: false })
      }
    }

    return Array.from(fileMap.values()).sort((a, b) => a.path.localeCompare(b.path))
  }, [status?.staged, status?.modified, status?.untracked, status?.deleted])

  // optimistic checkbox state — reconciled when real git status arrives
  const [optimisticToggles, setOptimisticToggles] = useState<Map<string, boolean>>(new Map())
  useEffect(() => {
    setOptimisticToggles((prev) => {
      if (prev.size === 0) return prev
      const stagedSet = new Set(status?.staged)
      const remaining = new Map<string, boolean>()
      for (const [path, optimisticStaged] of prev) {
        const reallyStaged = stagedSet.has(path)
        if (reallyStaged !== optimisticStaged) {
          remaining.set(path, optimisticStaged)
        }
      }
      // return same reference if nothing was cleared — avoids re-render loop
      return remaining.size === prev.size ? prev : remaining
    })
  }, [status])

  // apply optimistic overrides so checkboxes respond immediately
  const allFiles = useMemo(() => {
    if (optimisticToggles.size === 0) return baseFiles
    return baseFiles.map((f) => {
      const override = optimisticToggles.get(f.path)
      return override !== undefined ? { ...f, isStaged: override } : f
    })
  }, [baseFiles, optimisticToggles])

  const stagedCount = useMemo(() => allFiles.filter((f) => f.isStaged).length, [allFiles])
  const allStaged = allFiles.length > 0 && stagedCount === allFiles.length
  const someStaged = stagedCount > 0 && !allStaged

  const handleToggleFile = useCallback(
    async (filePath: string, isCurrentlyStaged: boolean) => {
      const newStaged = !isCurrentlyStaged
      setOptimisticToggles((prev) => new Map(prev).set(filePath, newStaged))
      setOperation("staging")
      try {
        const result = newStaged
          ? await window.electronAPI.git.stage(workspacePath, [filePath])
          : await window.electronAPI.git.unstage(workspacePath, [filePath])
        if (!isRight(result)) toast.error(result.value.description)
      } finally {
        setOperation("idle")
      }
    },
    [workspacePath, setOperation],
  )

  const handleDiscard = useCallback(
    (filePath: string) => {
      setDiscardState({ isOpen: true, kind: "file", filePath })
    },
    [setDiscardState],
  )

  const handleToggleAll = useCallback(async () => {
    const toggleMap = new Map<string, boolean>()
    for (const f of allFiles) {
      toggleMap.set(f.path, !allStaged)
    }
    setOptimisticToggles(toggleMap)
    setOperation("staging")
    try {
      if (allStaged) {
        const paths = allFiles.filter((f) => f.isStaged).map((f) => f.path)
        const result = await window.electronAPI.git.unstage(workspacePath, paths)
        if (!isRight(result)) toast.error(result.value.description)
      } else {
        const paths = allFiles.filter((f) => !f.isStaged).map((f) => f.path)
        const result = await window.electronAPI.git.stage(workspacePath, paths)
        if (!isRight(result)) toast.error(result.value.description)
      }
    } finally {
      setOperation("idle")
    }
  }, [workspacePath, allFiles, allStaged, setOperation])

  const hasNoChanges = conflictedFiles.length === 0 && allFiles.length === 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
        working tree
      </div>
      <CommitForm workspacePath={workspacePath} hasStagedFiles={stagedCount > 0} />
      <div className="flex-1 overflow-auto p-1">
        {hasNoChanges ? (
          <div className="text-sm text-muted-foreground text-center py-4">no changes</div>
        ) : (
          <div className="space-y-1">
            <ConflictSection
              files={conflictedFiles}
              workspacePath={workspacePath}
              onFileClick={onFileClick}
            />
            {allFiles.length > 0 && (
              <div>
                <div className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium">
                  <GitCheckbox
                    checked={allStaged}
                    indeterminate={someStaged}
                    onChange={handleToggleAll}
                    title={allStaged ? "unstage all changes" : "stage all changes"}
                    aria-label={allStaged ? "unstage all changes" : "stage all changes"}
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
                <div className="ml-2 border-l pl-2">
                  {allFiles.map((file) => (
                    <ChangeFileRow
                      key={file.path}
                      file={file}
                      workspacePath={workspacePath}
                      onFileClick={onFileClick}
                      onToggleStage={handleToggleFile}
                      onDiscard={handleDiscard}
                    />
                  ))}
                </div>
              </div>
            )}
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
