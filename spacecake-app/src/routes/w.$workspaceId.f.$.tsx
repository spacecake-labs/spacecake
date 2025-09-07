import React, { useEffect, useMemo } from "react"
import {
  createFileRoute,
  ErrorComponent,
  redirect,
} from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"

import {
  baselineFileAtom,
  editorStateAtom,
  fileContentAtom,
  selectedFilePathAtom,
  workspaceAtom,
} from "@/lib/atoms/atoms"
import { manageRecentFilesAtom, openFileAtom } from "@/lib/atoms/storage"
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
      // file not found, redirect to workspace index and let it handle cleanup
      throw redirect({
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

  const setSelected = useSetAtom(selectedFilePathAtom)
  const setFile = useSetAtom(fileContentAtom)
  const setEditorState = useSetAtom(editorStateAtom)
  const setBaseline = useSetAtom(baselineFileAtom)
  const manageRecentFiles = useSetAtom(manageRecentFilesAtom)
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
      // add to recent files using the new centralized atom
      manageRecentFiles({
        type: "add",
        file: data.file,
        workspacePath: workspace.path,
      })

      // open file in tab layout (handles existing tabs properly)
      openFile(data.filePath, workspace.path)
    }
  }, [
    data,
    setSelected,
    setFile,
    setBaseline,
    manageRecentFiles,
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
