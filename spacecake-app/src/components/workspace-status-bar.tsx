import { useAtom } from "jotai"
import { ListTodo, PanelLeft, Terminal, TriangleAlert } from "lucide-react"
import { useCallback, useState } from "react"

import { ClaudeStatusBadge } from "@/components/claude-status-badge"
import { ClaudeStatuslineBadge } from "@/components/claude-statusline-badge"
import { GitBranchBadge } from "@/components/git-branch-badge"
import { ModeToggle } from "@/components/mode-toggle"
import {
  statuslineConflictAtom,
  useStatuslineAutoSetup,
} from "@/components/statusline-setup-prompt"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { match } from "@/types/adt"

interface WorkspaceStatusBarProps {
  onToggleSidebar?: () => void
  isTerminalExpanded?: boolean
  isTaskExpanded?: boolean
  onToggleTerminal?: () => void
  onToggleTask?: () => void
}

function StatuslineConflictLink() {
  const [conflict, setConflict] = useAtom(statuslineConflictAtom)
  const [open, setOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const handleOverride = useCallback(() => {
    setIsUpdating(true)
    window.electronAPI.claude.statusline.update().then((result) => {
      match(result, {
        onLeft: (err) => {
          console.error("statusline override failed:", err)
          setIsUpdating(false)
        },
        onRight: () => {
          setConflict(null)
          setOpen(false)
          setIsUpdating(false)
        },
      })
    })
  }, [setConflict])

  const handleDismiss = useCallback(() => {
    setConflict(null)
    setOpen(false)
  }, [setConflict])

  if (!conflict) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 cursor-pointer dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60">
          <TriangleAlert className="h-3 w-3" />
          statusline
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72">
        <div className="space-y-2">
          <p className="text-sm font-medium">statusline conflict</p>
          <p className="text-xs text-muted-foreground">
            another tool is using the Claude Code statusline
            {conflict.command && (
              <span className="block mt-1 font-mono text-[11px] truncate">{conflict.command}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            override to enable real-time status in spacecake?
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleOverride}
              disabled={isUpdating}
              className="cursor-pointer text-xs h-7"
            >
              {isUpdating ? "overriding..." : "override"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              disabled={isUpdating}
              className="cursor-pointer text-xs h-7"
            >
              dismiss
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function WorkspaceStatusBar({
  onToggleSidebar,
  isTerminalExpanded,
  isTaskExpanded,
  onToggleTerminal,
  onToggleTask,
}: WorkspaceStatusBarProps) {
  useStatuslineAutoSetup()

  return (
    <div className="h-8 w-full bg-background/50 border-t flex items-center justify-between px-4 text-xs shrink-0">
      {/* Left side: theme toggle + sidebar toggle + terminal/task badges */}
      <div className="flex items-center gap-2 min-w-0">
        <ModeToggle variant="icon" />
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="toggle sidebar"
            title="toggle sidebar"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
        )}
        {onToggleTerminal && (
          <button
            onClick={onToggleTerminal}
            data-testid="statusbar-terminal-toggle"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium font-mono transition-all cursor-pointer",
              isTerminalExpanded
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-800 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:text-zinc-300",
            )}
            aria-label={isTerminalExpanded ? "hide terminal" : "show terminal"}
            title={isTerminalExpanded ? "hide terminal" : "show terminal"}
          >
            <Terminal className="h-3 w-3" />
            terminal
          </button>
        )}
        {onToggleTask && (
          <button
            onClick={onToggleTask}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium font-mono transition-all cursor-pointer",
              isTaskExpanded
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-800 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:text-zinc-300",
            )}
            aria-label={isTaskExpanded ? "hide tasks" : "show tasks"}
            title={isTaskExpanded ? "hide tasks" : "show tasks"}
          >
            <ListTodo className="h-3 w-3" />
            tasks
          </button>
        )}
        <GitBranchBadge />
      </div>

      {/* Right side: Claude status + conflict indicator */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatuslineConflictLink />
        <ClaudeStatusBadge className="text-xs" />
        <ClaudeStatuslineBadge className="text-xs" />
      </div>
    </div>
  )
}
