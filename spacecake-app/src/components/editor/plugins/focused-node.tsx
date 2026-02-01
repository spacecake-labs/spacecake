import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { addClassNamesToElement, removeClassNamesFromElement } from "@lexical/utils"
import { $getSelection, $isParagraphNode, $isRangeSelection } from "lexical"
import { useEffect, useRef } from "react"

const FOCUSED_NODE_CLASS = "focused-node"
const WAS_FOCUSED_NODE_CLASS = "was-focused-node"

/**
 * Plugin that manages CSS classes for paragraph focus state.
 *
 * Adds "focused-node" class to the currently focused paragraph.
 * Adds "was-focused-node" class when leaving a paragraph (persists until page reload).
 *
 * These classes enable:
 * - Showing empty paragraphs only when focused (via :not(.focused-node) selector)
 * - Different collapse animations for never-focused vs previously-focused paragraphs
 *
 * Uses a ref to efficiently track and update classes on DOM elements.
 */
export function FocusedNodePlugin(): null {
  const [editor] = useLexicalComposerContext()
  const previouslyFocusedDomRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          // clear focus if no selection
          if (previouslyFocusedDomRef.current) {
            removeClassNamesFromElement(previouslyFocusedDomRef.current, FOCUSED_NODE_CLASS)
            addClassNamesToElement(previouslyFocusedDomRef.current, WAS_FOCUSED_NODE_CLASS)
            previouslyFocusedDomRef.current = null
          }
          return
        }

        const anchor = selection.anchor
        const anchorNode = anchor.getNode()
        const focusedParagraph = $isParagraphNode(anchorNode) ? anchorNode : anchorNode.getParent()

        if (!$isParagraphNode(focusedParagraph)) {
          // not a paragraph, clear previous
          if (previouslyFocusedDomRef.current) {
            removeClassNamesFromElement(previouslyFocusedDomRef.current, FOCUSED_NODE_CLASS)
            addClassNamesToElement(previouslyFocusedDomRef.current, WAS_FOCUSED_NODE_CLASS)
            previouslyFocusedDomRef.current = null
          }
          return
        }

        // get the DOM element for the focused paragraph
        const focusedDom = editor.getElementByKey(focusedParagraph.getKey())

        // if same dom element is still focused, do nothing
        if (focusedDom === previouslyFocusedDomRef.current) {
          return
        }

        // remove class from previous element
        if (previouslyFocusedDomRef.current && previouslyFocusedDomRef.current !== focusedDom) {
          removeClassNamesFromElement(previouslyFocusedDomRef.current, FOCUSED_NODE_CLASS)
          addClassNamesToElement(previouslyFocusedDomRef.current, WAS_FOCUSED_NODE_CLASS)
        }

        // add class to current element
        if (focusedDom) {
          addClassNamesToElement(focusedDom, FOCUSED_NODE_CLASS)
          previouslyFocusedDomRef.current = focusedDom
        }
      })
    })
  }, [editor])

  return null
}
