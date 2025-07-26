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
import { editorStateAtom, selectedFilePathAtom } from "@/lib/atoms";
import { Editor, editorConfig } from "@/components/editor/editor";
import { getInitialEditorStateFromContent } from "@/components/editor/read-file";
import { SerializedEditorState } from "lexical";
import { toast } from "sonner";
import { readFile } from "@/lib/fs";

export const Route = createRootRoute({
  component: () => {
    // Use jotai atoms for selected file content and path
    // removed selectedFileContent, no longer needed
    const [selectedFilePath, setSelectedFilePath] =
      useAtom(selectedFilePathAtom);
    const [editorState, setEditorState] = useAtom(editorStateAtom);

    const handleFileClick = async (filePath: string) => {
      const file = await readFile(filePath);
      if (file !== null) {
        setEditorState({
          loader: getInitialEditorStateFromContent(file.content, file.fileType),
        });
        setSelectedFilePath(filePath);
      } else {
        toast("error reading file");
      }
    };

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
                  {/* <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem className="hidden md:block">
                        <BreadcrumbLink href="#">
                          Building Your Application
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="hidden md:block" />
                      <BreadcrumbItem>
                        <BreadcrumbPage>Data Fetching</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb> */}
                </div>
              </header>
              <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
                {/* <div className="container-wrapper section-soft flex-1 pb-6">
                  <div className="container overflow-hidden"> */}
                {typeof selectedFilePath === "string" &&
                  selectedFilePath !== "" && (
                    <Editor
                      key={selectedFilePath || undefined}
                      editorConfig={{
                        ...editorConfig,
                        ...(editorState &&
                        typeof editorState === "object" &&
                        "loader" in editorState
                          ? { editorState: editorState.loader }
                          : editorState
                            ? { editorState: JSON.stringify(editorState) }
                            : {}),
                      }}
                      onSerializedChange={(value: SerializedEditorState) =>
                        setEditorState(value)
                      }
                    />
                  )}
                {/* </div>
                </div> */}

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
