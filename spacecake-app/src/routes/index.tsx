import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDirectory } from "@/lib/fs";
import { workspaceAtom } from "@/lib/atoms";
import { useAtom } from "jotai";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [workspace, setWorkspace] = useAtom(workspaceAtom);

  const handleOpenWorkspace = async () => {
    const selectedPath = await openDirectory();
    if (selectedPath) {
      setWorkspace(selectedPath);
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
        >
          <FolderOpen />
          open folder
        </Button>
        {workspace && (
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Selected: {workspace}
          </p>
        )}
        {/* <p className="text-sm text-muted-foreground text-center max-w-md">
          Select a folder to begin 🤗
        </p> */}
      </div>
    </div>
  );
}
