import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import {
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  LexicalCommand,
} from "lexical";
import { $isCodeBlockNode } from "@/components/editor/nodes/code-node";

export function SpacerNavigationPlugin(): null {
  const [editor] = useLexicalComposerContext();

  const handle = (command: LexicalCommand<KeyboardEvent>) => {
    return editor.registerCommand(
      command,
      (event) => {
        // let system/editor shortcuts work
        if (event && (event.metaKey || event.ctrlKey || event.altKey))
          return false;
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();
        const paragraph = $isParagraphNode(anchorNode)
          ? anchorNode
          : anchorNode.getParent();

        if (!$isParagraphNode(paragraph)) return false;

        // compute start/end robustly, including empty paragraph
        const firstDescendant = paragraph.getFirstDescendant();
        const lastDescendant = paragraph.getLastDescendant();
        const isEmpty = paragraph.getTextContent().length === 0;
        const isAtStart =
          isEmpty ||
          (anchor.offset === 0 &&
            !!firstDescendant &&
            anchorNode === firstDescendant);
        const isAtEnd =
          isEmpty ||
          (!!lastDescendant &&
            anchorNode === lastDescendant &&
            anchor.offset === lastDescendant.getTextContent().length);

        // down/right: at end → jump over empty paragraphs to next non-paragraph
        if (
          (command === KEY_ARROW_DOWN_COMMAND ||
            command === KEY_ARROW_RIGHT_COMMAND) &&
          isAtEnd
        ) {
          let next = paragraph.getNextSibling();
          while (
            next &&
            $isParagraphNode(next) &&
            next.getTextContent().length === 0
          ) {
            next = next.getNextSibling();
          }
          if (next) {
            event?.preventDefault();
            if ($isCodeBlockNode(next)) {
              next.select();
            } else if ($isElementNode(next)) {
              next.selectStart();
            } else {
              // fallback: select the paragraph itself to move caret forward
              paragraph.selectEnd();
            }
            return true;
          }
        }

        // up/left: at start → jump over empty paragraphs to previous non-paragraph
        if (
          (command === KEY_ARROW_UP_COMMAND ||
            command === KEY_ARROW_LEFT_COMMAND) &&
          isAtStart
        ) {
          let prev = paragraph.getPreviousSibling();
          while (
            prev &&
            $isParagraphNode(prev) &&
            prev.getTextContent().length === 0
          ) {
            prev = prev.getPreviousSibling();
          }
          if (prev) {
            event?.preventDefault();
            if ($isCodeBlockNode(prev)) {
              prev.select();
            } else if ($isElementNode(prev)) {
              prev.selectEnd();
            } else {
              paragraph.selectStart();
            }
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  };

  useEffect(() => {
    const u1 = handle(KEY_ARROW_UP_COMMAND);
    const u2 = handle(KEY_ARROW_DOWN_COMMAND);
    const u3 = handle(KEY_ARROW_LEFT_COMMAND);
    const u4 = handle(KEY_ARROW_RIGHT_COMMAND);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [editor]);

  return null;
}
