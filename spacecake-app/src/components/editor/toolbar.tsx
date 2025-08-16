import { Save, FileText } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { isSavingAtom, selectedFilePathAtom } from "@/lib/atoms/atoms";
import { ModeToggle } from "@/components/mode-toggle";

export function EditorToolbar({ onSave }: { onSave: () => void }) {
  const selectedFilePath = useAtomValue(selectedFilePathAtom);
  const [isSaving] = useAtom(isSavingAtom);

  // hide toolbar when no file is selected
  if (!selectedFilePath) {
    return null;
  }

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
