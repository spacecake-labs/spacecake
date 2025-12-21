import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
} from "lexical"

import { needsSpacer } from "@/components/editor/plugins/utils"

/**
 * Plugin that prevents backspace deletion of empty paragraphs between code/context nodes.
 * This ensures users cannot accidentally delete the structural empty paragraphs
 * that separate parsed blocks.
 */
export function BackspacePreventionPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const unregister = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent | null) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        const anchor = selection.anchor
        const anchorNode = anchor.getNode()
        const paragraph = $isParagraphNode(anchorNode)
          ? anchorNode
          : anchorNode.getParent()

        if (!$isParagraphNode(paragraph)) return false

        // check if paragraph is empty
        const isEmpty = paragraph.getTextContent().length === 0
        if (!isEmpty) return false

        // check if cursor is at the start of the paragraph
        const isAtStart = anchor.offset === 0
        if (!isAtStart) return false

        // check if this empty paragraph is between code/context nodes
        const prevSibling = paragraph.getPreviousSibling()
        const nextSibling = paragraph.getNextSibling()

        const isBetweenCodeNodes = prevSibling && needsSpacer(prevSibling)
        const isBetweenContextNodes = nextSibling && needsSpacer(nextSibling)

        // prevent backspace if this empty paragraph is between parsed blocks
        if (isBetweenCodeNodes || isBetweenContextNodes) {
          event?.preventDefault()
          return true
        }

        return false
      },
      COMMAND_PRIORITY_HIGH
    )

    return unregister
  }, [editor])

  return null
}
