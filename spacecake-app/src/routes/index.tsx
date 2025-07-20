import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDirectory, readDirectory } from "@/lib/fs";
import { workspaceAtom } from "@/lib/atoms";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { atom } from "jotai";
import type { FileEntry } from "@/types/electron";

const filesAtom = atom<FileEntry[]>([]);
const loadingAtom = atom<boolean>(false);

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [files, setFiles] = useAtom(filesAtom);
  const [loading, setLoading] = useAtom(loadingAtom);

  // Read directory when workspace changes
  useEffect(() => {
    const loadDirectory = async () => {
      if (!workspace) {
        setFiles([]);
        return;
      }

      setLoading(true);
      try {
        const directoryFiles = await readDirectory(workspace);
        setFiles(directoryFiles);
      } catch (error) {
        console.error("error loading directory:", error);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    };

    loadDirectory();
  }, [workspace, setFiles, setLoading]);

  const handleOpenWorkspace = async () => {
    setLoading(true);
    try {
      const selectedPath = await openDirectory();
      if (selectedPath) {
        setWorkspace(selectedPath);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <div className="flex flex-col items-center space-y-3">
        {/* <FolderOpen className="h-16 w-16 text-muted-foreground" /> */}
        <Button
          size="lg"
          className="text-base"
          variant="outline"
          onClick={handleOpenWorkspace}
          disabled={loading}
        >
          {loading ? <Loader2Icon className="animate-spin" /> : <FolderOpen />}
          open folder
        </Button>
        {files.length > 0 && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50 max-w-2xl max-h-96 overflow-auto">
            <h3 className="text-sm font-medium mb-2">directory contents:</h3>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
              {JSON.stringify(files, null, 2)}
            </pre>
          </div>
        )}
        {/* <p className="text-sm text-muted-foreground text-center max-w-md">
          Select a folder to begin 🤗
        </p> */}
      </div>
    </div>
  );
}
