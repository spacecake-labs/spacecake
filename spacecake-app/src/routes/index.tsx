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
import { Match, Option, Schema } from "effect"
import { AlertCircleIcon, FolderOpen, Loader2Icon } from "lucide-react"

import { match } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"
import {
  WorkspaceError,
  WorkspaceErrorSchema,
  WorkspaceNotAccessible,
  WorkspaceNotFound,
} from "@/types/workspace-error"
import { exists } from "@/lib/fs"
import { useOpenWorkspace } from "@/lib/open-workspace"
import { encodeBase64Url } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { LoadingAnimation } from "@/components/loading-animation"
import { ModeToggle } from "@/components/mode-toggle"

const SearchParamsSchema = Schema.standardSchemaV1(
  Schema.Struct({
    workspaceError: Schema.optional(WorkspaceErrorSchema),
  })
)

export const Route = createFileRoute("/")({
  validateSearch: SearchParamsSchema,
  component: Index,
  beforeLoad: ({ search }) => {
    // Pass search params to loader via context
    return { searchWorkspaceError: search.workspaceError }
  },
  loader: async ({ context }) => {
    const { db, searchWorkspaceError } = context
    const homeFolderPath = await window.electronAPI.getHomeFolderPath()

    // If we were redirected here with a workspace error, don't auto-redirect back
    // (this prevents infinite loops when workspace exists but can't be read)
    if (searchWorkspaceError) {
      return { workspaceError: Option.some(searchWorkspaceError) }
    }

    const lastOpenedWorkspace = await RuntimeClient.runPromise(
      db.selectLastOpenedWorkspace
    )
    if (Option.isSome(lastOpenedWorkspace)) {
      const workspacePath = AbsolutePath(lastOpenedWorkspace.value.path)
      const pathExists = await exists(workspacePath)
      return match(pathExists, {
        onLeft: (error) => {
          // Map file system error to workspace error using Match.tag
          const workspaceError = Match.value(error).pipe(
            Match.tag(
              "PermissionDeniedError",
              () => new WorkspaceNotAccessible({ path: workspacePath })
            ),
            Match.orElse(() => new WorkspaceNotFound({ path: workspacePath }))
          )
          return { workspaceError: Option.some(workspaceError) }
        },
        onRight: (pathExists) => {
          if (pathExists) {
            const id = encodeBase64Url(workspacePath)
            throw redirect({
              to: "/w/$workspaceId",
              params: { workspaceId: id },
            })
          }
          return {
            workspaceError: Option.some(
              new WorkspaceNotFound({ path: workspacePath })
            ),
          }
        },
      })
    }

    // no last opened workspace - open home folder with getting-started guide
    const gettingStartedPath = `${homeFolderPath}/.app/getting-started.md`
    throw redirect({
      to: "/w/$workspaceId/f/$filePath",
      params: {
        workspaceId: encodeBase64Url(homeFolderPath),
        filePath: encodeBase64Url(gettingStartedPath),
      },
    })
  },
  pendingComponent: () => <LoadingAnimation />,
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
})

function Index() {
  const loaderData = Route.useLoaderData()
  const searchData = Route.useSearch()

  // Get workspace error from loader data or search params
  const workspaceError: WorkspaceError | null =
    (loaderData?.workspaceError &&
      Option.getOrNull(loaderData.workspaceError)) ??
    searchData.workspaceError ??
    null

  const { handleOpenWorkspace, isOpen: fileExplorerIsOpen } = useOpenWorkspace()

  return (
    <div className="flex flex-col h-screen">
      <header className="flex h-16 shrink-0 items-center justify-end px-4">
        <ModeToggle />
      </header>
      <main className="flex-1 flex flex-col items-center justify-center h-full space-y-4">
        {workspaceError && (
          <div className="w-full max-w-md">
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>
                {Match.value(workspaceError).pipe(
                  Match.tag("WorkspaceNotFound", () => "workspace not found:"),
                  Match.tag(
                    "WorkspaceNotAccessible",
                    () => "workspace not accessible:"
                  ),
                  Match.exhaustive
                )}
                {"\n"}
                <code className="font-mono text-xs break-all">
                  {workspaceError.path}
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
