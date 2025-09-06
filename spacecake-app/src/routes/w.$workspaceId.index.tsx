import React, { useEffect } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Schema } from "effect"
import { useSetAtom } from "jotai"
import { AlertCircleIcon } from "lucide-react"

import type { EditorTab, EditorTabGroup } from "@/types/editor"
import { EditorLayoutSchema } from "@/types/editor"
import { readEditorLayoutAtom } from "@/lib/atoms/storage"
import { pathExists } from "@/lib/fs"
import { decodeBase64Url, encodeBase64Url } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"

type LoaderData = { kind: "notFound"; filePath: string } | { kind: "empty" }

export const Route = createFileRoute("/w/$workspaceId/")({
  loader: async ({ params }): Promise<LoaderData> => {
    // we need to load the layout synchronously in the loader
    // since we can't use atoms in the loader, we'll need to read from localStorage directly
    const workspacePath = decodeBase64Url(params.workspaceId)
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
          const fileExists = await pathExists(activeTab.filePath)
          if (fileExists) {
            throw redirect({
              to: "/w/$workspaceId/f/$",
              params: {
                workspaceId: params.workspaceId,
                _splat: encodeBase64Url(activeTab.filePath),
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
  const readLayout = useSetAtom(readEditorLayoutAtom)

  const workspacePath = decodeBase64Url(workspaceId)

  // load the editor layout when component mounts (for cases where loader didn't redirect)
  useEffect(() => {
    readLayout(workspacePath)
  }, [workspacePath, readLayout])

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
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-muted-foreground">
          no file open
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          select a file from the sidebar or use quick open (⌘+P)
        </p>
      </div>
    </div>
  )
}
