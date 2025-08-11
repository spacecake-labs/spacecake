import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDirectory, readWorkspace } from "@/lib/fs";
import { workspaceAtom, filesAtom, workspaceItemsAtom } from "@/lib/atoms";
import { transformFilesToNavItems } from "@/lib/workspace";
import { useAtom, useSetAtom } from "jotai";
import { useEffect } from "react";
import { atom } from "jotai";
import { encodeBase64Url } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/mode-toggle";

const fileExplorerIsOpenAtom = atom<boolean>(false);

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [fileExplorerIsOpen, setFileExplorerIsOpen] = useAtom(
    fileExplorerIsOpenAtom
  );
  const setFiles = useSetAtom(filesAtom);
  const setSidebarNav = useSetAtom(workspaceItemsAtom);
  const navigate = useNavigate();

  // Read directory when workspace changes
  useEffect(() => {
    const loadDirectory = async () => {
      if (!workspace) {
        setFiles([]);
        setSidebarNav([]);
        return;
      }

      setFileExplorerIsOpen(true);
      try {
        const result = await readWorkspace(workspace.path);
        if (result) {
          setFiles(result.files);
          // Transform files into sidebar navigation
          const navItems = transformFilesToNavItems(result.files);
          setSidebarNav(navItems);
        } else {
          setFiles([]);
          setSidebarNav([]);
        }
      } catch (error) {
        console.error("error loading workspace:", error);
        setFiles([]);
        setSidebarNav([]);
      } finally {
        setFileExplorerIsOpen(false);
      }
    };

    loadDirectory();
  }, [workspace, setFiles, setSidebarNav, setFileExplorerIsOpen]);

  const handleOpenWorkspace = async () => {
    setFileExplorerIsOpen(true);
    try {
      const selectedPath = await openDirectory();
      if (selectedPath) {
        // Load the full workspace info immediately
        const result = await readWorkspace(selectedPath);
        if (result) {
          setWorkspace(result.workspace);
          // route into workspace layout
          const id = encodeBase64Url(result.workspace.path);
          navigate({ to: "/w/$workspaceId", params: { workspaceId: id } });
        } else {
          // Fallback to basic info if readWorkspace fails
          setWorkspace({ path: selectedPath, name: "" });
          const id = encodeBase64Url(selectedPath);
          navigate({ to: "/w/$workspaceId", params: { workspaceId: id } });
        }
      }
    } finally {
      setFileExplorerIsOpen(false);
    }
  };

  return (
    <div className="flex h-screen">
      <SidebarProvider>
        <AppSidebar selectedFilePath={null} />
        <SidebarInset className="overflow-auto">
          <header className="flex h-16 shrink-0 items-center gap-2 justify-between">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
            </div>
            <div className="px-4">
              <ModeToggle />
            </div>
          </header>
          <div className="h-full flex flex-1 flex-col gap-4 p-4 pt-0">
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="flex flex-col items-center space-y-3">
                <Button
                  size="lg"
                  className="text-base cursor-pointer"
                  variant="outline"
                  onClick={handleOpenWorkspace}
                  disabled={fileExplorerIsOpen}
                >
                  {fileExplorerIsOpen ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <FolderOpen />
                  )}
                  open folder
                </Button>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
