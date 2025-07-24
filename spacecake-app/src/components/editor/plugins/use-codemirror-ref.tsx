import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getNodeByKey,
  LexicalEditor,
  LexicalNode,
} from "lexical";
import React from "react";
import { useCodeBlockEditorContext } from "@/components/editor/nodes/code-node";
import { atom, useAtom } from "jotai";
import { EditorView } from "@codemirror/view";

// jotai atoms for editor state
export const activeEditorAtom = atom<LexicalEditor | null>(null);
export const editorInFocusAtom = atom<{
  editorType: string;
  rootNode: LexicalNode;
} | null>(null);

// Type for CodeMirror ref
export interface CodeMirrorRef {
  getCodemirror: () => EditorView;
}

export function useCodeMirrorRef(
  nodeKey: string,
  editorType: "codeblock",
  language: string,
  focusEmitter: {
    subscribe: (cb: () => void) => void;
    publish: () => void;
  }
) {
  const [editor] = useLexicalComposerContext();
  const [, setEditorInFocus] = useAtom(editorInFocusAtom);
  const codeMirrorRef = React.useRef<CodeMirrorRef | null>(null);
  const { lexicalNode } = useCodeBlockEditorContext();

  // these flags escape the editor with arrows.
  // they are set to true when the cursor is at the top or bottom of the editor, and then the user presses the arrow.
  const atBottom = React.useRef(false);
  const atTop = React.useRef(false);

  const onFocusHandler = React.useCallback(() => {
    setEditorInFocus({
      editorType,
      rootNode: lexicalNode,
    });
  }, [editorType, lexicalNode, setEditorInFocus]);

  const onKeyDownHandler = React.useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        const state = codeMirrorRef.current?.getCodemirror()?.state;
        if (state) {
          const docLength = state.doc.length;
          const selectionEnd = state.selection.ranges[0].to;

          if (docLength === selectionEnd) {
            // escaping once
            if (!atBottom.current) {
              atBottom.current = true;
            } else {
              // escaping twice
              editor.update(() => {
                const node = $getNodeByKey(nodeKey)!;
                const nextSibling = node.getNextSibling();
                if (nextSibling) {
                  codeMirrorRef.current?.getCodemirror()?.contentDOM.blur();
                  node.selectNext();
                } else {
                  node.insertAfter($createParagraphNode());
                }
              });
              atBottom.current = false;
            }
          }
        }
      } else if (e.key === "ArrowUp") {
        const state = codeMirrorRef.current?.getCodemirror()?.state;
        if (state) {
          const selectionStart = state.selection.ranges[0].from;

          if (selectionStart === 0) {
            // escaping once
            if (!atTop.current) {
              atTop.current = true;
            } else {
              // escaping twice
              editor.update(() => {
                const node = $getNodeByKey(nodeKey)!;
                const previousSibling = node.getPreviousSibling();
                if (previousSibling) {
                  codeMirrorRef.current?.getCodemirror()?.contentDOM.blur();
                  node.selectPrevious();
                } else {
                  // TODO: insert a paragraph before the code block node
                }
              });
              atTop.current = false;
            }
          }
        }
      } else if (e.key === "Enter") {
        e.stopPropagation();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        const state = codeMirrorRef.current?.getCodemirror()?.state;
        const docLength = state?.doc.length;
        if (docLength === 0) {
          editor.update(() => {
            const node = $getNodeByKey(nodeKey)!;
            node.remove();
          });
        }
      }
    },
    [editor, nodeKey]
  );

  React.useEffect(() => {
    const codeMirror = codeMirrorRef.current;
    setTimeout(() => {
      codeMirror
        ?.getCodemirror()
        ?.contentDOM.addEventListener("focus", onFocusHandler);
      codeMirror
        ?.getCodemirror()
        ?.contentDOM.addEventListener("keydown", onKeyDownHandler);
    }, 300);

    return () => {
      codeMirror
        ?.getCodemirror()
        ?.contentDOM.removeEventListener("focus", onFocusHandler);
      codeMirror
        ?.getCodemirror()
        ?.contentDOM.removeEventListener("keydown", onKeyDownHandler);
    };
  }, [codeMirrorRef, onFocusHandler, onKeyDownHandler, language]);

  React.useEffect(() => {
    focusEmitter.subscribe(() => {
      codeMirrorRef.current?.getCodemirror()?.focus();
      onFocusHandler();
    });
  }, [focusEmitter, codeMirrorRef, nodeKey, onFocusHandler]);

  return codeMirrorRef;
}
