import { useEffect } from "react"
import { EditorPrimaryKey, FilePrimaryKey } from "@/schema"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useAtomValue, useSetAtom } from "jotai"
import { $getSelection, $isNodeSelection, NodeSelection } from "lexical"

import { AbsolutePath, FileType } from "@/types/workspace"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { serializeEditorToSource } from "@/lib/editor"
import { useRoute } from "@/hooks/use-route"
import { convertPythonBlocksToLexical } from "@/components/editor/read-file"

/**
 * Listens for when file state machine enters Reparsing state.
 * Performs full file reparse of Python files while editor is frozen.
 * Emits reparse.complete or reparse.error events when done.
 */
export function ReparsePlugin() {
  const [editor] = useLexicalComposerContext()
  const route = useRoute()

  if (!route?.filePath) return null

  const filePath = AbsolutePath(route.filePath)
  const fileState = useAtomValue(fileStateAtomFamily(filePath))
  const sendFileState = useSetAtom(fileStateAtomFamily(filePath))

  useEffect(() => {
    // Only trigger reparse when state machine is in Reparsing state
    // (state machine ensures we only reach here for Python files in rich view)
    if (fileState?.value !== "Reparsing") return

    let isMounted = true

    async function performReparse() {
      try {
        // Capture current selection before reparse
        let nodeSelection: NodeSelection | null = null
        editor.getEditorState().read(() => {
          const selection = $getSelection()
          if ($isNodeSelection(selection)) {
            nodeSelection = selection
          }
        })

        // Get current editor content (what was just saved to disk)
        const editorState = editor.getEditorState()
        const content = serializeEditorToSource(editorState, FileType.Python)

        // Reuse the existing conversion function which handles:
        // - Progressive rendering
        // - Selection restoration
        // - Error handling
        if (isMounted) {
          await convertPythonBlocksToLexical(
            {
              fileId: FilePrimaryKey(""),
              editorId: EditorPrimaryKey(""),
              path: filePath,
              fileType: FileType.Python,
              content,
              cid: "",
              selection: null, // serializedSelection,
            },
            editor,
            null, // serializedSelection
            nodeSelection,
            undefined,
            () => {
              if (isMounted) {
                sendFileState({ type: "file.reparse.complete" })
              }
            }
          )
        }
      } catch (error) {
        console.error("reparse error:", error)
        if (isMounted) {
          sendFileState({ type: "file.reparse.error" })
        }
      }
    }

    performReparse()

    return () => {
      isMounted = false
    }
  }, [
    fileState?.value,
    route?.fileType,
    route?.viewKind,
    editor,
    filePath,
    sendFileState,
  ])

  return null
}
