import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDirectory, readWorkspace } from "@/lib/fs";
import {
  workspaceAtom,
  workspaceInfoAtom,
  filesAtom,
  sidebarNavAtom,
} from "@/lib/atoms";
import { transformFilesToNavItems } from "@/lib/workspace";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { atom } from "jotai";

const fileExplorerIsOpenAtom = atom<boolean>(false);

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [workspaceInfo, setWorkspaceInfo] = useAtom(workspaceInfoAtom);
  const [files, setFiles] = useAtom(filesAtom);
  const [sidebarNav, setSidebarNav] = useAtom(sidebarNavAtom);
  const [fileExplorerIsOpen, setFileExplorerIsOpen] = useAtom(
    fileExplorerIsOpenAtom
  );

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
        const result = await readWorkspace(workspace);
        if (result) {
          setFiles(result.files);
          setWorkspaceInfo(result.workspace);

          // Transform files into sidebar navigation
          const navItems = transformFilesToNavItems(result.files);
          setSidebarNav(navItems);
        } else {
          setFiles([]);
          setWorkspaceInfo(null);
          setSidebarNav([]);
        }
      } catch (error) {
        console.error("error loading workspace:", error);
        setFiles([]);
        setWorkspaceInfo(null);
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
        setWorkspace(selectedPath);
      }
    } finally {
      setFileExplorerIsOpen(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <div className="flex flex-col items-center space-y-3">
        <Button
          size="lg"
          className="text-base"
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
        {workspace && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50 max-w-2xl max-h-96 overflow-auto">
            <h3 className="text-sm font-medium mb-2">Workspace: {workspace}</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Found {files.length} items, {sidebarNav.length} navigation
              sections
            </p>
            {sidebarNav.length > 0 && (
              <div className="mt-2">
                <h4 className="text-xs font-medium mb-1">
                  Navigation Structure:
                </h4>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {JSON.stringify(sidebarNav, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
