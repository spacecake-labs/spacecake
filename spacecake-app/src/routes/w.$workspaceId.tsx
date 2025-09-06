import React, { useEffect } from "react"
import { RootLayout } from "@/layout"
import {
  createFileRoute,
  ErrorComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"

import { saveFileAtom, selectedFilePathAtom } from "@/lib/atoms/atoms"
import { loadWorkspaceAtom } from "@/lib/atoms/workspace"
import { pathExists } from "@/lib/fs"
import { decodeBase64Url } from "@/lib/utils"
import { WorkspaceWatcher } from "@/lib/workspace-watcher"
// toolbar renders the save button
import { EditorToolbar } from "@/components/editor/toolbar"
import { ModeToggle } from "@/components/mode-toggle"
import { QuickOpen } from "@/components/quick-open"

export const Route = createFileRoute("/w/$workspaceId")({
  loader: async ({ params }) => {
    const workspacePath = decodeBase64Url(params.workspaceId)
    // check if workspace path exists
    const exists = await pathExists(workspacePath)
    if (!exists) {
      // redirect to home with workspace path as search param
      throw redirect({
        to: "/",
        search: { notFoundPath: workspacePath },
      })
    }
    return {
      workspace: {
        path: workspacePath,
        name: workspacePath.split("/").pop() || "spacecake",
      },
    }
  },
  pendingComponent: () => (
    <div className="p-4 text-sm text-muted-foreground">loading workspace…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: WorkspaceLayout,
})

function WorkspaceLayout() {
  const data = Route.useLoaderData()

  const { workspace } = data
  const selectedFilePath = useAtomValue(selectedFilePathAtom)
  const saveFile = useSetAtom(saveFileAtom)

  // Effect to load workspace data when the workspace path changes
  const loadWorkspace = useSetAtom(loadWorkspaceAtom)

  // Effect to load workspace when workspace path changes
  useEffect(() => {
    if (workspace.path) {
      loadWorkspace(workspace)
    }
  }, [workspace.path, loadWorkspace])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSave =
        (e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")
      if (isSave) {
        e.preventDefault()
        // if focused within CodeMirror, let its own handler dispatch the save event
        const target = e.target as EventTarget | null
        const isInCodeMirror =
          target instanceof Element && !!target.closest(".cm-editor")
        if (isInCodeMirror) return
        void saveFile()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
    }
  }, [saveFile])

  return (
    <>
      <WorkspaceWatcher />
      <RootLayout
        selectedFilePath={selectedFilePath}
        headerRightContent={
          selectedFilePath ? (
            <div className="flex items-center gap-3">
              <EditorToolbar onSave={saveFile} />
              <ModeToggle />
            </div>
          ) : undefined
        }
      >
        <Outlet />
      </RootLayout>
      <QuickOpen />
    </>
  )
}
