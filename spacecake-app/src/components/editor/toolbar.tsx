import { useEditor } from "@/contexts/editor-context"
import { Link } from "@tanstack/react-router"
import { useAtomValue, useSetAtom } from "jotai"
import { Code, Eye, FileSearch, FolderSearch, Save } from "lucide-react"

import { EditorContext, EditorContextHelpers } from "@/types/workspace"
import { isSavingAtom, quickOpenMenuOpenAtom } from "@/lib/atoms/atoms"
import { supportedViews } from "@/lib/language-support"
import { useOpenWorkspace } from "@/lib/open-workspace"
import { encodeBase64Url } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CommandShortcut } from "@/components/ui/command"
import { SAVE_FILE_COMMAND } from "@/components/editor/plugins/save-command"

interface EditorToolbarProps {
  editorContext: EditorContext
}

export function EditorToolbar({ editorContext }: EditorToolbarProps) {
  const { editorRef } = useEditor()
  const isSaving = useAtomValue(isSavingAtom)
  const openQuickOpen = useSetAtom(quickOpenMenuOpenAtom)
  const { handleOpenWorkspace, isOpen: fileExplorerIsOpen } = useOpenWorkspace()

  // Extract values from editor context
  const { filePath, viewKind } = editorContext
  const workspaceId = EditorContextHelpers.workspaceId(editorContext)
  const fileType = EditorContextHelpers.fileType(editorContext)
  const canToggleViews = supportedViews(fileType).size > 1

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
          asChild
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs cursor-pointer"
          aria-label={
            viewKind === "rich"
              ? "switch to source view"
              : "switch to rich view"
          }
          title={
            viewKind === "rich"
              ? "switch to source view"
              : "switch to rich view"
          }
        >
          <Link
            to="/w/$workspaceId/f/$filePath"
            params={{
              workspaceId,
              filePath: encodeBase64Url(filePath),
            }}
            search={{ view: viewKind === "rich" ? "source" : "rich" }}
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
          </Link>
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
