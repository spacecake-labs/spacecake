import { useEffect } from "react"
import {
  createFileRoute,
  ErrorComponent,
  notFound,
  useNavigate,
} from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"

import type { EditorLayout } from "@/types/editor"
import {
  baselineFileAtom,
  editorStateAtom,
  fileContentAtom,
  selectedFilePathAtom,
  workspaceAtom,
} from "@/lib/atoms/atoms"
import {
  addRecentFileAtom,
  removeRecentFileAtom,
  saveEditorLayoutAtom,
} from "@/lib/atoms/storage"
import { readFile } from "@/lib/fs"
import { decodeBase64Url } from "@/lib/utils"

function FileNotFound() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const removeRecentFile = useSetAtom(removeRecentFileAtom)
  const saveEditorLayout = useSetAtom(saveEditorLayoutAtom)
  const setSelectedFilePath = useSetAtom(selectedFilePathAtom)

  const workspacePath = decodeBase64Url(params.workspaceId)
  const filePath = decodeBase64Url(params._splat as string)

  useEffect(() => {
    // clean up persisted state
    removeRecentFile(filePath, workspacePath)
    const emptyLayout: EditorLayout = {
      tabGroups: [],
      activeTabGroupId: null,
    }
    saveEditorLayout(emptyLayout, workspacePath)
    setSelectedFilePath(null)

    // navigate back to the workspace root with file path as search param
    navigate({
      to: "/w/$workspaceId",
      params: { workspaceId: params.workspaceId },
      search: { notFoundFilePath: filePath },
    })
  }, [
    filePath,
    workspacePath,
    params.workspaceId,
    removeRecentFile,
    saveEditorLayout,
    setSelectedFilePath,
    navigate,
  ])

  return null
}

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
    if (!file) throw notFound()
    return { filePath, file }
  },
  pendingComponent: () => (
    <div className="p-2 text-xs text-muted-foreground">loading file…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  notFoundComponent: FileNotFound,
  component: FileLayout,
})

function FileLayout() {
  const data = Route.useLoaderData()
  const setSelected = useSetAtom(selectedFilePathAtom)
  const setFile = useSetAtom(fileContentAtom)
  const setEditorState = useSetAtom(editorStateAtom)
  const setBaseline = useSetAtom(baselineFileAtom)
  const addRecentFile = useSetAtom(addRecentFileAtom)
  const saveEditorLayout = useSetAtom(saveEditorLayoutAtom)
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

      const newLayout: EditorLayout = {
        tabGroups: [
          {
            id: "main",
            tabs: [
              {
                id: data.filePath,
                filePath: data.filePath,
              },
            ],
            activeTabId: data.filePath,
          },
        ],
        activeTabGroupId: "main",
      }
      saveEditorLayout(newLayout, workspace.path)
    }
  }, [
    data,
    setSelected,
    setFile,
    setEditorState,
    addRecentFile,
    workspace,
    saveEditorLayout,
  ])
  return null
}
