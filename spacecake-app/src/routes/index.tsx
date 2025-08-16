import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDirectory } from "@/lib/fs";
import { workspaceAtom } from "@/lib/atoms/atoms";
import { useAtom, useSetAtom } from "jotai";
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
  const setWorkspace = useSetAtom(workspaceAtom);
  const [fileExplorerIsOpen, setFileExplorerIsOpen] = useAtom(
    fileExplorerIsOpenAtom
  );

  const navigate = useNavigate();

  const handleOpenWorkspace = async () => {
    setFileExplorerIsOpen(true);
    try {
      const selectedPath = await openDirectory();
      if (selectedPath) {
        // Just set basic workspace info and navigate
        setWorkspace({ path: selectedPath, name: "" });
        const id = encodeBase64Url(selectedPath);
        navigate({ to: "/w/$workspaceId", params: { workspaceId: id } });
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
              <SidebarTrigger className="-ml-1 cursor-pointer" />
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
