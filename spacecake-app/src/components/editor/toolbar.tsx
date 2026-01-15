import { useEditor } from "@/contexts/editor-context"
import { useAtomValue, useSetAtom } from "jotai"
import {
  FileSearch,
  FileWarning,
  FolderSearch,
  Loader2,
  Save,
} from "lucide-react"

import { RouteContext } from "@/types/workspace"
import { quickOpenMenuOpenAtom } from "@/lib/atoms/atoms"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { useOpenWorkspace } from "@/lib/open-workspace"
import { Button } from "@/components/ui/button"
import { CommandShortcut } from "@/components/ui/command"
import { SAVE_FILE_COMMAND } from "@/components/editor/plugins/save-command"
import { ViewToggleButton } from "@/components/editor/view-toggle-button"

interface EditorToolbarProps {
  routeContext: RouteContext
}

export function EditorToolbar({ routeContext }: EditorToolbarProps) {
  const { editorRef } = useEditor()
  const fileStateAtom = fileStateAtomFamily(routeContext.filePath)
  const fileState = useAtomValue(fileStateAtom).value
  const send = useSetAtom(fileStateAtom)
  const isSaving = fileState === "Saving"
  const isConflict = fileState === "Conflict"
  const openQuickOpen = useSetAtom(quickOpenMenuOpenAtom)
  const { handleOpenWorkspace, isOpen: fileExplorerIsOpen } = useOpenWorkspace()

  const handleSave = () => {
    if (editorRef.current) {
      editorRef.current.dispatchCommand(SAVE_FILE_COMMAND, undefined)
    }
  }

  if (isConflict) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mr-2">
          <FileWarning className="h-4 w-4 text-destructive" />
          <span>file changed externally</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs cursor-pointer"
          onClick={() => send({ type: "file.resolve.overwrite" })}
        >
          keep my changes
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 px-2 text-xs cursor-pointer"
          onClick={() => send({ type: "file.resolve.discard" })}
        >
          discard my changes
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpenWorkspace}
        disabled={fileExplorerIsOpen}
        className="h-7 px-2 text-xs cursor-pointer"
        aria-label="switch folder"
        title="switch folder"
      >
        <FolderSearch className="h-3 w-3 mr-1" />
        <CommandShortcut>⌘O</CommandShortcut>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => openQuickOpen()}
        className="h-7 px-2 text-xs cursor-pointer"
        aria-label="search files"
        title="search files"
      >
        <FileSearch className="h-3 w-3 mr-1" />
        <CommandShortcut>⌘P</CommandShortcut>
      </Button>
      <ViewToggleButton routeContext={routeContext} />
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSave}
        className="h-7 px-2 text-xs cursor-pointer"
        disabled={isSaving}
        aria-label="save"
      >
        {isSaving ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <Save className="h-3 w-3 mr-1" />
        )}
        save
      </Button>
    </div>
  )
}
