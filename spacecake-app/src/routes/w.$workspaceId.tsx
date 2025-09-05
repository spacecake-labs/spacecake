import { useEffect, useMemo } from "react"
import { RootLayout } from "@/layout"
import {
  createFileRoute,
  ErrorComponent,
  notFound,
  Outlet,
  useNavigate,
} from "@tanstack/react-router"
import { Schema } from "effect"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import type { SerializedEditorState } from "lexical"
import { AlertCircleIcon } from "lucide-react"

// mode toggle rendered inside EditorToolbar
import {
  createEditorConfigEffect,
  editorConfigAtom,
  editorLayoutLoadingEffect,
  editorStateAtom,
  recentFilesLoadingEffect,
  saveFileAtom,
  selectedFilePathAtom,
} from "@/lib/atoms/atoms"
import { editorLayoutAtom } from "@/lib/atoms/storage"
import { workspacePathAtom } from "@/lib/atoms/workspace"
import {
  createEditorConfigFromContent,
  createEditorConfigFromState,
} from "@/lib/editor"
import { pathExists } from "@/lib/fs"
import { decodeBase64Url, encodeBase64Url } from "@/lib/utils"
import { WorkspaceWatcher } from "@/lib/workspace-watcher"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Editor } from "@/components/editor/editor"
// toolbar renders the save button
import { EditorToolbar } from "@/components/editor/toolbar"
import { ModeToggle } from "@/components/mode-toggle"
import { QuickOpen } from "@/components/quick-open"

const NotFoundFilePathSchema = Schema.standardSchemaV1(
  Schema.Struct({
    notFoundFilePath: Schema.optional(Schema.String),
  })
)

export const Route = createFileRoute("/w/$workspaceId")({
  validateSearch: NotFoundFilePathSchema,
  loader: async ({ params }) => {
    const workspacePath = decodeBase64Url(params.workspaceId)
    // check if workspace path exists
    const exists = await pathExists(workspacePath)
    if (!exists) {
      throw notFound()
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
  notFoundComponent: WorkspaceNotFound,
})

function WorkspaceNotFound() {
  const { workspaceId } = Route.useParams()
  const workspacePath = decodeBase64Url(workspaceId)

  const navigate = useNavigate()

  useEffect(() => {
    navigate({ to: "/", search: { notFoundPath: workspacePath } })
  }, [navigate, workspacePath])

  return null
}

function WorkspaceLayout() {
  const { workspace } = Route.useLoaderData()
  const { notFoundFilePath } = Route.useSearch()
  const setWorkspacePath = useSetAtom(workspacePathAtom)
  const navigate = useNavigate({ from: Route.id })

  const handleNotFound = () => {
    navigate({ to: "/" })
  }

  useEffect(() => {
    setWorkspacePath(workspace.path)
    return () => {
      setWorkspacePath(null)
    }
  }, [workspace.path, setWorkspacePath])

  const saveFile = useSetAtom(saveFileAtom)

  const [selectedFilePath, setSelectedFilePath] = useAtom(selectedFilePathAtom)
  const setEditorState = useSetAtom(editorStateAtom)

  // Create the effect atom with injected dependencies (no circular imports!)
  // Use useMemo to ensure the atom is only created once, not on every render
  const editorConfigEffectAtom = useMemo(
    () =>
      createEditorConfigEffect(
        createEditorConfigFromState,
        createEditorConfigFromContent
      ),
    [] // Empty deps - these functions are stable
  )

  // Use the editor config atom directly - jotai handles the computation
  const editorConfig = useAtomValue(editorConfigAtom)

  // Activate the effect atom to ensure config is computed
  useAtom(editorConfigEffectAtom)

  // Activate the recent files loading effect
  useAtom(recentFilesLoadingEffect)

  // Activate editor layout loading and saving effects
  useAtom(editorLayoutLoadingEffect)

  const layout = useAtomValue(editorLayoutAtom)

  useEffect(() => {
    // on initial load, if we have a layout and no file is selected, open the last active file
    if (layout && !selectedFilePath) {
      const activeGroupId = layout.activeTabGroupId
      if (!activeGroupId) return

      const activeGroup = layout.tabGroups.find((g) => g.id === activeGroupId)
      if (activeGroup && activeGroup.activeTabId) {
        const activeTab = activeGroup.tabs.find(
          (t) => t.id === activeGroup.activeTabId
        )
        if (activeTab) {
          navigate({
            to: "/w/$workspaceId/f/$",
            params: {
              workspaceId: encodeBase64Url(workspace.path),
              _splat: encodeBase64Url(activeTab.filePath),
            },
          })
        }
      }
    }
  }, [layout, selectedFilePath, setSelectedFilePath, workspace.path, navigate])

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
      <WorkspaceWatcher onNotFound={handleNotFound} />
      <RootLayout
        selectedFilePath={selectedFilePath}
        headerRightContent={
          <div className="px-4 flex items-center space-x-4">
            <EditorToolbar onSave={saveFile} />
            <ModeToggle />
          </div>
        }
      >
        {notFoundFilePath ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="w-full max-w-md">
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>
                  file not found:{"\n"}
                  <code className="font-mono text-xs break-all">
                    {notFoundFilePath}
                  </code>
                </AlertDescription>
              </Alert>
            </div>
          </div>
        ) : (
          <>
            {/* integrated toolbar in header */}
            {editorConfig && (
              <Editor
                key={selectedFilePath ?? ""}
                editorConfig={editorConfig}
                onSerializedChange={(value: SerializedEditorState) => {
                  setEditorState(value)
                }}
              />
            )}
            <Outlet />
          </>
        )}
      </RootLayout>
      <QuickOpen />
    </>
  )
}
