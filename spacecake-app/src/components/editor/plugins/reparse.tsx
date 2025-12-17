import { useEffect } from "react"
import { EditorPrimaryKey, FilePrimaryKey } from "@/schema"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useAtomValue, useSetAtom } from "jotai"
import {
  $addUpdateTag,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  SKIP_DOM_SELECTION_TAG,
} from "lexical"

import { INITIAL_LOAD_TAG } from "@/types/lexical"
import { AbsolutePath, FileType } from "@/types/workspace"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { serializeEditorToSource } from "@/lib/editor"
import { parsePythonContentStreaming } from "@/lib/parser/python/blocks"
import { useRoute } from "@/hooks/use-route"
import { delimitPyBlock } from "@/components/editor/block-utils"
import { emptyMdNode, mdBlockToNode } from "@/components/editor/markdown-utils"

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
    // Only trigger reparse when:
    // 1. State machine is in Reparsing state
    // 2. File is Python
    // 3. View is rich (not source)
    if (fileState?.value !== "Reparsing") return
    if (route?.fileType !== FileType.Python) return
    if (route?.viewKind !== "rich") return

    let isMounted = true

    async function performReparse() {
      try {
        // Get current editor content (what was just saved to disk)
        const editorState = editor.getEditorState()
        const content = serializeEditorToSource(editorState, FileType.Python)

        // Clear root to prepare for reparse
        editor.update(
          () => {
            $addUpdateTag(SKIP_DOM_SELECTION_TAG)
            const root = $getRoot()
            root.clear()
          },
          { tag: INITIAL_LOAD_TAG }
        )

        // Perform full reparse using streaming parser
        let parsedBlockCount = 0
        for await (const block of parsePythonContentStreaming({
          fileId: FilePrimaryKey(""),
          editorId: EditorPrimaryKey(""),
          path: filePath,
          fileType: FileType.Python,
          content,
          cid: "",
          selection: null,
        })) {
          if (!isMounted) return

          editor.update(
            () => {
              $addUpdateTag(SKIP_DOM_SELECTION_TAG)
              const root = $getRoot()

              if (
                block.kind === "markdown inline" ||
                block.kind === "markdown block"
              ) {
                root.append(mdBlockToNode(block.text))
              } else {
                const delimitedNode = delimitPyBlock(block, filePath)
                root.append(delimitedNode)
              }

              root.append(emptyMdNode())
            },
            { tag: INITIAL_LOAD_TAG }
          )
          parsedBlockCount++
        }

        // If no blocks were parsed, fall back to plaintext
        if (parsedBlockCount === 0) {
          editor.update(
            () => {
              const root = $getRoot()
              root.clear()
              const paragraph = $createParagraphNode()
              paragraph.append($createTextNode(content))
              root.append(paragraph)
            },
            { tag: INITIAL_LOAD_TAG }
          )
        }

        if (isMounted) {
          // Signal reparse completion to state machine
          sendFileState({ type: "file.reparse.complete" })
        }
      } catch (error) {
        console.error("reparse error:", error)
        if (isMounted) {
          // Signal reparse error to state machine
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
