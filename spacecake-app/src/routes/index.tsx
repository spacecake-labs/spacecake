import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const handleOpenFolder = async () => {
    try {
      const result = await window.electronAPI.showOpenDialog({
        properties: ["openDirectory"],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        console.log("Selected folder:", result.filePaths[0]);
        // Handle the selected folder here
      }
    } catch (error) {
      console.error("Error opening folder:", error);
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
          onClick={handleOpenFolder}
        >
          <FolderOpen />
          open folder
        </Button>
        {/* <p className="text-sm text-muted-foreground text-center max-w-md">
          Select a folder to begin 🤗
        </p> */}
      </div>
    </div>
  );
}
