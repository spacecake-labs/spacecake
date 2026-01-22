/**
 * This route is matched when a workspace is open.
 * If the workspace path is not valid, it redirects to the home route.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { FileStateHydrationEvent } from "@/machines/file-tree"
import { ClaudeIntegrationProvider } from "@/providers/claude-integration-provider"
import { WorkspacePrimaryKey } from "@/schema/workspace"
import type { WorkspaceLayout } from "@/schema/workspace-layout"
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
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react"

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
import { useRoute } from "@/hooks/use-route"
import { useWorkspaceLayout } from "@/hooks/use-workspace-layout"
import { Button } from "@/components/ui/button"
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
import { GhosttyTerminal, TerminalAPI } from "@/components/ghostty-terminal"
import { LoadingAnimation } from "@/components/loading-animation"
import { ModeToggle } from "@/components/mode-toggle"
import { QuickOpen } from "@/components/quick-open"
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

function LayoutContent() {
  const { workspace } = Route.useRouteContext()
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const verticalPanelGroupRef =
    useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null)
  const terminalApiRef = useRef<TerminalAPI | null>(null)

  // this hook is still needed here because AppSidebar needs the path as a prop
  const route = useRoute()
  const selectedFilePath = route?.filePath || null

  // Get layout from database with live updates
  const { layout } = useWorkspaceLayout(workspace.id)
  const isTerminalExpanded = layout.dock.bottom.isExpanded
  const terminalSize = layout.dock.bottom.size
  const isTerminalCollapsed = !isTerminalExpanded

  const [isTerminalSessionActive, setIsTerminalSessionActive] = useState(true)

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
          bottom: { ...current.dock.bottom, isExpanded: expanded },
        },
      }))
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
        updateLayoutRef.current((current) => ({
          ...current,
          dock: {
            ...current.dock,
            bottom: { ...current.dock.bottom, size: newSize },
          },
        }))
        pendingTerminalSizeRef.current = null
      }
    }, 250)
  ).current

  // Handle terminal resize - debounce persistence to avoid excessive DB writes
  const handleTerminalResize = useCallback(
    (sizes: number[]) => {
      // sizes[1] is the terminal panel size
      const newSize = sizes[1]
      // Only persist if terminal is expanded and size is meaningful
      if (newSize > 0 && isTerminalExpanded) {
        pendingTerminalSizeRef.current = newSize
        debouncedSaveTerminalSize.schedule()
      }
    },
    [isTerminalExpanded, debouncedSaveTerminalSize]
  )

  // reset terminal panel size when toggling collapse state
  useEffect(() => {
    if (verticalPanelGroupRef.current) {
      // reset to layout: (100 - size)% for editor, size% for terminal
      verticalPanelGroupRef.current.setLayout(
        isTerminalCollapsed ? [100, 0] : [100 - terminalSize, terminalSize]
      )
      // when expanding, fit the terminal to the new size
      if (!isTerminalCollapsed && terminalApiRef.current) {
        // use requestAnimationFrame to ensure layout has settled
        requestAnimationFrame(() => {
          terminalApiRef.current?.fit()
        })
      }
    }
  }, [isTerminalCollapsed, terminalSize])

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
          className="flex flex-col h-full [&>*]:flex-1 [&>*]:min-h-0"
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
              direction="vertical"
              ref={verticalPanelGroupRef}
              onLayout={handleTerminalResize}
            >
              <ResizablePanel
                defaultSize={isTerminalCollapsed ? 100 : 70}
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
                className={isTerminalCollapsed ? "invisible" : ""}
              />
              <ResizablePanel
                defaultSize={isTerminalCollapsed ? 0 : 30}
                minSize={isTerminalCollapsed ? 0 : 10}
                maxSize={isTerminalCollapsed ? 0 : 70}
                className={
                  isTerminalCollapsed ? "grow-0! shrink-0! basis-auto!" : ""
                }
              >
                <div className="flex flex-col h-full w-full border-t">
                  <div
                    className={cn(
                      "h-8 w-full bg-background/50 flex items-center justify-between px-4",
                      !isTerminalCollapsed && "border-b"
                    )}
                  >
                    <TerminalStatusBadge />
                    <div className="flex items-center gap-2">
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
                        aria-label={
                          isTerminalCollapsed
                            ? "show terminal"
                            : "hide terminal"
                        }
                      >
                        {isTerminalCollapsed ? (
                          <ChevronUp className="cursor-pointer h-4 w-4" />
                        ) : (
                          <ChevronDown className="cursor-pointer h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex-1 overflow-hidden",
                      isTerminalCollapsed && "hidden"
                    )}
                  >
                    {isTerminalSessionActive && (
                      <GhosttyTerminal
                        id="main-terminal"
                        autoFocus={false}
                        cwd={workspace.path}
                        onReady={(api) => {
                          terminalApiRef.current = api
                        }}
                      />
                    )}
                  </div>
                </div>
              </ResizablePanel>
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
