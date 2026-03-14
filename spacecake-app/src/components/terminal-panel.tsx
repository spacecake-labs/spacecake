import { lazy, memo, type RefObject, Suspense } from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { ResizablePanel } from "@/components/ui/resizable"
import { DOCK_SIZE_CONSTRAINTS } from "@/lib/dock-transition"
import { cn } from "@/lib/utils"
import type { DockPosition } from "@/schema/workspace-layout"

const Terminal = lazy(() => import("@/components/terminal").then((m) => ({ default: m.Terminal })))

const panelFallback = <div className="h-full w-full bg-background" />

interface TerminalPanelProps {
  terminalResizablePanelRef: RefObject<PanelImperativeHandle | null>
  isTerminalCollapsed: boolean
  terminalSize: number
  terminalDock: DockPosition
  isTerminalSessionActive: boolean
  workspace: { path: string }
  terminalToolbarRight: React.ReactNode
  onTerminalSessionEnd: () => void
}

export const TerminalPanel = memo(function TerminalPanel({
  terminalResizablePanelRef,
  isTerminalCollapsed,
  terminalSize,
  terminalDock,
  isTerminalSessionActive,
  workspace,
  terminalToolbarRight,
  onTerminalSessionEnd,
}: TerminalPanelProps) {
  const terminalConstraints = DOCK_SIZE_CONSTRAINTS[terminalDock]

  return (
    <ResizablePanel
      id="terminal-panel"
      panelRef={terminalResizablePanelRef}
      defaultSize={isTerminalCollapsed ? "0%" : `${terminalSize}%`}
      minSize={`${terminalConstraints.min}%`}
      maxSize={`${terminalConstraints.max}%`}
      collapsible
      collapsedSize="0%"
      data-collapsed={isTerminalCollapsed || undefined}
    >
      <div className={cn("h-full w-full", isTerminalCollapsed && "hidden")}>
        {isTerminalSessionActive && (
          <Suspense fallback={panelFallback}>
            <Terminal
              cwd={workspace.path}
              toolbarRight={terminalToolbarRight}
              onLastTabClosed={onTerminalSessionEnd}
            />
          </Suspense>
        )}
      </div>
    </ResizablePanel>
  )
})
