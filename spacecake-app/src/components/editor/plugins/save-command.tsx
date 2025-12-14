import { useEffect } from "react"
import { useEditor } from "@/contexts/editor-context"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useSetAtom } from "jotai"
import {
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  createCommand,
  KEY_DOWN_COMMAND,
  LexicalCommand,
} from "lexical"

import { AbsolutePath } from "@/types/workspace"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { serializeEditorToSource } from "@/lib/editor"
import { addPendingSave } from "@/lib/file-event-handler"
import { fnv1a64Hex } from "@/lib/hash"
import { fileTypeFromFileName } from "@/lib/workspace"
import { useRoute } from "@/hooks/use-route"

// Create the save command
export const SAVE_FILE_COMMAND: LexicalCommand<void> = createCommand()

export function SaveCommandPlugin() {
  const [editor] = useLexicalComposerContext()
  const route = useRoute()
  const selectedFilePath = route?.filePath || null
  const sendFileState = useSetAtom(
    selectedFilePath
      ? fileStateAtomFamily(AbsolutePath(selectedFilePath))
      : fileStateAtomFamily(AbsolutePath(""))
  )
  const { cancelDebounce } = useEditor()

  useEffect(() => {
    return editor.registerCommand(
      SAVE_FILE_COMMAND,
      () => {
        // Only save if we have a valid file path
        if (selectedFilePath) {
          // cancel the pending debounce to prevent it from marking the file
          // as dirty after the save completes
          cancelDebounce()

          const filePath = AbsolutePath(selectedFilePath)
          const editorState = editor.getEditorState()
          const fileType = fileTypeFromFileName(filePath)
          const content = serializeEditorToSource(editorState, fileType)
          const cid = fnv1a64Hex(content)

          // Add to pending saves so file watcher recognizes it as app-initiated
          addPendingSave(filePath, cid)

          // Send save event to state machine with editor
          // The state machine will handle re-parsing for Python files
          sendFileState({
            type: "file.save",
            content,
          })
        }
        return true // Mark as handled
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor, sendFileState, selectedFilePath, cancelDebounce])

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
      COMMAND_PRIORITY_HIGH
    )
  }, [editor])

  return null
}
