import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
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
  fileContentAtom,
  selectedFilePathAtom,
  workspaceAtom,
  filesAtom,
  workspaceItemsAtom,
  lexicalEditorAtom,
  baselineFileAtom,
  isSavingAtom,
} from "@/lib/atoms";
import { readWorkspace } from "@/lib/fs";
import { transformFilesToNavItems } from "@/lib/workspace";
import { Outlet } from "@tanstack/react-router";
import { getEditorConfig } from "@/lib/editor";
import type { SerializedEditorState } from "lexical";
import { Editor } from "@/components/editor/editor";
import { toast } from "sonner";
import { readFile, saveFile } from "@/lib/fs";
import { decodeBase64Url } from "@/lib/utils";
import { useEffect, useRef } from "react";
// toolbar renders the save button
import { FileType } from "@/types/workspace";
import { fileTypeFromExtension } from "@/lib/workspace";
import { serializeEditorToPython } from "@/lib/editor";
import { EditorToolbar } from "@/components/editor/toolbar";

export const Route = createFileRoute("/w/$workspaceId")({
  loader: async ({ params }) => {
    const workspacePath = decodeBase64Url(params.workspaceId);
    const result = await readWorkspace(workspacePath);
    if (!result) {
      throw new Error("failed to read workspace");
    }
    return result;
  },
  pendingComponent: () => (
    <div className="p-4 text-sm text-muted-foreground">loading workspace…</div>
  ),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const workspaceData = Route.useLoaderData();
  const setWorkspace = useSetAtom(workspaceAtom);
  const setFiles = useSetAtom(filesAtom);
  const setSidebarNav = useSetAtom(workspaceItemsAtom);

  useEffect(() => {
    // always refresh workspace lists
    setWorkspace(workspaceData.workspace);
    setFiles(workspaceData.files);
    setSidebarNav(transformFilesToNavItems(workspaceData.files));

    if (workspaceData?.workspace?.path) {
      void window.electronAPI.watchWorkspace(workspaceData.workspace.path);
    }

    const off = window.electronAPI.onFileEvent(async (evt) => {
      if (evt.type !== "change" && evt.type !== "add") return;
      const currentPath = selectedPathRef.current;
      const currentEditor = lexicalEditorRef.current;
      if (!currentPath || !currentEditor) return;
      if (evt.path !== currentPath) return;

      try {
        const f = await readFile(currentPath);
        if (f) {
          console.log("external file change detected:", {
            path: evt.path,
            type: evt.type,
            contentLength: f.content.length,
            currentEditor: !!currentEditor,
          });

          const { parsePythonContentStreaming } = await import(
            "@/lib/parser/python/blocks"
          );
          const { reconcilePythonBlocks } = await import("@/lib/editor");

          const blocks: import("@/types/parser").PyBlock[] = [];
          for await (const b of parsePythonContentStreaming(f.content)) {
            blocks.push(b);
          }

          console.log("parsed blocks:", blocks.length, "blocks");
          reconcilePythonBlocks(currentEditor, blocks);
        }
      } catch (error) {
        console.error("error handling external file change:", error);
      }
    });
    return () => {
      off?.();
    };
  }, [workspaceData, setWorkspace, setFiles, setSidebarNav]);

  const [selectedFilePath, setSelectedFilePath] = useAtom(selectedFilePathAtom);
  const [editorState, setEditorState] = useAtom(editorStateAtom);
  const [fileContent, setFileContent] = useAtom(fileContentAtom);
  const [lexicalEditor] = useAtom(lexicalEditorAtom);
  // keep latest values in refs for async handlers
  const selectedPathRef = useRef<string | null>(selectedFilePath);
  const lexicalEditorRef = useRef(lexicalEditor);
  useEffect(() => {
    selectedPathRef.current = selectedFilePath;
  }, [selectedFilePath]);
  useEffect(() => {
    lexicalEditorRef.current = lexicalEditor;
  }, [lexicalEditor]);
  const [baseline, setBaseline] = useAtom(baselineFileAtom);
  const [isSaving, setIsSaving] = useAtom(isSavingAtom);
  // etag suppression is handled in main; no local map needed

  const handleFileClick = async (filePath: string) => {
    const file = await readFile(filePath);
    if (file !== null) {
      setEditorState(null);
      setSelectedFilePath(filePath);
      setFileContent(file);
      setBaseline({ path: file.path, content: file.content });
    } else {
      toast("error reading file");
    }
  };

  const editorConfig = getEditorConfig(
    editorState,
    fileContent,
    selectedFilePath
  );

  const doSave = async () => {
    if (!selectedFilePath || !lexicalEditor) return;
    if (isSaving) return; // re-entrancy guard to avoid double-saves
    setIsSaving(true);
    try {
      let contentToWrite = "";
      const inferredType = (() => {
        if (fileContent?.fileType) return fileContent.fileType;
        if (selectedFilePath) {
          const ext = selectedFilePath.split(".").pop() || "";
          return fileTypeFromExtension(ext);
        }
        return FileType.Plaintext;
      })();
      if (inferredType === FileType.Python) {
        contentToWrite = serializeEditorToPython(lexicalEditor, {
          baseline: baseline?.content,
        });
      } else if (baseline && baseline.path === selectedFilePath) {
        // fallback: write baseline until other serializers exist
        contentToWrite = baseline.content;
      } else {
        contentToWrite = "";
      }
      // debug logging removed
      // ensure codemirror commits any pending buffered changes across blocks
      window.dispatchEvent(new Event("sc-before-save"));
      const ok = await saveFile(selectedFilePath, contentToWrite);
      if (!ok) {
        toast("failed to save file");
        return;
      }
      toast(`saved ${selectedFilePath}`);
      // do not re-read the file after our own save to avoid remounting the editor
      // update baseline to the exact content we just wrote so subsequent saves splice correctly
      setBaseline({ path: selectedFilePath, content: contentToWrite });
    } finally {
      setIsSaving(false);
    }
  };

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
        void doSave();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [doSave]);

  return (
    <div className="flex h-screen">
      <SidebarProvider>
        <AppSidebar
          onFileClick={handleFileClick}
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
            <EditorToolbar onSave={doSave} />
          </header>

          <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
            {/* integrated toolbar in header */}
            {editorConfig && (
              <Editor
                key={`${selectedFilePath ?? ""}:${fileContent?.modified ?? ""}`}
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
