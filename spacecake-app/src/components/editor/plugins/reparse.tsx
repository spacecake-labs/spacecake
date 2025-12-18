import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useAtomValue, useSetAtom } from "jotai"
import { $getRoot } from "lexical"

import { AbsolutePath } from "@/types/workspace"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { useRoute } from "@/hooks/use-route"
import { $isCodeBlockNode } from "@/components/editor/nodes/code-node"
import { maybeUpdateBlockAndDocstring } from "@/components/editor/plugins/block-utils"

/**
 * Listens for when file state machine enters Reparsing state.
 * Traverses all code block nodes in the editor and updates them.
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
        // Collect all code block node keys
        const codeBlockKeys: string[] = []
        editor.getEditorState().read(() => {
          const root = $getRoot()
          const children = root.getChildren()
          for (const child of children) {
            if ($isCodeBlockNode(child)) {
              codeBlockKeys.push(child.getKey())
            }
          }
        })

        // Update each code block node
        if (isMounted) {
          for (const nodeKey of codeBlockKeys) {
            await maybeUpdateBlockAndDocstring(editor, nodeKey, true)
          }
          sendFileState({ type: "file.reparse.complete" })
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
