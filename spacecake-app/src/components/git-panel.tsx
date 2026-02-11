import { useAtom } from "jotai"
import { ChevronDown, ChevronRight, File, GitCommit } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  GitCommit as GitCommitType,
  gitCommitsAtom,
  GitStatus,
  gitStatusAtom,
  gitStatusLoadingAtom,
} from "@/lib/atoms/git"
import { cn } from "@/lib/utils"
import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"

interface GitPanelProps {
  workspacePath: AbsolutePath
  onFileClick?: (filePath: AbsolutePath) => void
}

function FileItem({
  file,
  status,
  onClick,
}: {
  file: string
  status: "modified" | "staged" | "untracked" | "deleted"
  onClick?: () => void
}) {
  const statusColors = {
    modified: "text-yellow-500",
    staged: "text-green-500",
    untracked: "text-blue-500",
    deleted: "text-red-500",
  }

  const statusLabels = {
    modified: "M",
    staged: "S",
    untracked: "U",
    deleted: "D",
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-2 py-1 text-sm hover:bg-accent rounded cursor-pointer text-left"
    >
      <File className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="truncate flex-1">{file}</span>
      <span className={cn("text-xs font-medium", statusColors[status])}>
        {statusLabels[status]}
      </span>
    </button>
  )
}

function FileSection({
  title,
  files,
  status,
  workspacePath,
  onFileClick,
  defaultOpen = true,
}: {
  title: string
  files: string[]
  status: "modified" | "staged" | "untracked" | "deleted"
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
          {files.map((file) => (
            <FileItem
              key={file}
              file={file}
              status={status}
              onClick={() => onFileClick?.(AbsolutePath(`${workspacePath}/${file}`))}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function CommitItem({ commit }: { commit: GitCommitType }) {
  const shortHash = commit.hash.substring(0, 7)
  const formattedDate = new Date(commit.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })

  return (
    <div className="px-2 py-1.5 text-sm hover:bg-accent rounded">
      <div className="flex items-center gap-2">
        <GitCommit className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="font-mono text-xs text-muted-foreground">{shortHash}</span>
        <span className="text-xs text-muted-foreground ml-auto">{formattedDate}</span>
      </div>
      <p className="mt-0.5 text-sm truncate pl-5.5">{commit.message}</p>
    </div>
  )
}

export function GitPanel({ workspacePath, onFileClick }: GitPanelProps) {
  const [status, setStatus] = useAtom(gitStatusAtom)
  const [commits, setCommits] = useAtom(gitCommitsAtom)
  const [isLoading, setIsLoading] = useAtom(gitStatusLoadingAtom)
  const [showCommits, setShowCommits] = useState(false)
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null)

  const refreshStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      // First check if this is a git repo
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
          // Convert date strings back to Date objects
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

    // subscribe to git changes
    const cleanup = window.electronAPI.git.onGitChange(({ workspacePath: changedPath }) => {
      if (changedPath === workspacePath) {
        refreshStatus()
      }
    })

    return cleanup
  }, [workspacePath, refreshStatus])

  const totalChanges =
    (status?.modified.length ?? 0) +
    (status?.staged.length ?? 0) +
    (status?.untracked.length ?? 0) +
    (status?.deleted.length ?? 0)

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <div className="p-2">
          {isGitRepo === false ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              no git repository found
            </div>
          ) : totalChanges === 0 && !isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-4">No changes</div>
          ) : (
            <div className="space-y-1">
              <FileSection
                title="Staged Changes"
                files={status?.staged ?? []}
                status="staged"
                workspacePath={workspacePath}
                onFileClick={onFileClick}
              />
              <FileSection
                title="Changes"
                files={status?.modified ?? []}
                status="modified"
                workspacePath={workspacePath}
                onFileClick={onFileClick}
              />
              <FileSection
                title="Untracked"
                files={status?.untracked ?? []}
                status="untracked"
                workspacePath={workspacePath}
                onFileClick={onFileClick}
                defaultOpen={false}
              />
              <FileSection
                title="Deleted"
                files={status?.deleted ?? []}
                status="deleted"
                workspacePath={workspacePath}
                onFileClick={onFileClick}
              />
            </div>
          )}

          {/* Commits section */}
          {isGitRepo && (
            <Collapsible open={showCommits} onOpenChange={setShowCommits} className="mt-4">
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium hover:bg-accent rounded cursor-pointer">
                {showCommits ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span>recent commits</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {commits.length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-2 border-l pl-2 space-y-1">
                  {commits.map((commit) => (
                    <CommitItem key={commit.hash} commit={commit} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  )
}
