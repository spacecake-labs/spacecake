/**
 * This route is matched when a workspace is open.
 * If the workspace path is not valid, it redirects to the home route.
 */

import type { ImperativePanelHandle } from "react-resizable-panels"

import { createFileRoute, ErrorComponent, Outlet, redirect } from "@tanstack/react-router"
import { Effect, Match } from "effect"
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
import { useCallback, useEffect, useRef, useState } from "react"

import type { DockAction } from "@/lib/dock-transition"
import type { DockPosition } from "@/schema/workspace-layout"

import { AppSidebar } from "@/components/app-sidebar"
import { DeleteButton } from "@/components/delete-button"
import { EditorToolbar } from "@/components/editor/toolbar"
import { GitPanel } from "@/components/git-panel"
import { LoadingAnimation } from "@/components/loading-animation"
import { QuickOpen } from "@/components/quick-open"
import { TabBar } from "@/components/tab-bar"
import { TaskTable } from "@/components/task-table/task-table"
import { TerminalMountPoint } from "@/components/terminal-mount-point"
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
import { FocusManagerProvider, useFocusablePanel, useFocusManager } from "@/contexts/focus-manager"
import { useClaudeTaskWatcher } from "@/hooks/use-claude-task-watcher"
import { useGhosttyEngine } from "@/hooks/use-ghostty-engine"
import { useActivePaneItemId, usePaneItems } from "@/hooks/use-pane-items"
import { usePaneMachine } from "@/hooks/use-pane-machine"
import { useRoute } from "@/hooks/use-route"
import { useWorkspaceLayout } from "@/hooks/use-workspace-layout"
import { contextItemNameAtom, isCreatingInContextAtom } from "@/lib/atoms/atoms"
import { taskStatusFilterAtom } from "@/lib/atoms/claude-tasks"
import { fileStateAtomFamily, setFileTreeAtom } from "@/lib/atoms/file-tree"
import { clampSize, DOCK_SIZE_CONSTRAINTS, findPanel, transition } from "@/lib/dock-transition"
import { exists, readDirectory } from "@/lib/fs"
import { store } from "@/lib/store"
import { cn, debounce, decodeBase64Url, encodeBase64Url } from "@/lib/utils"
import { WorkspaceWatcher } from "@/lib/workspace-watcher"
import { FileStateHydrationEvent } from "@/machines/file-tree"
import { ClaudeIntegrationProvider } from "@/providers/claude-integration-provider"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"
import { WorkspaceNotAccessible, WorkspaceNotFound } from "@/types/workspace-error"

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
          Match.orElse((e) => console.error(e)),
        )
      },
      onRight: async (tree) => {
        // hydrate file state machine atoms
        const cache = await RuntimeClient.runPromise(db.selectWorkspaceCache(workspace.path))
        cache.forEach((row) => {
          const event: FileStateHydrationEvent = {
            type: row.has_cached_state ? "file.dirty" : "file.clean",
          }
          store.set(fileStateAtomFamily(row.filePath), event)
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
}: {
  currentDock: DockPosition
  onDockChange: (dock: DockPosition) => void
}) {
  const CurrentIcon =
    currentDock === "left" ? PanelLeft : currentDock === "right" ? PanelRight : PanelBottom

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-0"
          aria-label="change dock position"
          title="change dock position"
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

function LayoutContent() {
  const { workspace, paneId } = Route.useRouteContext()
  const { isMobile, open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar()
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null)
  const verticalPanelGroupRef = useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null)
  const { focus } = useFocusManager()

  // Pane machine for serializing tab operations
  const workspaceIdEncoded = encodeBase64Url(workspace.path)
  const machine = usePaneMachine(paneId, workspace.path, workspaceIdEncoded)
  const { items: paneItems } = usePaneItems(paneId)
  const activePaneItemId = useActivePaneItemId(paneId)

  // Ctrl+W / Cmd+W to close active tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "w" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        const activeItem = paneItems.find((i) => i.id === activePaneItemId)
        if (activeItem) {
          machine.send({
            type: "pane.item.close",
            itemId: activeItem.id,
            filePath: activeItem.filePath,
            isClosingActiveTab: true,
          })
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [paneItems, activePaneItemId, machine])

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
    const terminalEl = document.querySelector('[data-testid="ghostty-terminal"]')
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

  // Git panel state
  const gitDock = findPanel(layout, "git") ?? "left"
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

  const {
    containerEl: terminalContainerEl,
    api: terminalApi,
    error: terminalError,
    fit: terminalFit,
  } = useGhosttyEngine({
    id: "main-terminal",
    enabled: isTerminalSessionActive,
    cwd: workspace.path,
  })

  // Toggle cursor blink based on terminal focus state
  useEffect(() => {
    if (!terminalApi || !terminalContainerEl) return

    const handleFocusIn = () => terminalApi.setCursorBlink(true)
    const handleFocusOut = (e: FocusEvent) => {
      // Only disable blink if focus is leaving the container entirely
      const relatedTarget = e.relatedTarget as Node | null
      if (relatedTarget && terminalContainerEl.contains(relatedTarget)) return
      terminalApi.setCursorBlink(false)
    }

    terminalContainerEl.addEventListener("focusin", handleFocusIn)
    terminalContainerEl.addEventListener("focusout", handleFocusOut)

    // Set initial state based on current focus
    if (terminalContainerEl.contains(document.activeElement)) {
      terminalApi.setCursorBlink(true)
    }

    return () => {
      terminalContainerEl.removeEventListener("focusin", handleFocusIn)
      terminalContainerEl.removeEventListener("focusout", handleFocusOut)
    }
  }, [terminalApi, terminalContainerEl])

  const handleTerminalMount = useCallback(() => {
    terminalFit()
  }, [terminalFit])

  const terminalPanelRef = useRef<HTMLDivElement>(null)

  const taskPanelRef = useRef<HTMLDivElement>(null)
  const taskBottomPanelGroupRef = useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null)

  const gitPanelRef = useRef<HTMLDivElement>(null)
  const gitPanelGroupRef = useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null)

  // Helper to dispatch a dock action and persist the result
  const dispatch = useCallback(
    (action: DockAction) => {
      const newLayout = transition(layout, action)
      if (newLayout === layout) return // no-op
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const db = yield* Database
          yield* db.updateWorkspaceLayout(workspace.id, newLayout)
        }),
      )
    },
    [layout, workspace.id],
  )

  // Helper to blur terminal focus (prevents aria-hidden focus warning when collapsing)
  const blurTerminal = useCallback(() => {
    const terminalEl = document.querySelector('[data-testid="ghostty-terminal"]')
    if (!terminalEl) return

    // Check if focus is within the terminal (could be textarea, canvas container, or other elements)
    if (terminalEl.contains(document.activeElement)) {
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+` to toggle terminal (Cmd+` is system window switching on macOS)
      if (e.ctrlKey && e.code === "Backquote") {
        e.preventDefault()

        // Skip synthetic events dispatched by the terminal's shortcut interceptor
        // The window capture handler already sees the original event first
        if (!e.isTrusted) return

        const terminalEl = document.querySelector('[data-testid="ghostty-terminal"]')
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
    [isTerminalExpanded, debouncedSaveTerminalSize, terminalDock],
  )

  // Reset bottom panel size when toggling collapse state
  useEffect(() => {
    if (!taskBottomPanelGroupRef.current) return
    const bottomPanel = taskDock === "bottom" ? "task" : gitDock === "bottom" ? "git" : null
    if (!bottomPanel) return

    const isCollapsed = bottomPanel === "task" ? isTaskCollapsed : isGitCollapsed
    const size = bottomPanel === "task" ? taskSize : gitSize
    const layout = isCollapsed ? [100, 0] : [100 - size, size]
    taskBottomPanelGroupRef.current.setLayout(layout)
  }, [isTaskCollapsed, isGitCollapsed, taskSize, gitSize, taskDock, gitDock])

  // Reset outer panel group (gitPanelGroupRef) layout when dock positions or collapse states change
  // This group can have 2-4 panels: [git-left?] [task-left?] [center] [task-right?] [git-right?]
  useEffect(() => {
    if (!gitPanelGroupRef.current) return
    // skip if both git and task are at bottom (only center panel present)
    if ((gitDock === "bottom" || gitDock === null) && (taskDock === "bottom" || taskDock === null))
      return

    // build layout array based on which panels are present (in order)
    const layout: number[] = []

    // git-left (order 0)
    if (gitDock === "left") {
      layout.push(isGitCollapsed ? 0 : gitSize)
    }
    // task-left (order 1)
    if (taskDock === "left") {
      layout.push(isTaskCollapsed ? 0 : taskSize)
    }
    // center is always present - will be calculated as remainder
    const centerIndex = layout.length
    layout.push(0) // placeholder
    // task-right (order 3)
    if (taskDock === "right") {
      layout.push(isTaskCollapsed ? 0 : taskSize)
    }
    // git-right (order 4)
    if (gitDock === "right") {
      layout.push(isGitCollapsed ? 0 : gitSize)
    }

    // calculate center size as remainder
    const usedSize = layout.reduce((sum, size) => sum + size, 0)
    layout[centerIndex] = 100 - usedSize

    gitPanelGroupRef.current.setLayout(layout)
  }, [isGitCollapsed, isTaskCollapsed, gitSize, taskSize, gitDock, taskDock])

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
      // Use the pane machine to open files - this serializes the operation
      // with close operations ensuring they complete in order.
      machine.send({ type: "pane.file.open", filePath })
    }
  }

  // Git panel file clicks open in diff view mode
  const handleGitFileClick = (filePath: AbsolutePath, baseRef?: string, targetRef?: string) => {
    if (workspace?.path) {
      machine.send({ type: "pane.file.open", filePath, viewKind: "diff", baseRef, targetRef })
    }
  }

  // Commit file clicks show diff for that specific commit vs its parent
  const handleCommitFileClick = (filePath: AbsolutePath, commitHash: string) => {
    handleGitFileClick(filePath, `${commitHash}^`, commitHash)
  }

  if (isMobile) {
    return (
      <ClaudeIntegrationProvider
        workspacePath={workspace.path}
        enabled={!isTerminalCollapsed}
        machine={machine}
      >
        <AppSidebar
          onFileClick={handleFileClick}
          workspace={workspace}
          selectedFilePath={selectedFilePath}
        />
        <div className="flex flex-col h-full w-full overflow-hidden">
          <main className="bg-background relative flex w-full flex-1 flex-col overflow-hidden rounded-xl shadow-sm p-2">
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
          <WorkspaceStatusBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        </div>
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

  // Note: No border class needed - ResizableHandle provides the visual divider

  // The toolbar content - same for all dock positions, h-10 + border-b to match editor header
  const toolbarContent = (
    <div className="h-10 shrink-0 w-full bg-background/50 flex items-center justify-between px-4 overflow-hidden border-b">
      {/* Left side: terminal status + dock position */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <TerminalStatusBadge />
        <DockPositionDropdown currentDock={terminalDock} onDockChange={setTerminalDock} />
      </div>
      {/* Right side: badges, task toggle, delete, collapse */}
      <div className="flex items-center gap-2 flex-shrink-0">
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

  // Task toolbar content - h-10 + border-b to match editor header
  const taskToolbarContent = (
    <div className="h-10 shrink-0 w-full bg-background/50 flex items-center justify-between px-4 overflow-hidden border-b">
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <ListTodo
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isTaskExpanded ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        />
        <DockPositionDropdown currentDock={taskDock} onDockChange={setTaskDock} />
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

  // Git toolbar content - h-10 + border-b to match editor header
  const gitToolbarContent = (
    <div className="h-10 shrink-0 w-full bg-background/50 flex items-center justify-between px-4 overflow-hidden border-b">
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <GitBranch
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isGitExpanded ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        />
        <DockPositionDropdown currentDock={gitDock} onDockChange={setGitDock} />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setGitExpanded(!isGitExpanded)}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label={isGitCollapsed ? "show git" : "hide git"}
        >
          {isGitCollapsed ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )

  // Determine which panel (if any) is docked at bottom
  const bottomDockedPanel = taskDock === "bottom" ? "task" : gitDock === "bottom" ? "git" : null
  const bottomPanelCollapsed = bottomDockedPanel === "task" ? isTaskCollapsed : isGitCollapsed
  const bottomPanelSize = bottomDockedPanel === "task" ? taskSize : gitSize

  const editorPanel = (
    <ResizablePanel
      id="editor-panel"
      defaultSize={isTerminalCollapsed ? 100 : 100 - terminalSize}
      minSize={30}
    >
      {bottomDockedPanel ? (
        <ResizablePanelGroup ref={taskBottomPanelGroupRef} direction="vertical" className="h-full">
          <ResizablePanel
            id="editor-main-panel"
            order={1}
            defaultSize={bottomPanelCollapsed ? 100 : 100 - bottomPanelSize}
            minSize={30}
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
              order={2}
              defaultSize={isTaskCollapsed ? 0 : taskSize}
              minSize={isTaskCollapsed ? 0 : 15}
              maxSize={isTaskCollapsed ? 0 : 50}
              className={isTaskCollapsed ? "grow-0! shrink-0! basis-auto!" : ""}
            >
              <div ref={taskPanelRef} className="flex h-full w-full flex-col">
                {!isTaskCollapsed && taskToolbarContent}
                <div
                  className={cn(
                    "flex-1 min-h-0 min-w-0 overflow-hidden",
                    isTaskCollapsed && "hidden",
                  )}
                >
                  <TaskTable />
                </div>
              </div>
            </ResizablePanel>
          ) : (
            <ResizablePanel
              id="git-panel-bottom"
              order={2}
              defaultSize={isGitCollapsed ? 0 : gitSize}
              minSize={isGitCollapsed ? 0 : 15}
              maxSize={isGitCollapsed ? 0 : 50}
              className={isGitCollapsed ? "grow-0! shrink-0! basis-auto!" : ""}
            >
              <div ref={gitPanelRef} className="flex h-full w-full flex-col">
                {!isGitCollapsed && gitToolbarContent}
                <div
                  className={cn(
                    "flex-1 min-h-0 min-w-0 overflow-hidden",
                    isGitCollapsed && "hidden",
                  )}
                >
                  <GitPanel
                    workspacePath={workspace.path}
                    onFileClick={handleGitFileClick}
                    onCommitFileClick={handleCommitFileClick}
                  />
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
      defaultSize={isTerminalCollapsed ? 0 : terminalSize}
      minSize={isTerminalCollapsed ? 0 : terminalConstraints.min}
      maxSize={isTerminalCollapsed ? 0 : terminalConstraints.max}
      className={isTerminalCollapsed ? "grow-0! shrink-0! basis-auto!" : ""}
    >
      <div ref={terminalPanelRef} className="flex h-full w-full flex-col">
        {/* Horizontal toolbar at top for all dock positions (hidden when collapsed — status bar provides toggle) */}
        {!isTerminalCollapsed && toolbarContent}

        {/* Terminal content area */}
        <div
          className={cn("flex-1 min-h-0 min-w-0 overflow-hidden", isTerminalCollapsed && "hidden")}
        >
          {isTerminalSessionActive && terminalContainerEl && (
            <TerminalMountPoint containerEl={terminalContainerEl} onMount={handleTerminalMount} />
          )}
          {terminalError && (
            <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 text-red-100 px-4 py-2 text-sm font-mono">
              {terminalError}
            </div>
          )}
        </div>
      </div>
    </ResizablePanel>
  )

  return (
    <ClaudeIntegrationProvider
      workspacePath={workspace.path}
      enabled={!isTerminalCollapsed}
      machine={machine}
    >
      <ResizablePanelGroup direction="horizontal" className="h-screen">
        <ResizablePanel
          id="sidebar-panel"
          order={1}
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
          />
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className={cn("w-0", !sidebarOpen && "[&>div]:translate-x-1.5")}
        />
        <ResizablePanel
          id="main-content-panel"
          order={2}
          defaultSize={85}
          className="p-2 overflow-hidden"
        >
          <div className="flex flex-col h-full bg-background rounded-xl shadow-sm overflow-hidden">
            <ResizablePanelGroup
              ref={gitPanelGroupRef}
              direction="horizontal"
              className="flex-1 min-h-0"
            >
              {/* Left git panel - full height */}
              {gitDock === "left" && (
                <>
                  <ResizablePanel
                    id="git-panel-left"
                    order={0}
                    defaultSize={isGitCollapsed ? 0 : gitSize}
                    minSize={isGitCollapsed ? 0 : 15}
                    maxSize={isGitCollapsed ? 0 : 50}
                    className={isGitCollapsed ? "grow-0! shrink-0! basis-auto!" : ""}
                  >
                    <div ref={gitPanelRef} className="flex h-full w-full flex-col">
                      {!isGitCollapsed && gitToolbarContent}
                      <div
                        className={cn(
                          "flex-1 min-h-0 min-w-0 overflow-hidden",
                          isGitCollapsed && "hidden",
                        )}
                      >
                        <GitPanel
                          workspacePath={workspace.path}
                          onFileClick={handleGitFileClick}
                          onCommitFileClick={handleCommitFileClick}
                        />
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
                    order={1}
                    defaultSize={isTaskCollapsed ? 0 : taskSize}
                    minSize={isTaskCollapsed ? 0 : 15}
                    maxSize={isTaskCollapsed ? 0 : 50}
                    className={isTaskCollapsed ? "grow-0! shrink-0! basis-auto!" : ""}
                  >
                    <div ref={taskPanelRef} className="flex h-full w-full flex-col">
                      {!isTaskCollapsed && taskToolbarContent}
                      <div
                        className={cn(
                          "flex-1 min-h-0 min-w-0 overflow-hidden",
                          isTaskCollapsed && "hidden",
                        )}
                      >
                        <TaskTable />
                      </div>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle className={isTaskCollapsed ? "invisible" : ""} />
                </>
              )}

              {/* Center panel */}
              <ResizablePanel
                id="center-panel"
                order={2}
                defaultSize={isTaskCollapsed || taskDock === "bottom" ? 100 : 100 - taskSize}
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
                  <ResizableHandle withHandle className={isTaskCollapsed ? "invisible" : ""} />
                  <ResizablePanel
                    id="task-panel-right"
                    order={3}
                    defaultSize={isTaskCollapsed ? 0 : taskSize}
                    minSize={isTaskCollapsed ? 0 : 15}
                    maxSize={isTaskCollapsed ? 0 : 50}
                    className={isTaskCollapsed ? "grow-0! shrink-0! basis-auto!" : ""}
                  >
                    <div ref={taskPanelRef} className="flex h-full w-full flex-col">
                      {!isTaskCollapsed && taskToolbarContent}
                      <div
                        className={cn(
                          "flex-1 min-h-0 min-w-0 overflow-hidden",
                          isTaskCollapsed && "hidden",
                        )}
                      >
                        <TaskTable />
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
                    order={4}
                    defaultSize={isGitCollapsed ? 0 : gitSize}
                    minSize={isGitCollapsed ? 0 : 15}
                    maxSize={isGitCollapsed ? 0 : 50}
                    className={isGitCollapsed ? "grow-0! shrink-0! basis-auto!" : ""}
                  >
                    <div ref={gitPanelRef} className="flex h-full w-full flex-col">
                      {!isGitCollapsed && gitToolbarContent}
                      <div
                        className={cn(
                          "flex-1 min-h-0 min-w-0 overflow-hidden",
                          isGitCollapsed && "hidden",
                        )}
                      >
                        <GitPanel
                          workspacePath={workspace.path}
                          onFileClick={handleGitFileClick}
                          onCommitFileClick={handleCommitFileClick}
                        />
                      </div>
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
            <WorkspaceStatusBar
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
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

  // Pane machine for quick open file selection (serializes with tab operations)
  const workspaceIdEncoded = encodeBase64Url(workspace.path)
  const machine = usePaneMachine(paneId, workspace.path, workspaceIdEncoded)

  const setIsCreatingInContext = useSetAtom(isCreatingInContextAtom)
  const setContextItemName = useSetAtom(contextItemNameAtom)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isNewFile = (e.metaKey || e.ctrlKey) && (e.key === "n" || e.key === "N")

      if (isNewFile) {
        e.preventDefault()
        // if focused within CodeMirror, let its own handler dispatch the save event
        const target = e.target as EventTarget | null
        const isInCodeMirror = target instanceof Element && !!target.closest(".cm-editor")
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
      <QuickOpen workspacePath={workspace.path} machine={machine} />
    </>
  )
}
