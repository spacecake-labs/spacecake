import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $createParagraphNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  LexicalCommand,
} from "lexical";
import { useEffect } from "react";
import { CodeNode } from "@lexical/code";
import { $isCodeNode } from "@lexical/code";

/**
 * Handles arrow key navigation for code blocks in Lexical.
 *
 * By default, Lexical code nodes "trap" the cursor, making it difficult to exit
 * code blocks using arrow keys. This plugin enables natural navigation:
 *
 * - UP/LEFT arrow at the start of a code block → exits and creates paragraph above
 * - DOWN/RIGHT arrow at the end of a code block → exits and creates paragraph below
 * - If there's already a node before/after, navigates to it instead of creating new
 *
 * This provides the expected editor behavior where users can easily move in/out
 * of code blocks using standard arrow key navigation.
 */
export function CodeBlockPlugin(): null {
  const [editor] = useLexicalComposerContext();

  const insertParagraphBefore = (
    codeNode: CodeNode,
    event: KeyboardEvent | null
  ) => {
    event?.preventDefault();

    editor.update(() => {
      const paragraph = $createParagraphNode();
      codeNode.insertBefore(paragraph);
      paragraph.select();
    });

    return true;
  };

  const insertParagraphAfter = (
    codeNode: CodeNode,
    event: KeyboardEvent | null
  ) => {
    event?.preventDefault();

    editor.update(() => {
      const paragraph = $createParagraphNode();
      codeNode.insertAfter(paragraph);
      paragraph.select();
    });

    return true;
  };

  const handleArrowNavigation = (command: LexicalCommand<KeyboardEvent>) => {
    return editor.registerCommand(
      command,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();
        const codeNode = $isCodeNode(anchorNode)
          ? anchorNode
          : anchorNode.getParent();

        if (!$isCodeNode(codeNode)) {
          return false;
        }

        // const codeText = codeNode.getTextContent();
        const offset = anchor.offset;
        const anchorTextLength = anchorNode.getTextContent().length;

        // Handle end of code block (DOWN/RIGHT)
        if (
          command === KEY_ARROW_DOWN_COMMAND ||
          command === KEY_ARROW_RIGHT_COMMAND
        ) {
          if (offset === anchorTextLength) {
            const codeChildren = codeNode.getChildren();
            const lastChild = codeChildren[codeChildren.length - 1];

            if (anchorNode === lastChild) {
              const nextNode = codeNode.getNextSibling();
              if (nextNode && $isElementNode(nextNode)) {
                event?.preventDefault();
                nextNode.selectStart();
                return true;
              } else {
                return insertParagraphAfter(codeNode, event);
              }
            }
          }
        }

        // Handle start of code block (UP/LEFT)
        if (
          command === KEY_ARROW_UP_COMMAND ||
          command === KEY_ARROW_LEFT_COMMAND
        ) {
          if (offset === 0) {
            const codeChildren = codeNode.getChildren();
            const firstChild = codeChildren[0];

            if (anchorNode === firstChild) {
              const prevNode = codeNode.getPreviousSibling();
              if (prevNode && $isElementNode(prevNode)) {
                event?.preventDefault();
                prevNode.selectEnd();
                return true;
              } else {
                return insertParagraphBefore(codeNode, event);
              }
            }
          }
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  };

  useEffect(() => {
    const unregisterUp = handleArrowNavigation(KEY_ARROW_UP_COMMAND);
    const unregisterLeft = handleArrowNavigation(KEY_ARROW_LEFT_COMMAND);
    const unregisterDown = handleArrowNavigation(KEY_ARROW_DOWN_COMMAND);
    const unregisterRight = handleArrowNavigation(KEY_ARROW_RIGHT_COMMAND);

    return () => {
      unregisterUp();
      unregisterLeft();
      unregisterDown();
      unregisterRight();
    };
  }, [editor]);

  return null;
}
