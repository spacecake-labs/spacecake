import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/mode-toggle";
import {
  editorStateAtom,
  fileContentAtom,
  selectedFilePathAtom,
  workspaceAtom,
  filesAtom,
  workspaceItemsAtom,
} from "@/lib/atoms";
import { readWorkspace } from "@/lib/fs";
import { transformFilesToNavItems } from "@/lib/workspace";
import { Outlet } from "@tanstack/react-router";
import { getEditorConfig } from "@/lib/editor";
import type { SerializedEditorState } from "lexical";
import { Editor } from "@/components/editor/editor";
import { toast } from "sonner";
import { readFile } from "@/lib/fs";
import { decodeBase64Url } from "@/lib/utils";
import { useEffect } from "react";

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
    setWorkspace(workspaceData.workspace);
    setFiles(workspaceData.files);
    setSidebarNav(transformFilesToNavItems(workspaceData.files));
  }, [workspaceData, setWorkspace, setFiles, setSidebarNav]);

  const [selectedFilePath, setSelectedFilePath] = useAtom(selectedFilePathAtom);
  const [editorState, setEditorState] = useAtom(editorStateAtom);
  const [fileContent, setFileContent] = useAtom(fileContentAtom);

  const handleFileClick = async (filePath: string) => {
    const file = await readFile(filePath);
    if (file !== null) {
      setEditorState(null);
      setSelectedFilePath(filePath);
      setFileContent(file);
    } else {
      toast("error reading file");
    }
  };

  const editorConfig = getEditorConfig(
    editorState,
    fileContent,
    selectedFilePath
  );

  return (
    <div className="flex h-screen">
      <SidebarProvider>
        <AppSidebar
          onFileClick={handleFileClick}
          selectedFilePath={selectedFilePath}
        />
        <SidebarInset className="overflow-auto">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              {selectedFilePath}
            </div>
            <div className="px-4">
              <ModeToggle />
            </div>
          </header>
          <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
            {editorConfig && (
              <Editor
                key={selectedFilePath ?? undefined}
                editorConfig={editorConfig}
                onSerializedChange={(value: SerializedEditorState) => {
                  setEditorState(value);
                  setFileContent(null);
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
