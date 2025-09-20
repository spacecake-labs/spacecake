/*
EditorToolbar handles the toolbar UI and view toggling.
*/

import { useEditor } from "@/contexts/editor-context"
import { useAtomValue, useSetAtom } from "jotai"
import { Code, Eye, FileSearch, FolderSearch, Save } from "lucide-react"

import {
  canToggleViewsAtom,
  isSavingAtom,
  quickOpenMenuOpenAtom,
  toggleViewAtom,
  viewKindAtom,
} from "@/lib/atoms/atoms"
import { useOpenWorkspace } from "@/lib/open-workspace"
import { Button } from "@/components/ui/button"
import { CommandShortcut } from "@/components/ui/command"
import { SAVE_FILE_COMMAND } from "@/components/editor/plugins/save-command"

export function EditorToolbar() {
  const { editorRef } = useEditor()
  const isSaving = useAtomValue(isSavingAtom)
  const canToggleViews = useAtomValue(canToggleViewsAtom)
  const viewKind = useAtomValue(viewKindAtom)
  const toggleView = useSetAtom(toggleViewAtom)
  const openQuickOpen = useSetAtom(quickOpenMenuOpenAtom)
  const { handleOpenWorkspace, isOpen: fileExplorerIsOpen } = useOpenWorkspace()

  const handleViewToggle = () => {
    toggleView(editorRef.current || undefined)
  }

  const handleSave = () => {
    if (editorRef.current) {
      editorRef.current.dispatchCommand(SAVE_FILE_COMMAND, undefined)
    }
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
      {canToggleViews && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleViewToggle}
          className="h-7 px-2 text-xs cursor-pointer"
          aria-label={viewKind === "rich" ? "rich" : "source"}
          title={
            viewKind === "rich"
              ? "switch to source view"
              : "switch to rich view"
          }
        >
          {viewKind === "rich" ? (
            <>
              <Eye className="h-3 w-3 mr-1" />
              rich
            </>
          ) : (
            <>
              <Code className="h-3 w-3 mr-1" />
              source
            </>
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSave}
        className="h-7 px-2 text-xs cursor-pointer"
        disabled={isSaving}
        aria-label="save"
      >
        <Save className="h-3 w-3 mr-1" />
        {isSaving ? "saving…" : "save"}
      </Button>
    </div>
  )
}
