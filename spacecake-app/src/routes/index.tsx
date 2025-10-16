/**
 * This route is matched when a workspace is not open.
 * If a valid workspace path is found in storage, it redirects to the workspace route.
 */

import { RuntimeClient } from "@/services/runtime-client"
import {
  createFileRoute,
  ErrorComponent,
  redirect,
} from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { AlertCircleIcon, FolderOpen, Loader2Icon } from "lucide-react"

import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"
import { exists } from "@/lib/fs"
import { useOpenWorkspace } from "@/lib/open-workspace"
import { encodeBase64Url } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"

const NotFoundPathSchema = Schema.standardSchemaV1(
  Schema.Struct({
    notFoundPath: Schema.optional(Schema.String),
  })
)

export const Route = createFileRoute("/")({
  validateSearch: NotFoundPathSchema,
  component: Index,
  loader: async ({ context: { db } }) => {
    const lastOpenedWorkspace = await RuntimeClient.runPromise(
      (await db).selectLastOpenedWorkspace
    )
    if (Option.isSome(lastOpenedWorkspace)) {
      const workspacePath = AbsolutePath(lastOpenedWorkspace.value.path)
      const pathExists = await exists(workspacePath)
      return match(pathExists, {
        onLeft: (error) => {
          console.error(error)
          return { notFoundPath: Option.none() }
        },
        onRight: (pathExists) => {
          if (pathExists) {
            const id = encodeBase64Url(workspacePath)
            throw redirect({
              to: "/w/$workspaceId",
              params: { workspaceId: id },
            })
          }
          return { notFoundPath: Option.some(workspacePath) }
        },
      })
    }
    return { notFoundPath: Option.none() }
  },
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
})

function Index() {
  const notFoundPath =
    Option.getOrNull(Route.useLoaderData().notFoundPath) ??
    Route.useSearch().notFoundPath

  const { handleOpenWorkspace, isOpen: fileExplorerIsOpen } = useOpenWorkspace()

  return (
    <div className="flex flex-col h-screen">
      <header className="flex h-16 shrink-0 items-center justify-end px-4">
        <ModeToggle />
      </header>
      <main className="flex-1 flex flex-col items-center justify-center h-full space-y-4">
        {notFoundPath && (
          <div className="w-full max-w-md">
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>
                workspace not found:{"\n"}
                <code className="font-mono text-xs break-all">
                  {notFoundPath}
                </code>
              </AlertDescription>
            </Alert>
          </div>
        )}
        <div className="flex flex-col items-center space-y-3">
          <Button
            size="lg"
            className="text-base cursor-pointer"
            variant="outline"
            onClick={handleOpenWorkspace}
            disabled={fileExplorerIsOpen}
          >
            {fileExplorerIsOpen ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <FolderOpen />
            )}
            open folder
          </Button>
        </div>
      </main>
    </div>
  )
}
