import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  LexicalCommand,
} from "lexical"

import { $isCodeBlockNode } from "@/components/editor/nodes/code-node"

export function NodeNavigationPlugin(): null {
  const [editor] = useLexicalComposerContext()

  const handle = (command: LexicalCommand<KeyboardEvent>) => {
    return editor.registerCommand(
      command,
      (event) => {
        if (event && (event.metaKey || event.ctrlKey || event.altKey))
          return false
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        // check if typeahead (slash command) menu is open
        const activeElement = document.activeElement
        const hasTypeaheadMenu =
          activeElement?.getAttribute("aria-controls") === "typeahead-menu"
        const hasActiveDescendant = activeElement
          ?.getAttribute("aria-activedescendant")
          ?.startsWith("typeahead-item-")

        const isInTypeaheadMenu = hasTypeaheadMenu && hasActiveDescendant
        // allow default behavior for menu navigation
        if (isInTypeaheadMenu) {
          return false
        }

        const anchor = selection.anchor
        const anchorNode = anchor.getNode()
        const paragraph = $isParagraphNode(anchorNode)
          ? anchorNode
          : anchorNode.getParent()

        if (!$isParagraphNode(paragraph)) return false

        const firstDescendant = paragraph.getFirstDescendant()
        const lastDescendant = paragraph.getLastDescendant()
        const isEmpty = paragraph.getTextContent().length === 0
        const isAtStart =
          isEmpty ||
          (anchor.offset === 0 &&
            !!firstDescendant &&
            anchorNode === firstDescendant)
        const isAtEnd =
          isEmpty ||
          (!!lastDescendant &&
            anchorNode === lastDescendant &&
            anchor.offset === lastDescendant.getTextContent().length)

        const isForward =
          command === KEY_ARROW_DOWN_COMMAND ||
          command === KEY_ARROW_RIGHT_COMMAND
        const shouldMove = (isForward && isAtEnd) || (!isForward && isAtStart)
        if (shouldMove) {
          const sibling = isForward
            ? paragraph.getNextSibling()
            : paragraph.getPreviousSibling()

          if (!sibling) return false

          event?.preventDefault()
          if ($isCodeBlockNode(sibling)) {
            sibling.select()
          } else if ($isElementNode(sibling)) {
            if (isForward) sibling.selectStart()
            else sibling.selectEnd()
          } else if ($isTextNode(sibling)) {
            if (isForward) sibling.selectStart()
            else sibling.selectEnd()
          }
          return true
        }

        return false
      },
      COMMAND_PRIORITY_HIGH
    )
  }

  useEffect(() => {
    const u1 = handle(KEY_ARROW_UP_COMMAND)
    const u2 = handle(KEY_ARROW_DOWN_COMMAND)
    const u3 = handle(KEY_ARROW_LEFT_COMMAND)
    const u4 = handle(KEY_ARROW_RIGHT_COMMAND)
    return () => {
      u1()
      u2()
      u3()
      u4()
    }
  }, [editor])

  return null
}
