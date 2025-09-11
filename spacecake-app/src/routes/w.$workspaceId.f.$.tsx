import { useEffect, useMemo } from "react"
import {
  localStorageService,
  openFile,
  updateRecentFiles,
} from "@/services/storage"
import {
  createFileRoute,
  ErrorComponent,
  redirect,
} from "@tanstack/react-router"
import { useSetAtom } from "jotai"

import {
  baselineFileAtom,
  editorStateAtom,
  fileContentAtom,
  selectedFilePathAtom,
} from "@/lib/atoms/atoms"
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
    return {
      workspace: {
        path: workspacePath,
        name: workspacePath.split("/").pop() || "spacecake",
      },
      filePath,
      file,
    }
  },
  pendingComponent: () => (
    <div className="p-2 text-xs text-muted-foreground">loading file…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: FileLayout,
})

function FileLayout() {
  const { workspace, filePath, file } = Route.useLoaderData()

  const setSelected = useSetAtom(selectedFilePathAtom)
  const setFile = useSetAtom(fileContentAtom)
  const setEditorState = useSetAtom(editorStateAtom)
  const setBaseline = useSetAtom(baselineFileAtom)

  // Create editor config for this specific file
  const editorConfig = useMemo(() => {
    return createEditorConfigFromContent(file, "block") // Default to block view
  }, [file, filePath])

  // Set up atoms when component mounts
  useEffect(() => {
    // Set atoms for this file
    setSelected(filePath)
    setFile(file)
    setBaseline({ path: file.path, content: file.content })

    if (workspace?.path) {
      // add to recent files using the new centralized atom
      updateRecentFiles(localStorageService, {
        type: "add",
        file: file,
        workspacePath: workspace.path,
      })

      // open file in tab layout (handles existing tabs properly)
      openFile(localStorageService, filePath, workspace.path)
    }
  }, [workspace, file, filePath, setSelected, setFile, setBaseline])

  return (
    <>
      {editorConfig && (
        <Editor
          key={filePath}
          editorConfig={editorConfig}
          onSerializedChange={(value) => {
            setEditorState(value)
          }}
        />
      )}
    </>
  )
}
