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
import { Schema } from "effect"
import { useSetAtom } from "jotai"

import { ViewKindSchema } from "@/types/lexical"
import { editorStateAtom, fileContentAtom } from "@/lib/atoms/atoms"
import { createEditorConfigFromContent } from "@/lib/editor"
import { readFile } from "@/lib/fs"
import { decodeBase64Url } from "@/lib/utils"
import { determineView } from "@/lib/view-preferences"
import { Editor } from "@/components/editor/editor"

const fileSearchSchema = Schema.Struct({
  view: Schema.optional(ViewKindSchema),
})

export const Route = createFileRoute("/w/$workspaceId/f/$filePath")({
  validateSearch: (search) =>
    Schema.decodeUnknownSync(fileSearchSchema)(search),
  loaderDeps: ({ search: { view } }) => ({ view }),
  loader: async ({ params, deps: { view } }) => {
    const workspacePath = decodeBase64Url(params.workspaceId)
    const filePath = decodeBase64Url(params.filePath)

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

    // Determine the final view using centralized logic
    const finalView = determineView(filePath, view)

    return {
      workspace: {
        path: workspacePath,
        name: workspacePath.split("/").pop() || "spacecake",
      },
      filePath,
      file,
      view: finalView,
    }
  },
  pendingComponent: () => (
    <div className="p-2 text-xs text-muted-foreground">loading file…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: FileLayout,
})

function FileLayout() {
  const { workspace, filePath, file, view } = Route.useLoaderData()

  const setFile = useSetAtom(fileContentAtom)
  const setEditorState = useSetAtom(editorStateAtom)

  // Create editor config for this specific file
  const editorConfig = useMemo(() => {
    return createEditorConfigFromContent(file, view)
  }, [file, view])

  // Set up atoms when component mounts
  useEffect(() => {
    // Set atoms for this file
    setFile(file)

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
  }, [workspace, file, filePath, setFile])

  return (
    <>
      {editorConfig && (
        <Editor
          key={`${filePath}-${view}`}
          editorConfig={editorConfig}
          onSerializedChange={(value) => {
            setEditorState(value)
          }}
        />
      )}
    </>
  )
}
