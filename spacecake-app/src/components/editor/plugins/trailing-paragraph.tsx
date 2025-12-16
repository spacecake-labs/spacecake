import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getRoot, $isParagraphNode, DecoratorNode } from "lexical"

import { INITIAL_LOAD_TAG } from "@/types/lexical"
import { emptyMdNode } from "@/components/editor/markdown-utils"
import { $isContainerNode } from "@/components/editor/nodes/container-node"

/**
 * Ensures there's always an empty paragraph node at the end of the editor
 * after decorator nodes (code blocks, mermaid diagrams, images, etc).
 * This gives users a natural place to continue typing after inserting these blocks.
 */
export function TrailingParagraphPlugin(): null {
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
          const lastChild = root.getLastChild()

          // if the last child is a decorator node, append an empty paragraph
          // (but only if there isn't already a paragraph node after it)
          if (lastChild instanceof DecoratorNode) {
            const nextSibling = lastChild.getNextSibling()
            if (
              !nextSibling ||
              !$isParagraphNode(nextSibling) ||
              !$isContainerNode(nextSibling)
            ) {
              editor.update(
                () => {
                  lastChild.insertAfter(emptyMdNode())
                },
                { discrete: true }
              )
            }
          }
        })
      }
    )
  }, [editor])

  return null
}
