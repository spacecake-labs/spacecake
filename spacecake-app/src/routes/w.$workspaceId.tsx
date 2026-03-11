/**
 * This route is matched when a workspace is open.
 * If the workspace path is not valid, it redirects to the home route.
 */

import { createFileRoute, ErrorComponent, Outlet, redirect } from "@tanstack/react-router"
import * as Match from "effect/Match"
import { useAtom, useSetAtom } from "jotai"
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  ListTodo,
  PanelBottom,
  PanelLeft,
  PanelRight,
  X,
} from "lucide-react"
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { GroupImperativeHandle, Layout, PanelImperativeHandle } from "react-resizable-panels"

import { AppSidebar } from "@/components/app-sidebar"
import { DeleteButton } from "@/components/delete-button"
import { EditorToolbar } from "@/components/editor/toolbar"
import { LoadingAnimation } from "@/components/loading-animation"
import { MenuButton } from "@/components/menu-button"
import { QuickOpen } from "@/components/quick-open"
import { TabBar } from "@/components/tab-bar"
import type { DockAction } from "@/lib/dock-transition"
import type { DockablePanelKind, DockPosition, FullDock } from "@/schema/workspace-layout"

const GitPanel = lazy(() => import("@/components/git-panel").then((m) => ({ default: m.GitPanel })))
const TaskTable = lazy(() =>
  import("@/components/task-table/task-table").then((m) => ({ default: m.TaskTable })),
)
const Terminal = lazy(() => import("@/components/terminal").then((m) => ({ default: m.Terminal })))

import { TerminalStatusBadge } from "@/components/terminal-status-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { WorkspaceStatusBar } from "@/components/workspace-status-bar"
import { CollectionsProvider } from "@/contexts/collections-context"
import { FocusManagerProvider, useFocusablePanel, useFocusManager } from "@/contexts/focus-manager"
import { useClaudeTaskWatcher } from "@/hooks/use-claude-task-watcher"
import { useHotkey } from "@/hooks/use-hotkey"
import { useMenuAction } from "@/hooks/use-menu-action"
import { useActivePaneItemId, usePaneItems } from "@/hooks/use-pane-items"
import { usePaneMachine } from "@/hooks/use-pane-machine"
import { useRoute } from "@/hooks/use-route"
import { useWorkspaceLayout } from "@/hooks/use-workspace-layout"
import { contextItemNameAtom, isCreatingInContextAtom } from "@/lib/atoms/atoms"
import { taskStatusFilterAtom } from "@/lib/atoms/claude-tasks"
import {
  clearFileStateAtoms,
  getOrCreateFileStateAtom,
  setFileTreeAtom,
} from "@/lib/atoms/file-tree"
import { gitBranchAtom } from "@/lib/atoms/git"
import { cleanupPaneMachine } from "@/lib/atoms/pane"
import { quickOpenIndexAtom, quickOpenIndexReadyAtom } from "@/lib/atoms/quick-open-index"
import { createWorkspaceCollections } from "@/lib/db/collections"
import * as mutations from "@/lib/db/mutations"
import { queryClient } from "@/lib/db/query-client"
import {
  clampSize,
  DOCK_SIZE_CONSTRAINTS,
  getDockPosition,
  transition,
} from "@/lib/dock-transition"
import { exists, readDirectory } from "@/lib/fs"
import { cleanupSettingsMachine } from "@/lib/settings-actor"
import { store } from "@/lib/store"
import { cn, debounce, decodeBase64Url, encodeBase64Url } from "@/lib/utils"
import { WorkspaceWatcher } from "@/lib/workspace-watcher"
import { FileStateHydrationEvent } from "@/machines/file-tree"
import { ClaudeIntegrationProvider } from "@/providers/claude-integration-provider"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import { RuntimeClient } from "@/services/runtime-client"
import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"
import { WorkspaceNotAccessible, WorkspaceNotFound } from "@/types/workspace-error"

const TASK_STATUSES = [
  { value: "pending", label: "pending" },
  { value: "in_progress", label: "in progress" },
  { value: "completed", label: "completed" },
]

const panelFallback = <div className="h-full w-full bg-background" />

export const Route = createFileRoute("/w/$workspaceId")({
  beforeLoad: async ({ params, context }) => {
    const { db } = context
    const workspacePath = AbsolutePath(decodeBase64Url(params.workspaceId))

    const pathExists = await exists(workspacePath)

    match(pathExists, {
      onLeft: (error) => {
        // Map file system error to workspace error using Match.tag
        const workspaceError = Match.value(error).pipe(
          Match.tag(
            "PermissionDeniedError",
            () => new WorkspaceNotAccessible({ path: workspacePath }),
          ),
          Match.orElse(() => new WorkspaceNotFound({ path: workspacePath })),
        )
        throw redirect({
          to: "/",
          search: { workspaceError },
        })
      },
      onRight: (pathExists) => {
        if (!pathExists) {
          // redirect to home with workspace error
          throw redirect({
            to: "/",
            search: {
              workspaceError: new WorkspaceNotFound({ path: workspacePath }),
            },
          })
        }
      },
    })

    const workspace = await RuntimeClient.runPromise(
      db.upsertWorkspace({
        path: workspacePath,
        is_open: true,
      }),
    )

    const pane = await RuntimeClient.runPromise(
      db.upsertPane({ workspace_id: workspace.id, position: 0 }),
    )

    return {
      workspace: {
        id: workspace.id as WorkspacePrimaryKey,
        path: workspacePath,
        name: workspacePath.split("/").pop() || "spacecake",
      },
      paneId: pane.id,
    }
  },
  loader: async ({ context }) => {
    const { db, workspace } = context

    // fetch git branch early so status bar toggle is available sooner
    // (fire-and-forget — don't block workspace loading)
    window.electronAPI.git
      .getCurrentBranch(workspace.path)
      .then((branch) => store.set(gitBranchAtom, branch))
      .catch(() => {})

    // parallelize independent I/O: directory read (filesystem) and cache query (database)
    const [result, cache] = await Promise.all([
      readDirectory(workspace.path),
      RuntimeClient.runPromise(db.selectWorkspaceCache(workspace.path)),
    ])

    match(result, {
      onLeft: (error) => {
        Match.value(error).pipe(
          Match.tag("PermissionDeniedError", () => {
            throw redirect({
              to: "/",
              search: {
                workspaceError: new WorkspaceNotAccessible({
                  path: workspace.path,
                }),
              },
            })
          }),
          Match.orElse((e) => console.error(e)),
        )
      },
      onRight: (tree) => {
        // hydrate file state machine atoms
        cache.forEach((row) => {
          const event: FileStateHydrationEvent = {
            type: row.has_cached_state ? "file.dirty" : "file.clean",
          }
          store.set(getOrCreateFileStateAtom(row.filePath), event)
        })

        store.set(setFileTreeAtom, tree)
      },
    })

    // Ensure plansDirectory is configured in project-level .claude/settings.json
    window.electronAPI.ensurePlansDirectory(workspace.path).catch((err) => {
      console.error("Failed to ensure plansDirectory:", err)
    })

    return {
      workspace: {
        id: workspace.id,
        path: workspace.path,
        name: workspace.path.split("/").pop() || "spacecake",
      },
    }
  },
  pendingComponent: () => <LoadingAnimation />,
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: WorkspaceLayout,
})

// component for the right side of the header
function HeaderToolbar() {
  const route = useRoute()
  const { paneId, workspace } = Route.useRouteContext()
  const workspaceIdEncoded = encodeBase64Url(workspace.path)
  const machine = usePaneMachine(paneId, workspace.path, workspaceIdEncoded)
  const activePaneItemId = useActivePaneItemId(paneId)
  const selectedFilePath = route?.filePath || null

  if (selectedFilePath && route && activePaneItemId) {
    return (
      <div className="app-no-drag flex items-center gap-3 px-4">
        <EditorToolbar routeContext={route} machine={machine} activePaneItemId={activePaneItemId} />
      </div>
    )
  }
  return null
}

// Dock position dropdown - shows current dock icon and allows switching
function DockPositionDropdown({
  currentDock,
  onDockChange,
  label,
}: {
  currentDock: DockPosition
  onDockChange: (dock: DockPosition) => void
  label: DockablePanelKind
}) {
  const CurrentIcon =
    currentDock === "left" ? PanelLeft : currentDock === "right" ? PanelRight : PanelBottom

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-0"
          aria-label={`change ${label} dock position`}
          title={`change ${label} dock position`}
        >
          <CurrentIcon className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={currentDock === "right" ? "end" : "start"}>
        {currentDock !== "left" && (
          <DropdownMenuItem onClick={() => onDockChange("left")} className="cursor-pointer">
            <PanelLeft className="h-4 w-4" />
            dock left
          </DropdownMenuItem>
        )}
        {currentDock !== "bottom" && (
          <DropdownMenuItem onClick={() => onDockChange("bottom")} className="cursor-pointer">
            <PanelBottom className="h-4 w-4" />
            dock bottom
          </DropdownMenuItem>
        )}
        {currentDock !== "right" && (
          <DropdownMenuItem onClick={() => onDockChange("right")} className="cursor-pointer">
            <PanelRight className="h-4 w-4" />
            dock right
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// task panel toolbar — owns taskStatusFilter to avoid re-rendering LayoutContent on filter changes
function TaskToolbar({
  isExpanded,
  dock,
  onExpandedChange,
  onDockChange,
}: {
  isExpanded: boolean
  dock: DockPosition
  onExpandedChange: (expanded: boolean) => void
  onDockChange: (dock: DockPosition) => void
}) {
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
}

// git panel toolbar
function GitToolbar({
  isExpanded,
  dock,
  onExpandedChange,
  onDockChange,
}: {
  isExpanded: boolean
  dock: DockPosition
  onExpandedChange: (expanded: boolean) => void
  onDockChange: (dock: DockPosition) => void
}) {
  const isCollapsed = !isExpanded

  return (
    <div className="h-10 shrink-0 w-full bg-background/50 flex items-center justify-between px-4 overflow-hidden border-b">
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <GitBranch
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isExpanded ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        />
        <DockPositionDropdown currentDock={dock} onDockChange={onDockChange} label="git" />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onExpandedChange(!isExpanded)}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label={isCollapsed ? "show git" : "hide git"}
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
}

// isolates pane-item live queries so LayoutContent doesn't re-render on tab changes
function TabCloseHotkey({
  paneId,
  machine,
}: {
  paneId: Parameters<typeof usePaneItems>[0]
  machine: ReturnType<typeof usePaneMachine>
}) {
  const { items: paneItems } = usePaneItems(paneId)
  const activePaneItemId = useActivePaneItemId(paneId)

  useHotkey(
    "mod+w",
    () => {
      const activeItem = paneItems.find((i) => i.id === activePaneItemId)
      if (activeItem) {
        machine.send({
          type: "pane.item.close",
          itemId: activeItem.id,
          filePath: activeItem.filePath,
          isClosingActiveTab: true,
        })
      }
    },
    {
      guard: () => {
        const terminalPanel = document.querySelector('[data-testid="terminal-panel"]')
        return !terminalPanel?.contains(document.activeElement)
      },
    },
  )

  return null
}

function LayoutContent() {
  const { workspace, paneId } = Route.useRouteContext()
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar()
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null)
  const verticalPanelGroupRef = useRef<GroupImperativeHandle>(null)
  const { focus } = useFocusManager()

  // Pane machine for serializing tab operations
  const workspaceIdEncoded = encodeBase64Url(workspace.path)
  const machine = usePaneMachine(paneId, workspace.path, workspaceIdEncoded)

  // Cmd+1 / Ctrl+1 to focus editor
  useHotkey("mod+1", () => focus("editor"), { capture: true })

  // Register terminal focus callback — find the active tab's terminal textarea
  const focusTerminal = useCallback(() => {
    // find the visible (active) ghostty terminal mount point
    const terminalPanel = document.querySelector('[data-testid="terminal-panel"]')
    const visibleMount = terminalPanel?.querySelector('[data-testid="ghostty-terminal"]')
    const textarea = visibleMount?.querySelector("textarea")
    textarea?.focus()
  }, [])
  useFocusablePanel("terminal", focusTerminal)

  // Sync sidebar open/close state with the resizable panel
  useEffect(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    if (sidebarOpen) {
      panel.expand()
    } else {
      panel.collapse()
    }
  }, [sidebarOpen])

  // Start watching Claude tasks
  useClaudeTaskWatcher()

  // Get layout from database with live updates
  const { layout } = useWorkspaceLayout(workspace.id)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const terminalDock = getDockPosition(layout.dock, "terminal")
  const isTerminalExpanded = layout.panels.terminal.isExpanded
  const terminalSize = clampSize(layout.panels.terminal.size, terminalDock)
  const isTerminalCollapsed = !isTerminalExpanded

  // Task panel state
  const taskDock = getDockPosition(layout.dock, "task")
  const isTaskExpanded = layout.panels.task.isExpanded
  const taskSize = clampSize(layout.panels.task.size, taskDock)
  const isTaskCollapsed = !isTaskExpanded

  // Git panel state
  const gitDock = getDockPosition(layout.dock, "git")
  const isGitExpanded = layout.panels.git.isExpanded
  const gitSize = clampSize(layout.panels.git.size, gitDock)
  const isGitCollapsed = !isGitExpanded

  const [isTerminalSessionActive, setIsTerminalSessionActive] = useState(true)
  const shouldFocusTerminalRef = useRef(false)

  // Focus terminal after it expands (when triggered by Ctrl+`)
  useEffect(() => {
    if (isTerminalExpanded && shouldFocusTerminalRef.current) {
      shouldFocusTerminalRef.current = false
      // Wait for layout to settle before focusing
      requestAnimationFrame(() => {
        focus("terminal")
      })
    }
  }, [isTerminalExpanded, focus])

  const terminalPanelRef = useRef<HTMLDivElement>(null)
  const terminalResizablePanelRef = useRef<PanelImperativeHandle>(null)

  const taskPanelRef = useRef<HTMLDivElement>(null)
  const taskResizablePanelRef = useRef<PanelImperativeHandle>(null)

  const gitPanelRef = useRef<HTMLDivElement>(null)
  const gitResizablePanelRef = useRef<PanelImperativeHandle>(null)

  // Helper to dispatch a dock action and persist the result.
  // Reads layout from ref so this callback is stable across renders.
  const dispatch = useCallback(
    (action: DockAction) => {
      const currentLayout = layoutRef.current
      const newLayout = transition(currentLayout, action)
      if (newLayout === currentLayout) return

      // auto-close/open sidebar when a left-docked panel expands/collapses
      const oldDock = currentLayout.dock
      const newDock = newLayout.dock as FullDock
      const hadExpandedLeft =
        (getDockPosition(oldDock, "git") === "left" && currentLayout.panels.git.isExpanded) ||
        (getDockPosition(oldDock, "task") === "left" && currentLayout.panels.task.isExpanded)
      const hasExpandedLeft =
        (getDockPosition(newDock, "git") === "left" && newLayout.panels.git.isExpanded) ||
        (getDockPosition(newDock, "task") === "left" && newLayout.panels.task.isExpanded)
      if (hasExpandedLeft !== hadExpandedLeft) {
        setSidebarOpen(!hasExpandedLeft)
      }

      // optimistically update ref so rapid dispatches chain correctly
      // transition preserves the FullDock shape when input is normalized
      layoutRef.current = newLayout as typeof currentLayout
      mutations.updateWorkspaceLayout(workspace.id, newLayout)
    },
    [workspace.id, setSidebarOpen],
  )

  // Helper to blur terminal focus (prevents aria-hidden focus warning when collapsing)
  const blurTerminal = useCallback(() => {
    const terminalPanel = document.querySelector('[data-testid="terminal-panel"]')
    if (!terminalPanel) return

    // Check if focus is within the terminal (could be textarea, canvas container, or other elements)
    if (terminalPanel.contains(document.activeElement)) {
      ;(document.activeElement as HTMLElement)?.blur?.()
    }
  }, [])

  const setTerminalExpanded = useCallback(
    (expanded: boolean) => {
      if (!expanded) {
        blurTerminal()
      }
      dispatch({ kind: expanded ? "expand" : "collapse", panel: "terminal" })
    },
    [dispatch, blurTerminal],
  )

  // Ctrl+` to toggle terminal (VS Code behavior)
  useHotkey(
    "ctrl+`",
    () => {
      const terminalPanel = document.querySelector('[data-testid="terminal-panel"]')
      const isTerminalFocused = terminalPanel?.contains(document.activeElement)

      if (isTerminalFocused && isTerminalExpanded) {
        // terminal focused + expanded → collapse
        setTerminalExpanded(false)
      } else if (!isTerminalFocused && isTerminalExpanded) {
        // editor focused + terminal expanded → focus terminal
        focus("terminal")
      } else {
        // editor focused + terminal collapsed → expand AND focus
        if (!isTerminalSessionActive) {
          setIsTerminalSessionActive(true)
        }
        shouldFocusTerminalRef.current = true
        setTerminalExpanded(true)
      }
    },
    {
      capture: true,
      // skip synthetic events dispatched by the terminal's shortcut interceptor
      guard: (e) => e.isTrusted,
    },
  )

  const setTerminalDock = useCallback(
    (dock: DockPosition) => {
      dispatch({ kind: "move", panel: "terminal", to: dock })
    },
    [dispatch],
  )

  const setTaskExpanded = useCallback(
    (expanded: boolean) => {
      dispatch({ kind: expanded ? "expand" : "collapse", panel: "task" })
    },
    [dispatch],
  )

  const setTaskDock = useCallback(
    (dock: DockPosition) => {
      dispatch({ kind: "move", panel: "task", to: dock })
    },
    [dispatch],
  )

  const setGitExpanded = useCallback(
    (expanded: boolean) => {
      dispatch({ kind: expanded ? "expand" : "collapse", panel: "git" })
    },
    [dispatch],
  )

  const setGitDock = useCallback(
    (dock: DockPosition) => {
      dispatch({ kind: "move", panel: "git", to: dock })
    },
    [dispatch],
  )

  const toggleTerminal = useCallback(() => {
    if (isTerminalCollapsed && !isTerminalSessionActive) {
      setIsTerminalSessionActive(true)
    }
    // Blur terminal before collapsing to avoid aria-hidden focus warning
    if (!isTerminalCollapsed) {
      blurTerminal()
    }
    dispatch({ kind: "toggle", panel: "terminal" })
  }, [isTerminalCollapsed, isTerminalSessionActive, dispatch, blurTerminal])

  const toggleTask = useCallback(() => {
    dispatch({ kind: "toggle", panel: "task" })
  }, [dispatch])

  const toggleGit = useCallback(() => {
    dispatch({ kind: "toggle", panel: "git" })
  }, [dispatch])

  // Track pending terminal size for debounced saves
  const pendingTerminalSizeRef = useRef<number | null>(null)

  // Keep dispatch in a ref so debounced callback always has current version
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch

  // Debounced save for terminal resize - only save after resize stops for 250ms
  const debouncedSaveTerminalSize = useRef(
    debounce(() => {
      const newSize = pendingTerminalSizeRef.current
      if (newSize !== null) {
        dispatchRef.current({
          kind: "resize",
          panel: "terminal",
          size: newSize,
        })
        pendingTerminalSizeRef.current = null
      }
    }, 250),
  ).current

  // Handle terminal resize - debounce persistence to avoid excessive DB writes
  const handleTerminalResize = useCallback(
    (layout: Layout) => {
      const newSize = layout["terminal-panel"]
      // Only persist if terminal is expanded and size is meaningful
      if (newSize != null && newSize > 0 && isTerminalExpanded) {
        pendingTerminalSizeRef.current = newSize
        debouncedSaveTerminalSize.schedule()
      }
    },
    [isTerminalExpanded, debouncedSaveTerminalSize],
  )

  // reset terminal panel size when toggling collapse state
  // uses useLayoutEffect + v4's built-in collapse/expand to ensure the panel
  // is sized before the browser paints — prevents ghostty from seeing a
  // 0-column terminal (which corrupts its buffer)
  useLayoutEffect(() => {
    const panel = terminalResizablePanelRef.current
    if (!panel) return
    if (isTerminalCollapsed) {
      panel.collapse()
    } else {
      panel.expand()
      // expand() restores the last pre-collapse size; if none was saved
      // (e.g., first expand), resize to the persisted terminal size
      if (panel.getSize().asPercentage < terminalSize) {
        panel.resize(`${terminalSize}%`)
      }
    }
  }, [isTerminalCollapsed, terminalSize])

  // collapse/expand git panel using the v4 imperative API.
  // uses useEffect (not useLayoutEffect) so the panel has time to register
  // with its group after dock position changes.
  useEffect(() => {
    const panel = gitResizablePanelRef.current
    if (!panel) return
    let rafId: number
    const apply = () => {
      try {
        if (isGitCollapsed) {
          panel.collapse()
        } else {
          panel.expand()
          if (panel.getSize().asPercentage < gitSize) {
            panel.resize(`${gitSize}%`)
          }
        }
      } catch {
        // panel not yet registered with group — retry next frame
        rafId = requestAnimationFrame(apply)
      }
    }
    apply()
    return () => cancelAnimationFrame(rafId)
  }, [isGitCollapsed, gitSize])

  // collapse/expand task panel using the v4 imperative API
  useEffect(() => {
    const panel = taskResizablePanelRef.current
    if (!panel) return
    let rafId: number
    const apply = () => {
      try {
        if (isTaskCollapsed) {
          panel.collapse()
        } else {
          panel.expand()
          if (panel.getSize().asPercentage < taskSize) {
            panel.resize(`${taskSize}%`)
          }
        }
      } catch {
        // panel not yet registered with group — retry next frame
        rafId = requestAnimationFrame(apply)
      }
    }
    apply()
    return () => cancelAnimationFrame(rafId)
  }, [isTaskCollapsed, taskSize])

  const handleSidebarResize = useCallback(() => {
    setSidebarOpen(!sidebarPanelRef.current?.isCollapsed())
  }, [setSidebarOpen])

  const sidebarOpenRef = useRef(sidebarOpen)
  sidebarOpenRef.current = sidebarOpen
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(!sidebarOpenRef.current)
  }, [setSidebarOpen])

  const handleFileClick = useCallback(
    (filePath: AbsolutePath) => {
      if (workspace?.path) {
        machine.send({ type: "pane.file.open", filePath })
      }
    },
    [workspace?.path, machine],
  )

  // git panel file clicks open in diff view mode
  const handleGitFileClick = useCallback(
    (filePath: AbsolutePath, baseRef?: string, targetRef?: string) => {
      if (workspace?.path) {
        machine.send({ type: "pane.file.open", filePath, viewKind: "diff", baseRef, targetRef })
      }
    },
    [workspace?.path, machine],
  )

  // commit file clicks show diff for that specific commit vs its parent
  const handleCommitFileClick = useCallback(
    (filePath: AbsolutePath, commitHash: string) => {
      handleGitFileClick(filePath, `${commitHash}^`, commitHash)
    },
    [handleGitFileClick],
  )

  // Layout direction based on dock position
  const panelDirection = terminalDock === "bottom" ? "vertical" : "horizontal"
  const terminalFirst = terminalDock === "left"

  // Controls injected into the right side of the tab bar
  const terminalToolbarRight = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <TerminalStatusBadge />
        <DockPositionDropdown
          currentDock={terminalDock}
          onDockChange={setTerminalDock}
          label="terminal"
        />
        <DeleteButton
          onDelete={
            isTerminalSessionActive
              ? () => {
                  setIsTerminalSessionActive(false)
                  setTerminalExpanded(false)
                }
              : undefined
          }
          disabled={!isTerminalSessionActive}
          title="kill terminal"
          data-testid="terminal-delete-button"
        />
        <button
          onClick={() => {
            if (isTerminalCollapsed && !isTerminalSessionActive) {
              setIsTerminalSessionActive(true)
            }
            setTerminalExpanded(!isTerminalExpanded)
          }}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label={isTerminalCollapsed ? "show terminal" : "hide terminal"}
        >
          {isTerminalCollapsed ? (
            <ChevronUp className="cursor-pointer h-4 w-4" />
          ) : (
            <ChevronDown className="cursor-pointer h-4 w-4" />
          )}
        </button>
      </div>
    ),
    [
      isTerminalCollapsed,
      isTerminalExpanded,
      isTerminalSessionActive,
      setTerminalExpanded,
      terminalDock,
      setTerminalDock,
    ],
  )

  // Determine which panel (if any) is docked at bottom
  const bottomDockedPanel = taskDock === "bottom" ? "task" : gitDock === "bottom" ? "git" : null
  const bottomPanelCollapsed = bottomDockedPanel === "task" ? isTaskCollapsed : isGitCollapsed
  const bottomPanelSize = bottomDockedPanel === "task" ? taskSize : gitSize

  const editorPanel = (
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
                <HeaderToolbar />
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
              <div ref={taskPanelRef} className="flex h-full w-full flex-col">
                {!isTaskCollapsed && (
                  <TaskToolbar
                    isExpanded={isTaskExpanded}
                    dock={taskDock}
                    onExpandedChange={setTaskExpanded}
                    onDockChange={setTaskDock}
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
              <div ref={gitPanelRef} className="flex h-full w-full flex-col">
                {!isGitCollapsed && (
                  <GitToolbar
                    isExpanded={isGitExpanded}
                    dock={gitDock}
                    onExpandedChange={setGitExpanded}
                    onDockChange={setGitDock}
                  />
                )}
                <div
                  className={cn(
                    "flex-1 min-h-0 min-w-0 overflow-hidden",
                    isGitCollapsed && "hidden",
                  )}
                >
                  <Suspense fallback={panelFallback}>
                    <GitPanel
                      workspacePath={workspace.path}
                      onFileClick={handleGitFileClick}
                      onCommitFileClick={handleCommitFileClick}
                    />
                  </Suspense>
                </div>
              </div>
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      ) : (
        <main className="relative flex w-full flex-1 flex-col overflow-hidden h-full">
          <header className="app-drag flex h-10 shrink-0 items-center gap-2 justify-between border-b">
            <div className="app-no-drag flex h-full items-end flex-1 min-w-0 overflow-hidden">
              <TabBar paneId={paneId} machine={machine} />
            </div>
            <HeaderToolbar />
          </header>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Outlet />
          </div>
        </main>
      )}
    </ResizablePanel>
  )

  const terminalConstraints = DOCK_SIZE_CONSTRAINTS[terminalDock]
  const terminalPanel = (
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
      <div ref={terminalPanelRef} className={cn("h-full w-full", isTerminalCollapsed && "hidden")}>
        {isTerminalSessionActive && (
          <Suspense fallback={panelFallback}>
            <Terminal
              cwd={workspace.path}
              toolbarRight={terminalToolbarRight}
              onLastTabClosed={() => {
                setIsTerminalSessionActive(false)
                setTerminalExpanded(false)
                focus("editor")
              }}
            />
          </Suspense>
        )}
      </div>
    </ResizablePanel>
  )

  return (
    <ClaudeIntegrationProvider
      workspacePath={workspace.path}
      enabled={!isTerminalCollapsed}
      machine={machine}
    >
      <TabCloseHotkey paneId={paneId} machine={machine} />
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel
          id="sidebar-panel"
          panelRef={sidebarPanelRef}
          defaultSize="15%"
          minSize="10%"
          maxSize="40%"
          collapsible
          collapsedSize="0%"
          data-collapsed={!sidebarOpen || undefined}
          onResize={handleSidebarResize}
          className="flex flex-col h-full *:flex-1 *:min-h-0"
        >
          <AppSidebar onFileClick={handleFileClick} workspace={workspace} />
        </ResizablePanel>
        <ResizableHandle withHandle className={cn("w-0", !sidebarOpen && "hidden")} />
        <ResizablePanel id="main-content-panel" defaultSize="85%" className="p-2 overflow-hidden">
          <div className="flex flex-col h-full bg-background rounded-md shadow-sm overflow-hidden">
            <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
              {/* Left git panel - full height */}
              {gitDock === "left" && (
                <>
                  <ResizablePanel
                    id="git-panel-left"
                    panelRef={gitResizablePanelRef}
                    defaultSize={isGitCollapsed ? "0%" : `${gitSize}%`}
                    minSize="10%"
                    maxSize="40%"
                    collapsible
                    collapsedSize="0%"
                    data-collapsed={isGitCollapsed || undefined}
                  >
                    <div ref={gitPanelRef} className="flex h-full w-full flex-col">
                      {!isGitCollapsed && (
                        <GitToolbar
                          isExpanded={isGitExpanded}
                          dock={gitDock}
                          onExpandedChange={setGitExpanded}
                          onDockChange={setGitDock}
                        />
                      )}
                      <div
                        className={cn(
                          "flex-1 min-h-0 min-w-0 overflow-hidden",
                          isGitCollapsed && "hidden",
                        )}
                      >
                        <Suspense fallback={panelFallback}>
                          <GitPanel
                            workspacePath={workspace.path}
                            onFileClick={handleGitFileClick}
                            onCommitFileClick={handleCommitFileClick}
                          />
                        </Suspense>
                      </div>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle className={isGitCollapsed ? "invisible" : ""} />
                </>
              )}

              {/* Left task panel - full height */}
              {taskDock === "left" && (
                <>
                  <ResizablePanel
                    id="task-panel-left"
                    panelRef={taskResizablePanelRef}
                    defaultSize={isTaskCollapsed ? "0%" : `${taskSize}%`}
                    minSize="10%"
                    maxSize="40%"
                    collapsible
                    collapsedSize="0%"
                    data-collapsed={isTaskCollapsed || undefined}
                  >
                    <div ref={taskPanelRef} className="flex h-full w-full flex-col">
                      {!isTaskCollapsed && (
                        <TaskToolbar
                          isExpanded={isTaskExpanded}
                          dock={taskDock}
                          onExpandedChange={setTaskExpanded}
                          onDockChange={setTaskDock}
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
                  <ResizableHandle withHandle className={isTaskCollapsed ? "invisible" : ""} />
                </>
              )}

              {/* Center panel */}
              <ResizablePanel
                id="center-panel"
                defaultSize={
                  isTaskCollapsed || taskDock === "bottom" ? "100%" : `${100 - taskSize}%`
                }
                minSize="30%"
              >
                <div className="h-full flex flex-col overflow-hidden">
                  <ResizablePanelGroup
                    orientation={panelDirection}
                    groupRef={verticalPanelGroupRef}
                    onLayoutChange={handleTerminalResize}
                  >
                    {terminalFirst ? (
                      <>
                        {terminalPanel}
                        <ResizableHandle
                          withHandle
                          className={isTerminalCollapsed ? "invisible" : ""}
                        />
                        {editorPanel}
                      </>
                    ) : (
                      <>
                        {editorPanel}
                        <ResizableHandle
                          withHandle
                          className={isTerminalCollapsed ? "invisible" : ""}
                        />
                        {terminalPanel}
                      </>
                    )}
                  </ResizablePanelGroup>
                </div>
              </ResizablePanel>

              {/* Right task panel - full height */}
              {taskDock === "right" && (
                <>
                  <ResizableHandle withHandle className={isTaskCollapsed ? "invisible" : ""} />
                  <ResizablePanel
                    id="task-panel-right"
                    panelRef={taskResizablePanelRef}
                    defaultSize={isTaskCollapsed ? "0%" : `${taskSize}%`}
                    minSize="10%"
                    maxSize="50%"
                    collapsible
                    collapsedSize="0%"
                    data-collapsed={isTaskCollapsed || undefined}
                  >
                    <div ref={taskPanelRef} className="flex h-full w-full flex-col">
                      {!isTaskCollapsed && (
                        <TaskToolbar
                          isExpanded={isTaskExpanded}
                          dock={taskDock}
                          onExpandedChange={setTaskExpanded}
                          onDockChange={setTaskDock}
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
                </>
              )}

              {/* Right git panel - full height */}
              {gitDock === "right" && (
                <>
                  <ResizableHandle withHandle className={isGitCollapsed ? "invisible" : ""} />
                  <ResizablePanel
                    id="git-panel-right"
                    panelRef={gitResizablePanelRef}
                    defaultSize={isGitCollapsed ? "0%" : `${gitSize}%`}
                    minSize="10%"
                    maxSize="50%"
                    collapsible
                    collapsedSize="0%"
                    data-collapsed={isGitCollapsed || undefined}
                  >
                    <div ref={gitPanelRef} className="flex h-full w-full flex-col">
                      {!isGitCollapsed && (
                        <GitToolbar
                          isExpanded={isGitExpanded}
                          dock={gitDock}
                          onExpandedChange={setGitExpanded}
                          onDockChange={setGitDock}
                        />
                      )}
                      <div
                        className={cn(
                          "flex-1 min-h-0 min-w-0 overflow-hidden",
                          isGitCollapsed && "hidden",
                        )}
                      >
                        <Suspense fallback={panelFallback}>
                          <GitPanel
                            workspacePath={workspace.path}
                            onFileClick={handleGitFileClick}
                            onCommitFileClick={handleCommitFileClick}
                          />
                        </Suspense>
                      </div>
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
            <WorkspaceStatusBar
              onToggleSidebar={toggleSidebar}
              isTerminalExpanded={isTerminalExpanded}
              isTaskExpanded={isTaskExpanded}
              isGitExpanded={isGitExpanded}
              onToggleTerminal={toggleTerminal}
              onToggleTask={toggleTask}
              onToggleGit={toggleGit}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </ClaudeIntegrationProvider>
  )
}

function WorkspaceLayout() {
  const { workspace, paneId } = Route.useRouteContext()

  // create workspace-scoped TanStack DB collections (stable per workspace).
  const [collections, setCollections] = useState(() =>
    createWorkspaceCollections(workspace.path, workspace.id, queryClient),
  )
  const collectionsKeyRef = useRef(`${workspace.path}:${workspace.id}`)

  useEffect(() => {
    const key = `${workspace.path}:${workspace.id}`
    if (collectionsKeyRef.current === key) return

    // no manual cleanup — old collections are GC'd via the built-in 5-minute
    // timer. calling cleanup() while live queries exist causes react crashes.
    collectionsKeyRef.current = key
    setCollections(createWorkspaceCollections(workspace.path, workspace.id, queryClient))
  }, [workspace.path, workspace.id])

  // Pane machine for quick open file selection (serializes with tab operations)
  const workspaceIdEncoded = encodeBase64Url(workspace.path)
  const machine = usePaneMachine(paneId, workspace.path, workspaceIdEncoded)

  const setIsCreatingInContext = useSetAtom(isCreatingInContextAtom)
  const setContextItemName = useSetAtom(contextItemNameAtom)

  // clean up all file state atoms and settings machine when workspace unmounts.
  // important: only clean up THIS workspace's pane machine (not the entire cache),
  // because on workspace switch React reuses the component — the new machine is
  // created during render before this cleanup effect runs.
  useEffect(() => {
    const id = workspace.id
    const currentPaneId = paneId
    return () => {
      cleanupSettingsMachine(id)
      cleanupPaneMachine(currentPaneId)
      store.set(quickOpenIndexAtom, [])
      store.set(quickOpenIndexReadyAtom, false)
      // defer so child components unmount first (prevents re-creation during teardown)
      setTimeout(() => {
        clearFileStateAtoms()
      }, 0)
    }
  }, [workspace.path, workspace.id, paneId])

  const handleNewFile = useCallback(() => {
    if (workspace?.path) {
      setIsCreatingInContext({ kind: "file", parentPath: workspace.path })
      setContextItemName("")
    }
  }, [workspace?.path, setIsCreatingInContext, setContextItemName])

  useHotkey("mod+n", handleNewFile)
  useMenuAction("new-file", handleNewFile)

  const titlebarHeight = window.electronAPI.titlebarHeight

  return (
    <CollectionsProvider collections={collections}>
      {workspace?.path && <WorkspaceWatcher workspacePath={workspace.path} />}
      <div className="flex h-screen flex-col overflow-hidden">
        {/* app-wide drag region for window controls */}
        <div
          className="app-drag shrink-0 bg-sidebar flex items-center"
          style={{ height: titlebarHeight }}
        >
          {window.electronAPI.platform !== "darwin" && <MenuButton />}
        </div>
        <FocusManagerProvider>
          <SidebarProvider className="flex-1 min-h-0">
            <LayoutContent />
          </SidebarProvider>
        </FocusManagerProvider>
      </div>
      {workspace?.path && <QuickOpen workspacePath={workspace.path} machine={machine} />}
    </CollectionsProvider>
  )
}
