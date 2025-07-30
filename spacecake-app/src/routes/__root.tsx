import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAtom } from "jotai";
import {
  editorStateAtom,
  selectedFilePathAtom,
  fileContentAtom,
} from "@/lib/atoms";
import { Editor } from "@/components/editor/editor";
import { SerializedEditorState } from "lexical";
import { toast } from "sonner";
import { readFile } from "@/lib/fs";
import { getEditorConfig } from "@/lib/editor";

export const Route = createRootRoute({
  component: () => {
    const [selectedFilePath, setSelectedFilePath] =
      useAtom(selectedFilePathAtom);
    const [editorState, setEditorState] = useAtom(editorStateAtom);
    const [fileContent, setFileContent] = useAtom(fileContentAtom);

    const handleFileClick = async (filePath: string) => {
      const file = await readFile(filePath);
      if (file !== null) {
        // Clear any previous editor state when loading new file
        setEditorState(null);
        setSelectedFilePath(filePath);
        setFileContent({
          content: file.content,
          fileType: file.fileType,
        });
      } else {
        toast("error reading file");
      }
    };

    // Pure function call - no local logic
    const editorConfig = getEditorConfig(
      editorState,
      fileContent,
      selectedFilePath
    );

    return (
      <>
        <div className="flex h-screen">
          <SidebarProvider>
            <AppSidebar
              onFileClick={handleFileClick}
              selectedFilePath={selectedFilePath}
            />
            <SidebarInset className="overflow-auto">
              <header className="flex h-16 shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 px-4">
                  <SidebarTrigger className="-ml-1" />
                  <Separator
                    orientation="vertical"
                    className="mr-2 data-[orientation=vertical]:h-4"
                  />
                  {selectedFilePath}
                </div>
              </header>
              <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
                {editorConfig && (
                  <Editor
                    key={selectedFilePath ?? undefined}
                    editorConfig={editorConfig}
                    onSerializedChange={(value: SerializedEditorState) => {
                      setEditorState(value);
                      // Clear temporary file content once editor is initialized
                      setFileContent(null);
                    }}
                  />
                )}

                <Outlet />
              </div>
            </SidebarInset>
          </SidebarProvider>
        </div>
        <TanStackRouterDevtools />
      </>
    );
  },
});
