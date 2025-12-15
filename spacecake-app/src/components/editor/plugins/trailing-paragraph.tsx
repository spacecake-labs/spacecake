import { useLayoutEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createParagraphNode,
  $getRoot,
  $isParagraphNode,
  DecoratorNode,
} from "lexical"

import { INITIAL_LOAD_TAG } from "@/types/lexical"

/**
 * Ensures there's always an empty paragraph node at the end of the editor
 * after decorator nodes (code blocks, mermaid diagrams, images, etc).
 * This gives users a natural place to continue typing after inserting these blocks.
 */
export function TrailingParagraphPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useLayoutEffect(() => {
    return editor.registerUpdateListener(({ editorState, tags }) => {
      // skip initial load - don't modify user's saved files
      if (tags.has(INITIAL_LOAD_TAG)) {
        return
      }

      editorState.read(() => {
        const root = $getRoot()
        const lastChild = root.getLastChild()

        // if the last child is a decorator node, append an empty paragraph
        // (but only if there isn't already a paragraph node after it)
        if (lastChild instanceof DecoratorNode) {
          const nextSibling = lastChild.getNextSibling()
          if (!nextSibling || !$isParagraphNode(nextSibling)) {
            editor.update(
              () => {
                lastChild.insertAfter($createParagraphNode())
              },
              { discrete: true }
            )
          }
        }
      })
    })
  }, [editor])

  return null
}
