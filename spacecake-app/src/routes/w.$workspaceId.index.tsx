/**
 * This route is matched when a workspace is open but no file is open.
 *
 */

import { createFileRoute, ErrorComponent } from "@tanstack/react-router"
import { Option } from "effect"
import { AlertCircleIcon, CakeSlice } from "lucide-react"
import { useEffect, useRef } from "react"

import { LoadingAnimation } from "@/components/loading-animation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CommandShortcut } from "@/components/ui/command"
import { usePaneMachine } from "@/hooks/use-pane-machine"
import { exists } from "@/lib/fs"
import { condensePath, decodeBase64Url, normalizePath } from "@/lib/utils"
import { RuntimeClient } from "@/services/runtime-client"
import { match } from "@/types/adt"
import { ViewKind } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"

type LoaderResult =
  | { kind: "empty" }
  | { kind: "notFound"; filePath: string }
  | { kind: "restore"; filePath: AbsolutePath; viewKind: ViewKind }

export const Route = createFileRoute("/w/$workspaceId/")({
  validateSearch: (search: Record<string, unknown>): { notFoundFilePath?: string } => {
    return {
      notFoundFilePath: search.notFoundFilePath as string | undefined,
    }
  },
  loaderDeps: ({ search }) => ({
    notFoundFilePath: search.notFoundFilePath,
  }),
  loader: async ({ deps, context }): Promise<LoaderResult> => {
    const { db } = context
    const { notFoundFilePath } = deps
    const workspacePath = context.workspace.path

    if (notFoundFilePath) {
      return { kind: "notFound", filePath: notFoundFilePath }
    }

    const activeEditor = await RuntimeClient.runPromise(
      db.selectActiveEditorForWorkspace(workspacePath),
    )

    if (Option.isSome(activeEditor)) {
      const { viewKind, filePath } = activeEditor.value
      const absolutePath = AbsolutePath(filePath)

      const fileExists = await exists(absolutePath)

      return match(fileExists, {
        onLeft: (error) => {
          console.error(error)
          return { kind: "notFound", filePath: filePath } as LoaderResult
        },
        onRight: async (exists): Promise<LoaderResult> => {
          if (exists) {
            // Return restore info - component will use pane machine to navigate
            return { kind: "restore", filePath: absolutePath, viewKind }
          }
          // file not found
          await RuntimeClient.runPromise(db.deleteFile(absolutePath))
          return { kind: "notFound", filePath: absolutePath }
        },
      })
    }

    return { kind: "empty" }
  },
  pendingComponent: () => <LoadingAnimation />,
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: WorkspaceIndex,
})

function WorkspaceIndex() {
  const { workspaceId } = Route.useParams()
  const { workspace, paneId } = Route.useRouteContext()
  const data = Route.useLoaderData()
  const workspacePath = AbsolutePath(decodeBase64Url(workspaceId))

  // Get the pane machine for navigation
  const machine = usePaneMachine(paneId, workspace.path, workspaceId)

  // Track if we've already triggered the restore navigation
  const hasTriggeredRestore = useRef(false)

  // If there's an active editor to restore, use the pane machine to navigate
  useEffect(() => {
    if (data.kind === "restore" && !hasTriggeredRestore.current) {
      hasTriggeredRestore.current = true
      machine.send({
        type: "pane.file.open",
        filePath: data.filePath,
        viewKind: data.viewKind,
      })
    }
  }, [data, machine])

  // Show loading while restoring
  if (data.kind === "restore") {
    return <LoadingAnimation />
  }

  // if we have a not found file path, show the alert
  if (data.kind === "notFound") {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="w-full max-w-md">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>
              file not found:{"\n"}
              <code className="font-mono text-xs break-all">{normalizePath(data.filePath)}</code>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center">
      <div className="mb-8">
        <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4 mx-auto">
          <CakeSlice className="w-8 h-" />
        </div>
        <h1 className="text-2xl font-bold mb-2">spacecake</h1>
        <p className="text-muted-foreground text-sm">{condensePath(workspacePath)}</p>
      </div>
      <h3 className="text-sm font-medium m-3">commands</h3>
      <div className="w-full max-w-sm mx-auto grid grid-cols-1 gap-2 text-sm">
        <div className="flex justify-between items-center py-1">
          <span className="text-muted-foreground">quick open</span>
          <CommandShortcut>⌘P</CommandShortcut>
        </div>
        <div className="flex justify-between items-center py-1">
          <span className="text-muted-foreground">new file</span>
          <CommandShortcut>⌘N</CommandShortcut>
        </div>
      </div>
    </div>
  )
}
