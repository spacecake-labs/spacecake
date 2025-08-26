import { useEffect, useMemo } from "react"
import { RootLayout } from "@/layout"
import { createFileRoute, ErrorComponent, Outlet } from "@tanstack/react-router"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import type { SerializedEditorState } from "lexical"

// mode toggle rendered inside EditorToolbar
import {
  createEditorConfigEffect,
  editorConfigAtom,
  editorStateAtom,
  saveFileAtom,
  selectedFilePathAtom,
} from "@/lib/atoms/atoms"
import { workspacePathAtom } from "@/lib/atoms/workspace"
import {
  createEditorConfigFromContent,
  createEditorConfigFromState,
} from "@/lib/editor"
import { decodeBase64Url } from "@/lib/utils"
import { WorkspaceWatcher } from "@/lib/workspace-watcher"
import { Editor } from "@/components/editor/editor"
// toolbar renders the save button
import { EditorToolbar } from "@/components/editor/toolbar"

export const Route = createFileRoute("/w/$workspaceId")({
  loader: async ({ params }) => {
    const workspacePath = decodeBase64Url(params.workspaceId)
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
  const workspaceData = Route.useLoaderData()
  const setWorkspacePath = useSetAtom(workspacePathAtom)

  useEffect(() => {
    setWorkspacePath(workspaceData.workspace.path)
    return () => {
      setWorkspacePath(null)
    }
  }, [workspaceData.workspace.path, setWorkspacePath])

  const saveFile = useSetAtom(saveFileAtom)

  const selectedFilePath = useAtomValue(selectedFilePathAtom)
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
    <RootLayout
      selectedFilePath={selectedFilePath}
      headerRightContent={<EditorToolbar onSave={saveFile} />}
    >
      <WorkspaceWatcher />
      {/* integrated toolbar in header */}
      {editorConfig && (
        <Editor
          // key={`${selectedFilePath ?? ""}:${fileContent?.modified ?? ""}`}
          key={selectedFilePath ?? ""}
          editorConfig={editorConfig}
          onSerializedChange={(value: SerializedEditorState) => {
            setEditorState(value)
          }}
        />
      )}
      <Outlet />
    </RootLayout>
  )
}
