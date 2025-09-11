/**
 * This route is matched when a workspace is open.
 * If thee workspace path is not valid, it redirects to the home route.
 */

import { useEffect } from "react"
import { RootLayout } from "@/layout"
import { localStorageService, setWorkspace } from "@/services/storage"
import {
  createFileRoute,
  ErrorComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"

import {
  contextItemNameAtom,
  isCreatingInContextAtom,
  saveFileAtom,
  selectedFilePathAtom,
} from "@/lib/atoms/atoms"
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
    const exists = await pathExists(workspacePath)
    if (!exists) {
      // redirect to home with workspace path as search param
      throw redirect({
        to: "/",
        search: { notFoundPath: workspacePath },
      })
    }

    const workspace = {
      path: workspacePath,
      name: workspacePath.split("/").pop() || "spacecake",
    }

    return {
      workspace,
    }
  },
  pendingComponent: () => (
    <div className="p-4 text-sm text-muted-foreground">loading workspace…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: WorkspaceLayout,
})

function WorkspaceLayout() {
  const { workspace } = Route.useLoaderData()
  const selectedFilePath = useAtomValue(selectedFilePathAtom)
  const saveFile = useSetAtom(saveFileAtom)
  const setIsCreatingInContext = useSetAtom(isCreatingInContextAtom)
  const setContextItemName = useSetAtom(contextItemNameAtom)

  // Effect to load workspace data when the workspace path changes
  useEffect(() => {
    if (workspace.path) {
      // initialize all workspace-specific state
      setWorkspace(localStorageService, workspace)
    }
  }, [workspace.path, setWorkspace])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSave =
        (e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")
      const isNewFile =
        (e.metaKey || e.ctrlKey) && (e.key === "n" || e.key === "N")

      if (isSave) {
        e.preventDefault()
        // if focused within CodeMirror, let its own handler dispatch the save event
        const target = e.target as EventTarget | null
        const isInCodeMirror =
          target instanceof Element && !!target.closest(".cm-editor")
        if (isInCodeMirror) return
        void saveFile()
      }

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
  }, [saveFile, workspace?.path, setIsCreatingInContext, setContextItemName])

  return (
    <>
      <WorkspaceWatcher workspace={workspace} />
      <RootLayout
        workspace={workspace}
        selectedFilePath={selectedFilePath}
        headerRightContent={
          selectedFilePath ? (
            <div className="flex items-center gap-3">
              <EditorToolbar onSave={saveFile} />
              <ModeToggle />
            </div>
          ) : (
            <div className="px-4">
              <ModeToggle />
            </div>
          )
        }
      >
        <Outlet />
      </RootLayout>
      <QuickOpen workspace={workspace} />
    </>
  )
}
