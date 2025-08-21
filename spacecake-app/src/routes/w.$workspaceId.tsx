import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
// mode toggle rendered inside EditorToolbar
import {
  editorStateAtom,
  selectedFilePathAtom,
  editorConfigAtom,
  createEditorConfigEffect,
  selectFileAtom,
  saveFileAtom,
} from "@/lib/atoms/atoms";
import { Outlet } from "@tanstack/react-router";
import {
  createEditorConfigFromState,
  createEditorConfigFromContent,
} from "@/lib/editor";
import type { SerializedEditorState } from "lexical";
import { Editor } from "@/components/editor/editor";
import { decodeBase64Url } from "@/lib/utils";
import { useEffect, useMemo } from "react";
// toolbar renders the save button
import { EditorToolbar } from "@/components/editor/toolbar";
import { workspacePathAtom } from "@/lib/atoms/workspace";
import { WorkspaceWatcher } from "@/lib/workspace-watcher";

export const Route = createFileRoute("/w/$workspaceId")({
  loader: async ({ params }) => {
    const workspacePath = decodeBase64Url(params.workspaceId);
    return {
      workspace: {
        path: workspacePath,
        name: workspacePath.split("/").pop() || "spacecake",
      },
    };
  },
  pendingComponent: () => (
    <div className="p-4 text-sm text-muted-foreground">loading workspace…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const workspaceData = Route.useLoaderData();
  const setWorkspacePath = useSetAtom(workspacePathAtom);

  useEffect(() => {
    setWorkspacePath(workspaceData.workspace.path);
    return () => {
      setWorkspacePath(null);
    };
  }, [workspaceData.workspace.path, setWorkspacePath]);

  const selectFile = useSetAtom(selectFileAtom);
  const saveFile = useSetAtom(saveFileAtom);

  const selectedFilePath = useAtomValue(selectedFilePathAtom);
  const setEditorState = useSetAtom(editorStateAtom);

  // Create the effect atom with injected dependencies (no circular imports!)
  // Use useMemo to ensure the atom is only created once, not on every render
  const editorConfigEffectAtom = useMemo(
    () =>
      createEditorConfigEffect(
        createEditorConfigFromState,
        createEditorConfigFromContent
      ),
    [] // Empty deps - these functions are stable
  );

  // Use the editor config atom directly - jotai handles the computation
  const editorConfig = useAtomValue(editorConfigAtom);

  // Activate the effect atom to ensure config is computed
  useAtom(editorConfigEffectAtom);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSave =
        (e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S");
      if (isSave) {
        e.preventDefault();
        // if focused within CodeMirror, let its own handler dispatch the save event
        const target = e.target as EventTarget | null;
        const isInCodeMirror =
          target instanceof Element && !!target.closest(".cm-editor");
        if (isInCodeMirror) return;
        void saveFile();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [saveFile]);

  return (
    <div className="flex h-screen">
      <WorkspaceWatcher />
      <SidebarProvider>
        <AppSidebar
          onFileClick={selectFile}
          selectedFilePath={selectedFilePath}
        />
        <SidebarInset className="overflow-auto">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between px-0">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1 cursor-pointer" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
            </div>
            <EditorToolbar onSave={saveFile} />
          </header>

          <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
            {/* integrated toolbar in header */}
            {editorConfig && (
              <Editor
                // key={`${selectedFilePath ?? ""}:${fileContent?.modified ?? ""}`}
                key={selectedFilePath ?? ""}
                editorConfig={editorConfig}
                onSerializedChange={(value: SerializedEditorState) => {
                  setEditorState(value);
                }}
              />
            )}
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}