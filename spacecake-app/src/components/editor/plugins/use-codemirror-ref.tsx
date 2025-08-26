import React from "react"
import { EditorView } from "@codemirror/view"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { atom, useSetAtom } from "jotai"
import {
  $createParagraphNode,
  $getNodeByKey,
  $isParagraphNode,
  LexicalEditor,
  LexicalNode,
  ParagraphNode,
} from "lexical"

import { debounce } from "@/lib/utils"
import { useCodeBlockEditorContext } from "@/components/editor/nodes/code-node"
import { maybeSplitBlock } from "@/components/editor/plugins/block-splitting"

// jotai atoms for editor state
export const activeEditorAtom = atom<LexicalEditor | null>(null)
export const editorInFocusAtom = atom<{
  editorType: string
  rootNode: LexicalNode
} | null>(null)

// Type for CodeMirror ref
export interface CodeMirrorRef {
  getCodemirror: () => EditorView
}

export function useCodeMirrorRef(
  nodeKey: string,
  editorType: "codeblock",
  language: string,
  focusEmitter: {
    subscribe: (cb: () => void) => void
    publish: () => void
  }
) {
  const [editor] = useLexicalComposerContext()
  const setEditorInFocus = useSetAtom(editorInFocusAtom)
  const codeMirrorRef = React.useRef<CodeMirrorRef | null>(null)
  const { lexicalNode } = useCodeBlockEditorContext()

  const debouncedSplit = React.useRef(
    debounce(() => {
      maybeSplitBlock(editor, nodeKey)
    }, 250)
  )

  // helpers
  const isOnFirstDocLine = (view: EditorView) => {
    const head = view.state.selection.main.head
    return view.state.doc.lineAt(head).number === 1
  }
  const isOnLastDocLine = (view: EditorView) => {
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    return line.number === view.state.doc.lines
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

  const isEmptyParagraph = (node: LexicalNode): node is ParagraphNode => {
    return $isParagraphNode(node) && node.getTextContent().length === 0
  }

  const onFocusHandler = React.useCallback(() => {
    setEditorInFocus({
      editorType,
      rootNode: lexicalNode,
    })
  }, [editorType, lexicalNode, setEditorInFocus])

  const onKeyDownHandler = React.useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        const view = codeMirrorRef.current?.getCodemirror()
        if (view) {
          const shouldExit =
            (e.key === "ArrowDown" && isOnLastDocLine(view)) ||
            (e.key === "ArrowRight" &&
              isOnLastDocLine(view) &&
              isAtLineEnd(view))

          if (shouldExit) {
            e.preventDefault()
            e.stopPropagation()
            editor.update(() => {
              const node = $getNodeByKey(nodeKey)!
              view.contentDOM.blur()
              const next = node.getNextSibling()
              // always land in a paragraph after the code block; reuse empty if present
              if (next && isEmptyParagraph(next)) {
                next.selectStart()
              } else {
                const paragraph = $createParagraphNode()
                node.insertAfter(paragraph)
                paragraph.select()
              }
            })
            debouncedSplit.current.schedule()
            // ensure focus transitions to lexical so the caret is visible
            setTimeout(() => {
              editor.focus()
              const rootEl = editor.getRootElement()
              if (rootEl) {
                rootEl.focus()
              } else {
                const el = document.querySelector(
                  ".ContentEditable__root"
                ) as HTMLElement | null
                el?.focus()
              }
            }, 50)
          }
        }
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        const view = codeMirrorRef.current?.getCodemirror()
        if (view) {
          const shouldExit =
            (e.key === "ArrowUp" && isOnFirstDocLine(view)) ||
            (e.key === "ArrowLeft" &&
              isOnFirstDocLine(view) &&
              isAtLineStart(view))

          if (shouldExit) {
            e.preventDefault()
            e.stopPropagation()
            editor.update(() => {
              const node = $getNodeByKey(nodeKey)!
              view.contentDOM.blur()
              const prev = node.getPreviousSibling()
              if (prev && isEmptyParagraph(prev)) {
                prev.selectEnd()
              } else {
                const paragraph = $createParagraphNode()
                node.insertBefore(paragraph)
                paragraph.select()
              }
            })
            debouncedSplit.current.schedule()
            setTimeout(() => {
              editor.focus()
              const rootEl = editor.getRootElement()
              if (rootEl) {
                rootEl.focus()
              } else {
                const el = document.querySelector(
                  ".ContentEditable__root"
                ) as HTMLElement | null
                el?.focus()
              }
            }, 50)
          }
        }
      } else if (e.key === "Backspace" || e.key === "Delete") {
        const state = codeMirrorRef.current?.getCodemirror()?.state
        const docLength = state?.doc.length
        if (docLength === 0) {
          editor.update(() => {
            const node = $getNodeByKey(nodeKey)!
            node.remove()
          })
        }
      }
      // else if (e.key === "Enter") {
      //   console.log("enter key down");
      //   // const node = $getNodeByKey(nodeKey);
      //   // prevent default enter behavior
      //   // e.preventDefault();
      //   // e.stopPropagation();
      //   // insert a newline
      //   // const view = codeMirrorRef.current?.getCodemirror();
      //   // if (view) {
      //   //   view.dispatch({
      //   //     changes: { from: view.state.selection.main.head, insert: "\n" },
      //   //   });
      //   // }

      //   debouncedSplit.current.schedule();
      // }
    },
    [editor, nodeKey]
  )

  React.useEffect(() => {
    const codeMirror = codeMirrorRef.current
    setTimeout(() => {
      codeMirror
        ?.getCodemirror()
        ?.contentDOM.addEventListener("focus", onFocusHandler)
      codeMirror
        ?.getCodemirror()
        ?.contentDOM.addEventListener("keydown", onKeyDownHandler, true)
    }, 300)

    return () => {
      codeMirror
        ?.getCodemirror()
        ?.contentDOM.removeEventListener("focus", onFocusHandler)
      codeMirror
        ?.getCodemirror()
        ?.contentDOM.removeEventListener("keydown", onKeyDownHandler, true)
    }
  }, [codeMirrorRef, onFocusHandler, onKeyDownHandler, language])

  React.useEffect(() => {
    focusEmitter.subscribe(() => {
      codeMirrorRef.current?.getCodemirror()?.focus()
      onFocusHandler()
    })
  }, [focusEmitter, codeMirrorRef, nodeKey, onFocusHandler])

  return codeMirrorRef
}
