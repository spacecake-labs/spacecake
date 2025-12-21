import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $addUpdateTag,
  $getNodeByKey,
  $getRoot,
  SKIP_DOM_SELECTION_TAG,
} from "lexical"

import { INITIAL_LOAD_TAG } from "@/types/lexical"
import { emptyMdNode } from "@/components/editor/markdown-utils"
import { needsSpacer } from "@/components/editor/plugins/utils"

/**
 * Inserts empty markdown nodes between consecutive decorator nodes.
 * Decorator nodes (code blocks, mermaid diagrams, images, etc) should be separated
 * to give users a natural place to add content between them.
 *
 * Uses two passes for safety: first collects node keys where spacers are needed,
 * then inserts them in a single transaction to avoid tree mutation issues.
 */
export function DecoratorSpacerPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, tags }) => {
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

          // collect consecutive decorator node pairs in a single pass
          const nodesToSpacerAfter: string[] = []
          for (let i = 0; i < children.length - 1; i++) {
            if (needsSpacer(children[i]) && needsSpacer(children[i + 1])) {
              nodesToSpacerAfter.push(children[i].getKey())
            }
          }

          // also check if the last node is a decorator node
          const lastChild = root.getLastChild()
          if (lastChild && needsSpacer(lastChild)) {
            nodesToSpacerAfter.push(lastChild.getKey())
          }

          // insert spacers in a single update transaction
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
      }
    )
  }, [editor])

  return null
}
