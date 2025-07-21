import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useState } from "react";

export const Route = createRootRoute({
  component: () => {
    const [selectedFileContent, setSelectedFileContent] = useState<
      string | null
    >(null);
    const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
      null
    );

    const handleFileClick = async (filePath: string) => {
      setSelectedFilePath(filePath);
      setSelectedFileContent("loading...");
      const result = await window.electronAPI.readFile(filePath);
      if (result.success) {
        setSelectedFileContent(result.content ?? "");
      } else {
        setSelectedFileContent(result.error ?? "unknown error");
      }
    };

    return (
      <>
        <div className="flex h-screen">
          <SidebarProvider>
            <AppSidebar onFileClick={handleFileClick} />
            <SidebarInset>
              <header className="flex h-16 shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 px-4">
                  <SidebarTrigger className="-ml-1" />
                  <Separator
                    orientation="vertical"
                    className="mr-2 data-[orientation=vertical]:h-4"
                  />
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
              <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                {selectedFilePath && (
                  <div className="border rounded p-4 bg-muted/50 w-full max-w-4xl mx-auto overflow-auto">
                    <div className="mb-2 text-xs text-muted-foreground">
                      {selectedFilePath}
                    </div>
                    <pre className="text-xs whitespace-pre-wrap w-full">
                      {selectedFileContent}
                    </pre>
                  </div>
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
