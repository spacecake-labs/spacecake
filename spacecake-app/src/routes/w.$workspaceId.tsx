import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { useAtom } from "jotai";
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
  lexicalEditorAtom,
  baselineFileAtom,
  isSavingAtom,
} from "@/lib/atoms/atoms";
import { Outlet } from "@tanstack/react-router";
import { getEditorConfig } from "@/lib/editor";
import type { SerializedEditorState } from "lexical";
import { Editor } from "@/components/editor/editor";
import { toast } from "sonner";
import { readFile, saveFile } from "@/lib/fs";
import { decodeBase64Url } from "@/lib/utils";
import { useEffect, useRef } from "react";
// toolbar renders the save button
import { FileType, FileTreeEvent } from "@/types/workspace";
import { fileTypeFromExtension } from "@/lib/workspace";
import { serializeEditorToPython } from "@/lib/editor";
import { EditorToolbar } from "@/components/editor/toolbar";
import { fileTreeEventAtom } from "@/lib/atoms/file-tree";

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

  const [, handleFileTreeEvent] = useAtom(fileTreeEventAtom);

  useEffect(() => {
    // Only start watching if we have a valid workspace path
    if (workspaceData?.workspace?.path !== "/") {
      void window.electronAPI.watchWorkspace(workspaceData.workspace.path);
    }

    const off = window.electronAPI.onFileEvent(async (event: FileTreeEvent) => {
      // Handle content change events for editor updates
      if (event.kind === "contentChange") {
        const currentPath = selectedPathRef.current;
        const currentEditor = lexicalEditorRef.current;

        // First, update file tree metadata (size, modified date, etag, content hash)
        handleFileTreeEvent({
          kind: "contentChange",
          path: event.path,
          etag: event.etag,
          content: event.content,
          fileType: event.fileType,
          cid: event.cid,
        });

        // Then, update editor content if this is the currently open file
        if (currentPath && currentEditor && event.path === currentPath) {
          try {
            // For Python files, use the surgical block reconciliation
            if (event.fileType === FileType.Python) {
              const { parsePythonContentStreaming } = await import(
                "@/lib/parser/python/blocks"
              );
              const { reconcilePythonBlocks } = await import("@/lib/editor");

              // Parse the new content into blocks
              const blocks: import("@/types/parser").PyBlock[] = [];
              for await (const block of parsePythonContentStreaming(
                event.content
              )) {
                blocks.push(block);
              }

              // Reconcile the blocks (this will update all CodeMirror instances)
              reconcilePythonBlocks(currentEditor, blocks);
            } else {
              // For non-Python files, update the editor content directly
              const { $getRoot, $createParagraphNode, $createTextNode } =
                await import("lexical");
              const root = $getRoot();
              root.clear();

              const paragraph = $createParagraphNode();
              paragraph.append($createTextNode(event.content));
              root.append(paragraph);
            }
          } catch (error) {
            console.error("error updating editor content:", error);
          }
        }
      }

      // Handle other file tree events
      handleFileTreeEvent(event);
    });
    return () => {
      off?.();
    };
  }, [handleFileTreeEvent]);

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
        contentToWrite = serializeEditorToPython(lexicalEditor);
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
                // key={`${selectedFilePath ?? ""}:${fileContent?.modified ?? ""}`}
                key={`${selectedFilePath ?? ""}:${fileContent ?? ""}`}
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
