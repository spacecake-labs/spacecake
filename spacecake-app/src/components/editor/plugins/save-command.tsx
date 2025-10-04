import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useSetAtom } from "jotai"
import {
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  KEY_DOWN_COMMAND,
  LexicalCommand,
} from "lexical"

import { AbsolutePath } from "@/types/workspace"
import { saveFileAtom } from "@/lib/atoms/atoms"
import { useEditorContext } from "@/hooks/use-filepath"

// Create the save command
export const SAVE_FILE_COMMAND: LexicalCommand<void> = createCommand()

export function SaveCommandPlugin() {
  const [editor] = useLexicalComposerContext()
  const saveFile = useSetAtom(saveFileAtom)
  const editorContext = useEditorContext()
  const selectedFilePath = editorContext?.filePath || null

  useEffect(() => {
    return editor.registerCommand(
      SAVE_FILE_COMMAND,
      () => {
        // Only save if we have a valid file path
        if (selectedFilePath) {
          void saveFile(AbsolutePath(selectedFilePath), editor)
        }
        return true // Mark as handled
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor, saveFile, selectedFilePath])

  // Register keyboard shortcut for Cmd/Ctrl+S
  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        const isSave =
          (event.metaKey || event.ctrlKey) &&
          (event.key === "s" || event.key === "S")

        if (isSave) {
          event.preventDefault()
          editor.dispatchCommand(SAVE_FILE_COMMAND, undefined)
          return true // Mark as handled
        }

        return false // Let other handlers process the event
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
