import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import * as Effect from "effect/Effect"
import { useSetAtom, useStore } from "jotai"
import {
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  createCommand,
  KEY_DOWN_COMMAND,
  LexicalCommand,
} from "lexical"
import { useCallback, useEffect } from "react"

import { useEditor } from "@/contexts/editor-context"
import { useHotkey } from "@/hooks/use-hotkey"
import { useMenuAction } from "@/hooks/use-menu-action"
import { useRoute } from "@/hooks/use-route"
import { getOrCreateFileStateAtom } from "@/lib/atoms/file-tree"
import { serializeEditorToSource } from "@/lib/editor"
import { addPendingSave } from "@/lib/file-event-handler"
import { fnv1a64Hex } from "@/lib/hash"
import { fileTypeFromFileName } from "@/lib/workspace"
import { EditorManager } from "@/services/editor-manager"
import { RuntimeClient } from "@/services/runtime-client"
import { AbsolutePath } from "@/types/workspace"

// Create the save command
export const SAVE_FILE_COMMAND: LexicalCommand<void> = createCommand()

export function SaveCommandPlugin() {
  const [editor] = useLexicalComposerContext()
  const route = useRoute()
  const selectedFilePath = route?.filePath || null
  const sendFileState = useSetAtom(
    selectedFilePath
      ? getOrCreateFileStateAtom(AbsolutePath(selectedFilePath))
      : getOrCreateFileStateAtom(AbsolutePath("")),
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

          // Send save event to state machine with viewKind
          // The state machine will decide whether to reparse based on file type + view
          const viewKind = route?.viewKind || "rich"
          sendFileState({
            type: "file.save",
            content,
            viewKind,
          })
        }
        return true // Mark as handled
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor, sendFileState, selectedFilePath, cancelDebounce])

  // Register keyboard shortcut for Cmd/Ctrl+S via Lexical's command system
  // (handles events that reach the editor directly)
  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        const isSave = (event.metaKey || event.ctrlKey) && (event.key === "s" || event.key === "S")

        if (isSave) {
          event.preventDefault()
          editor.dispatchCommand(SAVE_FILE_COMMAND, undefined)
          return true // Mark as handled
        }

        return false // Let other handlers process the event
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [editor])

  // document-level fallback for events dispatched from terminal/other sources
  // (e.g., when terminal intercepts Cmd+S and re-dispatches to document)
  useHotkey("mod+s", () => editor.dispatchCommand(SAVE_FILE_COMMAND, undefined), {
    guard: (e) => !e.defaultPrevented,
  })

  // listen for save triggered from the native application menu (File > Save)
  useMenuAction("save", () => editor.dispatchCommand(SAVE_FILE_COMMAND, undefined))

  // save all dirty files
  const store = useStore()
  const workspacePath = route?.workspaceId ? AbsolutePath(route.workspaceId) : null

  const handleSaveAll = useCallback(async () => {
    // save active editor via live lexical state
    editor.dispatchCommand(SAVE_FILE_COMMAND, undefined)

    if (!workspacePath) return

    // save all other dirty files from DB
    const pendingSaves = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const em = yield* EditorManager
        return yield* em.saveAll(workspacePath)
      }),
    )

    for (const save of pendingSaves) {
      if (save.filePath === selectedFilePath) continue
      addPendingSave(save.filePath, save.cid)
      store.set(getOrCreateFileStateAtom(save.filePath), {
        type: "file.save",
        content: save.content,
        viewKind: save.viewKind,
      })
    }
  }, [editor, selectedFilePath, workspacePath, store])

  useMenuAction("save-all", handleSaveAll)
  useHotkey("mod+shift+s", handleSaveAll)

  return null
}
