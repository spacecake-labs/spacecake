/**
 * This route is matched when a workspace is open.
 * If the workspace path is not valid, it redirects to the home route.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { FileStateHydrationEvent } from "@/machines/file-tree"
import { ClaudeIntegrationProvider } from "@/providers/claude-integration-provider"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import type { DockPosition, WorkspaceLayout } from "@/schema/workspace-layout"
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
import { useSetAtom } from "jotai"
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  PanelBottom,
  PanelLeft,
  PanelRight,
} from "lucide-react"

import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"
import {
  WorkspaceNotAccessible,
  WorkspaceNotFound,
} from "@/types/workspace-error"
import { contextItemNameAtom, isCreatingInContextAtom } from "@/lib/atoms/atoms"
import { fileStateAtomFamily, setFileTreeAtom } from "@/lib/atoms/file-tree"
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
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const verticalPanelGroupRef =
    useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null)

  // this hook is still needed here because AppSidebar needs the path as a prop
  const route = useRoute()
  const selectedFilePath = route?.filePath || null

  // Get layout from database with live updates
  const { layout } = useWorkspaceLayout(workspace.id)
  const terminalDock = layout.panel.terminal.dock
  const dockState = layout.dock[terminalDock]
  const isTerminalExpanded = dockState.isExpanded
  const terminalSize = dockState.size
  const isTerminalCollapsed = !isTerminalExpanded

  const [isTerminalSessionActive, setIsTerminalSessionActive] = useState(true)

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

  // Helper to persist layout changes
  const updateLayout = useCallback(
    (updater: (current: WorkspaceLayout) => WorkspaceLayout) => {
      const newLayout = updater(layout)
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
      updateLayout((current) => ({
        ...current,
        dock: {
          ...current.dock,
          [current.panel.terminal.dock]: {
            ...current.dock[current.panel.terminal.dock],
            isExpanded: expanded,
          },
        },
      }))
    },
    [updateLayout]
  )

  const setTerminalDock = useCallback(
    (dock: DockPosition) => {
      updateLayout((current) => {
        const currentDock = current.panel.terminal.dock
        if (currentDock === dock) return current
        // Move terminal to new dock, preserving expanded state
        const wasExpanded = current.dock[currentDock].isExpanded
        return {
          ...current,
          dock: {
            ...current.dock,
            // Collapse old dock
            [currentDock]: { ...current.dock[currentDock], isExpanded: false },
            // Expand new dock
            [dock]: { ...current.dock[dock], isExpanded: wasExpanded },
          },
          panel: {
            ...current.panel,
            terminal: { ...current.panel.terminal, dock },
          },
        }
      })
    },
    [updateLayout]
  )

  // Track pending terminal size for debounced saves
  const pendingTerminalSizeRef = useRef<number | null>(null)

  // Keep updateLayout in a ref so debounced callback always has current version
  const updateLayoutRef = useRef(updateLayout)
  updateLayoutRef.current = updateLayout

  // Debounced save for terminal resize - only save after resize stops for 250ms
  const debouncedSaveTerminalSize = useRef(
    debounce(() => {
      const newSize = pendingTerminalSizeRef.current
      if (newSize !== null) {
        updateLayoutRef.current((current) => {
          const dock = current.panel.terminal.dock
          return {
            ...current,
            dock: {
              ...current.dock,
              [dock]: { ...current.dock[dock], size: newSize },
            },
          }
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

  const editorPanel = (
    <ResizablePanel
      defaultSize={isTerminalCollapsed ? 100 : 100 - terminalSize}
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
  )

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
      {/* Right side: badges, delete, collapse */}
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

  const terminalPanel = (
    <ResizablePanel
      defaultSize={isTerminalCollapsed ? 0 : terminalSize}
      minSize={isTerminalCollapsed ? 0 : 10}
      maxSize={isTerminalCollapsed ? 0 : 70}
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
          defaultSize={15}
          minSize={15}
          maxSize={40}
          className="flex flex-col h-full *:flex-1 *:min-h-0"
        >
          <AppSidebar
            onFileClick={handleFileClick}
            workspace={workspace}
            selectedFilePath={selectedFilePath}
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="w-0" />
        <ResizablePanel defaultSize={85} className="p-2 overflow-hidden">
          <div className="h-full flex flex-col bg-background rounded-xl shadow-sm overflow-hidden">
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
          <SidebarProvider>
            <LayoutContent />
          </SidebarProvider>
        </div>
      </>
    )
  }
  return (
    <>
      <WorkspaceWatcher workspacePath={workspace.path} />
      <div className="flex h-screen overflow-hidden">
        <SidebarProvider>
          <LayoutContent />
        </SidebarProvider>
      </div>
      <QuickOpen workspacePath={workspace.path} />
    </>
  )
}
