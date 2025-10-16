/**
 * This route is matched when a workspace is open but no file is open.
 *
 */

import { RuntimeClient } from "@/services/runtime-client"
import {
  createFileRoute,
  ErrorComponent,
  redirect,
} from "@tanstack/react-router"
import { Option } from "effect"
import { AlertCircleIcon, CakeSlice } from "lucide-react"

import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"
import { exists } from "@/lib/fs"
import { condensePath, decodeBase64Url, encodeBase64Url } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CommandShortcut } from "@/components/ui/command"

export const Route = createFileRoute("/w/$workspaceId/")({
  validateSearch: (
    search: Record<string, unknown>
  ): { notFoundFilePath?: string } => {
    return {
      notFoundFilePath: search.notFoundFilePath as string | undefined,
    }
  },
  loaderDeps: ({ search }) => ({
    notFoundFilePath: search.notFoundFilePath,
  }),
  loader: async ({ params, deps, context: { db } }) => {
    const { notFoundFilePath } = deps
    const workspacePath = AbsolutePath(decodeBase64Url(params.workspaceId))

    if (notFoundFilePath) {
      return { kind: "notFound", filePath: notFoundFilePath }
    }

    const activeEditor = await RuntimeClient.runPromise(
      (await db).selectLastOpenedEditor(workspacePath)
    )

    if (Option.isSome(activeEditor)) {
      const { viewKind, filePath } = activeEditor.value
      const absolutePath = AbsolutePath(filePath)

      const fileExists = await exists(absolutePath)

      return match(fileExists, {
        onLeft: (error) => {
          console.error(error)
          return { kind: "notFound", filePath: filePath }
        },
        onRight: async (exists) => {
          if (exists) {
            throw redirect({
              to: "/w/$workspaceId/f/$filePath",
              params: {
                workspaceId: params.workspaceId,
                filePath: encodeBase64Url(absolutePath),
              },
              search: {
                view: viewKind,
              },
            })
          }
          // file not found
          await RuntimeClient.runPromise((await db).deleteFile(absolutePath))
          return { kind: "notFound", filePath: absolutePath }
        },
      })
    }

    return { kind: "empty" }
  },
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: WorkspaceIndex,
})

function WorkspaceIndex() {
  const { workspaceId } = Route.useParams()
  const data = Route.useLoaderData()
  const workspacePath = AbsolutePath(decodeBase64Url(workspaceId))

  // if we have a not found file path, show the alert
  if (data.kind === "notFound") {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="w-full max-w-md">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>
              file not found:{"\n"}
              <code className="font-mono text-xs break-all">
                {data.filePath}
              </code>
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
        <p className="text-muted-foreground text-sm">
          {condensePath(workspacePath)}
        </p>
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
