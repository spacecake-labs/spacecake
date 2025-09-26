/**
 * This route is matched when a workspace is not open.
 * If a valid workspace path is found in storage, it redirects to the workspace route.
 */

import { RootLayout } from "@/layout"
import { RuntimeClient } from "@/services/runtime-client"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { AlertCircleIcon, FolderOpen, Loader2Icon } from "lucide-react"

import { pathExists } from "@/lib/fs"
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
      const workspace = lastOpenedWorkspace.value
      const exists = await pathExists(workspace.path)
      if (exists) {
        const id = encodeBase64Url(workspace.path)
        throw redirect({
          to: "/w/$workspaceId",
          params: { workspaceId: id },
        })
      }
      return { notFoundPath: Option.some(workspace.path) }
    }

    return { notFoundPath: Option.none() }
  },
})

function Index() {
  const notFoundPath =
    Option.getOrNull(Route.useLoaderData().notFoundPath) ??
    Route.useSearch().notFoundPath

  const { handleOpenWorkspace, isOpen: fileExplorerIsOpen } = useOpenWorkspace()

  return (
    <RootLayout
      workspace={{
        path: "",
        name: "workspace",
      }}
      selectedFilePath={null}
      headerRightContent={
        <div className="px-4">
          <ModeToggle />
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center h-full space-y-4">
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
      </div>
    </RootLayout>
  )
}
