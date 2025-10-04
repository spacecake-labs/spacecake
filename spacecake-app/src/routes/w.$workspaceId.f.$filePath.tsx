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

import { match } from "@/types/adt"
import { ViewKindSchema } from "@/types/lexical"
import { AbsolutePath } from "@/types/workspace"
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
    const filePath = AbsolutePath(decodeBase64Url(params.filePath))

    // ensure file belongs to workspace by prefix (best-effort client guard)
    if (!filePath.startsWith(workspacePath)) {
      throw new Error("file not in workspace")
    }
    const finalView = determineView(filePath, view)
    const file = await readFile(filePath)

    return match(file, {
      onLeft: (error) => {
        console.error("failed to read file:", error)
        throw redirect({
          to: "/w/$workspaceId",
          params: { workspaceId: params.workspaceId },
          search: { notFoundFilePath: filePath },
        })
      },
      onRight: (file) => {
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
    })
  },
  pendingComponent: () => (
    <div className="p-2 text-xs text-muted-foreground">loading file…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: FileLayout,
  // Do not cache this route's data after it's unloaded
  gcTime: 0,
  // Only reload the route when the user navigates to it or when deps change
  shouldReload: false,
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
