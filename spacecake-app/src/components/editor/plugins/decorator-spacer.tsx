import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $addUpdateTag, $getNodeByKey, $getRoot, SKIP_DOM_SELECTION_TAG } from "lexical"
import { useEffect } from "react"

import { emptyMdNode } from "@/components/editor/markdown-utils"
import { $isCodeBlockNode } from "@/components/editor/nodes/code-node"
import { needsSpacer } from "@/components/editor/plugins/utils"
import { INITIAL_LOAD_TAG } from "@/types/lexical"

/**
 * Inserts empty markdown nodes between consecutive decorator nodes.
 * Decorator nodes (code blocks, mermaid diagrams, images, etc) should be separated
 * to give users a natural place to add content between them.
 *
 * Detects source mode by checking if the first child is a CodeBlockNode with
 * meta="source" (set by convertToSourceView). In source mode, only the source
 * code block is kept; all other nodes are removed.
 */
export function DecoratorSpacerPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
      // skip initial load - don't modify user's saved files
      if (tags.has(INITIAL_LOAD_TAG)) {
        return
      }

      // only check if content changed, not on selection-only updates
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
        return
      }

      editorState.read(() => {
        const root = $getRoot()
        const children = root.getChildren()
        if (children.length === 0) return

        // Source mode: first child is code block with meta="source"
        const firstChild = children[0]
        const isSourceMode = $isCodeBlockNode(firstChild) && firstChild.getMeta() === "source"

        if (isSourceMode) {
          // Keep only the source code block, remove everything else
          if (children.length > 1) {
            editor.update(() => {
              $addUpdateTag(SKIP_DOM_SELECTION_TAG)
              for (let i = 1; i < children.length; i++) {
                $getNodeByKey(children[i].getKey())?.remove()
              }
            })
          }
          return
        }

        // Rich mode: collect nodes needing spacers (single pass)
        const nodesToSpacerAfter: string[] = []
        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          if (!needsSpacer(child)) continue

          const nextChild = children[i + 1]
          // Add spacer after decorator if: it's last, or next is also a decorator
          if (!nextChild || needsSpacer(nextChild)) {
            nodesToSpacerAfter.push(child.getKey())
          }
        }

        if (nodesToSpacerAfter.length > 0) {
          editor.update(() => {
            $addUpdateTag(SKIP_DOM_SELECTION_TAG)
            for (const nodeKey of nodesToSpacerAfter) {
              const node = $getNodeByKey(nodeKey)
              if (node && needsSpacer(node)) {
                node.insertAfter(emptyMdNode())
              }
            }
          })
        }
      })
    })
  }, [editor])

  return null
}
