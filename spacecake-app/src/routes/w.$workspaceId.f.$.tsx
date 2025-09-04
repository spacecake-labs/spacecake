import { useEffect } from "react"
import { createFileRoute, ErrorComponent } from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"

import {
  baselineFileAtom,
  editorStateAtom,
  fileContentAtom,
  selectedFilePathAtom,
  workspaceAtom,
} from "@/lib/atoms/atoms"
import { addRecentFileAtom } from "@/lib/atoms/storage"
import { readFile } from "@/lib/fs"
import { decodeBase64Url } from "@/lib/utils"

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
    if (!file) throw new Error("failed to read file")
    return { filePath, file }
  },
  pendingComponent: () => (
    <div className="p-2 text-xs text-muted-foreground">loading file…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: FileRouteComponent,
})

function FileRouteComponent() {
  const data = Route.useLoaderData()
  const setSelected = useSetAtom(selectedFilePathAtom)
  const setFile = useSetAtom(fileContentAtom)
  const setEditorState = useSetAtom(editorStateAtom)
  const setBaseline = useSetAtom(baselineFileAtom)
  const addRecentFile = useSetAtom(addRecentFileAtom)
  const workspace = useAtomValue(workspaceAtom)

  // push into atoms so the editor at layout renders
  useEffect(() => {
    // clear any previous serialized editor state to force re-init from file
    setEditorState(null)
    setSelected(data.filePath)
    setFile(data.file)
    setBaseline({ path: data.file.path, content: data.file.content })

    if (workspace?.path) {
      addRecentFile(data.file, workspace.path)
    }
  }, [data, setSelected, setFile, setEditorState, addRecentFile, workspace])
  return null
}
