/**
 * This route is matched when a workspace is open.
 * If the workspace path is not valid, it redirects to the home route.
 */

import { useEffect, useState } from "react"
import { Database } from "@/services/database"
import { RuntimeClient } from "@/services/runtime-client"
import {
  createFileRoute,
  ErrorComponent,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { Effect } from "effect"
import { useSetAtom } from "jotai"
import { Check, Copy } from "lucide-react"

import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"
import { contextItemNameAtom, isCreatingInContextAtom } from "@/lib/atoms/atoms"
import { setFileTreeAtom } from "@/lib/atoms/file-tree"
import { getFoldersToExpand } from "@/lib/auto-reveal"
import { exists, readDirectory } from "@/lib/fs"
import { store } from "@/lib/store"
import { condensePath, decodeBase64Url, encodeBase64Url } from "@/lib/utils"
import { WorkspaceWatcher } from "@/lib/workspace-watcher"
import { useRoute } from "@/hooks/use-route"
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
import { EditorToolbar } from "@/components/editor/toolbar"
import { LoadingAnimation } from "@/components/loading-animation"
import { ModeToggle } from "@/components/mode-toggle"
import { QuickOpen } from "@/components/quick-open"

export const Route = createFileRoute("/w/$workspaceId")({
  beforeLoad: async ({ params }) => {
    const workspacePath = AbsolutePath(decodeBase64Url(params.workspaceId))

    const pathExists = await exists(workspacePath)

    match(pathExists, {
      onLeft: (error) => console.error(error),
      onRight: (pathExists) => {
        if (!pathExists) {
          // redirect to home with workspace path as search param
          throw redirect({
            to: "/",
            search: { notFoundPath: workspacePath },
          })
        }
      },
    })

    const pane = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const db = yield* Database

        const workspace = yield* db.upsertWorkspace({
          path: workspacePath,
          is_open: true,
        })

        return yield* db.upsertPane({ workspace_id: workspace.id, position: 0 })
      })
    )

    return {
      workspace: {
        path: workspacePath,
        name: workspacePath.split("/").pop() || "spacecake",
      },
      paneId: pane.id,
    }
  },
  loader: async ({ context }) => {
    const { workspace } = context
    const result = await readDirectory(workspace.path)
    match(result, {
      onLeft: (error) => console.error(error),
      onRight: (tree) => {
        store.set(setFileTreeAtom, tree)
      },
    })

    return {
      workspace: {
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
      <div className="flex items-center gap-3 px-4">
        {route && <EditorToolbar routeContext={route} />}
        <ModeToggle variant="compact" />
      </div>
    )
  }
  return (
    <div className="px-4">
      <ModeToggle />
    </div>
  )
}

function LayoutContent() {
  const { workspace } = Route.useLoaderData()
  const { isMobile } = useSidebar()
  const navigate = useNavigate()

  // this hook is still needed here because AppSidebar needs the path as a prop
  const route = useRoute()
  const selectedFilePath = route?.filePath || null

  // compute folders to auto-reveal based on current file
  const foldersToExpand = selectedFilePath
    ? getFoldersToExpand(selectedFilePath, workspace.path)
    : []

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
      <>
        <AppSidebar
          onFileClick={handleFileClick}
          workspace={workspace}
          selectedFilePath={selectedFilePath}
          foldersToExpand={foldersToExpand}
        />
        <main className="bg-background relative flex w-full flex-1 flex-col overflow-auto rounded-xl shadow-sm h-full p-2">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger
                aria-label="toggle sidebar"
                className="-ml-1 cursor-pointer"
              />
              <FileHeader />
            </div>
            <HeaderToolbar />
          </header>
          <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
            <Outlet />
          </div>
        </main>
      </>
    )
  }
  return (
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
          foldersToExpand={foldersToExpand}
        />
      </ResizablePanel>
      <ResizableHandle withHandle className="w-0" />
      <ResizablePanel defaultSize={85} className="p-2">
        <main className="bg-background relative flex w-full flex-1 flex-col overflow-auto rounded-xl shadow-sm h-full">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger
                aria-label="toggle sidebar"
                className="-ml-1 cursor-pointer"
              />
              <FileHeader />
            </div>
            <HeaderToolbar />
          </header>
          <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
            <Outlet />
          </div>
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function WorkspaceLayout() {
  const { workspace } = Route.useLoaderData()

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

  return (
    <>
      <WorkspaceWatcher workspace={workspace} />
      <div className="flex h-screen">
        <SidebarProvider>
          <LayoutContent />
        </SidebarProvider>
      </div>
      <QuickOpen workspace={workspace} />
    </>
  )
}
