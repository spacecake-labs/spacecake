/**
 * This route is matched when a workspace is open.
 * If the workspace path is not valid, it redirects to the home route.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  FocusManagerProvider,
  useFocusablePanel,
  useFocusManager,
} from "@/contexts/focus-manager"
import { FileStateHydrationEvent } from "@/machines/file-tree"
import { ClaudeIntegrationProvider } from "@/providers/claude-integration-provider"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import type { DockPosition } from "@/schema/workspace-layout"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import {
  createFileRoute,
  ErrorComponent,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { Effect, Match } from "effect"
import { useAtom, useSetAtom } from "jotai"
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ListTodo,
  PanelBottom,
  PanelLeft,
  PanelRight,
  X,
} from "lucide-react"
import type { ImperativePanelHandle } from "react-resizable-panels"

import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"
import {
  WorkspaceNotAccessible,
  WorkspaceNotFound,
} from "@/types/workspace-error"
import { contextItemNameAtom, isCreatingInContextAtom } from "@/lib/atoms/atoms"
import { taskStatusFilterAtom } from "@/lib/atoms/claude-tasks"
import { fileStateAtomFamily, setFileTreeAtom } from "@/lib/atoms/file-tree"
import type { DockAction } from "@/lib/dock-transition"
import {
  clampSize,
  DOCK_SIZE_CONSTRAINTS,
  findPanel,
  transition,
} from "@/lib/dock-transition"
import { exists, readDirectory } from "@/lib/fs"
import { store } from "@/lib/store"
import {
  cn,
  condensePath,
  debounce,
  decodeBase64Url,
  encodeBase64Url,
} from "@/lib/utils"
import { WorkspaceWatcher } from "@/lib/workspace-watcher"
import { useClaudeTaskWatcher } from "@/hooks/use-claude-task-watcher"
import { useGhosttyEngine } from "@/hooks/use-ghostty-engine"
import { useRoute } from "@/hooks/use-route"
import { useWorkspaceLayout } from "@/hooks/use-workspace-layout"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { ClaudeStatusBadge } from "@/components/claude-status-badge"
import { ClaudeStatuslineBadge } from "@/components/claude-statusline-badge"
import { DeleteButton } from "@/components/delete-button"
import { EditorToolbar } from "@/components/editor/toolbar"
import { LoadingAnimation } from "@/components/loading-animation"
import { ModeToggle } from "@/components/mode-toggle"
import { QuickOpen } from "@/components/quick-open"
import { TaskTable } from "@/components/task-table/task-table"
import { TerminalMountPoint } from "@/components/terminal-mount-point"
import { TerminalStatusBadge } from "@/components/terminal-status-badge"

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
            () => new WorkspaceNotAccessible({ path: workspacePath })
          ),
          Match.orElse(() => new WorkspaceNotFound({ path: workspacePath }))
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
      })
    )

    const pane = await RuntimeClient.runPromise(
      db.upsertPane({ workspace_id: workspace.id, position: 0 })
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
    const result = await readDirectory(workspace.path)
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
          Match.orElse((e) => console.error(e))
        )
      },
      onRight: async (tree) => {
        // hydrate file state machine atoms
        const cache = await RuntimeClient.runPromise(
          db.selectWorkspaceCache(workspace.path)
        )
        cache.forEach((row) => {
          const event: FileStateHydrationEvent = {
            type: row.has_cached_state ? "file.dirty" : "file.clean",
          }
          store.set(fileStateAtomFamily(row.filePath), event)
        })

        store.set(setFileTreeAtom, tree)
      },
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

// component for the file path part of the header
function FileHeader() {
  const route = useRoute()
  const selectedFilePath = route?.filePath || null
  const [copied, setCopied] = useState(false)

  const handleCopyPath = async (filePath: string) => {
    try {
      await navigator.clipboard.writeText(filePath)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("failed to copy path:", err)
    }
  }

  if (!selectedFilePath) return null

  return (
    <div
      className="flex items-center gap-2 min-w-0"
      data-testid="current-file-path"
    >
      <div className="min-w-0 flex-1">
        <div className="font-mono text-xs text-muted-foreground/70 truncate">
          {condensePath(selectedFilePath)}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleCopyPath(selectedFilePath)}
        className="h-7 w-7 p-0 cursor-pointer flex-shrink-0"
        aria-label="copy path"
        title="copy path"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  )
}

// component for the right side of the header
function HeaderToolbar() {
  const route = useRoute()
  const selectedFilePath = route?.filePath || null

  if (selectedFilePath) {
    return (
      <div className="app-no-drag flex items-center gap-3 px-4">
        {route && <EditorToolbar routeContext={route} />}
        <ModeToggle variant="compact" />
      </div>
    )
  }
  return (
    <div className="app-no-drag px-4">
      <ModeToggle />
    </div>
  )
}

// Dock position dropdown - shows current dock icon and allows switching
function DockPositionDropdown({
  currentDock,
  onDockChange,
}: {
  currentDock: DockPosition
  onDockChange: (dock: DockPosition) => void
}) {
  const CurrentIcon =
    currentDock === "left"
      ? PanelLeft
      : currentDock === "right"
        ? PanelRight
        : PanelBottom

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label="change dock position"
          title="change dock position"
        >
          <CurrentIcon className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={currentDock === "right" ? "end" : "start"}>
        {currentDock !== "left" && (
          <DropdownMenuItem
            onClick={() => onDockChange("left")}
            className="cursor-pointer"
          >
            <PanelLeft className="h-4 w-4" />
            dock left
          </DropdownMenuItem>
        )}
        {currentDock !== "bottom" && (
          <DropdownMenuItem
            onClick={() => onDockChange("bottom")}
            className="cursor-pointer"
          >
            <PanelBottom className="h-4 w-4" />
            dock bottom
          </DropdownMenuItem>
        )}
        {currentDock !== "right" && (
          <DropdownMenuItem
            onClick={() => onDockChange("right")}
            className="cursor-pointer"
          >
            <PanelRight className="h-4 w-4" />
            dock right
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LayoutContent() {
  const { workspace } = Route.useRouteContext()
  const { isMobile, open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar()
  const navigate = useNavigate()
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null)
  const verticalPanelGroupRef =
    useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null)
  const { focus } = useFocusManager()

  // Cmd+1 / Ctrl+1 to focus editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault()
        focus("editor")
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [focus])

  // Register terminal focus callback
  const focusTerminal = useCallback(() => {
    const terminalEl = document.querySelector(
      '[data-testid="ghostty-terminal"]'
    )
    // xterm.js uses a textarea for keyboard input, not the canvas
    const textarea = terminalEl?.querySelector("textarea")
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

  // this hook is still needed here because AppSidebar needs the path as a prop
  const route = useRoute()
  const selectedFilePath = route?.filePath || null

  // Start watching Claude tasks
  useClaudeTaskWatcher()

  // Get layout from database with live updates
  const { layout } = useWorkspaceLayout(workspace.id)
  const terminalDock = findPanel(layout, "terminal") ?? "bottom"
  const isTerminalExpanded = layout.panels.terminal.isExpanded
  const terminalSize = clampSize(layout.panels.terminal.size, terminalDock)
  const isTerminalCollapsed = !isTerminalExpanded

  // Task panel state
  const taskDock = findPanel(layout, "task") ?? "right"
  const isTaskExpanded = layout.panels.task.isExpanded
  const taskSize = clampSize(layout.panels.task.size, taskDock)
  const isTaskCollapsed = !isTaskExpanded
  const [taskStatusFilter, setTaskStatusFilter] = useAtom(taskStatusFilterAtom)

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

  const {
    containerEl: terminalContainerEl,
    error: terminalError,
    fit: terminalFit,
  } = useGhosttyEngine({
    id: "main-terminal",
    enabled: isTerminalSessionActive,
    cwd: workspace.path,
  })

  const handleTerminalMount = useCallback(() => {
    terminalFit()
  }, [terminalFit])

  const terminalPanelRef = useRef<HTMLDivElement>(null)
  const [terminalPanelHeight, setTerminalPanelHeight] = useState(0)

  // Measure terminal panel height for rotated toolbar
  useEffect(() => {
    if (terminalDock === "bottom" || !terminalPanelRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTerminalPanelHeight(entry.contentRect.height)
      }
    })
    resizeObserver.observe(terminalPanelRef.current)
    return () => resizeObserver.disconnect()
  }, [terminalDock])

  const taskPanelRef = useRef<HTMLDivElement>(null)
  const taskPanelGroupRef =
    useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null)
  const taskBottomPanelGroupRef =
    useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null)
  const [taskPanelHeight, setTaskPanelHeight] = useState(0)

  // Measure task panel height for rotated toolbar
  useEffect(() => {
    if (taskDock === "bottom" || !taskPanelRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTaskPanelHeight(entry.contentRect.height)
      }
    })
    resizeObserver.observe(taskPanelRef.current)
    return () => resizeObserver.disconnect()
  }, [taskDock])

  // Helper to dispatch a dock action and persist the result
  const dispatch = useCallback(
    (action: DockAction) => {
      const newLayout = transition(layout, action)
      if (newLayout === layout) return // no-op
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.updateWorkspaceLayout(workspace.id, newLayout)
        })
      )
    },
    [layout, workspace.id]
  )

  const setTerminalExpanded = useCallback(
    (expanded: boolean) => {
      dispatch({ kind: expanded ? "expand" : "collapse", panel: "terminal" })
    },
    [dispatch]
  )

  // Ctrl+` to toggle terminal (VS Code behavior)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+` to toggle terminal (Cmd+` is system window switching on macOS)
      if (e.ctrlKey && e.code === "Backquote") {
        e.preventDefault()

        // Skip synthetic events dispatched by the terminal's shortcut interceptor
        // The window capture handler already sees the original event first
        if (!e.isTrusted) return

        const terminalEl = document.querySelector(
          '[data-testid="ghostty-terminal"]'
        )
        const isTerminalFocused = terminalEl?.contains(document.activeElement)

        if (isTerminalFocused && isTerminalExpanded) {
          // Terminal focused + expanded → collapse
          setTerminalExpanded(false)
        } else if (!isTerminalFocused && isTerminalExpanded) {
          // Editor focused + terminal expanded → focus terminal
          focus("terminal")
        } else {
          // Editor focused + terminal collapsed → expand AND focus
          if (!isTerminalSessionActive) {
            setIsTerminalSessionActive(true)
          }
          shouldFocusTerminalRef.current = true
          setTerminalExpanded(true)
        }
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [
    focus,
    isTerminalExpanded,
    isTerminalSessionActive,
    setTerminalExpanded,
    setIsTerminalSessionActive,
  ])

  const setTerminalDock = useCallback(
    (dock: DockPosition) => {
      dispatch({ kind: "move", panel: "terminal", to: dock })
    },
    [dispatch]
  )

  const setTaskExpanded = useCallback(
    (expanded: boolean) => {
      dispatch({ kind: expanded ? "expand" : "collapse", panel: "task" })
    },
    [dispatch]
  )

  const setTaskDock = useCallback(
    (dock: DockPosition) => {
      dispatch({ kind: "move", panel: "task", to: dock })
    },
    [dispatch]
  )

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
    }, 250)
  ).current

  // Handle terminal resize - debounce persistence to avoid excessive DB writes
  const handleTerminalResize = useCallback(
    (sizes: number[]) => {
      // Terminal panel index depends on dock position (left = index 0, otherwise index 1)
      const terminalIndex = terminalDock === "left" ? 0 : 1
      const newSize = sizes[terminalIndex]
      // Only persist if terminal is expanded and size is meaningful
      if (newSize > 0 && isTerminalExpanded) {
        pendingTerminalSizeRef.current = newSize
        debouncedSaveTerminalSize.schedule()
      }
    },
    [isTerminalExpanded, debouncedSaveTerminalSize, terminalDock]
  )

  // Reset task panel size when toggling collapse state or changing dock position
  useEffect(() => {
    if (taskDock === "bottom") {
      if (taskBottomPanelGroupRef.current) {
        const layout = isTaskCollapsed ? [100, 0] : [100 - taskSize, taskSize]
        taskBottomPanelGroupRef.current.setLayout(layout)
      }
      return
    }
    if (taskPanelGroupRef.current) {
      const taskFirst = taskDock === "left"
      const layout = isTaskCollapsed
        ? taskFirst
          ? [0, 100]
          : [100, 0]
        : taskFirst
          ? [taskSize, 100 - taskSize]
          : [100 - taskSize, taskSize]
      taskPanelGroupRef.current.setLayout(layout)
    }
  }, [isTaskCollapsed, taskSize, taskDock])

  // reset terminal panel size when toggling collapse state or changing dock position
  useEffect(() => {
    if (verticalPanelGroupRef.current) {
      // Layout order depends on dock position (left = terminal first, otherwise editor first)
      const terminalFirst = terminalDock === "left"
      const layout = isTerminalCollapsed
        ? terminalFirst
          ? [0, 100]
          : [100, 0]
        : terminalFirst
          ? [terminalSize, 100 - terminalSize]
          : [100 - terminalSize, terminalSize]
      verticalPanelGroupRef.current.setLayout(layout)
      // when expanding, fit the terminal to the new size
      if (!isTerminalCollapsed) {
        // use requestAnimationFrame to ensure layout has settled
        requestAnimationFrame(() => {
          terminalFit()
        })
      }
    }
  }, [isTerminalCollapsed, terminalSize, terminalDock])

  const handleFileClick = (filePath: AbsolutePath) => {
    if (workspace?.path) {
      const workspaceIdEncoded = encodeBase64Url(workspace.path)
      const filePathEncoded = encodeBase64Url(filePath)
      navigate({
        to: "/w/$workspaceId/f/$filePath",
        params: {
          workspaceId: workspaceIdEncoded,
          filePath: filePathEncoded,
        },
      })
    }
  }

  if (isMobile) {
    return (
      <ClaudeIntegrationProvider
        workspacePath={workspace.path}
        enabled={!isTerminalCollapsed}
      >
        <AppSidebar
          onFileClick={handleFileClick}
          workspace={workspace}
          selectedFilePath={selectedFilePath}
        />
        <main className="bg-background relative flex w-full flex-1 flex-col overflow-hidden rounded-xl shadow-sm h-full p-2">
          <header className="app-drag flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="app-no-drag flex items-center gap-2 px-4">
              <SidebarTrigger
                aria-label="toggle sidebar"
                className="-ml-1 cursor-pointer"
              />
              <FileHeader />
            </div>
            <HeaderToolbar />
          </header>
          <div className="flex-1 min-h-0 overflow-hidden p-4 pt-0">
            <Outlet />
          </div>
        </main>
      </ClaudeIntegrationProvider>
    )
  }
  // Layout direction based on dock position
  const panelDirection = terminalDock === "bottom" ? "vertical" : "horizontal"
  const terminalFirst = terminalDock === "left"

  // Always use up/down chevrons - CSS rotation handles the rest
  const collapseIcon = isTerminalCollapsed ? (
    <ChevronUp className="cursor-pointer h-4 w-4" />
  ) : (
    <ChevronDown className="cursor-pointer h-4 w-4" />
  )

  // Border class based on dock position (between terminal and editor)
  const terminalBorderClass =
    terminalDock === "bottom"
      ? "border-t"
      : terminalDock === "left"
        ? "border-r"
        : "border-l"

  // The toolbar content - same for all dock positions, just rotated for left/right
  const toolbarContent = (
    <div className="h-8 w-full bg-background/50 flex items-center justify-between px-4 overflow-hidden">
      {/* Left side: terminal status + dock position */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <TerminalStatusBadge />
        <DockPositionDropdown
          currentDock={terminalDock}
          onDockChange={setTerminalDock}
        />
      </div>
      {/* Right side: badges, task toggle, delete, collapse */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <ClaudeStatusBadge className="text-xs" />
        <ClaudeStatuslineBadge className="text-xs" />
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
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={isTerminalCollapsed ? "show terminal" : "hide terminal"}
        >
          {collapseIcon}
        </button>
      </div>
    </div>
  )

  const taskStatuses = [
    { value: "pending", label: "pending" },
    { value: "in_progress", label: "in progress" },
    { value: "completed", label: "completed" },
  ]

  const toggleTaskStatus = (status: string) => {
    if (taskStatusFilter.includes(status)) {
      const next = taskStatusFilter.filter((s) => s !== status)
      setTaskStatusFilter(next)
    } else {
      setTaskStatusFilter([...taskStatusFilter, status])
    }
  }

  const taskToolbarContent = (
    <div className="h-8 w-full bg-background/50 flex items-center justify-between px-4 overflow-hidden">
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <ListTodo className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <DockPositionDropdown
          currentDock={taskDock}
          onDockChange={setTaskDock}
        />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {taskStatuses.map((status) => {
          const isActive = taskStatusFilter.includes(status.value)
          return (
            <button
              key={status.value}
              onClick={() => toggleTaskStatus(status.value)}
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium font-mono transition-colors cursor-pointer shrink-0",
                isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-800 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:text-zinc-300"
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
          onClick={() => setTaskExpanded(!isTaskExpanded)}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label={isTaskCollapsed ? "show tasks" : "hide tasks"}
        >
          {isTaskCollapsed ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )

  const editorPanel = (
    <ResizablePanel
      defaultSize={isTerminalCollapsed ? 100 : 100 - terminalSize}
      minSize={30}
    >
      {taskDock === "bottom" ? (
        <ResizablePanelGroup
          ref={taskBottomPanelGroupRef}
          direction="vertical"
          className="h-full"
        >
          <ResizablePanel
            defaultSize={isTaskCollapsed ? 100 : 100 - taskSize}
            minSize={30}
          >
            <main className="relative flex w-full flex-1 flex-col overflow-hidden h-full">
              <header className="app-drag flex h-16 shrink-0 items-center gap-2 justify-between">
                <div className="app-no-drag flex items-center gap-2 px-4">
                  <SidebarTrigger
                    aria-label="toggle sidebar"
                    className="-ml-1 cursor-pointer"
                  />
                  <FileHeader />
                </div>
                <HeaderToolbar />
              </header>
              <div className="flex-1 min-h-0 overflow-hidden p-4 pt-0">
                <Outlet />
              </div>
            </main>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className={isTaskCollapsed ? "invisible" : ""}
          />
          <ResizablePanel
            defaultSize={isTaskCollapsed ? 0 : taskSize}
            minSize={isTaskCollapsed ? 0 : 15}
            maxSize={isTaskCollapsed ? 0 : 50}
            className={isTaskCollapsed ? "grow-0! shrink-0! basis-auto!" : ""}
          >
            <div
              ref={taskPanelRef}
              className="flex h-full w-full border-t flex-col"
            >
              <div className={cn("shrink-0", !isTaskCollapsed && "border-b")}>
                {taskToolbarContent}
              </div>
              <div
                className={cn(
                  "flex-1 min-h-0 min-w-0 overflow-hidden",
                  isTaskCollapsed && "hidden"
                )}
              >
                <TaskTable />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <main className="relative flex w-full flex-1 flex-col overflow-hidden h-full">
          <header className="app-drag flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="app-no-drag flex items-center gap-2 px-4">
              <SidebarTrigger
                aria-label="toggle sidebar"
                className="-ml-1 cursor-pointer"
              />
              <FileHeader />
            </div>
            <HeaderToolbar />
          </header>
          <div className="flex-1 min-h-0 overflow-hidden p-4 pt-0">
            <Outlet />
          </div>
        </main>
      )}
    </ResizablePanel>
  )

  const terminalConstraints = DOCK_SIZE_CONSTRAINTS[terminalDock]
  const terminalPanel = (
    <ResizablePanel
      defaultSize={isTerminalCollapsed ? 0 : terminalSize}
      minSize={isTerminalCollapsed ? 0 : terminalConstraints.min}
      maxSize={isTerminalCollapsed ? 0 : terminalConstraints.max}
      className={isTerminalCollapsed ? "grow-0! shrink-0! basis-auto!" : ""}
    >
      <div
        ref={terminalPanelRef}
        className={cn(
          "flex h-full w-full",
          terminalBorderClass,
          terminalDock === "bottom" ? "flex-col" : "flex-row"
        )}
      >
        {/* Bottom dock: horizontal toolbar at top */}
        {terminalDock === "bottom" && (
          <div className={cn("shrink-0", !isTerminalCollapsed && "border-b")}>
            {toolbarContent}
          </div>
        )}

        {/* Left dock: rotated toolbar on the left side */}
        {terminalDock === "left" && (
          <div
            className={cn(
              "shrink-0 w-8 h-full relative overflow-hidden",
              !isTerminalCollapsed && "border-r"
            )}
          >
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                width:
                  terminalPanelHeight > 0 ? `${terminalPanelHeight}px` : "100%",
                height: "2rem",
                transform: "translate(-50%, -50%) rotate(-90deg)",
              }}
            >
              {toolbarContent}
            </div>
          </div>
        )}

        {/* Terminal content area */}
        <div
          className={cn(
            "flex-1 min-h-0 min-w-0 overflow-hidden",
            isTerminalCollapsed && "hidden"
          )}
        >
          {isTerminalSessionActive && terminalContainerEl && (
            <TerminalMountPoint
              containerEl={terminalContainerEl}
              className={terminalDock !== "bottom" ? "pt-6" : undefined}
              onMount={handleTerminalMount}
            />
          )}
          {terminalError && (
            <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 text-red-100 px-4 py-2 text-sm font-mono">
              {terminalError}
            </div>
          )}
        </div>

        {/* Right dock: rotated toolbar on the right side */}
        {terminalDock === "right" && (
          <div
            className={cn(
              "shrink-0 w-8 h-full relative overflow-hidden",
              !isTerminalCollapsed && "border-l"
            )}
          >
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                width:
                  terminalPanelHeight > 0 ? `${terminalPanelHeight}px` : "100%",
                height: "2rem",
                transform: "translate(-50%, -50%) rotate(90deg)",
              }}
            >
              {toolbarContent}
            </div>
          </div>
        )}
      </div>
    </ResizablePanel>
  )

  return (
    <ClaudeIntegrationProvider
      workspacePath={workspace.path}
      enabled={!isTerminalCollapsed}
    >
      <ResizablePanelGroup direction="horizontal" className="h-screen">
        <ResizablePanel
          ref={sidebarPanelRef}
          defaultSize={15}
          minSize={10}
          maxSize={40}
          collapsible
          collapsedSize={0}
          onCollapse={() => setSidebarOpen(false)}
          onExpand={() => setSidebarOpen(true)}
          className="flex flex-col h-full *:flex-1 *:min-h-0"
        >
          <AppSidebar
            onFileClick={handleFileClick}
            workspace={workspace}
            selectedFilePath={selectedFilePath}
            isTerminalExpanded={isTerminalExpanded}
            isTaskExpanded={isTaskExpanded}
            onToggleTerminal={() => {
              if (isTerminalCollapsed && !isTerminalSessionActive) {
                setIsTerminalSessionActive(true)
              }
              dispatch({ kind: "toggle", panel: "terminal" })
            }}
            onToggleTask={() => dispatch({ kind: "toggle", panel: "task" })}
          />
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className={cn("w-0", !sidebarOpen && "[&>div]:translate-x-1.5")}
        />
        <ResizablePanel defaultSize={85} className="p-2 overflow-hidden">
          <ResizablePanelGroup
            ref={taskPanelGroupRef}
            direction="horizontal"
            className="h-full bg-background rounded-xl shadow-sm overflow-hidden"
          >
            {/* Left task panel - full height */}
            {taskDock === "left" && (
              <>
                <ResizablePanel
                  order={1}
                  defaultSize={isTaskCollapsed ? 0 : taskSize}
                  minSize={isTaskCollapsed ? 0 : 15}
                  maxSize={isTaskCollapsed ? 0 : 50}
                  className={
                    isTaskCollapsed ? "grow-0! shrink-0! basis-auto!" : ""
                  }
                >
                  <div
                    ref={taskPanelRef}
                    className="flex h-full w-full border-r flex-row"
                  >
                    <div
                      className={cn(
                        "shrink-0 w-8 h-full relative overflow-hidden",
                        !isTaskCollapsed && "border-r"
                      )}
                    >
                      <div
                        className="absolute top-1/2 left-1/2"
                        style={{
                          width:
                            taskPanelHeight > 0
                              ? `${taskPanelHeight}px`
                              : "100%",
                          height: "2rem",
                          transform: "translate(-50%, -50%) rotate(-90deg)",
                        }}
                      >
                        {taskToolbarContent}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex-1 min-h-0 min-w-0 overflow-hidden",
                        isTaskCollapsed && "hidden"
                      )}
                    >
                      <TaskTable />
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle
                  withHandle
                  className={isTaskCollapsed ? "invisible" : ""}
                />
              </>
            )}

            {/* Center panel */}
            <ResizablePanel
              order={2}
              defaultSize={
                isTaskCollapsed || taskDock === "bottom" ? 100 : 100 - taskSize
              }
              minSize={30}
            >
              <div className="h-full flex flex-col overflow-hidden">
                <ResizablePanelGroup
                  direction={panelDirection}
                  ref={verticalPanelGroupRef}
                  onLayout={handleTerminalResize}
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
                <ResizableHandle
                  withHandle
                  className={isTaskCollapsed ? "invisible" : ""}
                />
                <ResizablePanel
                  order={3}
                  defaultSize={isTaskCollapsed ? 0 : taskSize}
                  minSize={isTaskCollapsed ? 0 : 15}
                  maxSize={isTaskCollapsed ? 0 : 50}
                  className={
                    isTaskCollapsed ? "grow-0! shrink-0! basis-auto!" : ""
                  }
                >
                  <div
                    ref={taskPanelRef}
                    className="flex h-full w-full border-l flex-row"
                  >
                    <div
                      className={cn(
                        "flex-1 min-h-0 min-w-0 overflow-hidden",
                        isTaskCollapsed && "hidden"
                      )}
                    >
                      <TaskTable />
                    </div>
                    <div
                      className={cn(
                        "shrink-0 w-8 h-full relative overflow-hidden",
                        !isTaskCollapsed && "border-l"
                      )}
                    >
                      <div
                        className="absolute top-1/2 left-1/2"
                        style={{
                          width:
                            taskPanelHeight > 0
                              ? `${taskPanelHeight}px`
                              : "100%",
                          height: "2rem",
                          transform: "translate(-50%, -50%) rotate(90deg)",
                        }}
                      >
                        {taskToolbarContent}
                      </div>
                    </div>
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </ClaudeIntegrationProvider>
  )
}

function WorkspaceLayout() {
  const { workspace } = Route.useRouteContext()

  const setIsCreatingInContext = useSetAtom(isCreatingInContextAtom)
  const setContextItemName = useSetAtom(contextItemNameAtom)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isNewFile =
        (e.metaKey || e.ctrlKey) && (e.key === "n" || e.key === "N")

      if (isNewFile) {
        e.preventDefault()
        // if focused within CodeMirror, let its own handler dispatch the save event
        const target = e.target as EventTarget | null
        const isInCodeMirror =
          target instanceof Element && !!target.closest(".cm-editor")
        if (isInCodeMirror) return

        // start creating a new file in the workspace root
        if (workspace?.path) {
          setIsCreatingInContext({ kind: "file", parentPath: workspace.path })
          setContextItemName("")
        }
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
    }
  }, [workspace?.path, setIsCreatingInContext, setContextItemName])

  if (!workspace?.path) {
    return (
      <>
        <div className="flex h-screen overflow-hidden">
          <FocusManagerProvider>
            <SidebarProvider>
              <LayoutContent />
            </SidebarProvider>
          </FocusManagerProvider>
        </div>
      </>
    )
  }
  return (
    <>
      <WorkspaceWatcher workspacePath={workspace.path} />
      <div className="flex h-screen overflow-hidden">
        <FocusManagerProvider>
          <SidebarProvider>
            <LayoutContent />
          </SidebarProvider>
        </FocusManagerProvider>
      </div>
      <QuickOpen workspacePath={workspace.path} />
    </>
  )
}
