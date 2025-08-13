import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getNodeByKey,
  $isElementNode,
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

  // no escape flags needed; we handle single keypress actions at edges

  const onFocusHandler = React.useCallback(() => {
    setEditorInFocus({
      editorType,
      rootNode: lexicalNode,
    });
  }, [editorType, lexicalNode, setEditorInFocus]);

  const onKeyDownHandler = React.useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        const state = codeMirrorRef.current?.getCodemirror()?.state;
        if (state) {
          const selectionEnd = state.selection.ranges[0].to;
          const line = state.doc.lineAt(selectionEnd);
          const isAtLastLine = line.number === state.doc.lines;
          const isAtLineEnd = selectionEnd === line.to;

          if (isAtLastLine && isAtLineEnd) {
            e.preventDefault();
            e.stopPropagation();
            editor.update(() => {
              const node = $getNodeByKey(nodeKey)!;
              const cm = codeMirrorRef.current?.getCodemirror();
              cm?.contentDOM.blur();
              const next = node.getNextSibling();
              if (next) {
                if ($isElementNode(next)) {
                  next.selectStart();
                } else {
                  node.selectNext();
                }
              } else {
                const paragraph = $createParagraphNode();
                node.insertAfter(paragraph);
                paragraph.select();
              }
            });
            // ensure focus transitions to lexical so the caret is visible
            setTimeout(() => editor.focus(), 0);
          }
        }
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        const state = codeMirrorRef.current?.getCodemirror()?.state;
        if (state) {
          const selectionStart = state.selection.ranges[0].from;
          const line = state.doc.lineAt(selectionStart);
          const isAtFirstLine = line.number === 1;
          const isAtLineStart = selectionStart === line.from;

          if (isAtFirstLine && isAtLineStart) {
            e.preventDefault();
            e.stopPropagation();
            editor.update(() => {
              const node = $getNodeByKey(nodeKey)!;
              const cm = codeMirrorRef.current?.getCodemirror();
              cm?.contentDOM.blur();
              const prev = node.getPreviousSibling();
              if (prev) {
                if ($isElementNode(prev)) {
                  prev.selectEnd();
                } else {
                  node.selectPrevious();
                }
              } else {
                const paragraph = $createParagraphNode();
                node.insertBefore(paragraph);
                paragraph.select();
              }
            });
            setTimeout(() => editor.focus(), 0);
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
