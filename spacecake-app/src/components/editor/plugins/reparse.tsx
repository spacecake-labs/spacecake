import { useEffect } from "react"
import { EditorPrimaryKey, FilePrimaryKey } from "@/schema"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useAtomValue, useSetAtom } from "jotai"
import {
  $addUpdateTag,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  SKIP_DOM_SELECTION_TAG,
  type ElementNode,
  type LexicalNode,
} from "lexical"

import { INITIAL_LOAD_TAG } from "@/types/lexical"
import { type PyBlock } from "@/types/parser"
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
    // Only trigger reparse when state machine is in Reparsing state
    // (state machine ensures we only reach here for Python files in rich view)
    if (fileState?.value !== "Reparsing") return

    let isMounted = true

    async function performReparse() {
      try {
        // Get current editor content (what was just saved to disk)
        const editorState = editor.getEditorState()
        const content = serializeEditorToSource(editorState, FileType.Python)

        // Parse all new blocks first
        const newBlocks: PyBlock[] = []
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
          newBlocks.push(block)
        }

        // If no blocks parsed, fall back to plaintext
        if (newBlocks.length === 0) {
          editor.update(
            () => {
              $addUpdateTag(SKIP_DOM_SELECTION_TAG)
              const root = $getRoot()
              root.clear()
              const paragraph = $createParagraphNode()
              paragraph.append($createTextNode(content))
              root.append(paragraph)
            },
            { tag: INITIAL_LOAD_TAG }
          )
          if (isMounted) {
            sendFileState({ type: "file.reparse.complete" })
          }
          return
        }

        // Now do surgical update: diff and patch blocks by CID
        editor.update(
          () => {
            $addUpdateTag(SKIP_DOM_SELECTION_TAG)
            const root = $getRoot()
            const oldNodes = root.getChildren()

            // Extract block metadata from old nodes to compare
            // For each old node, try to determine its block kind/cid
            const getNodeBlockId = (node: LexicalNode): string | null => {
              const type = node.getType()
              if (type === "container" && $isElementNode(node)) {
                // Container node from delimitPyBlock - get first child code block
                const children = (node as ElementNode).getChildren()
                for (const child of children) {
                  if (child.getType() === "code") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const meta = (child as any).getMeta?.()
                    if (meta) return meta // Use block kind as rough ID
                  }
                }
              } else if (type === "paragraph") {
                // Markdown block - use text content as rough ID
                const text = node.getTextContent()
                if (text.trim()) return text.substring(0, 20) // First 20 chars
              }
              return null
            }

            const getBlockId = (block: PyBlock): string =>
              block.cid || `${block.kind}-${block.name.value}`

            // Create mapping of new blocks by ID for lookup (reserved for future sophisticated diffing)
            // For now, we use simpler position-based matching below

            // Simple strategy: if node count matches and blocks are in same order, only replace changed ones
            // Otherwise, do a full rebuild (safer)
            if (oldNodes.length === newBlocks.length) {
              // Optimistic: try to match by position and only replace changed blocks
              for (let i = 0; i < newBlocks.length; i++) {
                const newBlock = newBlocks[i]
                const oldNode = oldNodes[i]
                const oldId = getNodeBlockId(oldNode)
                const newId = getBlockId(newBlock)

                // If IDs match, keep the old node (preserves selection/focus)
                if (oldId === newId) {
                  continue
                }

                // IDs don't match, replace the node
                let newNode: LexicalNode
                if (
                  newBlock.kind === "markdown inline" ||
                  newBlock.kind === "markdown block"
                ) {
                  newNode = mdBlockToNode(newBlock.text)
                } else {
                  newNode = delimitPyBlock(newBlock, filePath)
                }
                oldNode.replace(newNode)
              }
            } else {
              // Structure changed (different count), do full rebuild
              root.clear()
              for (const block of newBlocks) {
                let newNode: LexicalNode
                if (
                  block.kind === "markdown inline" ||
                  block.kind === "markdown block"
                ) {
                  newNode = mdBlockToNode(block.text)
                } else {
                  newNode = delimitPyBlock(block, filePath)
                }
                root.append(newNode)
              }
            }

            // Ensure there's always a trailing empty node
            root.append(emptyMdNode())
          },
          { tag: INITIAL_LOAD_TAG }
        )

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
