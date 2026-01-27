import { ListTodo, Terminal } from "lucide-react"

import { ClaudeStatusBadge } from "@/components/claude-status-badge"
import { ClaudeStatuslineBadge } from "@/components/claude-statusline-badge"

interface BottomPanelInfo {
  panel: "terminal" | "task"
  isCollapsed: boolean
  onToggle: () => void
}

interface WorkspaceStatusBarProps {
  bottomPanels: BottomPanelInfo[]
}

const panelIcons = {
  terminal: Terminal,
  task: ListTodo,
} as const

const panelLabels = {
  terminal: "show terminal",
  task: "show tasks",
} as const

export function WorkspaceStatusBar({ bottomPanels }: WorkspaceStatusBarProps) {
  const collapsedPanels = bottomPanels.filter((p) => p.isCollapsed)

  return (
    <div className="h-8 w-full bg-background/50 border-t flex items-center justify-between px-4 text-xs shrink-0">
      {/* Left side: toggle icons for collapsed bottom-docked panels */}
      <div className="flex items-center gap-1.5 min-w-0">
        {collapsedPanels.map(({ panel, onToggle }) => {
          const Icon = panelIcons[panel]
          return (
            <button
              key={panel}
              onClick={onToggle}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label={panelLabels[panel]}
              title={panelLabels[panel]}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          )
        })}
      </div>

      {/* Right side: Claude status */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <ClaudeStatusBadge className="text-xs" />
        <ClaudeStatuslineBadge className="text-xs" />
      </div>
    </div>
  )
}
