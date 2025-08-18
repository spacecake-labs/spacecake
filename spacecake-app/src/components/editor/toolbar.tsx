import { Save, FileText, Grid3X3, Code } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import {
  isSavingAtom,
  selectedFilePathAtom,
  canToggleViewsAtom,
  viewKindAtom,
  toggleViewAtom,
  fileContentAtom,
} from "@/lib/atoms/atoms";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export function EditorToolbar({ onSave }: { onSave: () => void }) {
  const selectedFilePath = useAtomValue(selectedFilePathAtom);
  const [isSaving] = useAtom(isSavingAtom);
  const canToggleViews = useAtomValue(canToggleViewsAtom);
  const viewKind = useAtomValue(viewKindAtom);
  const currentFile = useAtomValue(fileContentAtom);
  const [, toggleView] = useAtom(toggleViewAtom);

  // hide toolbar when no file is selected
  if (!selectedFilePath) {
    return null;
  }

  const handleViewToggle = () => {
    toggleView();
  };

  const getCurrentViewLabel = () => {
    if (!currentFile) return "";
    const currentView = viewKind(currentFile.fileType);
    return currentView === "block" ? "blocks" : "source";
  };

  const getToggleTitle = () => {
    if (!currentFile) return "";
    const currentView = viewKind(currentFile.fileType);
    return currentView === "block"
      ? "Switch to source view"
      : "Switch to block view";
  };

  const getCurrentView = () => {
    if (!currentFile) return null;
    return viewKind(currentFile.fileType);
  };

  return (
    <div className="flex items-center justify-between flex-1 px-4">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-muted-foreground/70 truncate">
            {selectedFilePath}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {canToggleViews && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewToggle}
            className="h-7 px-2 text-xs"
            aria-label={getCurrentViewLabel()}
            title={getToggleTitle()}
          >
            {getCurrentView() === "block" ? (
              <>
                <Grid3X3 className="h-3 w-3 mr-1" />
                blocks
              </>
            ) : (
              <>
                <Code className="h-3 w-3 mr-1" />
                source
              </>
            )}
          </Button>
        )}
        <button
          className="inline-flex items-center justify-center rounded-md text-xs h-7 px-2 text-foreground/90 hover:bg-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          onClick={onSave}
          disabled={isSaving}
          aria-label="save"
        >
          <Save className="h-3 w-3 mr-1" />
          {isSaving ? "saving…" : "save"}
        </button>
        <ModeToggle variant="compact" />
      </div>
    </div>
  );
}
