import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useAtomValue, useSetAtom } from "jotai"
import { $getRoot } from "lexical"
import { useEffect } from "react"

import { $isCodeBlockNode } from "@/components/editor/nodes/code-node"
import { maybeUpdateBlockAndDocstring } from "@/components/editor/plugins/block-utils"
import { useRoute } from "@/hooks/use-route"
import { getOrCreateFileStateAtom } from "@/lib/atoms/file-tree"
import { AbsolutePath } from "@/types/workspace"

/**
 * Listens for when file state machine enters Reparsing state.
 * Traverses all code block nodes in the editor and updates them.
 * Emits reparse.complete or reparse.error events when done.
 */
export function ReparsePlugin() {
  const route = useRoute()
  if (!route?.filePath) return null
  return <ReparsePluginInner filePath={AbsolutePath(route.filePath)} />
}

function ReparsePluginInner({ filePath }: { filePath: AbsolutePath }) {
  const [editor] = useLexicalComposerContext()
  const fileState = useAtomValue(getOrCreateFileStateAtom(filePath))
  const sendFileState = useSetAtom(getOrCreateFileStateAtom(filePath))

  useEffect(() => {
    if (fileState?.value !== "Reparsing") return

    let isMounted = true

    async function performReparse() {
      try {
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
  }, [fileState?.value, editor, filePath, sendFileState])

  return null
}
