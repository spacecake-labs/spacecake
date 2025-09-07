import React, { useEffect, useMemo } from "react"
import {
  createFileRoute,
  ErrorComponent,
  redirect,
} from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"

import type { RecentFile } from "@/types/storage"
import {
  baselineFileAtom,
  editorStateAtom,
  fileContentAtom,
  selectedFilePathAtom,
  workspaceAtom,
} from "@/lib/atoms/atoms"
import { addRecentFileAtom, openFileAtom } from "@/lib/atoms/storage"
import { createEditorConfigFromContent } from "@/lib/editor"
import { readFile } from "@/lib/fs"
import { decodeBase64Url } from "@/lib/utils"
import { Editor } from "@/components/editor/editor"

export const Route = createFileRoute("/w/$workspaceId/f/$")({
  loader: async ({ params }) => {
    const workspacePath = decodeBase64Url(params.workspaceId)
    // the catch-all $ is mapped to _splat in TS types
    const filePath = decodeBase64Url(params._splat as string)

    // ensure file belongs to workspace by prefix (best-effort client guard)
    if (!filePath.startsWith(workspacePath)) {
      throw new Error("file not in workspace")
    }
    const file = await readFile(filePath)

    if (!file) {
      // clean up persisted state before redirecting
      // we need to access the atoms directly since we can't use hooks in the loader
      const workspaceId = workspacePath.replace(/[^a-zA-Z0-9]/g, "_")

      // remove from recent files
      const recentFilesKey = `spacecake:recent-files:${workspaceId}`
      const storedRecentFiles = localStorage.getItem(recentFilesKey)
      if (storedRecentFiles) {
        try {
          const recentFiles = JSON.parse(storedRecentFiles) as RecentFile[]
          const updatedFiles = recentFiles.filter(
            (f: RecentFile) => f.path !== filePath
          )
          localStorage.setItem(recentFilesKey, JSON.stringify(updatedFiles))
        } catch (error) {
          console.warn("failed to clean up recent files:", error)
        }
      }

      // redirect to workspace root with file path as search param
      return redirect({
        to: "/w/$workspaceId",
        params: { workspaceId: params.workspaceId },
        search: { notFoundFilePath: filePath },
      })
    }
    return { filePath, file }
  },
  pendingComponent: () => (
    <div className="p-2 text-xs text-muted-foreground">loading file…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: FileLayout,
})

function FileLayout() {
  const data = Route.useLoaderData()

  // if we get here, the loader didn't redirect, so we have file data
  if (!("file" in data) || !("filePath" in data)) {
    return null
  }

  const setSelected = useSetAtom(selectedFilePathAtom)
  const setFile = useSetAtom(fileContentAtom)
  const setEditorState = useSetAtom(editorStateAtom)
  const setBaseline = useSetAtom(baselineFileAtom)
  const addRecentFile = useSetAtom(addRecentFileAtom)
  const openFile = useSetAtom(openFileAtom)
  const workspace = useAtomValue(workspaceAtom)

  // Create editor config for this specific file
  const editorConfig = useMemo(() => {
    return createEditorConfigFromContent(data.file, "block") // Default to block view
  }, [data.file, data.filePath])

  // Set up atoms when component mounts
  useEffect(() => {
    // Set atoms for this file
    setSelected(data.filePath)
    setFile(data.file)
    setBaseline({ path: data.file.path, content: data.file.content })

    if (workspace?.path) {
      // only add to recent files if the file belongs to the current workspace
      if (data.file.path.startsWith(workspace.path)) {
        addRecentFile(data.file, workspace.path)
      }

      // open file in tab layout (handles existing tabs properly)
      openFile(data.filePath, workspace.path)
    }
  }, [
    data,
    setSelected,
    setFile,
    setBaseline,
    addRecentFile,
    openFile,
    workspace,
  ])

  return (
    <>
      {editorConfig && (
        <Editor
          key={data.filePath}
          editorConfig={editorConfig}
          onSerializedChange={(value) => {
            setEditorState(value)
          }}
        />
      )}
    </>
  )
}
