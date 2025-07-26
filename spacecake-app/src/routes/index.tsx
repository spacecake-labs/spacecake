import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDirectory, readWorkspace } from "@/lib/fs";
import { workspaceAtom, filesAtom, sidebarNavAtom } from "@/lib/atoms";
import { transformFilesToNavItems } from "@/lib/workspace";
import { useAtom, useSetAtom } from "jotai";
import { useEffect } from "react";
import { atom } from "jotai";

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
  const setSidebarNav = useSetAtom(sidebarNavAtom);

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
        } else {
          // Fallback to basic info if readWorkspace fails
          setWorkspace({ path: selectedPath, name: "" });
        }
      }
    } finally {
      setFileExplorerIsOpen(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <div className="flex flex-col items-center space-y-3">
        {!workspace?.path && (
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
        )}
      </div>
    </div>
  );
}
