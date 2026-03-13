import { useAtom } from "jotai"
import { ChevronDown, ChevronUp, ListTodo, X } from "lucide-react"
import { memo, useCallback } from "react"

import { DockPositionDropdown } from "@/components/dock-position-dropdown"
import { taskStatusFilterAtom } from "@/lib/atoms/claude-tasks"
import { cn } from "@/lib/utils"
import type { DockPosition } from "@/schema/workspace-layout"

const TASK_STATUSES = [
  { value: "pending", label: "pending" },
  { value: "in_progress", label: "in progress" },
  { value: "completed", label: "completed" },
]

interface TaskToolbarProps {
  isExpanded: boolean
  dock: DockPosition
  onExpandedChange: (expanded: boolean) => void
  onDockChange: (dock: DockPosition) => void
}

export const TaskToolbar = memo(function TaskToolbar({
  isExpanded,
  dock,
  onExpandedChange,
  onDockChange,
}: TaskToolbarProps) {
  const [taskStatusFilter, setTaskStatusFilter] = useAtom(taskStatusFilterAtom)
  const isCollapsed = !isExpanded

  const toggleTaskStatus = useCallback(
    (status: string) => {
      setTaskStatusFilter((prev) =>
        prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
      )
    },
    [setTaskStatusFilter],
  )

  return (
    <div className="h-10 shrink-0 w-full bg-background/50 flex items-center justify-between px-4 overflow-hidden border-b">
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <ListTodo
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isExpanded ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        />
        <DockPositionDropdown currentDock={dock} onDockChange={onDockChange} label="task" />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {TASK_STATUSES.map((status) => {
          const isActive = taskStatusFilter.includes(status.value)
          return (
            <button
              key={status.value}
              onClick={() => toggleTaskStatus(status.value)}
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium font-mono transition-colors cursor-pointer shrink-0",
                isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-800 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:text-zinc-300",
              )}
            >
              {status.label}
            </button>
          )
        })}
        {taskStatusFilter.length > 0 && (
          <button
            onClick={() => setTaskStatusFilter([])}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          >
            <X className="h-3 w-3" />
            reset
          </button>
        )}
        <button
          onClick={() => onExpandedChange(!isExpanded)}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label={isCollapsed ? "show tasks" : "hide tasks"}
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
