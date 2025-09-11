/*
EditorToolbar handles the toolbar UI and view toggling.
*/

import { useEditor } from "@/contexts/editor-context"
import { useAtomValue, useSetAtom } from "jotai"
import { Code, FileSearch, FolderSearch, Grid3X3, Save } from "lucide-react"

import {
  canToggleViewsAtom,
  fileContentAtom,
  isSavingAtom,
  quickOpenMenuOpenAtom,
  toggleViewAtom,
  viewKindAtom,
} from "@/lib/atoms/atoms"
import { useOpenWorkspace } from "@/lib/open-workspace"
import { Button } from "@/components/ui/button"
import { CommandShortcut } from "@/components/ui/command"

export function EditorToolbar({ onSave }: { onSave: () => void }) {
  const { editorRef } = useEditor()
  const isSaving = useAtomValue(isSavingAtom)
  const canToggleViews = useAtomValue(canToggleViewsAtom)
  const viewKind = useAtomValue(viewKindAtom)
  const currentFile = useAtomValue(fileContentAtom)
  const toggleView = useSetAtom(toggleViewAtom)
  const openQuickOpen = useSetAtom(quickOpenMenuOpenAtom)
  const { handleOpenWorkspace, isOpen: fileExplorerIsOpen } = useOpenWorkspace()

  const handleViewToggle = () => {
    toggleView(editorRef.current || undefined)
  }

  const getCurrentViewLabel = () => {
    if (!currentFile) return ""
    const currentView = viewKind(currentFile.fileType)
    return currentView === "block" ? "blocks" : "source"
  }

  const getToggleTitle = () => {
    if (!currentFile) return ""
    const currentView = viewKind(currentFile.fileType)
    return currentView === "block"
      ? "switch to source view"
      : "switch to block view"
  }

  const getCurrentView = () => {
    if (!currentFile) return null
    return viewKind(currentFile.fileType)
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
      <Button
        variant="ghost"
        size="sm"
        onClick={onSave}
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
