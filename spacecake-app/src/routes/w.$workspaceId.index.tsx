/**
 * This route is matched when a workspace is open but no file is open.
 *
 */

import { useEffect } from "react"
import { localStorageService, updateRecentFiles } from "@/services/storage"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Schema } from "effect"
import { AlertCircleIcon, CakeSlice } from "lucide-react"

import type { EditorTab, EditorTabGroup } from "@/types/editor"
import { EditorLayoutSchema } from "@/types/editor"
import { pathExists } from "@/lib/fs"
import { condensePath, decodeBase64Url, encodeBase64Url } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CommandShortcut } from "@/components/ui/command"

type LoaderData = { kind: "notFound"; filePath: string } | { kind: "empty" }

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
  loader: async ({ params, deps }): Promise<LoaderData> => {
    const { notFoundFilePath } = deps
    const workspacePath = decodeBase64Url(params.workspaceId)

    if (notFoundFilePath) {
      return { kind: "notFound", filePath: notFoundFilePath }
    }

    // we need to load the layout synchronously in the loader
    // since we can't use atoms in the loader, we'll need to read from localStorage directly
    const workspaceId = workspacePath.replace(/[^a-zA-Z0-9]/g, "_")
    const storageKey = `spacecake:editor-layout:${workspaceId}`
    const stored = localStorage.getItem(storageKey)

    if (stored) {
      const parsed = JSON.parse(stored)
      const layout = Schema.decodeUnknownSync(EditorLayoutSchema)(parsed)

      if (layout.tabGroups && layout.activeTabGroupId) {
        const activeGroup = layout.tabGroups.find(
          (g: EditorTabGroup) => g.id === layout.activeTabGroupId
        )
        const activeTab = activeGroup?.tabs.find(
          (t: EditorTab) => t.id === activeGroup.activeTabId
        )

        if (activeTab) {
          // check if file is within the current workspace
          if (!activeTab.filePath.startsWith(workspacePath)) {
            // file is from a different workspace, just show empty state
            // (user switched workspaces, this is normal)
            return { kind: "empty" }
          }

          const fileExists = await pathExists(activeTab.filePath)
          if (fileExists) {
            throw redirect({
              to: "/w/$workspaceId/f/$filePath",
              params: {
                workspaceId: params.workspaceId,
                filePath: encodeBase64Url(activeTab.filePath),
              },
            })
          } else {
            // file no longer exists, return the file path so we can show the alert
            return { kind: "notFound", filePath: activeTab.filePath }
          }
        }
      }
    }

    return { kind: "empty" }
  },
  component: WorkspaceIndex,
})

function WorkspaceIndex() {
  const { workspaceId } = Route.useParams()
  const data = Route.useLoaderData()
  const workspacePath = decodeBase64Url(workspaceId)

  // if a file was not found, remove it from recent files
  useEffect(() => {
    if (data.kind === "notFound") {
      updateRecentFiles(localStorageService, {
        type: "remove",
        filePath: data.filePath,
        workspacePath,
      })
    }
  }, [data, workspacePath])

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
