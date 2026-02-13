import { useAtom, useSetAtom } from "jotai"
import { Check, ChevronDown, ChevronRight, Circle, Copy, File } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { useRoute } from "@/hooks/use-route"
import {
  gitBranchAtom,
  GitCommit as GitCommitType,
  gitCommitsAtom,
  GitStatus,
  gitStatusAtom,
  gitStatusLoadingAtom,
  selectedCommitAtom,
} from "@/lib/atoms/git"
import { encodeBase64Url } from "@/lib/utils"
import { cn, condensePath } from "@/lib/utils"
import { router } from "@/router"
import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"

interface GitPanelProps {
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath) => void
  onCommitFileClick?: (filePath: AbsolutePath, commitHash: string) => void
}

type FileStatus = "modified" | "staged" | "untracked" | "deleted" | "added"

const statusColors: Record<FileStatus, string> = {
  modified: "text-yellow-500",
  staged: "text-green-500",
  untracked: "text-blue-500",
  deleted: "text-red-500",
  added: "text-green-500",
}

const statusLabels: Record<FileStatus, string> = {
  modified: "M",
  staged: "S",
  untracked: "U",
  deleted: "D",
  added: "A",
}

function FileItem({
  file,
  fullPath,
  status,
  onClick,
}: {
  file: string
  fullPath: string
  status?: FileStatus
  onClick?: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopyPath = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(fullPath)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("failed to copy path:", err)
    }
  }

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          onClick={onClick}
          className="@container flex items-center gap-2 w-full px-2 py-1 text-sm hover:bg-accent rounded cursor-pointer text-left"
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
          {status && (
            <span
              className={cn("text-xs font-medium flex-shrink-0", statusColors[status])}
              title={status}
            >
              {statusLabels[status]}
            </span>
          )}
        </button>
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
  defaultOpen = true,
}: {
  title: string
  files: Array<{ path: string; status: FileStatus }>
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath) => void
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  if (files.length === 0) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium hover:bg-accent rounded cursor-pointer">
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
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">commits</div>
      <div className="flex-1 overflow-auto p-1 space-y-0.5">
        <WorkingTreeItem
          isSelected={selectedCommit === "working-tree"}
          hasChanges={hasChanges}
          onClick={() => onSelectCommit("working-tree")}
        />
        {commits.map((commit) => (
          <CommitListItem
            key={commit.hash}
            commit={commit}
            isSelected={selectedCommit === commit.hash}
            onClick={() => onSelectCommit(commit.hash)}
          />
        ))}
      </div>
    </div>
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
  // staged files with "added" status (A)
  const stagedFiles: Array<{ path: string; status: FileStatus }> =
    status?.staged.map((path) => ({ path, status: "added" as FileStatus })) ?? []

  // combine modified, untracked, deleted into "changes" section
  const changesFiles: Array<{ path: string; status: FileStatus }> = [
    ...(status?.modified.map((path) => ({ path, status: "modified" as FileStatus })) ?? []),
    ...(status?.untracked.map((path) => ({ path, status: "untracked" as FileStatus })) ?? []),
    ...(status?.deleted.map((path) => ({ path, status: "deleted" as FileStatus })) ?? []),
  ]

  const hasNoChanges = stagedFiles.length === 0 && changesFiles.length === 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
        changed files
      </div>
      <div className="flex-1 overflow-auto p-1">
        {hasNoChanges ? (
          <div className="text-sm text-muted-foreground text-center py-4">no changes</div>
        ) : (
          <div className="space-y-1">
            <FileSection
              title="staged changes"
              files={stagedFiles}
              workspacePath={workspacePath}
              onFileClick={onFileClick}
            />
            <FileSection
              title="changes"
              files={changesFiles}
              workspacePath={workspacePath}
              onFileClick={onFileClick}
            />
          </div>
        )}
      </div>
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
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null)
  const setGitBranch = useSetAtom(gitBranchAtom)
  const initialBranchFetched = useRef(false)

  const refreshStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      // first check if this is a git repo
      const isRepo = await window.electronAPI.git.isGitRepo(workspacePath)
      setIsGitRepo(isRepo)

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

      const logResult = await window.electronAPI.git.getCommitLog(workspacePath, 20)
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
  }, [workspacePath, setStatus, setCommits, setIsLoading])

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

  // get current route to detect stale diff views
  const currentRoute = useRoute()

  // navigate away from stale diff views when file is no longer in changes list
  useEffect(() => {
    if (!status || !currentRoute) return
    if (currentRoute.viewKind !== "diff") return

    // check if the current file is still in the working tree changes
    const allChangedFiles = [
      ...status.modified,
      ...status.staged,
      ...status.untracked,
      ...status.deleted,
    ]

    // convert relative paths to absolute for comparison
    const changedAbsolutePaths = allChangedFiles.map((f) => `${workspacePath}/${f}`)
    const isFileStillChanged = changedAbsolutePaths.includes(currentRoute.filePath)

    if (!isFileStillChanged) {
      // navigate to the same file without the diff view
      router.navigate({
        to: "/w/$workspaceId/f/$filePath",
        params: {
          workspaceId: encodeBase64Url(currentRoute.workspaceId),
          filePath: encodeBase64Url(currentRoute.filePath),
        },
        // remove view=diff by not passing it
        search: {},
      })
    }
  }, [status, currentRoute, workspacePath])

  const totalChanges =
    (status?.modified.length ?? 0) +
    (status?.staged.length ?? 0) +
    (status?.untracked.length ?? 0) +
    (status?.deleted.length ?? 0)

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
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={40} minSize={25}>
          <CommitPane
            commits={commits}
            selectedCommit={selectedCommit}
            hasChanges={totalChanges > 0}
            onSelectCommit={setSelectedCommit}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={60} minSize={30}>
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
