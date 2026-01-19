import * as React from "react"
import { useEditor } from "@/contexts/editor-context"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Check,
  FileSearch,
  FileWarning,
  FolderSearch,
  Loader2,
  Save,
  X,
} from "lucide-react"

import { RouteContext } from "@/types/workspace"
import { quickOpenMenuOpenAtom, saveResultAtom } from "@/lib/atoms/atoms"
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

  // Track previous state for transition detection
  const prevStateRef = React.useRef(fileState)
  const [saveResult, setSaveResult] = useAtom(saveResultAtom)

  // Detect state transitions
  if (prevStateRef.current !== fileState) {
    const prev = prevStateRef.current
    prevStateRef.current = fileState

    if (prev === "Saving" && fileState === "Clean") {
      setSaveResult("success")
      setTimeout(() => setSaveResult(null), 1500)
    } else if (
      prev === "Saving" &&
      (fileState === "Dirty" || fileState === "Conflict")
    ) {
      setSaveResult("error")
      setTimeout(() => setSaveResult(null), 1500)
    }
  }

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

  const renderSaveIcon = () => {
    return (
      <span className="relative mr-1 inline-flex h-3 w-3 items-center justify-center">
        <Save
          className={`h-3 w-3 transition-opacity duration-300 ${
            isSaving || saveResult ? "opacity-0" : "opacity-100"
          }`}
        />
        <Loader2
          className={`absolute h-3 w-3 animate-spin transition-opacity duration-300 ${
            isSaving ? "opacity-100" : "opacity-0"
          }`}
        />
        <Check
          className={`absolute h-3 w-3 text-green-500 transition-opacity duration-300 ${
            saveResult === "success" ? "opacity-100" : "opacity-0"
          }`}
        />
        <X
          className={`absolute h-3 w-3 text-red-500 transition-opacity duration-300 ${
            saveResult === "error" ? "opacity-100" : "opacity-0"
          }`}
        />
      </span>
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
        {renderSaveIcon()}
        save
      </Button>
    </div>
  )
}
