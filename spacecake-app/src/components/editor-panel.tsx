import { Outlet } from "@tanstack/react-router"
import { useAtom, useAtomValue } from "jotai"
import { lazy, memo, type RefObject, Suspense } from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { GitToolbar } from "@/components/git-toolbar"
import { TabBar } from "@/components/tab-bar"
import { TaskToolbar } from "@/components/task-toolbar"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Tabs } from "@/components/ui/tabs"
import type { usePaneMachine } from "@/hooks/use-pane-machine"
import { gitPanelTabAtom, gitTotalChangesAtom } from "@/lib/atoms/git"
import { cn } from "@/lib/utils"
import type { PanePrimaryKey } from "@/schema/pane"
import type { WorkspacePrimaryKey } from "@/schema/workspace"
import type { DockPosition } from "@/schema/workspace-layout"
import type { AbsolutePath } from "@/types/workspace"

const GitPanel = lazy(() => import("@/components/git-panel").then((m) => ({ default: m.GitPanel })))
const TaskTable = lazy(() =>
  import("@/components/task-table/task-table").then((m) => ({ default: m.TaskTable })),
)

const panelFallback = <div className="h-full w-full bg-background" />

interface EditorPanelProps {
  paneId: PanePrimaryKey
  machine: ReturnType<typeof usePaneMachine>
  headerToolbar: React.ReactNode
  isTerminalCollapsed: boolean
  terminalSize: number
  bottomDockedPanel: "task" | "git" | null
  bottomPanelCollapsed: boolean
  bottomPanelSize: number
  isTaskExpanded: boolean
  isTaskCollapsed: boolean
  taskDock: DockPosition
  taskSize: number
  isGitExpanded: boolean
  isGitCollapsed: boolean
  gitDock: DockPosition
  gitSize: number
  workspace: { id: WorkspacePrimaryKey; path: AbsolutePath; name: string }
  taskResizablePanelRef: RefObject<PanelImperativeHandle | null>
  gitResizablePanelRef: RefObject<PanelImperativeHandle | null>
  onTaskExpandedChange: (expanded: boolean) => void
  onTaskDockChange: (dock: DockPosition) => void
  onGitExpandedChange: (expanded: boolean) => void
  onGitDockChange: (dock: DockPosition) => void
  onGitFileClick: (filePath: AbsolutePath, baseRef?: string, targetRef?: string) => void
  onCommitFileClick: (filePath: AbsolutePath, commitHash: string) => void
}

export const EditorPanel = memo(function EditorPanel({
  paneId,
  machine,
  headerToolbar,
  isTerminalCollapsed,
  terminalSize,
  bottomDockedPanel,
  bottomPanelCollapsed,
  bottomPanelSize,
  isTaskExpanded,
  isTaskCollapsed,
  taskDock,
  taskSize,
  isGitExpanded,
  isGitCollapsed,
  gitDock,
  gitSize,
  workspace,
  taskResizablePanelRef,
  gitResizablePanelRef,
  onTaskExpandedChange,
  onTaskDockChange,
  onGitExpandedChange,
  onGitDockChange,
  onGitFileClick,
  onCommitFileClick,
}: EditorPanelProps) {
  const [currentGitTab, setCurrentGitTab] = useAtom(gitPanelTabAtom)
  const gitTotalChanges = useAtomValue(gitTotalChangesAtom)

  return (
    <ResizablePanel
      id="editor-panel"
      defaultSize={isTerminalCollapsed ? "100%" : `${100 - terminalSize}%`}
      minSize="30%"
    >
      {bottomDockedPanel ? (
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel
            id="editor-main-panel"
            defaultSize={bottomPanelCollapsed ? "100%" : `${100 - bottomPanelSize}%`}
            minSize="30%"
          >
            <main className="relative flex w-full flex-1 flex-col overflow-hidden h-full">
              <header className="app-drag flex h-10 shrink-0 items-center gap-2 justify-between border-b">
                <div className="app-no-drag flex h-full items-end flex-1 min-w-0 overflow-hidden">
                  <TabBar paneId={paneId} machine={machine} />
                </div>
                {headerToolbar}
              </header>
              <div className="flex-1 min-h-0 overflow-hidden">
                <Outlet />
              </div>
            </main>
          </ResizablePanel>
          <ResizableHandle withHandle className={bottomPanelCollapsed ? "invisible" : ""} />
          {bottomDockedPanel === "task" ? (
            <ResizablePanel
              id="task-panel-bottom"
              panelRef={taskResizablePanelRef}
              defaultSize={isTaskCollapsed ? "0%" : `${taskSize}%`}
              minSize="10%"
              maxSize="70%"
              collapsible
              collapsedSize="0%"
              data-collapsed={isTaskCollapsed || undefined}
            >
              <div className="flex h-full w-full flex-col">
                {!isTaskCollapsed && (
                  <TaskToolbar
                    isExpanded={isTaskExpanded}
                    dock={taskDock}
                    onExpandedChange={onTaskExpandedChange}
                    onDockChange={onTaskDockChange}
                  />
                )}
                <div
                  className={cn(
                    "flex-1 min-h-0 min-w-0 overflow-hidden",
                    isTaskCollapsed && "hidden",
                  )}
                >
                  <Suspense fallback={panelFallback}>
                    <TaskTable />
                  </Suspense>
                </div>
              </div>
            </ResizablePanel>
          ) : (
            <ResizablePanel
              id="git-panel-bottom"
              panelRef={gitResizablePanelRef}
              defaultSize={isGitCollapsed ? "0%" : `${gitSize}%`}
              minSize="10%"
              maxSize="70%"
              collapsible
              collapsedSize="0%"
              data-collapsed={isGitCollapsed || undefined}
            >
              <Tabs
                value={currentGitTab}
                onValueChange={(v) => setCurrentGitTab(v as "changes" | "history")}
                className="flex h-full w-full flex-col"
              >
                <div className="flex h-full w-full flex-col">
                  {!isGitCollapsed && (
                    <GitToolbar
                      isExpanded={isGitExpanded}
                      dock={gitDock}
                      workspacePath={workspace.path}
                      totalChanges={gitTotalChanges}
                      onExpandedChange={onGitExpandedChange}
                      onDockChange={onGitDockChange}
                    />
                  )}
                  <div
                    className={cn(
                      "flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden",
                      isGitCollapsed && "hidden",
                    )}
                  >
                    <Suspense fallback={panelFallback}>
                      <GitPanel
                        workspacePath={workspace.path}
                        onFileClick={onGitFileClick}
                        onCommitFileClick={onCommitFileClick}
                      />
                    </Suspense>
                  </div>
                </div>
              </Tabs>
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      ) : (
        <main className="relative flex w-full flex-1 flex-col overflow-hidden h-full">
          <header className="app-drag flex h-10 shrink-0 items-center gap-2 justify-between border-b">
            <div className="app-no-drag flex h-full items-end flex-1 min-w-0 overflow-hidden">
              <TabBar paneId={paneId} machine={machine} />
            </div>
            {headerToolbar}
          </header>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Outlet />
          </div>
        </main>
      )}
    </ResizablePanel>
  )
})
