import * as React from "react"
import { useEditor } from "@/contexts/editor-context"
import type { PaneMachineRef } from "@/machines/pane"
import type { PaneItemPrimaryKey } from "@/schema/pane"
import { useSearch } from "@tanstack/react-router"
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

import type { OpenFileSource } from "@/types/claude-code"
import { RouteContext } from "@/types/workspace"
import { quickOpenMenuOpenAtom, saveResultAtom } from "@/lib/atoms/atoms"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { useOpenWorkspace } from "@/lib/open-workspace"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CommandShortcut } from "@/components/ui/command"
import { SAVE_FILE_COMMAND } from "@/components/editor/plugins/save-command"
import { ViewToggleButton } from "@/components/editor/view-toggle-button"

interface EditorToolbarProps {
  routeContext: RouteContext
  machine?: PaneMachineRef
  activePaneItemId?: PaneItemPrimaryKey
}

export function EditorToolbar({
  routeContext,
  machine,
  activePaneItemId,
}: EditorToolbarProps) {
  const { editorRef } = useEditor()
  const fileStateAtom = fileStateAtomFamily(routeContext.filePath)
  const fileState = useAtomValue(fileStateAtom).value
  const send = useSetAtom(fileStateAtom)
  const isSaving = fileState === "Saving"
  const isConflict = fileState === "Conflict"
  const openQuickOpen = useSetAtom(quickOpenMenuOpenAtom)
  const { handleOpenWorkspace, isOpen: fileExplorerIsOpen } = useOpenWorkspace()

  // Get source from route search params
  const source = useSearch({
    strict: false,
    select: (search) => search?.source as OpenFileSource | undefined,
  })

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

  // Close the tab and return to Claude (triggers notifyFileClosed for --wait support)
  const handleCloseAndReturn = React.useCallback(() => {
    if (!machine || !activePaneItemId) return
    machine.send({
      type: "pane.item.close",
      itemId: activePaneItemId,
      filePath: routeContext.filePath,
      isClosingActiveTab: true,
    })
  }, [machine, activePaneItemId, routeContext.filePath])

  // Save the file, then close the tab
  const handleSaveAndReturn = React.useCallback(() => {
    if (editorRef.current) {
      editorRef.current.dispatchCommand(SAVE_FILE_COMMAND, undefined)
    }
    // Small delay to allow save to complete before closing
    setTimeout(handleCloseAndReturn, 100)
  }, [editorRef, handleCloseAndReturn])

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

  // When opened by Claude, show simplified toolbar with just close actions
  if (source && machine && activePaneItemId) {
    const isDirty = fileState === "Dirty"
    // Preferred action: close when clean, save & close when dirty
    const primaryButtonClass =
      "h-7 px-2.5 text-xs cursor-pointer border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/60"
    const secondaryButtonClass =
      "h-7 px-2.5 text-xs cursor-pointer border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:text-zinc-400 dark:hover:bg-zinc-800/60"

    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCloseAndReturn}
          className={cn(isDirty ? secondaryButtonClass : primaryButtonClass)}
          aria-label="close and return to claude"
          title="close and return to claude"
        >
          <X className="h-3 w-3 mr-1" />
          close
        </Button>
        {isDirty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveAndReturn}
            className={cn(primaryButtonClass)}
            aria-label="save and close"
            title="save and close"
          >
            <Check className="h-3 w-3 mr-1" />
            save & close
          </Button>
        )}
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
        {renderSaveIcon()}
        save
      </Button>
    </div>
  )
}
