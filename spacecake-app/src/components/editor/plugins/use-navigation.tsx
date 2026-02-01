import { EditorView, keymap } from "@codemirror/view"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $addUpdateTag,
  $createNodeSelection,
  $createRangeSelection,
  $getNodeByKey,
  $isElementNode,
  $isTextNode,
  $setSelection,
  LexicalNode,
  SKIP_DOM_SELECTION_TAG,
} from "lexical"
import React from "react"

import { $isCodeBlockNode } from "@/components/editor/nodes/code-node"
import { $isFrontmatterNode } from "@/components/editor/nodes/frontmatter-node"
import { $isMermaidNode } from "@/components/editor/nodes/mermaid-node"
import { maybeUpdateBlockAndDocstring } from "@/components/editor/plugins/block-utils"
import { debounce } from "@/lib/utils"

export function useNavigation(nodeKey: string) {
  const [editor] = useLexicalComposerContext()

  const debouncedUpdate = React.useRef(
    debounce(() => {
      maybeUpdateBlockAndDocstring(editor, nodeKey)
    }, 250),
  )

  // Helper functions for CodeMirror position detection
  const isOnFirstDocLine = (view: EditorView) => {
    const head = view.state.selection.main.head
    return view.state.doc.lineAt(head).number === 1
  }

  const isOnLastDocLine = (view: EditorView) => {
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    const isLastLine = line.number === view.state.doc.lines
    return isLastLine
  }

  const isAtLineStart = (view: EditorView) => {
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    return head === line.from
  }

  const isAtLineEnd = (view: EditorView) => {
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    return head === line.to
  }

  // Navigation logic for moving between nodes
  const navigateToNextNode = React.useCallback(() => {
    let nextNode: LexicalNode | null = null

    editor.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
      const node = $getNodeByKey(nodeKey)!
      nextNode = node.getNextSibling()
    })

    // Apply selection outside the transaction
    if (nextNode) {
      if ($isCodeBlockNode(nextNode) || $isMermaidNode(nextNode) || $isFrontmatterNode(nextNode)) {
        editor.update(() => {
          const selection = $createNodeSelection()
          selection.add(nextNode!.getKey())
          $setSelection(selection)
          ;(nextNode as unknown as { select: () => void }).select()
        })
      } else if ($isElementNode(nextNode)) {
        editor.update(() => {
          const rangeSelection = $createRangeSelection()
          rangeSelection.anchor.set(nextNode!.getKey(), 0, "element")
          rangeSelection.focus.set(nextNode!.getKey(), 0, "element")
          $setSelection(rangeSelection)
        })
      } else if ($isTextNode(nextNode)) {
        editor.update(() => {
          ;(nextNode as unknown as { selectStart: () => void }).selectStart()
        })
      }
    }

    debouncedUpdate.current.schedule()
  }, [editor, nodeKey])

  const navigateToPreviousNode = React.useCallback(() => {
    let prevNode: LexicalNode | null = null

    editor.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
      const node = $getNodeByKey(nodeKey)!
      prevNode = node.getPreviousSibling()
    })

    // Apply selection outside the transaction
    if (prevNode) {
      if ($isCodeBlockNode(prevNode) || $isMermaidNode(prevNode) || $isFrontmatterNode(prevNode)) {
        editor.update(() => {
          const selection = $createNodeSelection()
          selection.add(prevNode!.getKey())
          $setSelection(selection)
          ;(prevNode as unknown as { select: () => void }).select()
        })
      } else if ($isElementNode(prevNode)) {
        editor.update(() => {
          const rangeSelection = $createRangeSelection()
          rangeSelection.anchor.set(prevNode!.getKey(), 0, "element")
          rangeSelection.focus.set(prevNode!.getKey(), 0, "element")
          $setSelection(rangeSelection)
        })
      } else if ($isTextNode(prevNode)) {
        editor.update(() => {
          ;(prevNode as unknown as { selectEnd: () => void }).selectEnd()
        })
      }
    }

    debouncedUpdate.current.schedule()
  }, [editor, nodeKey])

  // Create CodeMirror keymap for navigation
  const navigationKeymap = React.useMemo(() => {
    return keymap.of([
      {
        key: "ArrowDown",
        run: (view) => {
          const isLastLine = isOnLastDocLine(view)
          if (isLastLine) {
            view.contentDOM.blur()
            navigateToNextNode()
            return true
          }
          return false
        },
      },
      {
        key: "ArrowUp",
        run: (view) => {
          const isFirstLine = isOnFirstDocLine(view)
          if (isFirstLine) {
            view.contentDOM.blur()
            navigateToPreviousNode()
            return true
          }
          return false
        },
      },
      {
        key: "ArrowRight",
        run: (view) => {
          const isLastLine = isOnLastDocLine(view)
          const isLineEnd = isAtLineEnd(view)
          if (isLastLine && isLineEnd) {
            view.contentDOM.blur()
            navigateToNextNode()
            return true
          }
          return false
        },
      },
      {
        key: "ArrowLeft",
        run: (view) => {
          const isFirstLine = isOnFirstDocLine(view)
          const isLineStart = isAtLineStart(view)
          if (isFirstLine && isLineStart) {
            view.contentDOM.blur()
            navigateToPreviousNode()
            return true
          }
          return false
        },
      },
      {
        key: "Backspace",
        run: (view) => {
          const docLength = view.state.doc.length
          if (docLength === 0) {
            editor.update(() => {
              $addUpdateTag(SKIP_DOM_SELECTION_TAG)
              const node = $getNodeByKey(nodeKey)!
              node.remove()
            })
            return true
          }
          return false
        },
      },
      {
        key: "Delete",
        run: (view) => {
          const docLength = view.state.doc.length
          if (docLength === 0) {
            editor.update(() => {
              $addUpdateTag(SKIP_DOM_SELECTION_TAG)
              const node = $getNodeByKey(nodeKey)!
              node.remove()
            })
            return true
          }
          return false
        },
      },
    ])
  }, [navigateToNextNode, navigateToPreviousNode, editor, nodeKey])

  return {
    navigationKeymap,
  }
}
